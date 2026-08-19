import { mkdir } from "node:fs/promises";

import { apiRoutes } from "@edu-agent/contracts";
import { expect, test, type APIRequestContext } from "@playwright/test";

import { playwrightArtifactPath } from "../config/test-artifacts.js";

const headers = {
  "x-demo-tenant": "tenant:demo-school",
  "x-demo-actor": "user:teacher-001"
};

const screenshotRoot = playwrightArtifactPath(
  "evidence",
  "memory-application-observability"
);

test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
});

test("first-round memory keeps a lesson-preparation conversation across turns and refresh", async ({
  page,
  request
}) => {
  const preference = await confirmPreference(request);
  const task = await createStartedTask(request);
  let conversationCreateCalls = 0;
  page.on("request", (webRequest) => {
    if (
      webRequest.method() === "POST" &&
      new URL(webRequest.url()).pathname ===
        apiRoutes.teacher.conversations
    ) {
      conversationCreateCalls += 1;
    }
  });

  await page.goto(
    `/agent/tasks/${encodeURIComponent(task.taskRef)}`
  );
  await expect(page.getByTestId("task-working-set")).toContainText(
    "斜率与图像变化"
  );

  const input = page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  });
  const firstRequest =
    "请强化斜率变化与图像陡峭程度的联系，并保留独立检查。";
  await input.fill(firstRequest);
  const firstConversationResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        apiRoutes.teacher.conversations
  );
  const firstTurnResponse = page.waitForResponse(
    isConversationTurnAppend
  );
  const firstInvocationResponse = page.waitForResponse(
    isModelInvocationCreate
  );
  await page.getByTestId("generate-copilot").click();

  const [createdConversation, firstTurn, firstInvocation] =
    await Promise.all([
      firstConversationResponse,
      firstTurnResponse,
      firstInvocationResponse
    ]);
  expect(createdConversation.status()).toBe(201);
  expect(firstTurn.status()).toBe(201);
  expect(firstInvocation.status()).toBe(202);
  const conversationRef = (
    (await createdConversation.json()) as {
      conversation: { conversationRef: string };
    }
  ).conversation.conversationRef;
  const firstTurnBody = (await firstTurn.json()) as {
    turn: { turnRef: string };
    conversation: { version: number };
  };
  const firstInvocationBody = (await firstInvocation.json()) as {
    execution: {
      modelExecutionRef: string;
      conversationRef: string | null;
      turnRef: string | null;
    };
  };
  const firstInvocationCommand =
    firstInvocation.request().postDataJSON() as {
      requestVersion: number;
      conversationRef: string;
      turnRef: string;
      conversationVersion: number;
    };
  expect(firstInvocationCommand).toMatchObject({
    requestVersion: 2,
    conversationRef,
    turnRef: firstTurnBody.turn.turnRef,
    conversationVersion: firstTurnBody.conversation.version
  });
  expect(firstInvocationBody.execution).toMatchObject({
    conversationRef,
    turnRef: firstTurnBody.turn.turnRef
  });

  await waitForExecution(
    request,
    firstInvocationBody.execution.modelExecutionRef
  );
  await expect(page.getByTestId("copilot-conversation")).toContainText(
    firstRequest,
    { timeout: 20_000 }
  );
  await expect(page).toHaveURL(
    new RegExp(`conversation=${encodeURIComponent(conversationRef)}`)
  );

  await page.reload();
  await expect(page.getByTestId("copilot-conversation")).toContainText(
    firstRequest,
    { timeout: 20_000 }
  );

  const secondRequest = "再短一点，保留独立检查。";
  await input.fill(secondRequest);
  const secondTurnResponse = page.waitForResponse(
    isConversationTurnAppend
  );
  const secondInvocationResponse = page.waitForResponse(
    isModelInvocationCreate
  );
  await page.getByTestId("generate-copilot").click();
  const [secondTurn, secondInvocation] = await Promise.all([
    secondTurnResponse,
    secondInvocationResponse
  ]);
  expect(secondTurn.status()).toBe(201);
  expect(secondInvocation.status()).toBe(202);
  const secondInvocationBody = (await secondInvocation.json()) as {
    execution: {
      modelExecutionRef: string;
      conversationRef: string | null;
    };
  };
  expect(secondInvocationBody.execution.conversationRef).toBe(
    conversationRef
  );
  const secondExecution = await waitForExecution(
    request,
    secondInvocationBody.execution.modelExecutionRef
  );
  const secondProposalRef = secondExecution.proposalRevisionRef!;

  await expect
    .poll(async () => {
      const response = await request.get(
        apiRoutes.teacher.conversation(conversationRef),
        { headers }
      );
      expect(response.status()).toBe(200);
      return (await response.json()) as {
        turns: unknown[];
        workingMemory: {
          activeGoal: { text: string };
          temporaryOverrides: string[];
        } | null;
      };
    })
    .toMatchObject({
      turns: [{}, {}, {}, {}],
      workingMemory: {
        activeGoal: { text: firstRequest },
        temporaryOverrides: ["短一点"]
      }
    });
  await expect(page.getByTestId("copilot-conversation")).toContainText(
    secondRequest,
    { timeout: 20_000 }
  );
  await expect(page).toHaveURL(
    new RegExp(
      `/copilot/proposals/${encodeURIComponent(secondProposalRef)}(?:\\?|$)`
    ),
    { timeout: 20_000 }
  );
  const disclosure = page.getByTestId("memory-use-disclosure");
  await expect(disclosure).toBeVisible({ timeout: 20_000 });
  const secondPackRef = await disclosure.getAttribute("data-pack-ref");
  const secondPackHash = await disclosure.getAttribute(
    "data-pack-content-hash"
  );
  expect(secondPackRef).toBeTruthy();
  expect(secondPackHash).toMatch(/^[a-f0-9]{64}$/u);
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-current-instruction")).toContainText(
    secondRequest
  );
  await expect(page.getByTestId("memory-working-memory")).toContainText(
    firstRequest
  );
  await expect(page.getByTestId("memory-preferences")).toContainText("简洁");
  await expect(page.getByTestId("memory-disclaimer")).toContainText(
    "不代表模型一定完整采用"
  );
  await page.screenshot({
    path: `${screenshotRoot}/proposal-memory-context.png`,
    fullPage: true
  });
  expect(conversationCreateCalls).toBe(1);

  await page.reload();
  await expect(page.getByTestId("copilot-conversation")).toContainText(
    secondRequest,
    { timeout: 20_000 }
  );
  await expect(page.getByTestId("conversation-turn")).toHaveCount(4);
  await expect(page.getByTestId("memory-use-disclosure")).toHaveAttribute(
    "data-pack-content-hash",
    secondPackHash!
  );

  const afterSecondResponse = await request.get(
    apiRoutes.teacher.conversation(conversationRef),
    { headers }
  );
  expect(afterSecondResponse.status()).toBe(200);
  const afterSecond = (await afterSecondResponse.json()) as {
    workingMemory: {
      latestAssistantResult: {
        resultRefs: { proposalRevisionRef: string };
      };
    };
  };
  expect(
    afterSecond.workingMemory.latestAssistantResult.resultRefs
      .proposalRevisionRef
  ).toBe(secondProposalRef);

  await page.goto(`/runs/tasks/${encodeURIComponent(task.taskRef)}`);
  await expect(page.getByTestId("memory-use-disclosure")).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByTestId("memory-use-disclosure")).toHaveAttribute(
    "data-pack-ref",
    secondPackRef!
  );
  await expect(page.getByTestId("memory-use-disclosure")).toHaveAttribute(
    "data-pack-content-hash",
    secondPackHash!
  );
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-run-metadata")).toContainText(
    "lesson-preparation@5"
  );

  const revoked = await request.post(
    apiRoutes.teacher.teacherPreferenceRevoke(preference.preferenceRef),
    {
      headers,
      data: {
        expectedVersion: preference.version,
        purpose: "personalization.preference.revoke",
        idempotencyKey: `playwright:memory:revoke:${crypto.randomUUID()}`
      }
    }
  );
  expect(revoked.status()).toBe(200);
  await page.reload();
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-preference")).toContainText(
    "本次运行当时参考，当前已撤销"
  );
  await page.screenshot({
    path: `${screenshotRoot}/runs-revoked-preference.png`,
    fullPage: true
  });

  const foreignProposal = await request.get(
    apiRoutes.demo.proposalDetail(secondProposalRef),
    {
      headers: {
        ...headers,
        "x-demo-actor": "user:teacher-foreign"
      }
    }
  );
  expect([403, 404]).toContain(foreignProposal.status());

  await page.goto(
    `/agent/tasks/${encodeURIComponent(task.taskRef)}?conversation=${encodeURIComponent(conversationRef)}`
  );
  const thirdRequest = "保持当前目标，再给一版更具体的独立检查。";
  await input.fill(thirdRequest);
  const thirdInvocationResponse = page.waitForResponse(
    isModelInvocationCreate
  );
  await page.getByTestId("generate-copilot").click();
  const thirdInvocation = await thirdInvocationResponse;
  expect(thirdInvocation.status()).toBe(202);
  const thirdInvocationBody = (await thirdInvocation.json()) as {
    execution: { modelExecutionRef: string };
  };
  await waitForExecution(
    request,
    thirdInvocationBody.execution.modelExecutionRef
  );
  await expect
    .poll(
      () =>
        page
          .getByTestId("memory-use-disclosure")
          .getAttribute("data-pack-content-hash"),
      { timeout: 20_000 }
    )
    .not.toBe(secondPackHash);
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-current-instruction")).toContainText(
    thirdRequest
  );
  await expect(page.getByTestId("memory-preferences")).toHaveCount(0);

  const conversationResponse = await request.get(
    apiRoutes.teacher.conversation(conversationRef),
    { headers }
  );
  expect(conversationResponse.status()).toBe(200);
  const conversation = (await conversationResponse.json()) as {
    version: number;
  };
  const closeResponse = await request.post(
    apiRoutes.teacher.conversationClose(conversationRef),
    {
      headers,
      data: {
        expectedConversationVersion: conversation.version,
        purpose: "teacher-copilot.conversation.close",
        idempotencyKey: `playwright:memory:close:${crypto.randomUUID()}`
      }
    }
  );
  expect(closeResponse.status()).toBe(201);

  const taskResponse = await request.get(
    apiRoutes.teacher.preparationTask(task.taskRef),
    { headers }
  );
  expect(taskResponse.status()).toBe(200);
  const taskDetail = (await taskResponse.json()) as {
    status: string;
    version: number;
  };
  if (!["cancelled", "completed"].includes(taskDetail.status)) {
    const cancelResponse = await request.post(
      apiRoutes.teacher.preparationTaskCancel(task.taskRef),
      {
        headers,
        data: {
          expectedVersion: taskDetail.version,
          purpose: "lesson-preparation.cancel",
          idempotencyKey: `playwright:memory:cancel:${crypto.randomUUID()}`
        }
      }
    );
    expect(cancelResponse.status()).toBe(201);
  }
});

async function confirmPreference(request: APIRequestContext): Promise<{
  preferenceRef: string;
  version: number;
}> {
  const candidate = await request.post(apiRoutes.teacher.memoryCandidates, {
    headers,
    data: {
      summary: "合成教师确认教案应保持简洁。",
      preferenceKey: "lesson_plan_detail",
      preferenceValue: "简洁",
      purpose: "personalization.candidate.create",
      idempotencyKey: `playwright:memory:candidate:${crypto.randomUUID()}`
    }
  });
  expect(candidate.status()).toBe(201);
  const candidateBody = (await candidate.json()) as {
    candidate: { candidateRef: string; version: number };
  };
  const confirmed = await request.post(
    apiRoutes.teacher.memoryCandidateConfirm(
      candidateBody.candidate.candidateRef
    ),
    {
      headers,
      data: {
        expectedVersion: candidateBody.candidate.version,
        purpose: "personalization.candidate.confirm",
        idempotencyKey: `playwright:memory:confirm:${crypto.randomUUID()}`
      }
    }
  );
  expect(confirmed.status()).toBe(200);
  return (
    (await confirmed.json()) as {
      preference: { preferenceRef: string; version: number };
    }
  ).preference;
}

async function createStartedTask(request: APIRequestContext) {
  const created = await request.post(
    apiRoutes.teacher.preparationTasks,
    {
      headers,
      data: {
        lessonRef: "lesson:slope-and-graph-change",
        dueAt: null,
        priority: "high",
        purpose: "lesson-preparation.create",
        idempotencyKey: `playwright:memory:create:${crypto.randomUUID()}`
      }
    }
  );
  expect(created.status()).toBe(201);
  const createdBody = (await created.json()) as {
    task: { taskRef: string; version: number };
  };
  const started = await request.post(
    apiRoutes.teacher.preparationTaskStart(
      createdBody.task.taskRef
    ),
    {
      headers,
      data: {
        expectedVersion: createdBody.task.version,
        purpose: "lesson-preparation.start",
        idempotencyKey: `playwright:memory:start:${crypto.randomUUID()}`
      }
    }
  );
  expect(started.status()).toBe(201);
  return (
    (await started.json()) as {
      task: { taskRef: string };
    }
  ).task;
}

function isConversationTurnAppend(response: {
  request(): { method(): string };
  url(): string;
}) {
  return (
    response.request().method() === "POST" &&
    /^\/api\/v1\/teacher\/conversations\/[^/]+\/turns$/u.test(
      new URL(response.url()).pathname
    )
  );
}

function isModelInvocationCreate(response: {
  request(): { method(): string };
  url(): string;
}) {
  return (
    response.request().method() === "POST" &&
    new URL(response.url()).pathname ===
      apiRoutes.teacher.modelInvocations
  );
}

async function waitForExecution(
  request: APIRequestContext,
  modelExecutionRef: string
): Promise<{ status: string; proposalRevisionRef: string | null }> {
  await expect
    .poll(
      async () => {
        const response = await request.get(
          apiRoutes.teacher.modelInvocation(modelExecutionRef),
          { headers }
        );
        expect(response.status()).toBe(200);
        return ((await response.json()) as { status: string })
          .status;
      },
      { timeout: 20_000 }
    )
    .toBe("succeeded");
  const response = await request.get(
    apiRoutes.teacher.modelInvocation(modelExecutionRef),
    { headers }
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    status: string;
    proposalRevisionRef: string | null;
  };
}

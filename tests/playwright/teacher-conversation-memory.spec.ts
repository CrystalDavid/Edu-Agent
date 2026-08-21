import { mkdir } from "node:fs/promises";

import { apiRoutes } from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/sample-data";
import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from "@playwright/test";

import { secondaryCourseDemoRefs } from "../../scripts/sample/gate2-5-demo-fixture.js";
import { playwrightArtifactPath } from "../config/test-artifacts.js";

const headers = {
  "x-demo-tenant": "tenant:demo-school",
  "x-demo-actor": "user:teacher-001"
};

const screenshotRoot = playwrightArtifactPath(
  "evidence",
  "memory-application-observability"
);
const cleanupTaskRefs = new Set<string>();
const cleanupConversationRefs = new Set<string>();

test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
});

test.beforeEach(() => {
  cleanupTaskRefs.clear();
  cleanupConversationRefs.clear();
});

test.afterEach(async ({ request }) => {
  await restartApi(request, "enabled");
  for (const conversationRef of cleanupConversationRefs) {
    await closeConversationIfOpen(request, conversationRef);
  }
  for (const taskRef of cleanupTaskRefs) {
    await cancelTaskIfOpen(request, taskRef);
  }
  await cleanupTestPersonalization(request);
});

test("scoped preferences and short-term memory stay explainable across courses, refresh and revoke", async ({
  page,
  request
}) => {
  test.setTimeout(120_000);
  await createAndConfirmPreferenceInSettings(page, {
    value: "简洁",
    scope: "global"
  });
  await createAndConfirmPreferenceInSettings(page, {
    value: "详细",
    scope: "course_run"
  });
  const personalizationResponse = await request.get(
    apiRoutes.teacher.personalizationState,
    { headers }
  );
  expect(personalizationResponse.status()).toBe(200);
  const activePreferences = (
    (await personalizationResponse.json()) as {
      preferences: Array<{
        preferenceRef: string;
        preferenceKey: string;
        preferenceValue: string;
        status: string;
        version: number;
        scope: { kind: string; courseRunRef: string | null };
      }>;
    }
  ).preferences.filter((entry) =>
    entry.status === "active" && entry.preferenceKey === "lesson_plan_detail"
  );
  const globalPreference = activePreferences.find((entry) =>
    entry.scope.kind === "global" && entry.preferenceValue === "简洁"
  );
  const coursePreference = activePreferences.find((entry) =>
    entry.scope.kind === "course_run" &&
    entry.scope.courseRunRef === gate2DemoRefs.courseRunRef &&
    entry.preferenceValue === "详细"
  );
  expect(globalPreference).toBeTruthy();
  expect(coursePreference).toBeTruthy();
  const task = await createStartedTask(request);
  cleanupTaskRefs.add(task.taskRef);
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
  cleanupConversationRefs.add(conversationRef);
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
  await expect(disclosure).toHaveAttribute("data-manifest-version", "2");
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-current-instruction")).toContainText(
    secondRequest
  );
  await expect(page.getByTestId("memory-working-memory")).toContainText(
    firstRequest
  );
  await expect(page.getByTestId("memory-preferences")).toContainText("详细");
  await expect(page.getByTestId("memory-preferences")).toContainText(
    "作用范围：当前课程"
  );
  await expect(page.getByTestId("memory-excluded")).toContainText("简洁");
  await expect(page.getByTestId("memory-excluded")).toContainText(
    "当前课程、课时或任务的偏好更具体"
  );
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

  await restartApi(request);
  await page.reload();
  await expect(page.getByTestId("copilot-conversation")).toContainText(
    secondRequest,
    { timeout: 20_000 }
  );
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
    "lesson-preparation@6"
  );

  const secondaryTask = await createStartedTask(
    request,
    secondaryCourseDemoRefs.lessonRef
  );
  cleanupTaskRefs.add(secondaryTask.taskRef);
  await page.goto(
    `/agent/tasks/${encodeURIComponent(secondaryTask.taskRef)}`
  );
  const secondaryRequest = "请为另一门合成课程生成简洁教案。";
  await page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  }).fill(secondaryRequest);
  const secondaryConversationResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === apiRoutes.teacher.conversations
  );
  const secondaryInvocationResponse = page.waitForResponse(
    isModelInvocationCreate
  );
  await page.getByTestId("generate-copilot").click();
  const [secondaryConversation, secondaryInvocation] = await Promise.all([
    secondaryConversationResponse,
    secondaryInvocationResponse
  ]);
  expect(secondaryConversation.status()).toBe(201);
  expect(secondaryInvocation.status()).toBe(202);
  const secondaryConversationRef = (
    (await secondaryConversation.json()) as {
      conversation: { conversationRef: string };
    }
  ).conversation.conversationRef;
  cleanupConversationRefs.add(secondaryConversationRef);
  const secondaryInvocationBody = (await secondaryInvocation.json()) as {
    execution: { modelExecutionRef: string };
  };
  await waitForExecution(
    request,
    secondaryInvocationBody.execution.modelExecutionRef
  );
  await expect(page.getByTestId("memory-use-disclosure")).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByTestId("memory-use-disclosure")).toHaveAttribute(
    "data-manifest-version",
    "2"
  );
  await page.getByTestId("memory-use-toggle").click();
  const secondaryPreferences = page.getByTestId("memory-preferences");
  await expect(secondaryPreferences).toContainText(
    "教案详细程度：简洁"
  );
  await expect(secondaryPreferences).not.toContainText(
    "教案详细程度：详细"
  );
  await expect(secondaryPreferences).not.toContainText(
    "作用范围：当前课程"
  );
  await expect(page.getByTestId("memory-use-disclosure")).not.toContainText(
    gate2DemoRefs.courseRunRef
  );
  await page.screenshot({
    path: `${screenshotRoot}/second-course-global-preference.png`,
    fullPage: true
  });

  const revoked = await request.post(
    apiRoutes.teacher.teacherPreferenceRevoke(coursePreference!.preferenceRef),
    {
      headers,
      data: {
        expectedVersion: coursePreference!.version,
        purpose: "personalization.preference.revoke",
        idempotencyKey: `playwright:memory:revoke:${crypto.randomUUID()}`
      }
    }
  );
  expect(revoked.status()).toBe(200);
  await page.goto(`/runs/tasks/${encodeURIComponent(task.taskRef)}`);
  await expect(page.getByTestId("memory-use-disclosure")).toBeVisible({
    timeout: 20_000
  });
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
  const postRevokePreferences = page.getByTestId("memory-preferences");
  await expect(postRevokePreferences).toContainText(
    "教案详细程度：简洁"
  );
  await expect(postRevokePreferences).not.toContainText(
    "教案详细程度：详细"
  );
  await expect(postRevokePreferences).not.toContainText(
    "作用范围：当前课程"
  );

  const revokeGlobal = await request.post(
    apiRoutes.teacher.teacherPreferenceRevoke(globalPreference!.preferenceRef),
    {
      headers,
      data: {
        expectedVersion: globalPreference!.version,
        purpose: "personalization.preference.revoke",
        idempotencyKey: `playwright:memory:revoke-global:${crypto.randomUUID()}`
      }
    }
  );
  expect(revokeGlobal.status()).toBe(200);

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
  await closeConversationIfOpen(request, secondaryConversationRef);
  await cancelTaskIfOpen(request, secondaryTask.taskRef);

  await restartApi(request, "disabled");
  try {
    await page.goto("/settings");
    await page.getByRole("button", { name: "助手偏好" }).click();
    const disabledPanel = page.getByTestId("teacher-preference-settings");
    await expect(disabledPanel).toBeVisible();
    await expect(
      disabledPanel.getByTestId("preference-scope-selector")
    ).toHaveCount(0);

    const disabledState = await request.get(
      apiRoutes.teacher.personalizationState,
      { headers }
    );
    expect(disabledState.status()).toBe(200);
    expect((await disabledState.json()).scopedPreferencesEnabled).toBe(false);

    const rejectedScopedCandidate = await request.post(
      apiRoutes.teacher.memoryCandidates,
      {
        headers,
        data: {
          summary: "功能关闭时不得写入课程级合成偏好。",
          preferenceKey: "flag_off_scope",
          preferenceValue: "拒绝",
          proposedScope: {
            kind: "course_run",
            subject: null,
            gradeLevel: null,
            courseRunRef: gate2DemoRefs.courseRunRef,
            lessonRef: null,
            taskRef: null,
            skillIds: ["lesson-preparation"]
          },
          purpose: "personalization.candidate.create",
          idempotencyKey:
            `playwright:memory:flag-off-scoped:${crypto.randomUUID()}`
        }
      }
    );
    expect(rejectedScopedCandidate.status()).toBe(409);
    expect((await rejectedScopedCandidate.json()).code).toBe(
      "SCOPED_PREFERENCES_DISABLED"
    );

    const globalCandidate = await request.post(
      apiRoutes.teacher.memoryCandidates,
      {
        headers,
        data: {
          summary: "功能关闭时仍允许无 Skill 限制的全局合成偏好。",
          preferenceKey: "flag_off_global",
          preferenceValue: "保留全局兼容",
          purpose: "personalization.candidate.create",
          idempotencyKey:
            `playwright:memory:flag-off-global:${crypto.randomUUID()}`
        }
      }
    );
    expect(globalCandidate.status()).toBe(201);
    const globalCandidateBody = (await globalCandidate.json()) as {
      candidate: { candidateRef: string; version: number };
    };
    const globalConfirmation = await request.post(
      apiRoutes.teacher.memoryCandidateConfirm(
        globalCandidateBody.candidate.candidateRef
      ),
      {
        headers,
        data: {
          expectedVersion: globalCandidateBody.candidate.version,
          purpose: "personalization.candidate.confirm",
          idempotencyKey:
            `playwright:memory:flag-off-confirm:${crypto.randomUUID()}`
        }
      }
    );
    expect(globalConfirmation.status()).toBe(200);
    const globalConfirmationBody = (await globalConfirmation.json()) as {
      preference: { preferenceRef: string; version: number };
    };

    const legacyTask = await createStartedTask(request);
    cleanupTaskRefs.add(legacyTask.taskRef);
    await page.goto(
      `/agent/tasks/${encodeURIComponent(legacyTask.taskRef)}`
    );
    const legacyRequest = "请验证关闭分范围功能后的旧版全局上下文。";
    await page.getByRole("textbox", {
      name: "告诉 Agent 你想完成什么"
    }).fill(legacyRequest);
    const legacyConversationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          apiRoutes.teacher.conversations
    );
    const legacyInvocationResponse = page.waitForResponse(
      isModelInvocationCreate
    );
    await page.getByTestId("generate-copilot").click();
    const [legacyConversation, legacyInvocation] = await Promise.all([
      legacyConversationResponse,
      legacyInvocationResponse
    ]);
    expect(legacyConversation.status()).toBe(201);
    expect(legacyInvocation.status()).toBe(202);
    const legacyConversationRef = (
      (await legacyConversation.json()) as {
        conversation: { conversationRef: string };
      }
    ).conversation.conversationRef;
    cleanupConversationRefs.add(legacyConversationRef);
    const legacyExecutionRef = (
      (await legacyInvocation.json()) as {
        execution: { modelExecutionRef: string };
      }
    ).execution.modelExecutionRef;
    await waitForExecution(request, legacyExecutionRef);
    const legacyDisclosure = page.getByTestId("memory-use-disclosure");
    await expect(legacyDisclosure).toBeVisible({ timeout: 20_000 });
    await expect(legacyDisclosure).toHaveAttribute(
      "data-manifest-version",
      "1"
    );
    const legacyPackRef = await legacyDisclosure.getAttribute(
      "data-pack-ref"
    );
    const legacyPackHash = await legacyDisclosure.getAttribute(
      "data-pack-content-hash"
    );
    await page.getByTestId("memory-use-toggle").click();
    await expect(page.getByTestId("memory-preferences")).toContainText(
      "保留全局兼容"
    );

    await page.reload();
    await expect(page.getByTestId("memory-use-disclosure")).toHaveAttribute(
      "data-pack-content-hash",
      legacyPackHash!
    );
    await page.goto(
      `/runs/tasks/${encodeURIComponent(legacyTask.taskRef)}`
    );
    await expect(page.getByTestId("memory-use-disclosure")).toHaveAttribute(
      "data-pack-ref",
      legacyPackRef!
    );
    await expect(page.getByTestId("memory-use-disclosure")).toHaveAttribute(
      "data-manifest-version",
      "1"
    );
    await page.getByTestId("memory-use-toggle").click();
    await expect(page.getByTestId("memory-run-metadata")).toContainText(
      "旧版全局偏好上下文"
    );

    const revokeLegacyPreference = await request.post(
      apiRoutes.teacher.teacherPreferenceRevoke(
        globalConfirmationBody.preference.preferenceRef
      ),
      {
        headers,
        data: {
          expectedVersion: globalConfirmationBody.preference.version,
          purpose: "personalization.preference.revoke",
          idempotencyKey:
            `playwright:memory:flag-off-revoke:${crypto.randomUUID()}`
        }
      }
    );
    expect(revokeLegacyPreference.status()).toBe(200);
    await closeConversationIfOpen(request, legacyConversationRef);
    await cancelTaskIfOpen(request, legacyTask.taskRef);
  } finally {
    await restartApi(request, "enabled");
  }
});

async function createAndConfirmPreferenceInSettings(
  page: Page,
  input: { value: string; scope: "global" | "course_run" }
): Promise<void> {
  await page.goto("/settings");
  await page.getByRole("button", { name: "助手偏好" }).click();
  const panel = page.getByTestId("teacher-preference-settings");
  await expect(panel).toBeVisible();
  await panel.getByLabel("偏好类型").click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .filter({ hasText: "教案详细程度" })
    .click();
  await panel
    .getByPlaceholder("偏好内容，例如 简洁、突出课堂案例")
    .fill(input.value);
  await panel
    .getByPlaceholder("为什么记录这条偏好")
    .fill(`合成教师确认教案应保持${input.value}。`);
  if (input.scope === "course_run") {
    await panel.getByTestId("preference-scope-selector").click();
    await page
      .locator(".ant-select-dropdown:visible .ant-select-item-option")
      .filter({ hasText: "3 班" })
      .click();
  }
  await panel.getByTestId("create-preference-candidate").click();
  const candidate = panel.locator("article.settings-row", {
    hasText: input.value
  }).filter({ has: page.getByRole("button", { name: /确\s*认/u }) });
  await expect(candidate).toContainText(
    input.scope === "global" ? "所有普通备课" : "3 班"
  );
  await expect(candidate).not.toContainText("course-run:");
  await candidate.getByRole("button", { name: /确\s*认/u }).click();
  const activeRow = panel
    .locator(`input[value="${input.value}"]`)
    .locator("xpath=ancestor::article[contains(@class, 'settings-row')]");
  await expect(activeRow).toContainText(
    input.scope === "global" ? "所有普通备课" : "3 班",
    { timeout: 20_000 }
  );
}

async function cleanupTestPersonalization(
  request: APIRequestContext
): Promise<void> {
  const response = await request.get(
    apiRoutes.teacher.personalizationState,
    { headers }
  );
  expect(response.status()).toBe(200);
  const state = (await response.json()) as {
    candidates: Array<{
      candidateRef: string;
      preferenceKey: string | null;
      preferenceValue: string | null;
      status: string;
      version: number;
    }>;
    preferences: Array<{
      preferenceRef: string;
      preferenceKey: string;
      preferenceValue: string;
      status: string;
      version: number;
    }>;
  };
  const ownsTestValue = (
    preferenceKey: string | null,
    preferenceValue: string | null
  ) =>
    (preferenceKey === "lesson_plan_detail" &&
      ["简洁", "详细"].includes(preferenceValue ?? "")) ||
    preferenceKey === "flag_off_global";

  for (const candidate of state.candidates) {
    if (
      candidate.status !== "draft" ||
      !ownsTestValue(candidate.preferenceKey, candidate.preferenceValue)
    ) {
      continue;
    }
    const rejected = await request.post(
      apiRoutes.teacher.memoryCandidateReject(candidate.candidateRef),
      {
        headers,
        data: {
          expectedVersion: candidate.version,
          purpose: "personalization.candidate.reject",
          idempotencyKey:
            `playwright:memory:cleanup-candidate:${crypto.randomUUID()}`
        }
      }
    );
    expect(rejected.status()).toBe(200);
  }

  for (const preference of state.preferences) {
    if (
      preference.status !== "active" ||
      !ownsTestValue(
        preference.preferenceKey,
        preference.preferenceValue
      )
    ) {
      continue;
    }
    const revoked = await request.post(
      apiRoutes.teacher.teacherPreferenceRevoke(
        preference.preferenceRef
      ),
      {
        headers,
        data: {
          expectedVersion: preference.version,
          purpose: "personalization.preference.revoke",
          idempotencyKey:
            `playwright:memory:cleanup-preference:${crypto.randomUUID()}`
        }
      }
    );
    expect(revoked.status()).toBe(200);
  }
}

async function createStartedTask(
  request: APIRequestContext,
  lessonRef = "lesson:slope-and-graph-change"
) {
  const created = await request.post(
    apiRoutes.teacher.preparationTasks,
    {
      headers,
      data: {
        lessonRef,
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

async function closeConversationIfOpen(
  request: APIRequestContext,
  conversationRef: string
): Promise<void> {
  const response = await request.get(
    apiRoutes.teacher.conversation(conversationRef),
    { headers }
  );
  expect(response.status()).toBe(200);
  const conversation = (await response.json()) as {
    status: "active" | "closed" | "expired";
    version: number;
  };
  if (conversation.status !== "active") return;
  const closed = await request.post(
    apiRoutes.teacher.conversationClose(conversationRef),
    {
      headers,
      data: {
        expectedConversationVersion: conversation.version,
        purpose: "teacher-copilot.conversation.close",
        idempotencyKey: `playwright:memory:close-secondary:${crypto.randomUUID()}`
      }
    }
  );
  expect(closed.status()).toBe(201);
}

async function cancelTaskIfOpen(
  request: APIRequestContext,
  taskRef: string
): Promise<void> {
  const response = await request.get(
    apiRoutes.teacher.preparationTask(taskRef),
    { headers }
  );
  expect(response.status()).toBe(200);
  const task = (await response.json()) as {
    status: string;
    version: number;
  };
  if (["cancelled", "completed"].includes(task.status)) return;
  const cancelled = await request.post(
    apiRoutes.teacher.preparationTaskCancel(taskRef),
    {
      headers,
      data: {
        expectedVersion: task.version,
        purpose: "lesson-preparation.cancel",
        idempotencyKey: `playwright:memory:cancel-secondary:${crypto.randomUUID()}`
      }
    }
  );
  expect(cancelled.status()).toBe(201);
}

async function restartApi(
  request: APIRequestContext,
  scopedPreferences?: "enabled" | "disabled"
): Promise<void> {
  const controlPort = process.env.E2E_CONTROL_PORT;
  const runId = process.env.E2E_RUN_ID;
  expect(controlPort).toBeTruthy();
  expect(runId).toBeTruthy();
  const url = new URL(
    `http://127.0.0.1:${controlPort}/__e2e/restart-api`
  );
  if (scopedPreferences) {
    url.searchParams.set("scoped-preferences", scopedPreferences);
  }
  const response = await request.post(url.toString(), {
    headers: { "x-e2e-run-id": runId! }
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    restarted: true,
    scopedPreferences: scopedPreferences ?? "unchanged"
  });
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

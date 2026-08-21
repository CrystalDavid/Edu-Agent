import { mkdir } from "node:fs/promises";

import {
  DispatchTeacherConversationTurnResultSchema,
  TeacherPersonalizationStateSchema,
  apiRoutes,
  type DispatchTeacherConversationTurnResult,
  type ExplicitRememberReceipt,
  type TeacherPersonalizationState
} from "@edu-agent/contracts";
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
  await restartApi(request, "enabled", "enabled", "enabled", "enabled");
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
    isConversationTurnDispatch
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
    isConversationTurnDispatch
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
          builderVersion: string;
          activeGoal: { text: string };
          temporaryOverrides: unknown[];
        } | null;
      };
    })
    .toMatchObject({
      turns: [{}, {}, {}, {}],
      workingMemory: {
        builderVersion: "working-memory-builder@2",
        activeGoal: { text: firstRequest },
        temporaryOverrides: []
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
  await expect(disclosure).toHaveAttribute("data-manifest-version", "3");
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
    "lesson-preparation@7"
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
    "3"
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
  await expect(
    page
      .getByTestId("memory-preferences")
      .getByTestId("memory-preference")
  ).toContainText("本次运行当时参考，当前已撤销");
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

test("explicit remember persists canonical preferences across restart, run views and a new session", async ({
  page,
  request,
  browser,
  baseURL
}) => {
  test.setTimeout(240_000);
  const task = await createStartedTask(request);
  cleanupTaskRefs.add(task.taskRef);
  let modelInvocationCreates = 0;
  page.on("request", (webRequest) => {
    if (
      webRequest.method() === "POST" &&
      new URL(webRequest.url()).pathname ===
        apiRoutes.teacher.modelInvocations
    ) {
      modelInvocationCreates += 1;
    }
  });

  await page.goto(`/agent/tasks/${encodeURIComponent(task.taskRef)}`);
  const input = page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  });
  const rememberText =
    "记住：以后教案控制在一页，案例尽量贴近日常生活。";
  await input.fill(rememberText);
  const conversationResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === apiRoutes.teacher.conversations
  );
  const commandResponse = page.waitForResponse(isConversationTurnDispatch);
  await page.getByTestId("generate-copilot").click();
  const [createdConversation, command] = await Promise.all([
    conversationResponse,
    commandResponse
  ]);
  expect(createdConversation.status()).toBe(201);
  expect(command.status()).toBe(201);
  const conversationRef = (
    (await createdConversation.json()) as {
      conversation: { conversationRef: string };
    }
  ).conversation.conversationRef;
  cleanupConversationRefs.add(conversationRef);
  const commandBody = (await command.json()) as {
    kind: string;
    conversation: { version: number };
    receipt: {
      status: string;
      memoryEpochBefore: number;
      memoryEpochAfter: number;
      items: Array<{
        canonicalKey: string;
        displayValue: string;
        status: string;
        scope: { kind: string; skillIds: string[] };
      }>;
    };
  };
  expect(commandBody).toMatchObject({
    kind: "memory_command",
    receipt: {
      status: "applied"
    }
  });
  expect(
    commandBody.receipt.memoryEpochAfter -
      commandBody.receipt.memoryEpochBefore
  ).toBe(2);
  expect(commandBody.receipt.items).toEqual(expect.arrayContaining([
    expect.objectContaining({
      canonicalKey: "lesson_plan_length",
      displayValue: "一页以内",
      status: "applied",
      scope: expect.objectContaining({
        kind: "global",
        skillIds: ["lesson-preparation"]
      })
    }),
    expect.objectContaining({
      canonicalKey: "example_preference",
      displayValue: "优先使用贴近日常生活的案例",
      status: "applied",
      scope: expect.objectContaining({
        kind: "global",
        skillIds: ["lesson-preparation"]
      })
    })
  ]));
  expect(modelInvocationCreates).toBe(0);
  await expect(page.getByTestId("copilot-conversation")).toContainText(
    "已记住 2 条偏好"
  );
  await expect(page.getByTestId("memory-command-item")).toHaveCount(2);
  await expect(page.getByTestId("memory-command-receipt")).toContainText(
    "教案长度：一页以内"
  );
  await expect(page.getByTestId("memory-command-receipt")).toContainText(
    "案例偏好：优先使用贴近日常生活的案例"
  );
  await expect(page.getByTestId("memory-command-receipt")).toContainText(
    "作用范围：所有普通备课"
  );
  await expect(page.getByRole("button", { name: "调整作用范围" }))
    .toBeVisible();

  await page.reload();
  await expect(page.getByTestId("copilot-conversation")).toContainText(
    rememberText,
    { timeout: 20_000 }
  );
  await expect(page.getByTestId("memory-command-receipt")).toContainText(
    "已记住"
  );
  await restartApi(request, "enabled", "enabled");
  await page.reload();
  await expect(page.getByTestId("copilot-conversation")).toContainText(
    "已记住 2 条偏好",
    { timeout: 20_000 }
  );

  await page.goto("/settings");
  await page.getByRole("button", { name: "助手偏好" }).click();
  const settings = page.getByTestId("teacher-preference-settings");
  const lengthPreference = settings
    .locator('input[value="一页以内"]')
    .locator("xpath=ancestor::article[contains(@class, 'settings-row')]");
  const examplePreference = settings
    .locator('input[value="优先使用贴近日常生活的案例"]')
    .locator("xpath=ancestor::article[contains(@class, 'settings-row')]");
  await expect(lengthPreference).toContainText("教案长度");
  await expect(examplePreference).toContainText("案例偏好");
  await expect(lengthPreference).toContainText("来源：对话中明确记住");
  await expect(examplePreference).toContainText("来源：对话中明确记住");

  await page.goto(
    `/agent/tasks/${encodeURIComponent(task.taskRef)}?conversation=${encodeURIComponent(conversationRef)}`
  );
  const normalText = "请为当前课时生成一份新的教学方案。";
  await page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  }).fill(normalText);
  const normalDispatch = page.waitForResponse(isConversationTurnDispatch);
  const invocationResponse = page.waitForResponse(isModelInvocationCreate);
  await page.getByTestId("generate-copilot").click();
  expect((await normalDispatch).status()).toBe(201);
  const invocation = await invocationResponse;
  expect(invocation.status()).toBe(202);
  const execution = (await invocation.json()) as {
    execution: {
      modelExecutionRef: string;
      agentRunRef: string;
    };
  };
  const completed = await waitForExecution(
    request,
    execution.execution.modelExecutionRef
  );
  expect(completed.proposalRevisionRef).toBeTruthy();
  await expect(page.getByTestId("memory-use-disclosure")).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByTestId("memory-use-disclosure")).toHaveAttribute(
    "data-manifest-version",
    "3"
  );
  const packRef = await page.getByTestId("memory-use-disclosure")
    .getAttribute("data-pack-ref");
  const packHash = await page.getByTestId("memory-use-disclosure")
    .getAttribute("data-pack-content-hash");
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-preferences")).toContainText(
    "教案长度：一页以内"
  );
  await expect(page.getByTestId("memory-preferences")).toContainText(
    "案例偏好：优先使用贴近日常生活的案例"
  );
  await expect(page.getByTestId("memory-disclaimer")).toContainText(
    "不代表模型一定完整采用"
  );

  await page.goto(`/runs/tasks/${encodeURIComponent(task.taskRef)}`);
  await expect(page.getByTestId("memory-use-disclosure")).toHaveAttribute(
    "data-pack-ref",
    packRef!
  );
  await expect(page.getByTestId("memory-use-disclosure")).toHaveAttribute(
    "data-pack-content-hash",
    packHash!
  );
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-run-metadata")).toContainText(
    "教师记忆版本"
  );
  await expect(page.getByTestId("memory-run-metadata")).toContainText(
    String(commandBody.receipt.memoryEpochAfter)
  );

  expect(baseURL).toBeTruthy();
  const freshSession = await browser.newContext({ baseURL: baseURL! });
  try {
    const login = await freshSession.request.post(
      "/api/v1/auth/local-login",
      { data: { profile: "teacher", returnTo: "/overview" } }
    );
    expect(login.status()).toBe(201);
    const freshTask = await createStartedTask(
      freshSession.request,
      secondaryCourseDemoRefs.lessonRef
    );
    cleanupTaskRefs.add(freshTask.taskRef);
    const freshPage = await freshSession.newPage();
    await freshPage.goto(
      `/agent/tasks/${encodeURIComponent(freshTask.taskRef)}`
    );
    await freshPage.getByRole("textbox", {
      name: "告诉 Agent 你想完成什么"
    }).fill("请在新会话中生成一份教案。");
    const freshConversationResponse = freshPage.waitForResponse((response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === apiRoutes.teacher.conversations
    );
    const freshInvocationResponse = freshPage.waitForResponse(
      isModelInvocationCreate
    );
    await freshPage.getByTestId("generate-copilot").click();
    const [freshConversation, freshInvocation] = await Promise.all([
      freshConversationResponse,
      freshInvocationResponse
    ]);
    const freshConversationRef = (
      (await freshConversation.json()) as {
        conversation: { conversationRef: string };
      }
    ).conversation.conversationRef;
    cleanupConversationRefs.add(freshConversationRef);
    const freshExecutionRef = (
      (await freshInvocation.json()) as {
        execution: { modelExecutionRef: string };
      }
    ).execution.modelExecutionRef;
    await waitForExecution(freshSession.request, freshExecutionRef);
    await expect(freshPage.getByTestId("memory-use-disclosure"))
      .toBeVisible({ timeout: 20_000 });
    await freshPage.getByTestId("memory-use-toggle").click();
    await expect(freshPage.getByTestId("memory-preferences")).toContainText(
      "教案长度：一页以内"
    );
    await expect(freshPage.getByTestId("memory-preferences")).toContainText(
      "案例偏好：优先使用贴近日常生活的案例"
    );
  } finally {
    await freshSession.close();
  }
});

test("explicit remember keeps duplicate, conflict and CourseRun scope under teacher control", async ({
  page,
  request
}) => {
  test.setTimeout(240_000);
  const task = await createStartedTask(request);
  cleanupTaskRefs.add(task.taskRef);
  let modelInvocationCreates = 0;
  page.on("request", (webRequest) => {
    if (
      webRequest.method() === "POST" &&
      new URL(webRequest.url()).pathname ===
        apiRoutes.teacher.modelInvocations
    ) {
      modelInvocationCreates += 1;
    }
  });
  await page.goto(`/agent/tasks/${encodeURIComponent(task.taskRef)}`);
  const input = page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  });
  await input.fill("以后教案尽量简洁");
  const conversationResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === apiRoutes.teacher.conversations
  );
  const firstCommandResponse = page.waitForResponse(
    isConversationTurnDispatch
  );
  await page.getByTestId("generate-copilot").click();
  const [conversationCreated, firstCommand] = await Promise.all([
    conversationResponse,
    firstCommandResponse
  ]);
  const conversationRef = (
    (await conversationCreated.json()) as {
      conversation: { conversationRef: string };
    }
  ).conversation.conversationRef;
  cleanupConversationRefs.add(conversationRef);
  expect((await firstCommand.json()).receipt.status).toBe("applied");
  expect(modelInvocationCreates).toBe(0);

  const duplicate = await sendMemoryCommand(
    page,
    "以后教案尽量简洁"
  );
  expect(duplicate.receipt.status).toBe("already_remembered");
  await expect(page.getByTestId("copilot-conversation")).toContainText(
    "没有重复保存"
  );

  const conflict = await sendMemoryCommand(
    page,
    "以后教案写详细一点"
  );
  expect(conflict.receipt.status).toBe("review_required");
  await expect(page.getByTestId("memory-conflict-card")).toContainText(
    "已保存的是“简洁”"
  );
  await page.getByTestId("keep-memory-preference").click();
  await expect(page.getByText("已保留原偏好")).toBeVisible({
    timeout: 20_000
  });

  const replacementConflict = await sendMemoryCommand(
    page,
    "以后教案写详细一点"
  );
  expect(replacementConflict.receipt.status).toBe("review_required");
  await page.getByTestId("replace-memory-preference").click();
  await expect(page.getByText("已替换并记住")).toBeVisible({
    timeout: 20_000
  });

  const courseCommand = await sendMemoryCommand(
    page,
    "记住：这门课以后教案尽量简洁"
  );
  expect(courseCommand.receipt).toMatchObject({
    status: "applied",
    items: [expect.objectContaining({
      displayValue: "简洁",
      scope: expect.objectContaining({
        kind: "course_run",
        courseRunRef: gate2DemoRefs.courseRunRef
      })
    })]
  });
  await expect(page.getByTestId("memory-command-receipt").last())
    .toContainText("作用范围：当前课程");
  const courseDuplicate = await sendMemoryCommand(
    page,
    "记住：这门课以后教案尽量简洁"
  );
  expect(courseDuplicate.receipt.status).toBe("already_remembered");
  expect(modelInvocationCreates).toBe(0);

  const currentRunText = "请为当前课程生成一版新教案。";
  await input.fill(currentRunText);
  const currentInvocationResponse = page.waitForResponse(
    isModelInvocationCreate
  );
  await page.getByTestId("generate-copilot").click();
  const currentInvocation = await currentInvocationResponse;
  const currentExecutionRef = (
    (await currentInvocation.json()) as {
      execution: { modelExecutionRef: string };
    }
  ).execution.modelExecutionRef;
  await waitForExecution(request, currentExecutionRef);
  await expect(page.getByTestId("memory-use-disclosure")).toBeVisible({
    timeout: 20_000
  });
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-preferences")).toContainText(
    "教案详细程度：简洁"
  );
  await expect(page.getByTestId("memory-preferences")).toContainText(
    "作用范围：当前课程"
  );
  await expect(page.getByTestId("memory-excluded")).toContainText(
    "教案详细程度：详细"
  );
  await expect(page.getByTestId("memory-excluded")).toContainText(
    "当前课程、课时或任务的偏好更具体"
  );

  const secondaryTask = await createStartedTask(
    request,
    secondaryCourseDemoRefs.lessonRef
  );
  cleanupTaskRefs.add(secondaryTask.taskRef);
  await page.goto(
    `/agent/tasks/${encodeURIComponent(secondaryTask.taskRef)}`
  );
  await page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  }).fill("请为另一门合成课程生成教案。");
  const secondaryConversationResponse = page.waitForResponse((response) =>
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
  const secondaryConversationRef = (
    (await secondaryConversation.json()) as {
      conversation: { conversationRef: string };
    }
  ).conversation.conversationRef;
  cleanupConversationRefs.add(secondaryConversationRef);
  const secondaryExecutionRef = (
    (await secondaryInvocation.json()) as {
      execution: { modelExecutionRef: string };
    }
  ).execution.modelExecutionRef;
  await waitForExecution(request, secondaryExecutionRef);
  await expect(page.getByTestId("memory-use-disclosure")).toBeVisible({
    timeout: 20_000
  });
  await page.getByTestId("memory-use-toggle").click();
  const secondaryPreferences = page.getByTestId("memory-preferences");
  await expect(secondaryPreferences).toContainText(
    "教案详细程度：详细"
  );
  await expect(secondaryPreferences).not.toContainText(
    "教案详细程度：简洁"
  );
  await expect(page.getByTestId("memory-use-disclosure")).not.toContainText(
    gate2DemoRefs.courseRunRef
  );
});

test("explicit forget revokes one preference and preserves sealed run history across restart", async ({
  page,
  request
}) => {
  test.setTimeout(240_000);
  const task = await createStartedTask(request);
  cleanupTaskRefs.add(task.taskRef);
  let modelInvocationCreates = 0;
  page.on("request", (webRequest) => {
    if (
      webRequest.method() === "POST" &&
      new URL(webRequest.url()).pathname ===
        apiRoutes.teacher.modelInvocations
    ) {
      modelInvocationCreates += 1;
    }
  });
  const started = await startConversationWithMemoryCommand(
    page,
    task.taskRef,
    "记住：以后案例尽量贴近日常生活"
  );
  cleanupConversationRefs.add(started.conversationRef);
  const startedReceipt = rememberReceipt(started.command);
  const rememberedItem = startedReceipt.items.find((item) =>
    item.canonicalKey === "example_preference"
  );
  expect(rememberedItem?.preferenceRef).toBeTruthy();
  const preferenceRef = rememberedItem!.preferenceRef!;

  const historicalRun = await sendModelInstruction(
    page,
    "请生成一版贴近日常生活的斜率教案"
  );
  const historicalCompleted = await waitForExecution(
    request,
    historicalRun.modelExecutionRef
  );
  expect(historicalCompleted.proposalRevisionRef).toBeTruthy();
  const historicalProposalRef = historicalCompleted.proposalRevisionRef!;
  await expect(page).toHaveURL(
    new RegExp(
      `/copilot/proposals/${encodeURIComponent(historicalProposalRef)}`
    ),
    { timeout: 20_000 }
  );
  await expect(page.getByTestId("memory-use-disclosure")).toBeVisible();
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-preferences")).toContainText(
    "案例偏好：优先使用贴近日常生活的案例"
  );
  expect(modelInvocationCreates).toBe(1);

  const forgotten = await sendMemoryCommand(
    page,
    "忘掉我之前关于案例类型的偏好。"
  );
  const forgottenReceipt = forgetReceipt(forgotten);
  expect(forgotten.receipt).toMatchObject({
    interpreterVersion: "explicit-forget-command-interpreter@1",
    status: "revoked",
    memoryEpochBefore: startedReceipt.memoryEpochAfter
  });
  expect(forgottenReceipt.memoryEpochAfter -
    forgottenReceipt.memoryEpochBefore).toBe(1);
  expect(modelInvocationCreates).toBe(1);
  const forgetReceiptCard = page.locator(
    '[data-testid="memory-command-receipt"][data-memory-command-kind="forget"]'
  ).last();
  await expect(forgetReceiptCard).toHaveAttribute(
    "data-memory-command-status",
    "revoked"
  );
  await expect(forgetReceiptCard).toContainText("案例偏好");
  await expect(forgetReceiptCard).toContainText("当前状态已撤销");
  await expect(forgetReceiptCard).toContainText("后续新备课不再参考");
  await expect(page.getByText("生成中", { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(forgetReceiptCard).toContainText("当前状态已撤销", {
    timeout: 20_000
  });
  await restartApi(request, "enabled", "enabled", "enabled");
  await page.reload();
  await expect(forgetReceiptCard).toContainText("后续新备课不再参考", {
    timeout: 20_000
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "助手偏好" }).click();
  const settings = page.getByTestId("teacher-preference-settings");
  await expect(settings).toContainText("已删除");
  await expect(settings).toContainText(
    "案例偏好：优先使用贴近日常生活的案例"
  );

  await page.goto(
    `/agent/tasks/${encodeURIComponent(task.taskRef)}?conversation=${encodeURIComponent(started.conversationRef)}`
  );
  const laterRun = await sendModelInstruction(
    page,
    "请生成一版不依赖长期案例偏好的新教案"
  );
  const laterCompleted = await waitForExecution(
    request,
    laterRun.modelExecutionRef
  );
  expect(laterCompleted.proposalRevisionRef).toBeTruthy();
  await expect(page).toHaveURL(
    new RegExp(
      `/copilot/proposals/${encodeURIComponent(laterCompleted.proposalRevisionRef!)}`
    ),
    { timeout: 20_000 }
  );
  await expect(page.getByTestId("memory-use-disclosure")).toBeVisible();
  await expect(page.getByTestId("memory-use-disclosure")).not.toContainText(
    "案例偏好：优先使用贴近日常生活的案例"
  );
  expect(modelInvocationCreates).toBe(2);

  await page.goto(
    `/copilot/proposals/${encodeURIComponent(historicalProposalRef)}`
  );
  await expect(page.getByTestId("memory-use-disclosure")).toBeVisible();
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-preferences")).toContainText(
    "本次运行当时参考，当前已撤销"
  );
  await expect(page.getByTestId("memory-preferences")).toContainText(
    "案例偏好：优先使用贴近日常生活的案例"
  );
  const state = await teacherPersonalizationState(request);
  expect(state.preferences.find((preference) =>
    preference.preferenceRef === preferenceRef
  )?.status).toBe("revoked");
});

test("explicit forget requires scope selection and atomically confirms an explicit batch", async ({
  page,
  request
}) => {
  test.setTimeout(300_000);
  const task = await createStartedTask(request);
  cleanupTaskRefs.add(task.taskRef);
  const started = await startConversationWithMemoryCommand(
    page,
    task.taskRef,
    "记住：以后案例尽量贴近日常生活"
  );
  cleanupConversationRefs.add(started.conversationRef);
  const globalRef = rememberReceipt(started.command)
    .items[0]!.preferenceRef!;
  const courseRemember = await sendMemoryCommand(
    page,
    "记住：这门课以后案例尽量贴近日常生活"
  );
  const courseRef = rememberReceipt(courseRemember)
    .items[0]!.preferenceRef!;

  const selection = await sendMemoryCommand(page, "忘掉案例偏好");
  const selectionReceipt = forgetReceipt(selection);
  expect(selectionReceipt).toMatchObject({
    interpreterVersion: "explicit-forget-command-interpreter@1",
    status: "selection_required"
  });
  const epochBeforeSelection = selectionReceipt.memoryEpochBefore;
  expect(selectionReceipt.memoryEpochAfter).toBe(epochBeforeSelection);
  const selectionCard = page.locator(
    '[data-testid="memory-command-receipt"][data-memory-command-status="selection_required"]'
  ).last();
  await expect(selectionCard.getByTestId("forget-memory-option"))
    .toHaveCount(2);
  await expect(selectionCard).toContainText("所有普通备课");
  await expect(selectionCard).toContainText("当前课程");
  let state = await teacherPersonalizationState(request);
  expect(activeExamplePreferenceRefs(state).sort())
    .toEqual([courseRef, globalRef].sort());

  await selectionCard.getByTestId("forget-option-course_run").check();
  const confirmResponsePromise = page.waitForResponse(
    isForgetConfirmation
  );
  await selectionCard.getByTestId("confirm-forget-selection").click();
  const confirmResponse = await confirmResponsePromise;
  expect(confirmResponse.status()).toBe(201);
  const confirmBody = (await confirmResponse.json()) as {
    replayed: boolean;
    receipt: {
      memoryEpochBefore: number;
      memoryEpochAfter: number;
      status: string;
    };
  };
  expect(confirmBody).toMatchObject({
    replayed: false,
    receipt: { status: "revoked" }
  });
  expect(confirmBody.receipt.memoryEpochAfter -
    confirmBody.receipt.memoryEpochBefore).toBe(1);
  await expect(page.locator(
    '[data-testid="memory-command-receipt"][data-memory-command-status="resolved"]'
  ).last()).toContainText("这次选择已处理");
  state = await teacherPersonalizationState(request);
  expect(state.preferences.find((entry) =>
    entry.preferenceRef === courseRef
  )?.status).toBe("revoked");
  expect(state.preferences.find((entry) =>
    entry.preferenceRef === globalRef
  )?.status).toBe("active");

  const fallbackRun = await sendModelInstruction(
    page,
    "请为当前课程生成一版新教案"
  );
  await waitForExecution(request, fallbackRun.modelExecutionRef);
  await expect(page.getByTestId("memory-use-disclosure")).toBeVisible({
    timeout: 20_000
  });
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-preferences")).toContainText(
    "作用范围：所有普通备课"
  );
  await expect(page.getByTestId("memory-use-disclosure")).not.toContainText(
    gate2DemoRefs.courseRunRef
  );

  const secondaryTask = await createStartedTask(
    request,
    secondaryCourseDemoRefs.lessonRef
  );
  cleanupTaskRefs.add(secondaryTask.taskRef);
  await page.goto(
    `/agent/tasks/${encodeURIComponent(secondaryTask.taskRef)}`
  );
  await page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  }).fill("请为第二门合成课程生成教案");
  const secondaryConversationResponse = page.waitForResponse((response) =>
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
  const secondaryConversationRef = (
    (await secondaryConversation.json()) as {
      conversation: { conversationRef: string };
    }
  ).conversation.conversationRef;
  cleanupConversationRefs.add(secondaryConversationRef);
  const secondaryExecutionRef = (
    (await secondaryInvocation.json()) as {
      execution: { modelExecutionRef: string };
    }
  ).execution.modelExecutionRef;
  await waitForExecution(request, secondaryExecutionRef);
  await expect(page.getByTestId("memory-use-disclosure")).toBeVisible({
    timeout: 20_000
  });
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-preferences")).toContainText(
    "作用范围：所有普通备课"
  );
  await expect(page.getByTestId("memory-use-disclosure")).not.toContainText(
    courseRef
  );

  await page.goto(
    `/agent/tasks/${encodeURIComponent(task.taskRef)}?conversation=${encodeURIComponent(started.conversationRef)}`
  );
  const replacementCourse = await sendMemoryCommand(
    page,
    "记住：这门课以后案例尽量贴近日常生活"
  );
  const replacementCourseRef =
    rememberReceipt(replacementCourse).items[0]!.preferenceRef!;
  const batchSelection = await sendMemoryCommand(
    page,
    "忘掉所有关于案例的偏好"
  );
  expect(forgetReceipt(batchSelection).status).toBe("selection_required");
  const batchCard = page.locator(
    '[data-testid="memory-command-receipt"][data-memory-command-status="selection_required"]'
  ).last();
  await expect(batchCard.getByTestId("forget-memory-option")).toHaveCount(2);
  await batchCard.getByTestId("forget-option-global").check();
  await batchCard.getByTestId("forget-option-course_run").check();
  const batchResponsePromise = page.waitForResponse(isForgetConfirmation);
  await batchCard.getByTestId("confirm-forget-selection").click();
  const batchResponse = await batchResponsePromise;
  expect(batchResponse.status()).toBe(201);
  const batchBody = (await batchResponse.json()) as {
    replayed: boolean;
    receipt: {
      status: string;
      memoryEpochBefore: number;
      memoryEpochAfter: number;
    };
  };
  expect(batchBody.receipt.status).toBe("revoked");
  expect(batchBody.receipt.memoryEpochAfter -
    batchBody.receipt.memoryEpochBefore).toBe(2);
  const replayData = batchResponse.request().postDataJSON();
  const replay = await request.post(
    apiRoutes.teacher.conversationForgetConfirm(
      started.conversationRef,
      batchSelection.teacherTurn.turnRef
    ),
    { headers, data: replayData }
  );
  expect(replay.status()).toBe(200);
  expect((await replay.json()).replayed).toBe(true);
  state = await teacherPersonalizationState(request);
  expect(state.preferences.find((entry) =>
    entry.preferenceRef === globalRef
  )?.status).toBe("revoked");
  expect(state.preferences.find((entry) =>
    entry.preferenceRef === replacementCourseRef
  )?.status).toBe("revoked");
});

test("explicit forget rejects false positives, foreign owners and a disabled conversation flag", async ({
  page,
  request
}) => {
  test.setTimeout(240_000);
  const task = await createStartedTask(request);
  cleanupTaskRefs.add(task.taskRef);
  const started = await startConversationWithMemoryCommand(
    page,
    task.taskRef,
    "记住：以后案例尽量贴近日常生活"
  );
  cleanupConversationRefs.add(started.conversationRef);
  const preferenceRef = rememberReceipt(started.command)
    .items[0]!.preferenceRef!;

  const temporary = await sendModelInstruction(
    page,
    "这次不要使用生活化案例"
  );
  const temporaryCompleted = await waitForExecution(
    request,
    temporary.modelExecutionRef
  );
  await expect(page).toHaveURL(
    new RegExp(
      `/copilot/proposals/${encodeURIComponent(temporaryCompleted.proposalRevisionRef!)}`
    ),
    { timeout: 20_000 }
  );
  let state = await teacherPersonalizationState(request);
  expect(state.preferences.find((entry) =>
    entry.preferenceRef === preferenceRef
  )?.status).toBe("active");

  const negativeRemember = await sendUnsupportedMemoryCommand(
    page,
    "不要记住这次的要求"
  );
  expect(negativeRemember.safeReasonCode).toBe("negative_remember_request");
  const ordinary = await sendModelInstruction(
    page,
    "不要安排小组讨论"
  );
  const ordinaryCompleted = await waitForExecution(
    request,
    ordinary.modelExecutionRef
  );
  await expect(page).toHaveURL(
    new RegExp(
      `/copilot/proposals/${encodeURIComponent(ordinaryCompleted.proposalRevisionRef!)}`
    ),
    { timeout: 20_000 }
  );
  state = await teacherPersonalizationState(request);
  expect(state.preferences.find((entry) =>
    entry.preferenceRef === preferenceRef
  )?.status).toBe("active");

  const foreign = await request.get(
    apiRoutes.teacher.conversation(started.conversationRef),
    { headers: {
      "x-demo-tenant": "tenant:demo-school-b",
      "x-demo-actor": "user:teacher-b-001"
    } }
  );
  expect([403, 404]).toContain(foreign.status());
  const foreignBody = await foreign.json();
  expect(JSON.stringify(foreignBody)).not.toContain(preferenceRef);
  expect(JSON.stringify(foreignBody)).not.toContain(
    gate2DemoRefs.courseRunRef
  );

  await restartApi(request, "enabled", "enabled", "disabled");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("generate-copilot")).toBeEnabled();
  const disabledState = await teacherPersonalizationState(request);
  expect(disabledState.explicitForgetEnabled).toBe(false);
  const blocked = await sendUnsupportedMemoryCommand(
    page,
    "忘掉案例偏好"
  );
  expect(blocked).toMatchObject({
    safeReasonCode: "explicit_forget_disabled"
  });
  await expect(page.getByTestId("copilot-conversation")).toContainText(
    "对话式忘记当前未启用"
  );
  state = await teacherPersonalizationState(request);
  expect(state.preferences.find((entry) =>
    entry.preferenceRef === preferenceRef
  )?.status).toBe("active");
  await page.getByRole("button", { name: "查看助手偏好" }).last().click();
  await expect(page).toHaveURL(/\/settings$/u);
  await expect(page.getByTestId("teacher-preference-settings"))
    .toContainText("案例偏好");
});

test("explicit remember rejects unsafe and unsupported commands and obeys its feature flag", async ({
  page,
  request
}) => {
  test.setTimeout(180_000);
  const task = await createStartedTask(request);
  cleanupTaskRefs.add(task.taskRef);
  await page.goto(`/agent/tasks/${encodeURIComponent(task.taskRef)}`);
  const input = page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  });
  await input.fill("记住某班学生能力差");
  const conversationResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === apiRoutes.teacher.conversations
  );
  const unsafeResponse = page.waitForResponse(isConversationTurnDispatch);
  await page.getByTestId("generate-copilot").click();
  const [conversationCreated, unsafe] = await Promise.all([
    conversationResponse,
    unsafeResponse
  ]);
  const conversationRef = (
    (await conversationCreated.json()) as {
      conversation: { conversationRef: string };
    }
  ).conversation.conversationRef;
  cleanupConversationRefs.add(conversationRef);
  expect(await unsafe.json()).toMatchObject({
    kind: "unsupported_memory_command",
    safeReasonCode: "unsafe_memory_content"
  });
  await expect(page.getByTestId("copilot-conversation")).toContainText(
    "未保存为长期偏好"
  );

  const forget = await sendMemoryCommand(
    page,
    "忘掉案例偏好"
  );
  expect(forget).toMatchObject({
    kind: "memory_command",
    receipt: {
      status: "nothing_to_forget"
    }
  });
  await expect(page.getByTestId("copilot-conversation")).toContainText(
    "没有找到当前可撤销的匹配偏好"
  );

  const mixedTemporary = await sendUnsupportedMemoryCommand(
    page,
    "记住这次公开课写详细一点"
  );
  expect(mixedTemporary).toMatchObject({
    kind: "unsupported_memory_command",
    safeReasonCode: "temporary_override_not_saved"
  });

  const temporaryInstruction = await sendModelInstruction(
    page,
    "这次公开课写详细一点"
  );
  expect(temporaryInstruction.dispatch.kind).toBe("model_instruction");
  const temporaryCompleted = await waitForExecution(
    request,
    temporaryInstruction.modelExecutionRef
  );
  expect(temporaryCompleted.proposalRevisionRef).toBeTruthy();
  await expect(page).toHaveURL(
    new RegExp(
      `/copilot/proposals/${encodeURIComponent(temporaryCompleted.proposalRevisionRef!)}`
    ),
    { timeout: 20_000 }
  );
  const falsePositive = await sendModelInstruction(page, "以后再说");
  expect(falsePositive.dispatch.kind).toBe("model_instruction");
  const falsePositiveCompleted = await waitForExecution(
    request,
    falsePositive.modelExecutionRef
  );
  expect(falsePositiveCompleted.proposalRevisionRef).toBeTruthy();
  await expect(page).toHaveURL(
    new RegExp(
      `/copilot/proposals/${encodeURIComponent(falsePositiveCompleted.proposalRevisionRef!)}`
    ),
    { timeout: 20_000 }
  );

  const beforeDisabled = await request.get(
    apiRoutes.teacher.personalizationState,
    { headers }
  );
  expect(beforeDisabled.status()).toBe(200);
  expect(((await beforeDisabled.json()) as {
    preferences: Array<{ status: string }>;
  }).preferences.filter((preference) => preference.status === "active"))
    .toHaveLength(0);
  await restartApi(request, "enabled", "disabled");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("generate-copilot")).toBeEnabled();
  const disabledState = await request.get(
    apiRoutes.teacher.personalizationState,
    { headers }
  );
  expect(disabledState.status()).toBe(200);
  expect((await disabledState.json()).explicitRememberEnabled).toBe(false);
  const disabled = await sendUnsupportedMemoryCommand(
    page,
    "记住：教案控制在一页"
  );
  expect(disabled).toMatchObject({
    kind: "unsupported_memory_command",
    safeReasonCode: "explicit_remember_disabled"
  });
  await expect(page.getByTestId("copilot-conversation")).toContainText(
    "长期偏好功能当前未启用，本次未保存"
  );
  const afterDisabled = await request.get(
    apiRoutes.teacher.personalizationState,
    { headers }
  );
  expect(afterDisabled.status()).toBe(200);
  expect(((await afterDisabled.json()) as {
    preferences: Array<{ status: string }>;
  }).preferences.filter((preference) => preference.status === "active"))
    .toHaveLength(0);
});

test("temporary detail override survives refresh and restart, then clears without changing durable memory", async ({
  page,
  request
}) => {
  test.setTimeout(300_000);
  await createAndConfirmPreferenceInSettings(page, {
    keyLabel: "教案详细程度",
    value: "简洁",
    scope: "global"
  });
  const beforeState = await teacherPersonalizationState(request);
  const durablePreference = beforeState.preferences.find((preference) =>
    preference.status === "active" &&
    preference.canonicalKey === "lesson_plan_detail" &&
    preference.preferenceValue === "简洁"
  );
  expect(durablePreference).toBeTruthy();
  const durableCountsBefore = {
    candidates: beforeState.candidates.length,
    preferences: beforeState.preferences.length
  };

  const task = await createStartedTask(request);
  cleanupTaskRefs.add(task.taskRef);
  await page.goto(`/agent/tasks/${encodeURIComponent(task.taskRef)}`);
  const baselineRun = await sendModelInstruction(
    page,
    "请先生成一版用于验证长期偏好的合成教案。"
  );
  cleanupConversationRefs.add(
    baselineRun.dispatch.conversation.conversationRef
  );
  const baselineExecution = await waitForExecution(
    request,
    baselineRun.modelExecutionRef
  );
  await expect(page).toHaveURL(
    new RegExp(
      `/copilot/proposals/${encodeURIComponent(baselineExecution.proposalRevisionRef!)}`
    ),
    { timeout: 20_000 }
  );
  const baselineContext = await proposalMemoryContext(
    request,
    baselineExecution.proposalRevisionRef!
  );
  expect(baselineContext).toMatchObject({
    manifestVersion: 3,
    temporaryOverrides: [],
    durablePreferences: [
      expect.objectContaining({
        preferenceRef: durablePreference!.preferenceRef,
        preferenceValue: "简洁",
        decision: "injected"
      })
    ]
  });

  const temporaryText =
    "这次是公开课，教案写详细一点，但别改我平时的习惯。";
  const temporaryRun = await sendModelInstruction(page, temporaryText);
  expect(temporaryRun.dispatch.temporaryOverrideReceipt).toMatchObject({
    status: "applied",
    longTermPreferenceChanged: false,
    items: [expect.objectContaining({
      canonicalKey: "lesson_plan_detail",
      effect: "replace_value",
      canonicalValue: "详细",
      lifetime: "current_conversation",
      eligibleForConsolidation: false
    })]
  });
  expect(
    temporaryRun.dispatch.temporaryOverrideReceipt!.teacherMemoryEpochAfter
  ).toBe(
    temporaryRun.dispatch.temporaryOverrideReceipt!.teacherMemoryEpochBefore
  );
  const temporaryExecution = await waitForExecution(
    request,
    temporaryRun.modelExecutionRef
  );
  const temporaryProposalRef = temporaryExecution.proposalRevisionRef!;
  await expect(page).toHaveURL(
    new RegExp(
      `/copilot/proposals/${encodeURIComponent(temporaryProposalRef)}`
    ),
    { timeout: 20_000 }
  );
  const temporaryContext = await proposalMemoryContext(
    request,
    temporaryProposalRef
  );
  expect(temporaryContext.teacherMemoryEpoch).toBe(
    baselineContext.teacherMemoryEpoch
  );
  expect(temporaryContext).toMatchObject({
    manifestVersion: 3,
    temporaryOverrides: [expect.objectContaining({
      canonicalKey: "lesson_plan_detail",
      effect: "replace_value",
      displayValue: "详细",
      decision: "injected"
    })],
    durablePreferences: [expect.objectContaining({
      preferenceRef: durablePreference!.preferenceRef,
      preferenceValue: "简洁",
      decision: "overridden",
      reasonCode: "current_instruction_override"
    })]
  });
  await expect(page.getByTestId("temporary-override-receipt"))
    .toContainText("不会修改你平时保存的偏好");
  await expect(page.getByTestId("active-temporary-overrides"))
    .toContainText("教案详细程度：详细");
  const temporaryDisclosure = page.getByTestId("memory-use-disclosure");
  await expect(temporaryDisclosure).toHaveAttribute(
    "data-manifest-version",
    "3"
  );
  const temporaryPackRef = await temporaryDisclosure.getAttribute(
    "data-pack-ref"
  );
  const temporaryPackHash = await temporaryDisclosure.getAttribute(
    "data-pack-content-hash"
  );
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-temporary-overrides"))
    .toContainText("教案详细程度：详细");
  await expect(page.getByTestId("memory-excluded"))
    .toContainText("教案详细程度：简洁");
  await expect(page.getByTestId("memory-excluded"))
    .toContainText("本次明确要求优先");
  await expect(page.getByTestId("memory-temporary-disclaimer"))
    .toContainText("本次覆盖不会修改你的长期偏好");

  await page.goto(`/runs/tasks/${encodeURIComponent(task.taskRef)}`);
  await expect(page.getByTestId("memory-use-disclosure")).toHaveAttribute(
    "data-pack-ref",
    temporaryPackRef!
  );
  await expect(page.getByTestId("memory-use-disclosure")).toHaveAttribute(
    "data-pack-content-hash",
    temporaryPackHash!
  );
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-run-metadata"))
    .toContainText("lesson-preparation@7");

  await page.goto(
    `/agent/tasks/${encodeURIComponent(task.taskRef)}?conversation=${encodeURIComponent(temporaryRun.dispatch.conversation.conversationRef)}`
  );
  await page.reload();
  await expect(page.getByTestId("active-temporary-overrides"))
    .toContainText("教案详细程度：详细");
  await restartApi(request);
  await page.reload();
  await expect(page.getByTestId("active-temporary-overrides"))
    .toContainText("教案详细程度：详细");

  const continuationRun = await sendModelInstruction(
    page,
    "再加一个互动活动。"
  );
  expect(continuationRun.dispatch.temporaryOverrideReceipt).toBeUndefined();
  expect(continuationRun.dispatch.workingMemory).toMatchObject({
    builderVersion: "working-memory-builder@2",
    temporaryOverrides: [expect.objectContaining({
      canonicalKey: "lesson_plan_detail",
      canonicalValue: "详细"
    })]
  });
  const continuationExecution = await waitForExecution(
    request,
    continuationRun.modelExecutionRef
  );
  await expect(page).toHaveURL(
    new RegExp(
      `/copilot/proposals/${encodeURIComponent(continuationExecution.proposalRevisionRef!)}`
    ),
    { timeout: 20_000 }
  );
  const continuationContext = await proposalMemoryContext(
    request,
    continuationExecution.proposalRevisionRef!
  );
  expect(continuationContext.temporaryOverrides).toEqual([
    expect.objectContaining({ canonicalKey: "lesson_plan_detail" })
  ]);

  const clearRun = await sendModelInstruction(page, "恢复平时的习惯。");
  expect(clearRun.dispatch.temporaryOverrideReceipt).toMatchObject({
    status: "cleared",
    longTermPreferenceChanged: false,
    clearedCanonicalKeys: ["lesson_plan_detail"]
  });
  expect(clearRun.dispatch.workingMemory).toMatchObject({
    builderVersion: "working-memory-builder@2",
    temporaryOverrides: []
  });
  await expect(page.getByTestId("active-temporary-overrides")).toHaveCount(0);
  const clearExecution = await waitForExecution(
    request,
    clearRun.modelExecutionRef
  );
  const clearContext = await proposalMemoryContext(
    request,
    clearExecution.proposalRevisionRef!
  );
  expect(clearContext.teacherMemoryEpoch).toBe(
    baselineContext.teacherMemoryEpoch
  );
  expect(clearContext).toMatchObject({
    manifestVersion: 3,
    temporaryOverrides: [],
    durablePreferences: [expect.objectContaining({
      preferenceRef: durablePreference!.preferenceRef,
      preferenceValue: "简洁",
      decision: "injected"
    })]
  });

  await page.goto(
    `/copilot/proposals/${encodeURIComponent(temporaryProposalRef)}`
  );
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-temporary-overrides"))
    .toContainText("教案详细程度：详细");

  const finalState = await teacherPersonalizationState(request);
  expect({
    candidates: finalState.candidates.length,
    preferences: finalState.preferences.length
  }).toEqual(durableCountsBefore);
  expect(finalState.preferences.find((preference) =>
    preference.preferenceRef === durablePreference!.preferenceRef
  )).toMatchObject({
    status: "active",
    version: durablePreference!.version,
    preferenceValue: "简洁"
  });

  await closeConversationIfOpen(
    request,
    temporaryRun.dispatch.conversation.conversationRef
  );
  await page.goto(`/agent/tasks/${encodeURIComponent(task.taskRef)}`);
  const freshRun = await sendModelInstruction(
    page,
    "请在新的备课对话中继续生成。"
  );
  const freshConversationRef = freshRun.dispatch.conversation.conversationRef;
  cleanupConversationRefs.add(freshConversationRef);
  expect(freshConversationRef).not.toBe(
    temporaryRun.dispatch.conversation.conversationRef
  );
  expect(freshRun.dispatch.workingMemory).toMatchObject({
    builderVersion: "working-memory-builder@2",
    temporaryOverrides: []
  });
  const freshExecution = await waitForExecution(
    request,
    freshRun.modelExecutionRef
  );
  const freshContext = await proposalMemoryContext(
    request,
    freshExecution.proposalRevisionRef!
  );
  expect(freshContext.temporaryOverrides).toEqual([]);
  expect(freshContext.durablePreferences).toEqual(expect.arrayContaining([
    expect.objectContaining({
      preferenceRef: durablePreference!.preferenceRef,
      preferenceValue: "简洁",
      decision: "injected"
    })
  ]));

  const foreign = await request.get(
    apiRoutes.teacher.conversation(freshConversationRef),
    {
      headers: {
        "x-demo-tenant": "tenant:demo-school-b",
        "x-demo-actor": "user:teacher-b-001"
      }
    }
  );
  expect([403, 404]).toContain(foreign.status());
  expect(JSON.stringify(await foreign.json())).not.toContain("详细");
});

test("temporary suppression, no-durable overrides and flag fallback remain explicit", async ({
  page,
  request
}) => {
  test.setTimeout(300_000);
  const task = await createStartedTask(request);
  cleanupTaskRefs.add(task.taskRef);
  const remembered = await startConversationWithMemoryCommand(
    page,
    task.taskRef,
    "记住：以后案例尽量贴近日常生活"
  );
  cleanupConversationRefs.add(remembered.conversationRef);
  const remember = rememberReceipt(remembered.command);
  const preferenceRef = remember.items[0]!.preferenceRef!;
  const stableEpoch = remember.memoryEpochAfter;

  const suppressRun = await sendModelInstruction(
    page,
    "这次不要使用生活化案例。"
  );
  expect(suppressRun.dispatch.temporaryOverrideReceipt).toMatchObject({
    status: "applied",
    longTermPreferenceChanged: false,
    teacherMemoryEpochBefore: stableEpoch,
    teacherMemoryEpochAfter: stableEpoch,
    items: [expect.objectContaining({
      canonicalKey: "example_preference",
      effect: "suppress_preference",
      canonicalValue: null
    })]
  });
  const suppressExecution = await waitForExecution(
    request,
    suppressRun.modelExecutionRef
  );
  const suppressContext = await proposalMemoryContext(
    request,
    suppressExecution.proposalRevisionRef!
  );
  expect(suppressContext).toMatchObject({
    manifestVersion: 3,
    teacherMemoryEpoch: stableEpoch,
    temporaryOverrides: [expect.objectContaining({
      canonicalKey: "example_preference",
      effect: "suppress_preference",
      decision: "injected"
    })],
    durablePreferences: [expect.objectContaining({
      preferenceRef,
      decision: "overridden",
      reasonCode: "current_instruction_override"
    })]
  });
  await expect(page.getByTestId("active-temporary-overrides"))
    .toContainText("仅本次不使用");
  await page.getByTestId("memory-use-toggle").click();
  await expect(page.getByTestId("memory-temporary-overrides"))
    .toContainText("优先使用贴近日常生活的案例");
  const stateAfterSuppress = await teacherPersonalizationState(request);
  expect(stateAfterSuppress.preferences.find((preference) =>
    preference.preferenceRef === preferenceRef
  )?.status).toBe("active");

  await closeConversationIfOpen(request, remembered.conversationRef);
  await page.goto(`/agent/tasks/${encodeURIComponent(task.taskRef)}`);
  const restoredRun = await sendModelInstruction(
    page,
    "请在新会话中生成一版教案。"
  );
  const restoredConversationRef =
    restoredRun.dispatch.conversation.conversationRef;
  cleanupConversationRefs.add(restoredConversationRef);
  const restoredExecution = await waitForExecution(
    request,
    restoredRun.modelExecutionRef
  );
  await expect(page).toHaveURL(
    new RegExp(
      `/copilot/proposals/${encodeURIComponent(restoredExecution.proposalRevisionRef!)}`
    ),
    { timeout: 20_000 }
  );
  const restoredContext = await proposalMemoryContext(
    request,
    restoredExecution.proposalRevisionRef!
  );
  expect(restoredContext.temporaryOverrides).toEqual([]);
  expect(restoredContext.durablePreferences).toEqual(expect.arrayContaining([
    expect.objectContaining({
      preferenceRef,
      preferenceValue: "优先使用贴近日常生活的案例",
      decision: "injected"
    })
  ]));

  const noDurableRun = await sendModelInstruction(
    page,
    "本次建议写详细一些。"
  );
  expect(noDurableRun.dispatch.temporaryOverrideReceipt).toMatchObject({
    status: "applied",
    items: [expect.objectContaining({
      canonicalKey: "response_length",
      effect: "replace_value",
      canonicalValue: "详细"
    })]
  });
  const noDurableExecution = await waitForExecution(
    request,
    noDurableRun.modelExecutionRef
  );
  await expect(page).toHaveURL(
    new RegExp(
      `/copilot/proposals/${encodeURIComponent(noDurableExecution.proposalRevisionRef!)}`
    ),
    { timeout: 20_000 }
  );
  const noDurableContext = await proposalMemoryContext(
    request,
    noDurableExecution.proposalRevisionRef!
  );
  expect(noDurableContext.temporaryOverrides).toEqual(expect.arrayContaining([
    expect.objectContaining({
      canonicalKey: "response_length",
      displayValue: "详细"
    })
  ]));
  expect(noDurableContext.durablePreferences.some((preference: {
    canonicalKey?: string;
  }) => preference.canonicalKey === "response_length")).toBe(false);

  const ordinaryRun = await sendModelInstruction(
    page,
    "不要安排小组讨论。"
  );
  expect(ordinaryRun.dispatch.temporaryOverrideReceipt).toBeUndefined();
  expect(ordinaryRun.dispatch.workingMemory).toMatchObject({
    builderVersion: "working-memory-builder@2",
    temporaryOverrides: [expect.objectContaining({
      canonicalKey: "response_length"
    })]
  });
  await waitForExecution(request, ordinaryRun.modelExecutionRef);

  const foreign = await request.get(
    apiRoutes.teacher.conversation(restoredConversationRef),
    {
      headers: {
        "x-demo-tenant": "tenant:demo-school-b",
        "x-demo-actor": "user:teacher-b-001"
      }
    }
  );
  expect([403, 404]).toContain(foreign.status());
  expect(JSON.stringify(await foreign.json())).not.toContain("response_length");

  await closeConversationIfOpen(request, restoredConversationRef);
  await restartApi(request, "enabled", "enabled", "enabled", "disabled");
  await page.goto(`/agent/tasks/${encodeURIComponent(task.taskRef)}`);
  const disabledRun = await sendModelInstruction(
    page,
    "这次教案写详细一点。"
  );
  const disabledConversationRef =
    disabledRun.dispatch.conversation.conversationRef;
  cleanupConversationRefs.add(disabledConversationRef);
  expect(disabledRun.dispatch.temporaryOverrideReceipt).toBeUndefined();
  expect(disabledRun.dispatch.workingMemory).toMatchObject({
    builderVersion: "working-memory-builder@1"
  });
  const disabledExecution = await waitForExecution(
    request,
    disabledRun.modelExecutionRef
  );
  const disabledContext = await proposalMemoryContext(
    request,
    disabledExecution.proposalRevisionRef!
  );
  expect(disabledContext).toMatchObject({
    manifestVersion: 2,
    temporaryOverrides: []
  });
  await expect(page.getByTestId("active-temporary-overrides")).toHaveCount(0);
  await expect(page.getByTestId("memory-use-disclosure")).toHaveAttribute(
    "data-manifest-version",
    "2"
  );
});

async function startConversationWithMemoryCommand(
  page: Page,
  taskRef: string,
  teacherText: string
): Promise<{
  conversationRef: string;
  command: Extract<
    DispatchTeacherConversationTurnResult,
    { kind: "memory_command" }
  >;
}> {
  await page.goto(`/agent/tasks/${encodeURIComponent(taskRef)}`);
  await page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  }).fill(teacherText);
  const conversationResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === apiRoutes.teacher.conversations
  );
  const commandResponse = page.waitForResponse(isConversationTurnDispatch);
  await page.getByTestId("generate-copilot").click();
  const [created, dispatched] = await Promise.all([
    conversationResponse,
    commandResponse
  ]);
  expect(created.status()).toBe(201);
  expect(dispatched.status()).toBe(201);
  const conversationRef = (
    (await created.json()) as {
      conversation: { conversationRef: string };
    }
  ).conversation.conversationRef;
  const command = DispatchTeacherConversationTurnResultSchema.parse(
    await dispatched.json()
  );
  if (
    command.kind !== "memory_command" ||
    command.receipt.interpreterVersion !==
      "explicit-memory-command-interpreter@1"
  ) {
    throw new Error("Expected an explicit remember command receipt.");
  }
  return { conversationRef, command };
}

function forgetReceipt(
  result: Extract<
    DispatchTeacherConversationTurnResult,
    { kind: "memory_command" }
  >
) {
  if (
    result.receipt.interpreterVersion !==
      "explicit-forget-command-interpreter@1"
  ) {
    throw new Error("Expected an explicit forget command receipt.");
  }
  return result.receipt;
}

function rememberReceipt(
  result: Extract<
    DispatchTeacherConversationTurnResult,
    { kind: "memory_command" }
  >
): ExplicitRememberReceipt {
  if (
    result.receipt.interpreterVersion !==
      "explicit-memory-command-interpreter@1"
  ) {
    throw new Error("Expected an explicit remember command receipt.");
  }
  return result.receipt;
}

async function teacherPersonalizationState(
  request: APIRequestContext
): Promise<TeacherPersonalizationState> {
  const response = await request.get(
    apiRoutes.teacher.personalizationState,
    { headers }
  );
  expect(response.status()).toBe(200);
  return TeacherPersonalizationStateSchema.parse(await response.json());
}

function activeExamplePreferenceRefs(
  state: TeacherPersonalizationState
): string[] {
  return state.preferences
    .filter((preference) =>
      preference.status === "active" &&
      preference.canonicalKey === "example_preference"
    )
    .map((preference) => preference.preferenceRef);
}

async function createAndConfirmPreferenceInSettings(
  page: Page,
  input: {
    keyLabel?: "教案详细程度" | "案例偏好";
    value: string;
    scope: "global" | "course_run";
  }
): Promise<void> {
  await page.goto("/settings");
  await page.getByRole("button", { name: "助手偏好" }).click();
  const panel = page.getByTestId("teacher-preference-settings");
  await expect(panel).toBeVisible();
  await panel.getByLabel("偏好类型").click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .filter({ hasText: input.keyLabel ?? "教案详细程度" })
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
    (preferenceKey === "lesson_plan_length" &&
      preferenceValue === "一页以内") ||
    (preferenceKey === "example_preference" &&
      preferenceValue === "优先使用贴近日常生活的案例") ||
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
  scopedPreferences?: "enabled" | "disabled",
  explicitRemember?: "enabled" | "disabled",
  explicitForget?: "enabled" | "disabled",
  temporaryOverrides?: "enabled" | "disabled"
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
  if (explicitRemember) {
    url.searchParams.set("explicit-remember", explicitRemember);
  }
  if (explicitForget) {
    url.searchParams.set("explicit-forget", explicitForget);
  }
  if (temporaryOverrides) {
    url.searchParams.set("temporary-overrides", temporaryOverrides);
  }
  const response = await request.post(url.toString(), {
    headers: { "x-e2e-run-id": runId! }
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    restarted: true,
    scopedPreferences: scopedPreferences ?? "unchanged",
    explicitRemember: explicitRemember ?? "unchanged",
    explicitForget: explicitForget ?? "unchanged",
    temporaryOverrides: temporaryOverrides ?? "unchanged"
  });
}

function isConversationTurnDispatch(response: {
  request(): { method(): string };
  url(): string;
}) {
  return (
    response.request().method() === "POST" &&
    /^\/api\/v1\/teacher\/conversations\/[^/]+\/dispatch-turn$/u.test(
      new URL(response.url()).pathname
    )
  );
}

async function sendMemoryCommand(
  page: Page,
  teacherText: string
): Promise<Extract<
  DispatchTeacherConversationTurnResult,
  { kind: "memory_command" }
>> {
  await page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  }).fill(teacherText);
  const responsePromise = page.waitForResponse(isConversationTurnDispatch);
  await page.getByTestId("generate-copilot").click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toMatchObject({ teacherText });
  const result = DispatchTeacherConversationTurnResultSchema.parse(
    await response.json()
  );
  if (result.kind !== "memory_command") {
    throw new Error(`Expected memory_command, received ${result.kind}.`);
  }
  return result;
}

async function sendUnsupportedMemoryCommand(
  page: Page,
  teacherText: string
): Promise<Extract<
  DispatchTeacherConversationTurnResult,
  { kind: "unsupported_memory_command" }
>> {
  await page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  }).fill(teacherText);
  const responsePromise = page.waitForResponse(isConversationTurnDispatch);
  await page.getByTestId("generate-copilot").click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toMatchObject({ teacherText });
  const result = DispatchTeacherConversationTurnResultSchema.parse(
    await response.json()
  );
  if (result.kind !== "unsupported_memory_command") {
    throw new Error(
      `Expected unsupported_memory_command, received ${result.kind}.`
    );
  }
  return result;
}

async function sendModelInstruction(
  page: Page,
  teacherText: string
): Promise<{
  dispatch: Extract<
    DispatchTeacherConversationTurnResult,
    { kind: "model_instruction" }
  >;
  modelExecutionRef: string;
}> {
  await page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  }).fill(teacherText);
  const dispatchResponse = page.waitForResponse(isConversationTurnDispatch);
  const invocationResponse = page.waitForResponse(isModelInvocationCreate);
  await page.getByTestId("generate-copilot").click();
  const [dispatchHttp, invocationHttp] = await Promise.all([
    dispatchResponse,
    invocationResponse
  ]);
  expect(dispatchHttp.status()).toBe(201);
  expect(dispatchHttp.request().postDataJSON()).toMatchObject({ teacherText });
  expect(invocationHttp.status()).toBe(202);
  const dispatch = DispatchTeacherConversationTurnResultSchema.parse(
    await dispatchHttp.json()
  );
  if (dispatch.kind !== "model_instruction") {
    throw new Error(`Expected model_instruction, received ${dispatch.kind}.`);
  }
  const invocation = (await invocationHttp.json()) as {
    execution: { modelExecutionRef: string };
  };
  return {
    dispatch,
    modelExecutionRef: invocation.execution.modelExecutionRef
  };
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

function isForgetConfirmation(response: {
  request(): { method(): string };
  url(): string;
}) {
  return (
    response.request().method() === "POST" &&
    /^\/api\/v1\/teacher\/conversations\/[^/]+\/forget-commands\/[^/]+\/confirm$/u
      .test(new URL(response.url()).pathname)
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

async function proposalMemoryContext(
  request: APIRequestContext,
  proposalRevisionRef: string
): Promise<{
  manifestVersion: number;
  teacherMemoryEpoch?: number;
  temporaryOverrides: Array<Record<string, unknown>>;
  durablePreferences: Array<Record<string, unknown>>;
}> {
  const response = await request.get(
    apiRoutes.demo.proposalDetail(proposalRevisionRef),
    { headers }
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    memoryContext: {
      manifestVersion: number;
      teacherMemoryEpoch?: number;
      temporaryOverrides: Array<Record<string, unknown>>;
      durablePreferences: Array<Record<string, unknown>>;
    };
  };
  return body.memoryContext;
}

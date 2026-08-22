import {
  AuthenticationSessionStatusSchema,
  LessonBriefStateSchema,
  LessonTeachingPlanStateSchema,
  apiRoutes
} from "@edu-agent/contracts";
import { expect, test } from "@playwright/test";

import { gate25DemoRefs } from "../../scripts/sample/gate2-5-demo-fixture.js";

test("adopted Lesson Brief scopes a teacher-controlled Preparation Proposal", async ({
  page
}) => {
  test.setTimeout(90_000);
  const lessonRef = gate25DemoRefs.lessonRefs.slopeAndGraph;
  await page.goto(`/teaching/lessons/${encodeURIComponent(lessonRef)}`);
  await expect(page.getByTestId("lesson-context-header")).toContainText(
    "斜率与图像变化"
  );

  const sessionResponse = await page.request.get(
    apiRoutes.authentication.session
  );
  const session = AuthenticationSessionStatusSchema.parse(
    await sessionResponse.json()
  );
  expect(session.authenticated).toBe(true);
  if (!session.authenticated) return;
  const mutationHeaders = {
    origin: new URL(page.url()).origin,
    "x-csrf-token": session.csrfToken
  };

  const planBeforeResponse = await page.request.get(
    apiRoutes.teacher.lessonTeachingPlans(lessonRef)
  );
  expect(planBeforeResponse.status()).toBe(200);
  const planBefore = LessonTeachingPlanStateSchema.parse(
    await planBeforeResponse.json()
  );
  expect(planBefore.currentApproved).not.toBeNull();

  const taskCreatedResponse = await page.request.post(
    apiRoutes.teacher.preparationTasks,
    {
      headers: mutationHeaders,
      data: {
        lessonRef,
        dueAt: null,
        priority: "normal",
        purpose: "lesson-preparation.create",
        idempotencyKey: `playwright:phase8a2:create:${crypto.randomUUID()}`
      }
    }
  );
  expect(taskCreatedResponse.status()).toBe(201);
  const createdTask = (await taskCreatedResponse.json()) as {
    task: { taskRef: string; version: number };
  };
  const taskStartedResponse = await page.request.post(
    apiRoutes.teacher.preparationTaskStart(createdTask.task.taskRef),
    {
      headers: mutationHeaders,
      data: {
        expectedVersion: createdTask.task.version,
        purpose: "lesson-preparation.start",
        idempotencyKey: `playwright:phase8a2:start:${crypto.randomUUID()}`
      }
    }
  );
  expect(taskStartedResponse.status()).toBe(201);
  const startedTask = (await taskStartedResponse.json()) as {
    task: {
      taskRef: string;
      workingSet: { version: number };
    };
  };

  const generatedResponse = await page.request.post(
    apiRoutes.teacher.generateLessonBrief(lessonRef),
    {
      headers: mutationHeaders,
      data: {
        purpose: "lesson-brief.generate",
        idempotencyKey: `playwright:phase8a2:generate:${crypto.randomUUID()}`,
        teacherAdjustment: null
      }
    }
  );
  expect(generatedResponse.status()).toBe(201);
  const generatedStateResponse = await page.request.get(
    apiRoutes.teacher.lessonBrief(lessonRef)
  );
  expect(generatedStateResponse.status()).toBe(200);
  const generatedState = LessonBriefStateSchema.parse(
    await generatedStateResponse.json()
  );
  const brief = generatedState.current;
  expect(brief).toMatchObject({
    status: "waiting_for_teacher",
    generatedBySkillRef: "lesson-analysis@1"
  });
  expect(brief?.knownGaps).toEqual(
    expect.arrayContaining(["尚未接入教材知识源"])
  );
  if (!brief) return;

  const candidateIds = [
    ...brief.teachingFocusCandidates,
    ...brief.difficultyCandidates,
    ...brief.suggestedAttentionPoints
  ].map((candidate) => candidate.candidateId);
  const adoptedResponse = await page.request.post(
    apiRoutes.teacher.decideLessonBrief(lessonRef, brief.agentRunRef),
    {
      headers: mutationHeaders,
      data: {
        purpose: "lesson-brief.decide",
        idempotencyKey: `playwright:phase8a2:adopt:${crypto.randomUUID()}`,
        expectedContentHash: brief.contentHash,
        action: "adopt",
        selectedCandidateIds: candidateIds,
        preparationTaskRef: startedTask.task.taskRef,
        expectedWorkingSetVersion: startedTask.task.workingSet.version
      }
    }
  );
  expect(adoptedResponse.status()).toBe(200);
  await expect.poll(async () => {
    const response = await page.request.get(
      apiRoutes.teacher.lessonBrief(lessonRef)
    );
    return LessonBriefStateSchema.parse(await response.json()).current?.status;
  }).toBe("adopted");

  const scopedTaskResponse = await page.request.get(
    apiRoutes.teacher.preparationTask(startedTask.task.taskRef)
  );
  expect(scopedTaskResponse.status()).toBe(200);
  const scopedTask = (await scopedTaskResponse.json()) as {
    workingSet: { sourceResourceRefs?: string[] };
  };
  expect(scopedTask.workingSet.sourceResourceRefs).toContain(
    `lesson-brief-run:${brief.agentRunRef}`
  );

  await page.goto(
    `/agent/tasks/${encodeURIComponent(startedTask.task.taskRef)}`
  );
  await expect(page.getByTestId("task-working-set")).toContainText(
    "斜率与图像变化"
  );
  const requestText = "根据已确认的本课教学洞察，生成可比较的课堂调整方案。";
  await page.getByRole("textbox", {
    name: "告诉 Agent 你想完成什么"
  }).fill(requestText);
  const invocationResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        apiRoutes.teacher.modelInvocations &&
      response.request().method() === "POST"
  );
  await page.getByTestId("generate-copilot").click();
  const queuedResponse = await invocationResponse;
  expect(queuedResponse.status()).toBe(202);
  const queued = (await queuedResponse.json()) as {
    execution: {
      conversationRef: string | null;
      modelExecutionRef: string;
    };
  };
  await expect(page.getByRole("heading", {
    name: "比较教学策略"
  })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(requestText).first()).toBeVisible();
  await expect(page.getByTestId("strategy-detail")).toContainText("使用证据");
  await expect(page.getByTestId("strategy-detail")).toContainText("证据缺口");

  const rejectionResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/dispositions") &&
      response.request().method() === "POST"
  );
  await page.getByText("其他处理", { exact: true }).click();
  await page.getByTestId("reject-suggestion").click();
  expect((await rejectionResponse).status()).toBe(201);
  await expect(page.getByText("已拒绝")).toBeVisible({ timeout: 20_000 });

  const planAfterResponse = await page.request.get(
    apiRoutes.teacher.lessonTeachingPlans(lessonRef)
  );
  expect(planAfterResponse.status()).toBe(200);
  const planAfter = LessonTeachingPlanStateSchema.parse(
    await planAfterResponse.json()
  );
  expect(planAfter.activeInReview).toBeNull();
  expect(planAfter.currentApproved?.revisionRef).toBe(
    planBefore.currentApproved?.revisionRef
  );

  expect(queued.execution.conversationRef).toBeTruthy();
  if (queued.execution.conversationRef) {
    const conversationResponse = await page.request.get(
      apiRoutes.teacher.conversation(queued.execution.conversationRef)
    );
    expect(conversationResponse.status()).toBe(200);
    const conversation = (await conversationResponse.json()) as {
      version: number;
    };
    const closeResponse = await page.request.post(
      apiRoutes.teacher.conversationClose(
        queued.execution.conversationRef
      ),
      {
        headers: mutationHeaders,
        data: {
          expectedConversationVersion: conversation.version,
          purpose: "teacher-copilot.conversation.close",
          idempotencyKey: `playwright:phase8a2:close:${crypto.randomUUID()}`
        }
      }
    );
    expect(closeResponse.status()).toBe(201);
  }

  const latestTaskResponse = await page.request.get(
    apiRoutes.teacher.preparationTask(startedTask.task.taskRef)
  );
  expect(latestTaskResponse.status()).toBe(200);
  const latestTask = (await latestTaskResponse.json()) as {
    version: number;
  };
  const cancelResponse = await page.request.post(
    apiRoutes.teacher.preparationTaskCancel(startedTask.task.taskRef),
    {
      headers: mutationHeaders,
      data: {
        expectedVersion: latestTask.version,
        purpose: "lesson-preparation.cancel",
        idempotencyKey: `playwright:phase8a2:cancel:${crypto.randomUUID()}`
      }
    }
  );
  expect(cancelResponse.status()).toBe(201);
});

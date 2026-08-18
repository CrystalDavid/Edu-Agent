import {
  AuthenticationSessionStatusSchema,
  LessonPreparationTaskListSchema,
  LessonBriefStateSchema,
  LessonTeachingPlanStateSchema,
  apiRoutes
} from "@edu-agent/contracts";
import { expect, test } from "@playwright/test";

import { gate25DemoRefs } from "../../scripts/sample/gate2-5-demo-fixture.js";

test("Lesson Brief drives a teacher-controlled Preparation Proposal in the Lesson Workspace", async ({
  page
}) => {
  test.setTimeout(90_000);
  await page.goto("/teaching");
  await expect(page.getByTestId("lesson-list")).toBeVisible();
  await page.getByTestId("lesson-3").click();

  const panel = page.getByTestId("lesson-brief-panel");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "生成教学洞察" }).click();
  await expect(panel.locator(".lesson-brief-candidates button").first())
    .toBeVisible();
  await expect(panel).toContainText("待教师判断");
  await expect(panel.locator(".lesson-brief-sources")).toBeVisible();
  await expect(panel).toContainText("尚未接入教材知识源");

  const stateResponse = await page.request.get(
    apiRoutes.teacher.lessonBrief(gate25DemoRefs.lessonRefs.slopeAndGraph)
  );
  expect(stateResponse.status()).toBe(200);
  expect(LessonBriefStateSchema.parse(await stateResponse.json()).current)
    .toMatchObject({
      status: "waiting_for_teacher",
      generatedBySkillRef: "lesson-analysis@1"
    });

  const planBeforeResponse = await page.request.get(
    apiRoutes.teacher.lessonTeachingPlans(
      gate25DemoRefs.lessonRefs.slopeAndGraph
    )
  );
  expect(planBeforeResponse.status()).toBe(200);
  const planBefore = LessonTeachingPlanStateSchema.parse(
    await planBeforeResponse.json()
  );

  await panel.getByRole("button", { name: "采用所选洞察" }).click();
  await expect.poll(async () => {
    const response = await page.request.get(
      apiRoutes.teacher.lessonBrief(gate25DemoRefs.lessonRefs.slopeAndGraph)
    );
    const state = LessonBriefStateSchema.parse(await response.json());
    return state.current?.status;
  }).toBe("adopted");
  await expect(panel).toHaveCount(0);

  const generatePlan = page.getByTestId("lesson-next-best-action")
    .getByRole("button", { name: "生成教学方案" });
  await expect(generatePlan).toBeVisible();
  await generatePlan.click();

  const proposalPanel = page.getByTestId("preparation-proposal-panel");
  await expect(proposalPanel).toContainText("比较方案，再由你决定", {
    timeout: 30_000
  });
  await expect(proposalPanel.locator(".preparation-proposal-grid > button").first())
    .toBeVisible();
  await expect(proposalPanel).toContainText("目标");
  await expect(proposalPanel).toContainText("课堂流程");
  await expect(proposalPanel).toContainText("练习");
  await expect(proposalPanel).toContainText("风险");

  await proposalPanel.getByRole("button", { name: "说一句话调整" }).click();
  await expect(proposalPanel.getByPlaceholder(/这个班基础较弱/u)).toBeVisible();
  await proposalPanel.getByRole("button", { name: /取\s*消/u }).click();
  await proposalPanel.getByRole("button", { name: "不采用本次方案" }).click();
  await expect(proposalPanel).toHaveCount(0);
  await expect(page.getByTestId("lesson-next-best-action"))
    .toContainText("生成教学方案");

  const planAfterResponse = await page.request.get(
    apiRoutes.teacher.lessonTeachingPlans(
      gate25DemoRefs.lessonRefs.slopeAndGraph
    )
  );
  const planAfter = LessonTeachingPlanStateSchema.parse(
    await planAfterResponse.json()
  );
  expect(planAfter.activeInReview).toBeNull();
  expect(planAfter.currentApproved?.revisionRef).toBe(
    planBefore.currentApproved?.revisionRef
  );

  const tasksResponse = await page.request.get(
    apiRoutes.teacher.preparationTasks
  );
  const tasks = LessonPreparationTaskListSchema.parse(
    await tasksResponse.json()
  );
  const createdTask = tasks.items.find((task) =>
    task.lessonRef === gate25DemoRefs.lessonRefs.slopeAndGraph &&
    task.status === "in_progress"
  );
  expect(createdTask).toBeDefined();
  const sessionResponse = await page.request.get(
    apiRoutes.authentication.session
  );
  const session = AuthenticationSessionStatusSchema.parse(
    await sessionResponse.json()
  );
  expect(session.authenticated).toBe(true);
  if (!session.authenticated) return;
  const cancelResponse = await page.request.post(
    apiRoutes.teacher.preparationTaskCancel(createdTask!.taskRef),
    {
      headers: {
        origin: new URL(page.url()).origin,
        "x-csrf-token": session.csrfToken
      },
      data: {
        expectedVersion: createdTask!.version,
        purpose: "lesson-preparation.cancel",
        idempotencyKey: `playwright:phase8a2:cancel:${crypto.randomUUID()}`
      }
    }
  );
  expect(cancelResponse.status()).toBe(201);
});

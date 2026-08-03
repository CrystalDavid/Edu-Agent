import { mkdir } from "node:fs/promises";

import { apiRoutes } from "@edu-agent/contracts";
import { expect, test, type Page } from "@playwright/test";

import { playwrightArtifactPath } from "../config/test-artifacts.js";

const screenshotRoot = playwrightArtifactPath("evidence", "gate-2-7");
const headers = {
  "x-demo-tenant": "tenant:demo-school",
  "x-demo-actor": "user:teacher-001"
};

test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
});

test("Assignment → confirmed Evidence → adjustment Task → approved next lesson plan remains recoverable", async ({
  page,
  request
}) => {
  test.setTimeout(120_000);
  const monitor = monitorPage(page);
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto("/assignments");
  await expect(page.getByTestId("assignment-workspace")).toBeVisible();

  await page.getByTestId("create-assignment").click();
  await expect(page.getByTestId("assignment-editor")).toBeVisible();
  const title = `斜率与图像变化练习 ${Date.now()}`;
  await page.getByTestId("assignment-title").fill(title);
  await page.getByTestId("assignment-item-3").fill(
    "请用自己的语言解释斜率正负与图像变化方向。"
  );
  const createResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === apiRoutes.teacher.assignments &&
      response.request().method() === "POST"
  );
  await page.getByTestId("save-assignment").click();
  const created = await createResponse;
  expect(created.status()).toBe(201);
  const createdBody = await created.json();
  const assignmentRef = createdBody.assignment.assignmentRef as string;
  await expect(page.getByTestId("assignment-detail")).toContainText(title);

  const publishResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/publish") &&
      response.request().method() === "POST"
  );
  await page.getByTestId("publish-assignment").click();
  await page.locator(".ant-popconfirm-buttons").getByRole("button").last().click();
  expect((await publishResponse).status()).toBe(201);
  await expect(page.getByTestId("assignment-detail")).toContainText("已发布");

  await page.reload();
  await expect(page.getByTestId("assignment-detail")).toContainText(title, {
    timeout: 20_000
  });
  await expect(page.getByTestId("assignment-detail")).toContainText("已发布");

  const importResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/synthetic-submissions") &&
      response.request().method() === "POST"
  );
  await page.getByTestId("import-submissions").click();
  expect((await importResponse).status()).toBe(201);
  await expect(page.getByText("未交", { exact: true })).toHaveCount(2, {
    timeout: 20_000
  });
  const submissionsResponse = await request.get(
    apiRoutes.teacher.assignmentSubmissions(assignmentRef),
    { headers }
  );
  const submissions = await submissionsResponse.json();
  expect(submissions.items).toHaveLength(12);
  expect(
    submissions.items
      .filter((item: { submissionState: string }) => item.submissionState === "not_submitted")
      .every((item: { score: number | null }) => item.score === null)
  ).toBe(true);

  await page.getByRole("button", { name: /批\s*改/ }).first().click();
  await expect(page.getByTestId("grading-panel")).toContainText("逐题批改");
  await expect(page.getByTestId("confirm-grade")).toBeDisabled();
  const saveResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/grade-draft") &&
      response.request().method() === "POST"
  );
  await page.getByTestId("save-grade-draft").click();
  expect((await saveResponse).status()).toBe(201);
  await expect(page.getByTestId("confirm-grade")).toBeEnabled();
  const confirmResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/confirm") &&
      response.request().method() === "POST"
  );
  await page.getByTestId("confirm-grade").click();
  expect((await confirmResponse).status()).toBe(201);
  await expect(page.getByTestId("reopen-grade")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("assignment-analytics")).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByTestId("assignment-analytics")).toContainText("教学目标表现");
  await page.screenshot({
    path: `${screenshotRoot}/01-assignment-grading-and-evidence.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page.goto("/students");
  await expect(page.getByTestId("real-student-list")).toBeVisible();
  await page.getByTestId("real-student-list").getByRole("button").first().click();
  await expect(page.getByTestId("learner-confirmed-evidence")).toContainText(
    "来源：作业 → 提交 → 逐题作答 → 教师批改"
  );
  await expect(page.locator("body")).not.toContainText("差生");
  await expect(page.locator("body")).not.toContainText("低能力学生");

  await page.goto("/assignments");
  await expect(page.getByTestId("assignment-detail")).toContainText(title, {
    timeout: 20_000
  });
  const analytics = page.getByTestId("assignment-analytics");
  await expect(analytics).toBeVisible();
  await analytics.locator(".ant-checkbox-wrapper").first().click();
  const adjustmentResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/adjust-next-lesson") &&
      response.request().method() === "POST"
  );
  await page.getByTestId("adjust-next-lesson").click();
  const adjusted = await adjustmentResponse;
  expect(adjusted.status()).toBe(201);
  const adjustedBody = await adjusted.json();
  await expect(page).toHaveURL(/\/agent\/tasks\//, { timeout: 20_000 });
  const workingSet = page.getByTestId("task-working-set");
  await expect(workingSet).toContainText("待定系数法");
  await expect(workingSet).toContainText("本次允许使用的学习证据");
  await page.screenshot({
    path: `${screenshotRoot}/02-selected-evidence-working-set.png`,
    fullPage: true,
    animations: "disabled"
  });

  const taskDetailResponse = await request.get(
    apiRoutes.teacher.preparationTask(adjustedBody.task.taskRef),
    { headers }
  );
  expect(taskDetailResponse.status()).toBe(200);
  const taskDetail = await taskDetailResponse.json();
  expect(taskDetail.workingSet.sourceAssignmentRef).toBe(assignmentRef);
  expect(taskDetail.workingSet.evidenceRefs.length).toBeGreaterThan(0);

  const requestText =
    "仅根据教师明确选择的本次作业学习证据，调整下一课待定系数法的教学安排。";
  await page.getByRole("textbox", { name: "教师助手任务说明" }).fill(requestText);
  const invocationResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === apiRoutes.teacher.modelInvocations &&
      response.request().method() === "POST"
  );
  await page.getByTestId("generate-copilot").click();
  expect((await invocationResponse).status()).toBe(202);
  await expect(page).toHaveURL(/\/copilot\/proposals\//, { timeout: 20_000 });
  await expect(page.getByText(requestText).first()).toBeVisible();

  let duplicateInvocationCount = 0;
  page.on("request", (webRequest) => {
    if (
      new URL(webRequest.url()).pathname === apiRoutes.teacher.modelInvocations &&
      webRequest.method() === "POST"
    ) {
      duplicateInvocationCount += 1;
    }
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "比较教学策略" })).toBeVisible({
    timeout: 20_000
  });
  expect(duplicateInvocationCount).toBe(0);
  await expect(page.getByText(requestText).first()).toBeVisible();

  await page.getByTestId("edit-suggestion").click();
  await page.getByTestId("edit-lesson-focus").fill(
    "教师修改：先根据已确认错误安排斜率复核，再进入待定系数法。"
  );
  await page.getByTestId("save-teacher-edits").click();
  await expect(page.getByText("修改后接受")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "查看教学计划" }).click();
  await expect(page.getByTestId("teaching-plan-preparation-task")).toContainText(
    "当前状态：待审核"
  );
  await page.getByTestId("approve-teaching-plan").click();
  await expect(page.getByTestId("teaching-plan-preparation-task")).toContainText(
    "当前状态：已准备，待完成",
    { timeout: 20_000 }
  );

  const nextLessonPlans = await request.get(
    apiRoutes.teacher.lessonTeachingPlans("lesson:coefficient-method"),
    { headers }
  );
  expect(nextLessonPlans.status()).toBe(200);
  expect((await nextLessonPlans.json()).currentApproved).not.toBeNull();
  await page.reload();
  await expect(page.getByTestId("teaching-plan-preparation-task")).toContainText(
    "当前状态：已准备，待完成",
    { timeout: 20_000 }
  );
  await page.screenshot({
    path: `${screenshotRoot}/03-adjustment-plan-approved.png`,
    fullPage: true,
    animations: "disabled"
  });
  await assertCleanMonitor(monitor);
});

function monitorPage(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
}

async function assertCleanMonitor(monitor: {
  consoleErrors: string[];
  pageErrors: string[];
}) {
  expect(monitor.consoleErrors).toEqual([]);
  expect(monitor.pageErrors).toEqual([]);
}

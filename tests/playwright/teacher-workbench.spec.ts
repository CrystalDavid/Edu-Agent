import { mkdir } from "node:fs/promises";

import { apiRoutes } from "@edu-agent/contracts";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { playwrightArtifactPath } from "../config/test-artifacts.js";

const screenshotRoot = playwrightArtifactPath("evidence", "gate-2-8");
const headers = {
  "x-demo-tenant": "tenant:demo-school",
  "x-demo-actor": "user:teacher-001"
};

test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
});

test("manual Todo and Calendar remain independent and recover after restart", async ({
  page,
  request
}) => {
  test.setTimeout(120_000);
  const monitor = monitorPage(page);
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto("/overview");
  const title = `准备周五教研材料 ${Date.now()}`;
  await page.getByRole("button", { name: "新建待办" }).click();
  await page.getByTestId("overview-todo-title").fill(title);
  const createdResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === apiRoutes.teacher.todos && response.request().method() === "POST"
  );
  await page.getByRole("dialog").filter({ hasText: "新建个人待办" }).getByRole("button", { name: /创\s*建/u }).click();
  expect((await createdResponse).status()).toBe(201);
  await expect(page.getByTestId("today-work")).toContainText(title);

  await page.goto("/schedule");
  const todoPanel = page.getByTestId("todo-panel");
  const todo = todoPanel.locator("article").filter({ hasText: title });
  await expect(todo).toBeVisible();

  await todo.getByTitle("安排到日历").click();
  const scheduleDialog = page.getByRole("dialog").filter({ hasText: title });
  const date = localDate(new Date());
  await scheduleDialog.locator('input[type="datetime-local"]').nth(0).fill(`${date}T15:00`);
  await scheduleDialog.locator('input[type="datetime-local"]').nth(1).fill(`${date}T16:00`);
  const scheduleResponse = page.waitForResponse(
    (response) => response.url().endsWith("/schedule") && response.request().method() === "POST"
  );
  await scheduleDialog.getByRole("button", { name: "创建时间块" }).click();
  const scheduled = await scheduleResponse;
  expect(scheduled.status()).toBe(201);
  const scheduledBody = await scheduled.json();

  const calendar = page.getByTestId("calendar-view");
  await expect(calendar.getByRole("button", { name: new RegExp(title) })).toBeVisible();
  const fifteenHour = calendar.locator(".day-calendar__row").nth(8);
  await expect(fifteenHour.locator("time")).toHaveText("15:00");
  await expect(fifteenHour).toContainText(title);
  await calendar.locator(".segmented-control").getByRole("button", { name: "周" }).click();
  await expect(calendar.getByTestId("week-calendar")).toContainText(title);
  await calendar.locator(".segmented-control").getByRole("button", { name: "月" }).click();
  await expect(calendar.getByTestId("month-calendar")).toContainText(title);
  await calendar.locator(".segmented-control").getByRole("button", { name: "日" }).click();

  await calendar.getByRole("button", { name: new RegExp(title) }).click();
  const editDialog = page.getByRole("dialog").filter({ hasText: "编辑手工日程" });
  await editDialog.locator('input[type="datetime-local"]').nth(1).fill(`${date}T16:30`);
  const updateResponse = page.waitForResponse(
    (response) => response.url().includes("/calendar-events/") && response.request().method() === "PUT"
  );
  await editDialog.getByRole("button", { name: /保\s*存/u }).click();
  expect((await updateResponse).status()).toBe(200);

  await todo.getByRole("checkbox", { name: new RegExp(`完成 ${escapeRegex(title)}`) }).click();
  await expect(todo).toHaveCount(0);
  await todoPanel.getByRole("button", { name: "已完成" }).click();
  await expect(todoPanel).toContainText(title);
  const eventDetail = await request.get(
    apiRoutes.teacher.calendarEvent(scheduledBody.event.eventRef),
    { headers }
  );
  expect(eventDetail.status()).toBe(200);
  expect((await eventDetail.json()).status).toBe("scheduled");

  await restartApi(request);
  await page.reload();
  await page.getByTestId("todo-panel").getByRole("button", { name: "已完成" }).click();
  await expect(page.getByTestId("todo-panel")).toContainText(title, { timeout: 20_000 });
  await expect(page.getByTestId("calendar-view")).toContainText(title);
  await page.screenshot({
    path: `${screenshotRoot}/01-manual-todo-calendar-recovery.png`,
    fullPage: true,
    animations: "disabled"
  });
  await assertCleanMonitor(monitor);
});

test("Assignment projections can be snoozed and a Todo handoff seals only explicit Agent context", async ({
  page,
  request
}) => {
  test.setTimeout(120_000);
  const monitor = monitorPage(page);
  const assignment = await createPublishedAssignmentWithSubmissions(request);

  await page.goto("/schedule");
  const todoPanel = page.getByTestId("todo-panel");
  await todoPanel.getByRole("button", { name: /业务提醒/ }).click();
  const grading = todoPanel.locator("article").filter({
    hasText: `待确认批改：${assignment.title}`
  });
  await expect(grading).toBeVisible({ timeout: 20_000 });
  const snoozeResponse = page.waitForResponse(
    (response) => response.url().endsWith("/preference") && response.request().method() === "POST"
  );
  await grading.getByRole("button", { name: "明天提醒" }).click();
  expect((await snoozeResponse).status()).toBe(200);
  await expect(grading).toHaveCount(0);
  await todoPanel.getByRole("button", { name: "查看已稍后提醒" }).click();
  await expect(todoPanel).toContainText(`待确认批改：${assignment.title}`);

  const assignmentDetail = await request.get(
    apiRoutes.teacher.assignment(assignment.assignmentRef),
    { headers }
  );
  expect(assignmentDetail.status()).toBe(200);
  const source = await assignmentDetail.json();
  expect(source.status).toBe("published");
  expect(source.dueAt).toBe(assignment.dueAt);

  await todoPanel.getByRole("button", { name: "进行中" }).click();
  await todoPanel.getByRole("button", { name: "新建待办" }).click();
  const todoTitle = `用 Agent 整理教研提纲 ${Date.now()}`;
  await page.getByTestId("todo-title-input").fill(todoTitle);
  const todoCreatedResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === apiRoutes.teacher.todos && response.request().method() === "POST"
  );
  await page.getByRole("dialog").filter({ hasText: "新建个人待办" }).getByRole("button", { name: /创\s*建/u }).click();
  const todoCreated = await todoCreatedResponse;
  expect(todoCreated.status()).toBe(201);
  const todoBody = await todoCreated.json();

  const todo = todoPanel.locator("article").filter({ hasText: todoTitle });
  await todo.getByTitle("关联课时", { exact: true }).click();
  const linkDialog = page.getByRole("dialog").filter({ hasText: "关联课时" });
  await linkDialog.getByRole("combobox").click();
  await page.locator(".ant-select-item-option").filter({ hasText: /^斜率与图像变化$/ }).click();
  const linkResponse = page.waitForResponse(
    (response) => response.url().endsWith("/resources") && response.request().method() === "POST"
  );
  await linkDialog.getByRole("button", { name: /关\s*联/u }).click();
  expect((await linkResponse).status()).toBe(201);

  const refreshedTodo = todoPanel.locator("article").filter({ hasText: todoTitle });
  const handoffResponse = page.waitForResponse(
    (response) => response.url().endsWith("/agent-handoff") && response.request().method() === "POST"
  );
  await refreshedTodo.getByTitle("在 Agent 中处理", { exact: true }).click();
  const handoff = await handoffResponse;
  expect(handoff.status()).toBe(201);
  const handoffBody = await handoff.json();
  await expect(page).toHaveURL(/\/agent\/tasks\//);
  const workingSet = page.getByTestId("task-working-set");
  await expect(workingSet).toContainText(todoTitle, { timeout: 20_000 });
  await expect(workingSet).toContainText("斜率与图像变化");
  await expect(workingSet).toContainText("lesson:slope-and-graph-change");

  const prompt = "请根据当前课时和这条教研待办生成一份可审阅的教学建议。";
  await page.getByRole("textbox", { name: "教师助手任务说明" }).fill(prompt);
  const invocationResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === apiRoutes.teacher.modelInvocations && response.request().method() === "POST"
  );
  await page.getByTestId("generate-copilot").click();
  expect((await invocationResponse).status()).toBe(202);
  await expect(page).toHaveURL(/\/copilot\/proposals\//, { timeout: 20_000 });
  await expect(page.getByText(prompt).first()).toBeVisible();

  const todoDetail = await request.get(
    apiRoutes.teacher.todo(todoBody.todo.todoRef),
    { headers }
  );
  expect(todoDetail.status()).toBe(200);
  expect((await todoDetail.json()).status).toBe("active");

  await restartApi(request);
  await page.reload();
  await expect(page.getByText(prompt).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("task-working-set")).toContainText(todoTitle);
  await page.screenshot({
    path: `${screenshotRoot}/02-source-reminder-agent-context.png`,
    fullPage: true,
    animations: "disabled"
  });
  await assertCleanMonitor(monitor);
  expect(handoffBody.workingSet.sourceTodoRef).toBe(todoBody.todo.todoRef);
});

async function createPublishedAssignmentWithSubmissions(request: APIRequestContext) {
  const title = `工作台批改提醒 ${Date.now()}`;
  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
  const created = await request.post(apiRoutes.teacher.assignments, {
    headers,
    data: {
      courseRunRef: "course-run:grade8-math-class3-2026-fall",
      curriculumUnitRef: "curriculum-unit:linear-functions",
      lessonRef: "lesson:slope-and-graph-change",
      title,
      instructions: "仅用于合成演示。",
      dueAt,
      items: [{
        sequence: 1,
        itemType: "multiple_choice",
        prompt: "斜率为正时图像如何变化？",
        maxScore: 5,
        options: [
          { key: "A", text: "上升" },
          { key: "B", text: "下降" }
        ],
        answerKey: { choiceKey: "A" },
        gradingCriteria: "选择 A 得满分。",
        objectiveRef: "learning-objective:slope-and-graph"
      }],
      purpose: "assignment.create",
      idempotencyKey: `pw-gate28-assignment:${crypto.randomUUID()}`
    }
  });
  expect(created.status()).toBe(201);
  const createdBody = await created.json();
  const assignmentRef = createdBody.assignment.assignmentRef as string;
  const published = await request.post(
    apiRoutes.teacher.assignmentPublish(assignmentRef),
    {
      headers,
      data: {
        expectedVersion: createdBody.assignment.version,
        purpose: "assignment.publish",
        idempotencyKey: `pw-gate28-publish:${crypto.randomUUID()}`
      }
    }
  );
  expect(published.status()).toBe(201);
  const imported = await request.post(
    apiRoutes.teacher.assignmentSyntheticSubmissions(assignmentRef),
    {
      headers,
      data: {
        purpose: "assignment.synthetic-submissions.import",
        idempotencyKey: `pw-gate28-import:${crypto.randomUUID()}`
      }
    }
  );
  expect(imported.status()).toBe(201);
  return { assignmentRef, title, dueAt };
}

async function restartApi(request: APIRequestContext) {
  const controlPort = process.env.E2E_CONTROL_PORT;
  const runId = process.env.E2E_RUN_ID;
  expect(controlPort).toBeTruthy();
  expect(runId).toBeTruthy();
  const response = await request.post(
    `http://127.0.0.1:${controlPort}/__e2e/restart-api`,
    { headers: { "x-e2e-run-id": runId! } }
  );
  expect(response.status()).toBe(200);
}

function localDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

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

import { mkdir } from "node:fs/promises";

import { apiRoutes } from "@edu-agent/contracts";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const screenshotRoot = "output/playwright/gate-2-9";
const lessonRef = "lesson:slope-and-graph-change";
const headers = {
  "x-demo-tenant": "tenant:demo-school",
  "x-demo-actor": "user:teacher-001"
};

test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
});

test("approved plan -> confirmed classroom facts -> recoverable Reflection -> explicit follow-up", async ({
  page,
  request
}) => {
  test.setTimeout(180_000);
  const monitor = monitorPage(page);
  await page.setViewportSize({ width: 1536, height: 960 });

  const planBeforeResponse = await request.get(
    apiRoutes.teacher.lessonTeachingPlans(lessonRef),
    { headers }
  );
  expect(planBeforeResponse.status()).toBe(200);
  const planBefore = await planBeforeResponse.json();
  expect(planBefore.currentApproved).not.toBeNull();

  await page.goto(`/teaching/lessons/${encodeURIComponent(lessonRef)}`);
  await expect(page.getByTestId("lesson-detail")).toContainText("斜率与图像变化");
  const classroom = page.getByTestId("classroom-reflection-panel");
  await expect(classroom).toContainText("approved TeachingPlan 只是计划");

  await page.getByTestId("create-lesson-delivery").click();
  const deliveryDialog = page.getByRole("dialog").filter({ hasText: "课堂实施草稿" });
  const firstStep = deliveryDialog.locator(".ant-card").filter({ hasText: "课堂导入" });
  await firstStep.getByRole("combobox").click();
  await page.locator(".ant-select-item-option").filter({ hasText: "现场调整" }).click();
  await firstStep.getByRole("textbox", { name: "课堂导入实际实施" }).fill(
    "教师根据现场回答延长了斜率正负与图像方向的对比。"
  );
  await firstStep.getByRole("textbox", { name: "课堂导入调整原因" }).fill(
    "教师观察到部分匿名学习者仍混淆截距与斜率。"
  );
  const deliveryCreated = page.waitForResponse(
    (response) => new URL(response.url()).pathname === apiRoutes.teacher.lessonDeliveries && response.request().method() === "POST"
  );
  await deliveryDialog.getByRole("button", { name: "保存草稿" }).click();
  const deliveryResponse = await deliveryCreated;
  expect(deliveryResponse.status()).toBe(201);
  const deliveryBody = await deliveryResponse.json();

  const deliveryConfirmed = page.waitForResponse(
    (response) => response.url().endsWith("/confirm") && response.request().method() === "POST"
  );
  await page.getByTestId("confirm-lesson-delivery").click();
  await page.locator(".ant-popconfirm-buttons").getByRole("button").last().click();
  expect((await deliveryConfirmed).status()).toBe(200);
  await expect(page.getByTestId("lesson-delivery-card")).toContainText("教师已确认");
  await expect(page.getByTestId("lesson-delivery-card")).toContainText("现场调整");

  await page.getByTestId("create-classroom-observation").click();
  const observationDialog = page.getByRole("dialog").filter({ hasText: "添加课堂观察" });
  const observationText = `部分学生仍把截距与斜率混淆 ${Date.now()}`;
  await observationDialog.getByRole("textbox", { name: "课堂观察内容" }).fill(observationText);
  const observationCreated = page.waitForResponse(
    (response) => new URL(response.url()).pathname === apiRoutes.teacher.classroomObservations && response.request().method() === "POST"
  );
  await observationDialog.getByRole("button", { name: "保存草稿" }).click();
  expect((await observationCreated).status()).toBe(201);
  await expect(page.getByTestId("classroom-observation-card")).toContainText(observationText);

  const observationConfirmed = page.waitForResponse(
    (response) => response.url().endsWith("/confirm") && response.request().method() === "POST"
  );
  await page.getByTestId("confirm-classroom-observation").click();
  const observationConfirmedResponse = await observationConfirmed;
  expect(observationConfirmedResponse.status()).toBe(200);
  const observationConfirmedBody = await observationConfirmedResponse.json();
  const observationRevisionRef = observationConfirmedBody.observation.currentConfirmed.observationRevisionRef as string;
  await expect(page.getByTestId("classroom-observation-card")).toContainText("已确认");

  await expect(
    page.getByTestId("lesson-reflection-card").getByRole("checkbox", { name: observationText })
  ).toBeChecked();
  const reflectionCreated = page.waitForResponse(
    (response) => new URL(response.url()).pathname === apiRoutes.teacher.reflections && response.request().method() === "POST"
  );
  await page.getByTestId("create-reflection-draft").click();
  const reflectionResponse = await reflectionCreated;
  expect(reflectionResponse.status()).toBe(201);
  const reflectionBody = await reflectionResponse.json();
  const reflectionRef = reflectionBody.reflection.reflectionRef as string;
  await expect(page).toHaveURL(/\/agent\/reflections\//);
  await expect(page.getByTestId("reflection-context")).toContainText("教师确认观察：1 项");
  await page.screenshot({
    path: `${screenshotRoot}/01-confirmed-classroom-context.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page.getByLabel("本次给 Agent 的补充说明").fill(
    "只整理教师确认的课堂事实，并保留证据缺口。"
  );
  const generationCreated = page.waitForResponse(
    (response) => response.url().endsWith("/generate") && response.request().method() === "POST"
  );
  await page.getByTestId("generate-reflection").click();
  const generationResponse = await generationCreated;
  expect(generationResponse.status()).toBe(202);
  const generationBody = await generationResponse.json();
  const execution = await waitForExecution(
    request,
    generationBody.modelExecutionRef,
    "succeeded"
  );
  expect(execution.resultKind).toBe("lesson_reflection_draft");

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/agent/reflections/${encodeURIComponent(reflectionRef)}`));
  await expect(page.getByTestId("reflection-context")).toContainText("已完成", { timeout: 20_000 });
  await expect(page.getByTestId("reflection-draft-editor")).toContainText("Agent 辅助草稿");
  await page.getByLabel("目标达成情况").fill(
    "教师确认：多数学生能解释斜率正负与图像方向，仍需区分截距。"
  );
  const saved = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/${encodeURIComponent(reflectionRef)}`) && response.request().method() === "PUT"
  );
  await page.getByTestId("save-reflection-draft").click();
  expect((await saved).status()).toBe(200);

  const reflectionConfirmed = page.waitForResponse(
    (response) => response.url().endsWith("/confirm") && response.request().method() === "POST"
  );
  await page.getByTestId("confirm-reflection").click();
  await page.locator(".ant-popconfirm-buttons").getByRole("button").last().click();
  expect((await reflectionConfirmed).status()).toBe(200);
  await expect(page.getByTestId("reflection-draft-editor")).toContainText("教师已确认正式 Reflection");

  const followUpCreated = page.waitForResponse(
    (response) => response.url().endsWith("/follow-ups") && response.request().method() === "POST"
  );
  await page.getByTestId("create-reflection-follow-up").click();
  const followUpResponse = await followUpCreated;
  expect(followUpResponse.status()).toBe(201);
  const followUp = await followUpResponse.json();
  await expect(page).toHaveURL(/\/agent\/tasks\//);
  await expect(page.getByTestId("task-working-set")).toContainText(reflectionRef);
  await expect(page.getByTestId("task-working-set")).toContainText(observationRevisionRef);

  const planAfterResponse = await request.get(
    apiRoutes.teacher.lessonTeachingPlans(lessonRef),
    { headers }
  );
  expect(planAfterResponse.status()).toBe(200);
  const planAfter = await planAfterResponse.json();
  expect(planAfter.currentApproved.revisionRef).toBe(planBefore.currentApproved.revisionRef);
  expect(planAfter.currentApproved.content).toEqual(planBefore.currentApproved.content);

  await page.goto("/overview");
  await expect(page.getByTestId("today-work")).toContainText("待定系数法", { timeout: 20_000 });
  await page.screenshot({
    path: `${screenshotRoot}/02-reflection-follow-up-workbench.png`,
    fullPage: true,
    animations: "disabled"
  });

  await restartApi(request);
  await page.goto(`/teaching/lessons/${encodeURIComponent(lessonRef)}`);
  await expect(page.getByTestId("lesson-delivery-card")).toContainText("教师已确认", { timeout: 20_000 });
  await expect(page.getByTestId("classroom-observation-card")).toContainText(observationText);
  await expect(page.getByTestId("lesson-reflection-card")).toContainText("正式反思已确认");
  const followUpTask = await request.get(
    apiRoutes.teacher.preparationTask(followUp.targetRef),
    { headers }
  );
  expect(followUpTask.status()).toBe(200);
  expect((await followUpTask.json()).workingSet.sourceReflectionRef).toBe(reflectionRef);
  const deliveryAfterRestart = await request.get(
    apiRoutes.teacher.lessonDelivery(deliveryBody.delivery.deliveryRef),
    { headers }
  );
  expect(deliveryAfterRestart.status()).toBe(200);
  expect((await deliveryAfterRestart.json()).currentConfirmed.status).toBe("confirmed");
  await page.screenshot({
    path: `${screenshotRoot}/03-restart-recovery.png`,
    fullPage: true,
    animations: "disabled"
  });
  await assertCleanMonitor(monitor);
});

async function waitForExecution(
  request: APIRequestContext,
  modelExecutionRef: string,
  expectedStatus: string
) {
  let last: Record<string, unknown> = {};
  await expect.poll(async () => {
    const response = await request.get(
      apiRoutes.teacher.modelInvocation(modelExecutionRef),
      { headers }
    );
    expect(response.status()).toBe(200);
    last = await response.json();
    return last.status;
  }, { timeout: 30_000 }).toBe(expectedStatus);
  return last;
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

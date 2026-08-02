import { mkdir } from "node:fs/promises";

import { apiRoutes } from "@edu-agent/contracts";
import { expect, test, type Page } from "@playwright/test";

import { playwrightArtifactPath } from "../config/test-artifacts.js";

const screenshotRoot = playwrightArtifactPath(
  "evidence",
  "teacher-portal-ui-v1",
  "final"
);

const bannedTeacherTerms = [
  "EvidenceObservation",
  "EvidenceClaim",
  "CourseRun",
  "TeachingPlanRevision",
  "SuggestionDisposition",
  "ContextManifest",
  "AuthorizationDecision",
  "PromptBundle",
  "RunManifest",
  "AgentRun",
  "TaskRun",
  "Outbox",
  "MockModelProvider"
] as const;

test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
});

test("portal bootstrap, sidebar and modular overview use the verified API contract", async ({
  page,
  request
}) => {
  const monitor = monitorPage(page);
  const health = await request.get(apiRoutes.health);
  expect(health.status()).toBe(200);
  await expect(health.json()).resolves.toEqual({
    status: "ok",
    service: "edu-agent-api",
    mode: "mock"
  });

  const bootstrap = await request.get(apiRoutes.demo.bootstrap, {
    headers: {
      "x-demo-tenant": "tenant:demo-school",
      "x-demo-actor": "user:teacher-001"
    }
  });
  expect(bootstrap.status()).toBe(200);

  const missing = await request.get("/api/not-a-real-route");
  expect(missing.status()).toBe(404);
  await expect(missing.json()).resolves.toMatchObject({
    code: "API_ROUTE_NOT_FOUND",
    method: "GET",
    path: "/api/not-a-real-route"
  });

  const apiRequests: string[] = [];
  page.on("request", (webRequest) => {
    const url = new URL(webRequest.url());
    if (url.pathname.startsWith("/api/")) apiRequests.push(url.pathname);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "概览" })).toBeVisible();
  expect(apiRequests.slice(0, 2)).toEqual([
    apiRoutes.authentication.session,
    apiRoutes.authentication.provider
  ]);
  expect(apiRequests).toContain(apiRoutes.health);
  expect(apiRequests).toContain(apiRoutes.demo.bootstrap);
  await expect(page.locator("body")).not.toContainText(
    "教师工作空间未能启动"
  );

  const sidebar = page.locator(".teacher-sidebar");
  await expect(sidebar).toHaveCSS("width", "260px");
  for (const label of [
    "概览",
    "日程",
    "教学",
    "学生",
    "文件",
    "Agent"
  ]) {
    await expect(
      sidebar.getByRole("button", { name: label, exact: true })
    ).toBeVisible();
  }
  for (const removed of [
    "学习证据",
    "运行记录",
    "教学目标",
    "教师助手"
  ]) {
    await expect(
      sidebar.getByRole("button", { name: removed, exact: true })
    ).toHaveCount(0);
  }
  await expect(
    page.getByTestId("teacher-profile-trigger")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /展开|收起/ })
  ).toHaveCount(0);

  for (const heading of [
    "今天需要做什么",
    "学生概况",
    "今日课程",
    "备课组动态",
    "学校动态",
    "最近文件"
  ]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true })
    ).toBeVisible();
  }
  await expect(page.locator("[class*='hero']")).toHaveCount(0);
  await assertNoInternalTerms(page);

  await page.screenshot({
    path: `${screenshotRoot}/01-overview-1440x900.png`,
    animations: "disabled"
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "概览" })).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/02-overview-1920x1080.png`,
    animations: "disabled"
  });
  const width = await page
    .locator(".portal-page")
    .first()
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(1540);

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 2560, height: 1440 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/overview");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("heading", { name: "概览" })).toBeVisible();
  }

  await assertCleanMonitor(monitor);
});

test("schedule uses the real workbench and keeps day, week, and month on one data source", async ({
  page
}) => {
  const monitor = monitorPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/schedule");
  await expect(page.getByRole("heading", { name: "日程" })).toBeVisible();
  const calendar = page.getByTestId("calendar-view");
  await expect(calendar.getByTestId("day-calendar")).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/03-schedule-day.png`,
    animations: "disabled"
  });

  await calendar.locator(".segmented-control").getByRole("button", { name: "周" }).click();
  await expect(calendar.getByTestId("week-calendar")).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/04-schedule-week.png`,
    animations: "disabled"
  });

  await calendar.locator(".segmented-control").getByRole("button", { name: "月" }).click();
  await expect(calendar.getByTestId("month-calendar")).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/05-schedule-month.png`,
    animations: "disabled"
  });

  await expect(page.getByTestId("todo-panel")).toContainText("业务提醒");
  await expect(page.getByTestId("todo-panel")).not.toContainText("已将待办加入日程草稿");
  await assertNoInternalTerms(page);
  await assertCleanMonitor(monitor);
});

test("teaching workspace supports course files, homework and assessment analysis", async ({
  page
}) => {
  const monitor = monitorPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/teaching");
  await expect(
    page.getByRole("heading", { name: "教学", exact: true })
  ).toBeVisible();
  await expect(page.getByTestId("lesson-list")).toBeVisible();
  await expect(page.getByTestId("lesson-detail")).toContainText(
    "斜率与图像变化"
  );
  await page.screenshot({
    path: `${screenshotRoot}/06-teaching-course-tree.png`,
    animations: "disabled"
  });

  await page.getByTestId("lesson-5").click();
  await expect(page.getByTestId("lesson-detail")).toContainText(
    "一次函数的应用"
  );
  await page.screenshot({
    path: `${screenshotRoot}/07-course-file-preview.png`,
    animations: "disabled"
  });

  await page.getByRole("tab", { name: /作业/ }).click();
  await expect(page.getByTestId("assignment-workspace")).toBeVisible();
  await expect(page.getByTestId("create-assignment")).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/08-homework-analysis.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page.getByRole("tab", { name: /考试/ }).click();
  await expect(page.getByTestId("exam-dashboard")).toBeVisible();
  await page.getByTestId("exam-list").getByRole("button", { name: /期中阶段测评/ }).click();
  await expect(page.getByTestId("exam-dashboard")).toContainText(
    "本次无年级比较数据"
  );
  await expect(page.getByTestId("exam-dashboard")).not.toContainText(
    "年级百分位"
  );
  await page.screenshot({
    path: `${screenshotRoot}/09-exam-analysis.png`,
    fullPage: true,
    animations: "disabled"
  });

  await assertNoInternalTerms(page);
  await assertCleanMonitor(monitor);
});

test("student workspace reads anonymous enrollments and recent confirmed evidence", async ({
  page
}) => {
  const monitor = monitorPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/students");
  await expect(page.getByTestId("real-student-list")).toBeVisible();
  await expect(page.getByText("不按 0 分处理", { exact: false })).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/10-students-class-overview.png`,
    fullPage: true,
    animations: "disabled"
  });

  const learnerList = page.getByTestId("real-student-list");
  await learnerList.getByRole("button", { name: /匿名学习者 02/ }).click();
  await expect(page.getByTestId("learner-evidence-detail")).toContainText("匿名学习者 02");
  await expect(page.getByText("近期、可追溯、非长期结论")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("低能力学生");
  await page.screenshot({
    path: `${screenshotRoot}/11-student-detail.png`,
    fullPage: true,
    animations: "disabled"
  });
  await assertNoInternalTerms(page);
  await assertCleanMonitor(monitor);
});

test("file manager uploads, restores and versions a real local file", async ({
  page
}) => {
  const monitor = monitorPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/files");
  const manager = page.getByTestId("file-manager");
  await manager.getByTestId("file-upload-input").setInputFiles({
    name: "斜率课堂观察.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 合成参考资料\n仅用于 Gate 2.5B E2E。", "utf8")
  });
  const fileButton = manager.locator(".file-results").getByRole("button", {
    name: /斜率课堂观察/
  });
  await expect(fileButton).toBeVisible({ timeout: 20_000 });
  await fileButton.click();
  await expect(manager.getByTestId("file-detail")).toContainText("教师上传");
  await manager.getByTestId("file-version-input").setInputFiles({
    name: "斜率课堂观察-v2.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 合成参考资料\n第二个不可变版本。", "utf8")
  });
  await expect(manager.getByTestId("file-version-history")).toContainText("v2", {
    timeout: 20_000
  });
  const deletedResponse = page.waitForResponse(
    (response) => response.url().endsWith("/delete") && response.request().method() === "POST"
  );
  await manager.getByTestId("file-detail").getByRole("button", { name: /删\s*除/ }).click();
  expect((await deletedResponse).status()).toBe(201);
  await manager.getByLabel("文件生命周期筛选").click();
  await page.locator(".ant-select-item-option").filter({ hasText: /^已删除$/ }).click();
  await expect(fileButton).toBeVisible({ timeout: 20_000 });
  await fileButton.click();
  const restoredResponse = page.waitForResponse(
    (response) => response.url().endsWith("/restore") && response.request().method() === "POST"
  );
  await manager.getByTestId("file-detail").getByRole("button", { name: /恢\s*复/ }).click();
  expect((await restoredResponse).status()).toBe(201);
  await manager.getByLabel("文件生命周期筛选").click();
  await page.locator(".ant-select-item-option").filter({ hasText: /^有效$/ }).click();
  await expect(fileButton).toBeVisible({ timeout: 20_000 });
  await fileButton.click();
  await manager.getByLabel("上传关联课时").click();
  await page.locator(".ant-select-item-option").filter({ hasText: /^一次函数的应用$/ }).click();
  const taskBindingResponse = page.waitForResponse(
    (response) => response.url().endsWith("/bindings") && response.request().method() === "POST"
  );
  await manager.getByTestId("file-detail").getByRole("button", { name: "关联任务" }).click();
  expect((await taskBindingResponse).status()).toBe(201);
  await manager.getByLabel("上传关联课时").click();
  await page.locator(".ant-select-item-option").filter({ hasText: /^斜率与图像变化$/ }).click();
  const planBindingResponse = page.waitForResponse(
    (response) => response.url().endsWith("/bindings") && response.request().method() === "POST"
  );
  await manager.getByTestId("file-detail").getByRole("button", { name: "关联教学计划" }).click();
  expect((await planBindingResponse).status()).toBe(201);
  await expect(manager.getByTestId("file-detail")).toContainText("preparation_task");
  await expect(manager.getByTestId("file-detail")).toContainText("teaching_plan_revision");
  await expect(manager.getByTestId("file-detail").getByRole("button", { name: /删\s*除/ })).toBeDisabled();
  await manager.getByRole("button", { name: "列表视图" }).click();
  await expect(manager.locator(".file-result-list")).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/12-file-manager.png`,
    fullPage: true,
    animations: "disabled"
  });
  await assertNoInternalTerms(page);
  await assertCleanMonitor(monitor);
});

test("demo Agent workspace does not import Mock Todo business state", async ({
  page
}) => {
  const monitor = monitorPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agent");
  await expect(page.getByRole("heading", { name: "有什么可以帮你？" })).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/13-agent-empty.png`,
    animations: "disabled"
  });

  await page.getByRole("button", { name: "新建对话" }).click();
  await expect(page.getByRole("heading", { name: "新对话" })).toBeVisible();
  await page.getByRole("button", { name: "制作 PPT" }).click();
  await expect(page.getByText("我可以基于当前教案")).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/14-agent-conversation.png`,
    animations: "disabled"
  });

  const contextPanel = page.getByTestId("agent-context-panel");
  await expect(contextPanel.locator(".segmented-control").getByRole("button", { name: "待办" })).toHaveCount(0);
  await expect(contextPanel.getByText("完成一次函数课件")).toHaveCount(0);
  await page.screenshot({
    path: `${screenshotRoot}/15-agent-context.png`,
    animations: "disabled"
  });

  await page.setViewportSize({ width: 1120, height: 800 });
  const drawerTrigger = page.getByRole("button", { name: "待办与上下文" });
  await expect(drawerTrigger).toBeVisible();
  await drawerTrigger.click();
  const drawer = page.getByRole("dialog", { name: "待办与上下文" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("当前课程")).toBeVisible();
  await page.keyboard.press("Escape");
  await assertNoInternalTerms(page);
  await assertCleanMonitor(monitor);
});

test("profile menu opens settings, memory controls and the typography guide", async ({
  page
}) => {
  const monitor = monitorPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/overview");
  await page.getByTestId("teacher-profile-trigger").click();
  await expect(page.getByRole("menu", { name: "教师设置菜单" })).toBeVisible();
  await page.getByRole("menuitem", { name: "上下文和记忆" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "上下文和记忆" })).toBeVisible();
  await expect(page.getByText("候选推断", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/16-settings-memory.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page.goto("/style-guide");
  await expect(page.getByRole("heading", { name: "样式指南" })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('14px "HarmonyOS Sans SC"'))).toBe(true);
  const fonts = await platformFonts(page, ".type-body p");
  expect(fonts.some((font) => font.familyName.includes("HarmonyOS Sans SC"))).toBe(true);
  await page.screenshot({
    path: `${screenshotRoot}/17-style-guide.png`,
    fullPage: true,
    animations: "disabled"
  });
  await assertCleanMonitor(monitor);
});

test("all new routes and legacy redirects remain reachable", async ({
  page
}) => {
  const routes = [
    ["/overview", "概览"],
    ["/schedule", "日程"],
    ["/teaching", "教学"],
    ["/students", "学生"],
    ["/files", "文件"],
    ["/agent", "有什么可以帮你？"],
    ["/settings", "设置"],
    ["/style-guide", "样式指南"]
  ] as const;
  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  }

  await page.goto("/courses");
  await expect(
    page.getByRole("heading", { name: "教学", exact: true })
  ).toBeVisible();
  await page.goto("/assignments");
  await expect(page.getByTestId("assignment-workspace")).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto("/unknown-teacher-route");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "概览" })).toBeVisible();
});

test("Gate 2.4 recovers a teacher request, reviews and approves a plan, then rejects without changing current", async ({
  page,
  request
}) => {
  const monitor = monitorPage(page);
  const headers = {
    "x-demo-tenant": "tenant:demo-school",
    "x-demo-actor": "user:teacher-001"
  };
  const initialApprovedResponse = await request.get(
    apiRoutes.demo.currentApprovedTeachingPlan,
    { headers }
  );
  expect(initialApprovedResponse.status()).toBe(200);
  const initialApproved = await initialApprovedResponse.json();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/copilot");
  await expect(page.getByText("结构化教学建议详情")).toBeVisible();
  const taskInput = page.getByRole("textbox", { name: "教师助手任务说明" });
  const firstRequest =
    "根据一次函数学习证据，比较明天课堂的两种调整策略";
  await taskInput.fill(firstRequest);
  let delayFirstInvocationRead = true;
  await page.route(/\/model-invocations\/[^/?]+(?:\?.*)?$/, async (route) => {
    if (
      delayFirstInvocationRead &&
      route.request().method() === "GET"
    ) {
      delayFirstInvocationRead = false;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    await route.continue();
  });
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(
        apiRoutes.demo.createTeacherCopilotTask
      ) &&
      response.request().method() === "POST"
  );
  await page.getByTestId("generate-copilot").click();
  const created = await createResponse;
  expect(created.status()).toBe(201);
  const createdBody = await created.json();
  await expect(page.getByRole("heading", { name: "比较教学策略" })).toBeVisible({
    timeout: 20_000
  });
  await expect(page).toHaveURL(
    new RegExp(
      `/copilot/proposals/${encodeURIComponent(
        createdBody.proposalRevisionRef
      ).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`
    )
  );
  await expect(page.getByText(firstRequest).first()).toBeVisible();
  await expect(page.getByText("直接观察", { exact: true }).first()).toBeVisible();

  let createCallsAfterRefresh = 0;
  page.on("request", (webRequest) => {
    if (
      new URL(webRequest.url()).pathname ===
        apiRoutes.demo.createTeacherCopilotTask &&
      webRequest.method() === "POST"
    ) {
      createCallsAfterRefresh += 1;
    }
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "比较教学策略" })).toBeVisible({
    timeout: 20_000
  });
  expect(createCallsAfterRefresh).toBe(0);
  await expect(page.getByText(firstRequest).first()).toBeVisible();

  await page.getByRole("button", { name: /策略 B/ }).click();
  const diff = page.getByTestId("teaching-plan-diff");
  await expect(diff).toHaveAttribute("data-view-mode", "changes");
  await page.screenshot({
    path: `${screenshotRoot}/18-gate2-copilot-and-diff.png`,
    fullPage: true,
    animations: "disabled"
  });
  await page.getByTestId("diff-view-all").click();
  await expect(diff).toHaveAttribute("data-view-mode", "all");
  await page.getByTestId("diff-view-changes").click();

  await page.getByTestId("edit-suggestion").click();
  const teacherChange =
    "教师修改：先核对独立解释，再决定是否继续提供句式支架。";
  await page.getByTestId("edit-follow-up").fill(teacherChange);
  const dispositionResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/dispositions") &&
      response.request().method() === "POST"
  );
  await page.getByTestId("save-teacher-edits").click();
  const disposition = await dispositionResponse;
  expect(disposition.status()).toBe(201);
  expect(await disposition.json()).toMatchObject({
    disposition: "accepted_with_changes",
    implementationObserved: false,
    instructionalDecisionCreated: false,
    resultingRevision: { state: "in_review" }
  });
  await expect(page.getByText("修改后接受")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("已发布", { exact: true })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("ObservedPedagogicalMove");
  await expect(page.locator("body")).not.toContainText("InstructionalDecision");

  const currentBeforeApproval = await request.get(
    apiRoutes.demo.currentApprovedTeachingPlan,
    { headers }
  );
  expect((await currentBeforeApproval.json()).revisionRef).toBe(
    initialApproved.revisionRef
  );

  await page.getByRole("button", { name: "查看教学计划" }).click();
  await expect(page).toHaveURL(/\/teaching-plan$/);
  await expect(page.getByText(/in_review（尚未成为当前正式计划）/)).toBeVisible({
    timeout: 20_000
  });
  await expect(
    page.getByText(
      new RegExp(
        `第 ${initialApproved.revisionNumber} 版.*approved`
      )
    )
  ).toBeVisible();

  const approvalResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/approve") &&
      response.request().method() === "POST"
  );
  await page.getByTestId("approve-teaching-plan").click();
  const approvedResponse = await approvalResponse;
  expect(approvedResponse.status()).toBe(201);
  const approved = await approvedResponse.json();
  await expect(page.getByText(/已创建并批准第/)).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByText("当前没有待审核版本。")).toBeVisible();

  const currentAfterApproval = await request.get(
    apiRoutes.demo.currentApprovedTeachingPlan,
    { headers }
  );
  expect((await currentAfterApproval.json()).revisionRef).toBe(
    approved.approvedRevision.revisionRef
  );

  await page.goto("/copilot");
  const secondRequest =
    "为同一课堂创建第二条建议，用于验证拒绝不改变当前计划";
  await taskInput.fill(secondRequest);
  const secondCreateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(
        apiRoutes.demo.createTeacherCopilotTask
      ) &&
      response.request().method() === "POST"
  );
  await page.getByTestId("generate-copilot").click();
  const secondCreated = await secondCreateResponse;
  expect(secondCreated.status()).toBe(201);
  await expect(page.getByRole("heading", { name: "比较教学策略" })).toBeVisible({
    timeout: 20_000
  });
  const rejectionResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/dispositions") &&
      response.request().method() === "POST"
  );
  await page.getByTestId("reject-suggestion").click();
  expect((await rejectionResponse).status()).toBe(201);
  await expect(page.getByText("已拒绝")).toBeVisible({
    timeout: 20_000
  });

  const currentAfterRejection = await request.get(
    apiRoutes.demo.currentApprovedTeachingPlan,
    { headers }
  );
  expect((await currentAfterRejection.json()).revisionRef).toBe(
    approved.approvedRevision.revisionRef
  );

  await page.getByRole("button", { name: "查看运行依据" }).click();
  await expect(page).toHaveURL(/\/runs$/);
  await expect(page.getByText(secondRequest).first()).toBeVisible({
    timeout: 20_000
  });
  await page.getByText("查看可审计技术详情").click();
  await page.getByText("固定契约与使用的数据").click();
  await expect(page.getByText("Evidence refs")).toBeVisible();
  await expect(page.getByText("权限检查与后台处理")).toBeVisible();
  await page.getByText("权限检查与后台处理").click();
  await expect(
    page.getByText("AuthorizationDecision", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "processed" }).first()).toBeVisible({
    timeout: 20_000
  });
  await assertCleanMonitor(monitor);
});

test("Gate 2.5 completes a recoverable Lesson → Task → Proposal → approved plan workflow", async ({
  page,
  request
}) => {
  const monitor = monitorPage(page);
  const headers = {
    "x-demo-tenant": "tenant:demo-school",
    "x-demo-actor": "user:teacher-001"
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/teaching");
  await page.getByTestId("lesson-3").click();
  const lessonDetail = page.getByTestId("lesson-detail");
  await expect(lessonDetail).toContainText("斜率与图像变化");
  await expect(lessonDetail).toContainText(
    "当前课时没有未完成的备课任务"
  );
  const initialPlansResponse = await request.get(
    apiRoutes.teacher.lessonTeachingPlans(
      "lesson:slope-and-graph-change"
    ),
    { headers }
  );
  expect(initialPlansResponse.status()).toBe(200);
  const initialPlans = await initialPlansResponse.json();
  const initialExportResponse = await request.post(
    apiRoutes.teacher.teachingPlanDocxExport(
      initialPlans.currentApproved.revisionRef
    ),
    {
      headers,
      data: {
        lessonRef: "lesson:slope-and-graph-change",
        expectedRevisionNumber:
          initialPlans.currentApproved.revisionNumber,
        purpose: "teaching-plan.export-docx",
        idempotencyKey: `playwright:initial-export:${crypto.randomUUID()}`
      }
    }
  );
  expect(initialExportResponse.status()).toBe(201);

  await page.getByTestId("start-lesson-preparation").click();
  await expect(page).toHaveURL(/\/agent\/tasks\//);
  await expect(page.getByTestId("task-working-set")).toContainText(
    "斜率与图像变化"
  );
  await expect(page.getByTestId("task-working-set")).toContainText(
    "baseline approved plan"
  );
  const taskInput = page.getByRole("textbox", {
    name: "教师助手任务说明"
  });
  const firstRequest =
    "请强化斜率变化与图像陡峭程度的联系，并加入独立检查。";
  await taskInput.fill(firstRequest);
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(
        apiRoutes.teacher.modelInvocations
      ) &&
      response.request().method() === "POST"
  );
  await page.getByTestId("generate-copilot").click();
  const createdResponse = await createResponse;
  expect(createdResponse.status()).toBe(202);
  await expect(page.getByTestId("generate-copilot")).toBeDisabled();
  const created = await createdResponse.json();
  expect(created.execution.taskRef).toBeTruthy();
  expect(
    created.execution.authorizedContextPlanRef
  ).toBeTruthy();
  await expect(page).toHaveURL(/\/copilot\/proposals\//, {
    timeout: 20_000
  });
  await expect(
    page.getByRole("heading", { name: "比较教学策略" })
  ).toBeVisible({ timeout: 20_000 });

  let duplicateGenerationCalls = 0;
  page.on("request", (webRequest) => {
    if (
      new URL(webRequest.url()).pathname ===
        apiRoutes.teacher.modelInvocations &&
      webRequest.method() === "POST"
    ) {
      duplicateGenerationCalls += 1;
    }
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "比较教学策略" })
  ).toBeVisible({ timeout: 20_000 });
  expect(duplicateGenerationCalls).toBe(0);
  await expect(page.getByText(firstRequest).first()).toBeVisible();

  await page.getByTestId("edit-suggestion").click();
  await page
    .getByTestId("edit-lesson-focus")
    .fill(
      "教师修改：比较同方向直线的斜率绝对值与陡峭程度。"
    );
  await page.getByTestId("save-teacher-edits").click();
  await expect(page.getByText("修改后接受")).toBeVisible({
    timeout: 20_000
  });

  const beforeApprovalResponse = await request.get(
    apiRoutes.teacher.lessonTeachingPlans(
      "lesson:slope-and-graph-change"
    ),
    { headers }
  );
  const beforeApproval = await beforeApprovalResponse.json();
  expect(beforeApproval.currentApproved.revisionRef).toBe(
    initialPlans.currentApproved.revisionRef
  );
  expect(beforeApproval.activeInReview).not.toBeNull();

  await page.getByRole("button", { name: "查看教学计划" }).click();
  await expect(page).toHaveURL(/\/teaching-plan\/tasks\//);
  await expect(
    page.getByRole("heading", { name: "你正在查看当前待审核版本" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "你正在查看历史版本" })
  ).toHaveCount(0);
  await page.screenshot({
    path: `${screenshotRoot}/22-gate2-5c-active-in-review.png`,
    fullPage: true,
    animations: "disabled"
  });
  await expect(
    page.getByTestId("teaching-plan-preparation-task")
  ).toContainText("awaiting_plan_review");
  await page.getByTestId("approve-teaching-plan").click();
  await expect(
    page.getByTestId("teaching-plan-preparation-task")
  ).toContainText("ready_for_use", { timeout: 20_000 });
  const afterApprovalResponse = await request.get(
    apiRoutes.teacher.lessonTeachingPlans(
      "lesson:slope-and-graph-change"
    ),
    { headers }
  );
  const afterApproval = await afterApprovalResponse.json();
  expect(afterApproval.currentApproved.revisionRef).not.toBe(
    initialPlans.currentApproved.revisionRef
  );
  expect(afterApproval.activeInReview).toBeNull();

  await page.getByRole("button", { name: "返回课时" }).click();
  await expect(page).toHaveURL(
    /\/teaching\/lessons\/lesson(?:%3A|:)slope-and-graph-change/
  );
  await expect(page.getByTestId("finish-ready-preparation")).toBeVisible();
  await expect(page.getByTestId("start-lesson-preparation")).toHaveCount(0);
  await page.screenshot({
    path: `${screenshotRoot}/23-gate2-5c-ready-action.png`,
    fullPage: true,
    animations: "disabled"
  });
  await page.getByTestId("finish-ready-preparation").click();
  await expect(page).toHaveURL(/\/teaching-plan\/tasks\//);

  const exportResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/exports/docx") &&
      response.request().method() === "POST"
  );
  await page.getByTestId("export-approved-plan-docx").click();
  expect((await exportResponse).status()).toBe(201);
  await expect(
    page.getByTestId("teaching-plan-file-exports")
  ).toContainText("已批准教案文件");

  await page.getByTestId("complete-lesson-preparation").click();
  await expect(
    page.getByTestId("teaching-plan-preparation-task")
  ).toContainText("completed", { timeout: 20_000 });
  await page.reload();
  await expect(
    page.getByTestId("teaching-plan-preparation-task")
  ).toContainText("completed", { timeout: 20_000 });
  const summaryResponse = await request.get(
    apiRoutes.teacher.lessonPreparationSummary,
    { headers }
  );
  const summary = await summaryResponse.json();
  expect(
    summary.incompleteTasks.some(
      (task: { taskRef: string }) =>
        task.taskRef === created.execution.taskRef
    )
  ).toBe(false);

  await page.getByRole("button", { name: "返回备课 Task" }).click();
  await expect(page).toHaveURL(/\/agent\/tasks\//);
  await expect(page.getByTestId("completed-task-review-only")).toBeVisible();
  await taskInput.fill(
    "创建第二条建议，用于验证拒绝不会改变已批准计划。"
  );
  await page.getByTestId("generate-copilot").click();
  await expect(
    page.getByRole("heading", { name: "比较教学策略" })
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("accept-suggestion")).toBeDisabled();
  await expect(page.getByTestId("edit-suggestion")).toBeDisabled();
  await expect(page.getByTestId("reject-suggestion")).toBeEnabled();
  await page.getByTestId("reject-suggestion").click();
  await expect(page.getByText("已拒绝")).toBeVisible({
    timeout: 20_000
  });
  const afterRejectResponse = await request.get(
    apiRoutes.teacher.lessonTeachingPlans(
      "lesson:slope-and-graph-change"
    ),
    { headers }
  );
  const afterReject = await afterRejectResponse.json();
  expect(afterReject.currentApproved.revisionRef).toBe(
    afterApproval.currentApproved.revisionRef
  );

  await page.getByRole("button", { name: "查看运行依据" }).click();
  await expect(page).toHaveURL(/\/runs\/tasks\//);
  await page.getByText("查看可审计技术详情").click();
  await page.getByText("备课 Task 与封存上下文").click();
  await expect(
    page.getByText("AuthorizedContextPlan", { exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/19-gate2-5-recoverable-lesson-preparation.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page.goto("/overview");
  await expect(
    page.getByRole("heading", {
      name: "今天需要做什么",
      exact: true
    })
  ).toBeVisible();
  const workbenchResponse = await request.get(
    `${apiRoutes.teacher.workbenchActionItems}?includeDeferred=false`,
    { headers }
  );
  expect(workbenchResponse.status()).toBe(200);
  const workbench = await workbenchResponse.json();
  expect(workbench.items.some((item: {
    sourceType: string;
    sourceRef: string;
  }) => item.sourceType === "lesson_preparation" &&
    item.sourceRef === created.execution.taskRef)).toBe(false);
  await expect(
    page.getByTestId("today-work").locator("article").filter({
      hasText: "继续备课：斜率与图像变化"
    })
  ).toHaveCount(0);
  await page
    .getByTestId("today-courses")
    .locator("article")
    .filter({ hasText: "一次函数的应用" })
    .getByRole("button", { name: "打开课时" })
    .click();
  await expect(page).toHaveURL(
    /\/teaching\/lessons\/lesson(?:%3A|:)linear-function-application/
  );
  await expect(page.getByTestId("lesson-detail")).toContainText(
    "一次函数的应用"
  );

  await page.goto("/files");
  const exportedFile = page
    .getByTestId("real-file-list")
    .getByRole("button", { name: /斜率与图像变化 教案/ });
  await expect(exportedFile).toBeVisible({ timeout: 20_000 });
  await exportedFile.click();
  await expect(page.getByTestId("file-version-history")).toContainText("v2");
  await expect(page.getByTestId("file-version-history")).toContainText("v1");
  await expect(
    page.getByTestId("file-detail").getByRole("button", {
      name: "创建新版本"
    })
  ).toBeDisabled();
  await expect(
    page.getByTestId("file-detail").getByRole("button", {
      name: "创建新版本"
    })
  ).toHaveAttribute(
    "title",
    "正式教案的新版本只能从新的 approved TeachingPlan Revision 导出"
  );
  await expect(
    page.getByTestId("file-detail").getByRole("button", { name: /删\s*除/ })
  ).toBeDisabled();
  await expect(
    page.getByTestId("file-detail").getByRole("button", { name: /删\s*除/ })
  ).toHaveAttribute("title", "正式教学成果引用的文件不可删除");
  const download = page.waitForEvent("download");
  await page.getByTestId("file-detail").getByRole("button", { name: /下\s*载/ }).click();
  const downloaded = await download;
  expect(downloaded.suggestedFilename()).toMatch(/\.docx$/u);
  await page.screenshot({
    path: `${screenshotRoot}/20-gate2-5b-file-and-docx.png`,
    fullPage: true,
    animations: "disabled"
  });

  const controlPort = process.env.E2E_CONTROL_PORT;
  const e2eRunId = process.env.E2E_RUN_ID;
  expect(controlPort).toBeTruthy();
  expect(e2eRunId).toBeTruthy();
  const restartResponse = await request.post(
    `http://127.0.0.1:${controlPort}/__e2e/restart-api`,
    { headers: { "x-e2e-run-id": e2eRunId! } }
  );
  expect(restartResponse.status()).toBe(200);
  expect(await restartResponse.json()).toMatchObject({ restarted: true });
  await page.reload();
  await expect(exportedFile).toBeVisible({ timeout: 20_000 });
  await exportedFile.click();
  await expect(page.getByTestId("file-version-history")).toContainText("v2");
  await expect(page.getByTestId("file-detail")).toContainText(
    "teaching_plan_revision"
  );
  await page.screenshot({
    path: `${screenshotRoot}/21-gate2-5b-restart-recovery.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page.goto("/teaching");
  await page.getByTestId("lesson-3").click();
  await expect(page.getByTestId("lesson-detail")).toContainText("已完成");
  await expect(
    page.getByTestId("lesson-detail").getByRole("button", {
      name: "查看已完成备课"
    })
  ).toBeVisible();
  await expect(page.getByTestId("lesson-related-files")).toContainText(
    "斜率与图像变化 教案"
  );
  await page
    .getByTestId("lesson-related-files")
    .getByRole("button", { name: /斜率与图像变化 教案/ })
    .click();
  await expect(page).toHaveURL(
    /\/files\?asset=.*&lesson=lesson(?:%3A|:)slope-and-graph-change/
  );
  await expect(
    page
      .getByLabel("上传关联课时")
      .locator("xpath=ancestor::*[contains(@class, 'ant-select')][1]")
  ).toContainText("斜率与图像变化");
  await page.screenshot({
    path: `${screenshotRoot}/24-gate2-5c-file-context.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page.goto("/teaching");
  await page.getByTestId("lesson-5").click();
  await expect(page.getByTestId("lesson-detail")).toContainText("已计划");
  await page.getByRole("button", { name: "取消备课" }).click();
  await page.getByRole("button", { name: "确认取消" }).click();
  await expect(page.getByTestId("lesson-detail")).toContainText("已取消");
  await page.getByTestId("reopen-lesson-preparation").click();
  await expect(page).toHaveURL(/\/agent\/tasks\//);
  await expect(page.getByTestId("task-working-set")).toContainText(
    "一次函数的应用"
  );
  await assertCleanMonitor(monitor);
});

test("startup failure remains precise and safe", async ({ page }) => {
  await page.route(`**${apiRoutes.demo.bootstrap}`, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "BOOTSTRAP_UNAVAILABLE",
        message: "示例启动服务不可用"
      })
    });
  });
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "教师工作空间未能启动" })).toBeVisible();
  await expect(page.getByText("教师工作台启动数据")).toBeVisible();
  await expect(page.getByText("BOOTSTRAP_UNAVAILABLE")).toBeVisible();
  await expect(page.getByText("示例启动服务不可用")).toBeVisible();
  await expect(page.getByRole("button", { name: /重\s*试/ })).toBeVisible();
  await expect(page.getByText("查看本地启动指南")).toBeVisible();
});

test("an incomplete Ark configuration falls back to the local demo assistant without exposing configuration", async ({
  page
}) => {
  const monitor = monitorPage(page);
  await page.route(
    `**${apiRoutes.teacher.modelProviderAvailability}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          requestedMode: "ark",
          activeProvider: "mock",
          configured: false,
          available: true,
          fallbackToMock: true,
          modelDisplayName: "Deterministic MockModelProvider",
          apiMode: "chat_completions",
          liveTestsEnabled: false,
          safeReason:
            "火山方舟配置不完整，已使用本地演示助手。"
        })
      });
    }
  );
  await page.goto("/copilot");
  await expect(
    page.getByTestId("model-provider-availability")
  ).toContainText("火山方舟配置不完整");
  await expect(page.locator("body")).not.toContainText(
    "ARK_API_KEY"
  );
  await assertCleanMonitor(monitor);
});

function monitorPage(page: Page) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nonLocalRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
    if (message.type() === "warning") warnings.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
      nonLocalRequests.push(request.url());
    }
  });
  return { errors, warnings, nonLocalRequests };
}

async function assertCleanMonitor(
  monitor: ReturnType<typeof monitorPage>
): Promise<void> {
  expect(monitor.errors).toEqual([]);
  expect(monitor.warnings).toEqual([]);
  expect(monitor.nonLocalRequests).toEqual([]);
}

async function assertNoInternalTerms(page: Page): Promise<void> {
  const visibleText = await page.locator(".teacher-portal-main").innerText();
  for (const term of bannedTeacherTerms) {
    expect(
      visibleText,
      `教师默认界面不应显示技术词：${term}`
    ).not.toMatch(new RegExp(`\\b${escapeRegExp(term)}\\b`, "i"));
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type PlatformFont = {
  familyName: string;
  glyphCount: number;
  isCustomFont: boolean;
};

async function platformFonts(
  page: Page,
  selector: string
): Promise<PlatformFont[]> {
  const client = await page.context().newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  try {
    const { root } = await client.send("DOM.getDocument");
    const { nodeId } = await client.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector
    });
    const result = await client.send(
      "CSS.getPlatformFontsForNode",
      { nodeId }
    );
    return result.fonts;
  } finally {
    await client.detach();
  }
}

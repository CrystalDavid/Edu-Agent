import { mkdir } from "node:fs/promises";

import { apiRoutes } from "@edu-agent/contracts";
import { expect, test, type Page } from "@playwright/test";

const screenshotRoot =
  "output/playwright/teacher-portal-ui-v1/final";

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
  await mkdir("docs/ui/images", { recursive: true });
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
    apiRoutes.health,
    apiRoutes.demo.bootstrap
  ]);
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
    page.getByRole("button", { name: /林老师.*数学教师/ })
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
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expect(page.locator("[class*='hero']")).toHaveCount(0);
  await assertNoInternalTerms(page);

  await page.screenshot({
    path: `${screenshotRoot}/01-overview-1440x900.png`,
    animations: "disabled"
  });
  await page.screenshot({
    path: "docs/ui/images/teacher-portal-v1-after.png",
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

test("schedule distinguishes fixed events from movable todos", async ({
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

  const todo = page.getByTestId("todo-panel").locator("article").filter({
    hasText: "完成一次函数课件"
  });
  await todo.getByRole("button", { name: "转成日程" }).click();
  await expect(page.getByText("已将待办加入日程草稿")).toBeVisible();
  await todo.getByRole("checkbox").click();
  await expect(todo).toHaveCount(0);
  await assertNoInternalTerms(page);
  await assertCleanMonitor(monitor);
});

test("teaching workspace supports course files, homework and assessment analysis", async ({
  page
}) => {
  const monitor = monitorPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/teaching");
  await expect(page.getByRole("heading", { name: "教学" })).toBeVisible();
  await expect(page.getByTestId("course-tree")).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/06-teaching-course-tree.png`,
    animations: "disabled"
  });

  await page.getByTestId("course-tree").getByRole("button", { name: /第二单元/ }).click();
  await page.getByTestId("course-tree").getByRole("button", { name: /第一节 数据的收集/ }).click();
  await page.getByTestId("course-file-list").getByRole("button", { name: /八年级作业完成情况/ }).click();
  await expect(page.getByTestId("file-preview")).toContainText(
    "八年级作业完成情况"
  );
  await page.screenshot({
    path: `${screenshotRoot}/07-course-file-preview.png`,
    animations: "disabled"
  });

  await page.getByRole("tab", { name: /作业/ }).click();
  await expect(page.getByTestId("homework-dashboard")).toBeVisible();
  await page.getByTestId("homework-list").getByRole("button", { name: /一次函数图像判断/ }).click();
  await expect(page.getByTestId("homework-dashboard")).toContainText("100%");
  await expect(page.getByRole("columnheader", { name: "主要情况" })).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/08-homework-analysis.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page.getByRole("tab", { name: /测试/ }).click();
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

test("student workspace moves evidence behind teacher-facing interpretation", async ({
  page
}) => {
  const monitor = monitorPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/students");
  await expect(page.getByTestId("class-overview")).toBeVisible();
  await expect(page.getByText("只呈现当前证据支持的变化")).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/10-students-class-overview.png`,
    fullPage: true,
    animations: "disabled"
  });

  const priorityList = page.getByTestId("student-priority-list");
  await priorityList.getByRole("button", { name: /学生 02/ }).click();
  await expect(page.getByTestId("student-detail")).toContainText("学生 02");
  await expect(page.getByText("教学建议草稿，需要教师判断和修改")).toBeVisible();
  await page.getByRole("button", { name: "查看分析依据" }).click();
  await expect(page.getByText("不适用条件")).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/11-student-detail.png`,
    fullPage: true,
    animations: "disabled"
  });
  await assertNoInternalTerms(page);
  await assertCleanMonitor(monitor);
});

test("file manager filters, sorts and previews local demo files", async ({
  page
}) => {
  const monitor = monitorPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/files");
  const manager = page.getByTestId("file-manager");
  await manager.getByRole("button", { name: /^课件/ }).click();
  const fileButton = manager.locator(".file-results").getByRole("button", {
    name: /一次函数：斜率与图像/
  });
  await expect(fileButton).toBeVisible();
  await manager.getByLabel("文件排序").click();
  await page.locator(".ant-select-item-option").filter({ hasText: /^名称$/ }).click();
  await fileButton.click();
  await expect(manager.getByTestId("file-preview")).toContainText("第 6 页 / 18 页");
  await manager.getByRole("button", { name: "列表视图" }).click();
  await expect(manager.locator(".file-result-list")).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/12-file-manager.png`,
    fullPage: true,
    animations: "disabled"
  });
  await manager.getByRole("button", { name: "恢复初始数据" }).click();
  await assertNoInternalTerms(page);
  await assertCleanMonitor(monitor);
});

test("Agent workspace manages conversations, tasks and explainable context", async ({
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
  await contextPanel.locator(".segmented-control").getByRole("button", { name: "待办" }).click();
  await contextPanel.getByRole("button", { name: /完成一次函数课件/ }).click();
  await contextPanel.locator(".segmented-control").getByRole("button", { name: "上下文" }).click();
  await expect(contextPanel.getByText("完成一次函数课件")).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/15-agent-context.png`,
    animations: "disabled"
  });
  await contextPanel.getByRole("button", { name: "移除 完成一次函数课件" }).click();
  await expect(contextPanel.getByText("完成一次函数课件")).toHaveCount(0);

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
  await page.getByRole("button", { name: /林老师.*数学教师/ }).click();
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
  await expect(page.getByRole("heading", { name: "教学" })).toBeVisible();
  await page.goto("/assignments");
  await expect(page.getByTestId("homework-dashboard")).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto("/unknown-teacher-route");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "概览" })).toBeVisible();
});

test("Gate 2 proposal, disposition and audit semantics remain unchanged", async ({
  page
}) => {
  const monitor = monitorPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/copilot");
  await expect(page.getByText("结构化教学建议详情")).toBeVisible();
  const taskInput = page.getByRole("textbox", { name: "教师助手任务说明" });
  await taskInput.fill("准备明天的课");
  await page.getByTestId("generate-copilot").click();
  await expect(page.getByRole("heading", { name: "比较教学策略" })).toBeVisible({
    timeout: 20_000
  });

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

import { mkdir } from "node:fs/promises";

import { apiRoutes } from "@edu-agent/contracts";
import { expect, test, type Page } from "@playwright/test";

const screenshotRoot =
  "output/playwright/gate2-ui-redesign-v2/final";

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

const bannedSyntheticLabels = [
  "（合成）",
  "合成学生",
  "合成演示",
  "全部数据为合成数据"
] as const;

test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
  await mkdir("docs/ui/images", { recursive: true });
});

test("API contract and teacher-daily-work dashboard stay aligned", async ({
  page,
  request
}) => {
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
    if (url.pathname.startsWith("/api/")) {
      apiRequests.push(url.pathname);
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "上午好，林老师" })
  ).toBeVisible();
  await expect(page.getByTestId("today-courses")).toBeVisible();
  expect(apiRequests.slice(0, 2)).toEqual([
    apiRoutes.health,
    apiRoutes.demo.bootstrap
  ]);
  await expect(page.locator("body")).not.toContainText(
    "教师工作台未能启动"
  );
  expect(new URL(page.url()).pathname).toBe("/");

  await expect(page.locator(".side-rail")).toHaveCSS(
    "width",
    "68px"
  );
  await expect(
    page.getByRole("button", { name: "林老师头像" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /展开侧栏|收起侧栏/ })
  ).toHaveCount(0);

  const primaryNav = page.locator(".primary-nav");
  for (const label of [
    "工作台",
    "日程",
    "课程",
    "学生",
    "作业",
    "文件"
  ]) {
    await expect(
      primaryNav.getByRole("button", { name: label, exact: true })
    ).toBeVisible();
  }
  for (const removed of [
    "教师助手",
    "学习证据",
    "教学目标",
    "运行记录",
    "样式与字体"
  ]) {
    await expect(
      primaryNav.getByRole("button", {
        name: removed,
        exact: true
      })
    ).toHaveCount(0);
  }

  for (const heading of [
    "今日课程",
    "快捷操作",
    "需要处理",
    "备课与课件",
    "学生学习情况",
    "今日日程与待办",
    "最近文件"
  ]) {
    await expect(
      page.getByRole("heading", { name: heading })
    ).toBeVisible();
  }
  await expect(page.locator(".teaching-headline")).toHaveCount(0);
  await expect(page.locator("[class*='hero']")).toHaveCount(0);
  await assertTeacherFacingChinese(page);

  const dashboardBrandBlocks = await page
    .locator(".dashboard-page *")
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            background: style.backgroundColor,
            width: rect.width,
            height: rect.height
          };
        })
        .filter(
          (item) =>
            item.background === "rgb(51, 112, 255)" &&
            item.width > window.innerWidth * 0.6 &&
            item.height > 80
        )
    );
  expect(dashboardBrandBlocks).toEqual([]);

  const quickIconColors = await page
    .locator(".quick-action .workspace-icon")
    .evaluateAll((icons) =>
      Array.from(
        new Set(icons.map((icon) => getComputedStyle(icon).color))
      )
    );
  expect(quickIconColors).toEqual(["rgb(51, 112, 255)"]);

  await page.screenshot({
    path: `${screenshotRoot}/01-home-1440x900.png`,
    animations: "disabled"
  });
  await page.screenshot({
    path: "docs/ui/images/gate2-v2-after.png",
    animations: "disabled"
  });
  await page.getByTestId("today-courses").screenshot({
    path: `${screenshotRoot}/03-today-courses.png`,
    animations: "disabled"
  });
  await page.getByTestId("quick-actions").screenshot({
    path: `${screenshotRoot}/04-quick-actions.png`,
    animations: "disabled"
  });
  await page.getByTestId("attention-items").screenshot({
    path: `${screenshotRoot}/05-attention-items.png`,
    animations: "disabled"
  });
  await page.getByTestId("teaching-assets").screenshot({
    path: `${screenshotRoot}/06-preparation-assets.png`,
    animations: "disabled"
  });
  await page.getByTestId("student-learning").screenshot({
    path: `${screenshotRoot}/07-student-learning.png`,
    animations: "disabled"
  });
  await page.getByTestId("schedule-todos").screenshot({
    path: `${screenshotRoot}/08-schedule-todos.png`,
    animations: "disabled"
  });

  await page.getByTestId("global-agent-input").click();
  await expect(page.getByTestId("agent-command-palette")).toBeVisible();
  for (const command of [
    "准备明天的课程",
    "制作一次函数课件",
    "根据最近作业调整教学重点",
    "查看今天未交作业",
    "查看需要关注的学生",
    "安排本周备课时间"
  ]) {
    await expect(
      page.getByRole("button", { name: command })
    ).toBeVisible();
  }
  await page.getByTestId("agent-command-palette").screenshot({
    path: `${screenshotRoot}/09-agent-command-palette.png`,
    animations: "disabled"
  });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "林老师身份菜单" }).click();
  await expect(
    page.getByText("演示环境", { exact: false })
  ).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "上午好，林老师" })
  ).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/02-home-1920x1080.png`,
    animations: "disabled"
  });
  const dashboardWidth = await page
    .locator(".dashboard-page")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(dashboardWidth).toBeLessThanOrEqual(1440);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
  ).toBeLessThanOrEqual(1);
});

test("teacher pages organize courses, students, assignments and files", async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const routes = [
    ["/schedule", "日程"],
    ["/courses", "课程"],
    ["/students", "学生"],
    ["/assignments", "作业"],
    ["/files", "文件"],
    ["/settings", "设置"]
  ] as const;
  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: heading, exact: true })
    ).toBeVisible();
    await assertTeacherFacingChinese(page);
  }

  await page.goto("/courses");
  await expect(page.getByText("当前课程", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "教学目标" })
  ).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/10-courses.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page.goto("/students");
  await expect(
    page.getByRole("heading", { name: "需要关注", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "学生 14", exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/11-students.png`,
    fullPage: true,
    animations: "disabled"
  });
  await page.getByRole("button", { name: "查看分析依据" }).click();
  await expect(
    page.getByRole("heading", { name: "学习证据" })
  ).toBeVisible();
  await expect(page.getByTestId("evidence-observation")).toHaveCount(2);
  await expect(page.getByTestId("evidence-claim")).toHaveCount(2);

  await page.goto("/assignments");
  await expect(page.getByText("4 人未交")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "布置作业" })
  ).toBeDisabled();
  await page.screenshot({
    path: `${screenshotRoot}/12-assignments.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page.goto("/files");
  await expect(
    page.getByRole("button", { name: "新建文件" })
  ).toBeDisabled();
  await expect(page.getByText("备课材料")).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/13-files.png`,
    fullPage: true,
    animations: "disabled"
  });
});

test("global task entry drives the Mock Copilot without changing Gate 2 semantics", async ({
  page
}) => {
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const nonLocalRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
    if (message.type() === "warning") {
      consoleWarnings.push(message.text());
    }
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
      nonLocalRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("global-agent-input").click();
  await page
    .getByRole("textbox", { name: "搜索与任务输入" })
    .fill("准备明天的课");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/copilot$/);
  await expect(
    page.getByRole("textbox", { name: "教师助手任务说明" })
  ).toHaveValue("准备明天的课");
  await expect(
    page.getByText(
      "以下内容为教学建议草稿，需由教师判断和修改。"
    )
  ).toBeVisible();

  await page.getByTestId("generate-copilot").click();
  await expect(
    page.getByRole("heading", { name: "比较教学策略" })
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /策略 B/ }).click();
  await expect(
    page
      .getByTestId("strategy-detail")
      .getByRole("heading", { name: /对比样例/ })
  ).toBeVisible();
  await assertTeacherFacingChinese(page);
  await page.locator(".strategy-comparison-grid").evaluate((element) => {
    window.scrollTo(
      0,
      window.scrollY +
        element.getBoundingClientRect().top -
        150
    );
  });
  await page.screenshot({
    path: `${screenshotRoot}/14-copilot-result.png`,
    animations: "disabled"
  });

  const diff = page.getByTestId("teaching-plan-diff");
  await expect(diff).toHaveAttribute("data-view-mode", "changes");
  const firstDiffSection = diff.locator(".ant-collapse-header").first();
  if (
    (await firstDiffSection.getAttribute("aria-expanded")) !== "true"
  ) {
    await firstDiffSection.click();
  }
  await diff.evaluate((element) => {
    window.scrollTo(
      0,
      window.scrollY +
        element.getBoundingClientRect().top -
        76
    );
  });
  await page.screenshot({
    path: `${screenshotRoot}/15-teaching-plan-diff.png`,
    animations: "disabled"
  });
  await page.getByTestId("diff-view-all").click();
  await expect(diff).toHaveAttribute("data-view-mode", "all");
  await page.getByTestId("diff-view-changes").click();
  await expect(diff).toHaveAttribute("data-view-mode", "changes");

  await page.getByTestId("edit-suggestion").click();
  const changedFields = page.locator(".edit-field textarea");
  expect(await changedFields.count()).toBeGreaterThan(0);
  await expect(changedFields.first()).toBeEditable();
  const teacherChange =
    "教师修改：先核对独立解释，再决定是否继续提供句式支架。";
  await page.getByTestId("edit-follow-up").fill(teacherChange);
  await expect(page.getByTestId("edit-summary")).toContainText(
    "后续行动"
  );

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
    resultingRevision: {
      state: "in_review"
    }
  });
  await expect(page.getByText("修改后接受")).toBeVisible({
    timeout: 20_000
  });
  await expect(
    page.getByText("已发布", { exact: true })
  ).toHaveCount(0);

  await page.getByRole("button", { name: "查看运行依据" }).click();
  await expect(
    page.getByRole("heading", { name: "本次建议如何形成" })
  ).toBeVisible({ timeout: 20_000 });
  await page
    .getByRole("button", { name: "查看可审计技术详情" })
    .click();
  await page
    .getByRole("button", { name: "固定契约与使用的数据" })
    .click();
  await expect(
    page.getByText("ContextManifest", { exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: `${screenshotRoot}/16-system-records-technical.png`,
    fullPage: true,
    animations: "disabled"
  });

  expect(consoleErrors).toEqual([]);
  expect(consoleWarnings).toEqual([]);
  expect(nonLocalRequests).toEqual([]);
});

test("routes, local fonts, startup diagnostics and responsive layouts remain stable", async ({
  page
}) => {
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font") {
      fontRequests.push(request.url());
    }
  });

  const routes = [
    ["/", "上午好，林老师"],
    ["/schedule", "日程"],
    ["/courses", "课程"],
    ["/students", "学生"],
    ["/assignments", "作业"],
    ["/files", "文件"],
    ["/settings", "设置"],
    ["/goals", "教学目标"],
    ["/evidence", "学习证据"],
    ["/copilot", "教师助手"],
    ["/teaching-plan", "教学计划"],
    ["/runs", "运行记录"],
    ["/style-guide", "样式与字体"]
  ] as const;

  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: heading }).first()
    ).toBeVisible();
  }

  await page.goto("/style-guide");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const simplified = await platformFonts(
    page,
    '[data-font-probe="simplified"]'
  );
  const traditional = await platformFonts(
    page,
    '[data-font-probe="traditional"]'
  );
  const latin = await platformFonts(
    page,
    '[data-font-probe="latin"]'
  );
  const numbers = await platformFonts(
    page,
    '[data-font-probe="numbers"]'
  );

  expect(
    traditional.some((font) =>
      font.familyName.includes("Chiron GoRound TC")
    )
  ).toBe(true);
  expect(
    latin.some(
      (font) =>
        font.familyName.includes("Nunito") && font.isCustomFont
    )
  ).toBe(true);
  expect(
    numbers.some(
      (font) =>
        font.familyName.includes("Nunito") && font.isCustomFont
    )
  ).toBe(true);
  expect(
    simplified.some((font) =>
      font.familyName.includes("Chiron GoRound TC")
    )
  ).toBe(false);
  expect(
    simplified.some((font) =>
      /Microsoft YaHei|PingFang SC/i.test(font.familyName)
    )
  ).toBe(true);

  const uniqueFontRequests = Array.from(new Set(fontRequests));
  expect(uniqueFontRequests.length).toBeGreaterThanOrEqual(6);
  for (const requestUrl of uniqueFontRequests) {
    expect(new URL(requestUrl).hostname).toBe("localhost");
  }
  expect(
    uniqueFontRequests.some((url) =>
      url.includes("nunito-latin-variable.woff2")
    )
  ).toBe(true);
  expect(
    uniqueFontRequests.filter((url) => url.includes("gf_")).length
  ).toBe(5);

  for (const [width, height] of [
    [1280, 720],
    [1440, 900],
    [1920, 1080],
    [2560, 1440]
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth - window.innerWidth
      )
    ).toBeLessThanOrEqual(1);
  }

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
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "教师工作台未能启动" })
  ).toBeVisible();
  await expect(page.getByText("教师工作台启动数据")).toBeVisible();
  await expect(page.getByText("BOOTSTRAP_UNAVAILABLE")).toBeVisible();
  await expect(page.getByText("示例启动服务不可用")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /重\s*试/ })
  ).toBeVisible();
  await expect(page.getByText("查看本地启动指南")).toBeVisible();
});

async function assertTeacherFacingChinese(page: Page): Promise<void> {
  const visibleText = await page.locator(".workspace-main").innerText();
  for (const term of bannedTeacherTerms) {
    expect(
      visibleText,
      `教师默认界面不应显示技术词：${term}`
    ).not.toMatch(new RegExp(`\\b${escapeRegExp(term)}\\b`, "i"));
  }
  for (const label of bannedSyntheticLabels) {
    expect(
      visibleText,
      `教师默认界面不应重复演示标记：${label}`
    ).not.toContain(label);
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
    for (let attempt = 0; attempt < 4; attempt += 1) {
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
      } catch (error) {
        if (attempt === 3) throw error;
        await page.waitForTimeout(150);
      }
    }
    throw new Error(`无法读取字体节点：${selector}`);
  } finally {
    await client.detach();
  }
}

import { mkdir } from "node:fs/promises";

import { apiRoutes } from "@edu-agent/contracts";
import { expect, test, type Page } from "@playwright/test";

const screenshotRoot =
  "output/playwright/gate2-ui-redesign/final";

const bannedTeacherTerms = [
  "Today",
  "Goals",
  "Evidence",
  "Teacher Copilot",
  "TeachingPlan",
  "Runs",
  "CourseRun",
  "Mock",
  "Revision",
  "draft",
  "in_review",
  "Proposal",
  "EvidenceObservation",
  "EvidenceClaim",
  "Assistance",
  "ContextManifest",
  "AuthorizationDecision",
  "PromptBundle",
  "RunManifest"
] as const;

const bannedSyntheticLabels = [
  "（合成）",
  "合成学生",
  "合成演示",
  "全部数据为合成数据"
] as const;

test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
});

test("API contract, bright workbench and Chinese default view stay aligned", async ({
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
    page.getByRole("heading", {
      name: "先帮助学生理解“斜率为什么改变图像”"
    })
  ).toBeVisible();
  expect(apiRequests.slice(0, 2)).toEqual([
    apiRoutes.health,
    apiRoutes.demo.bootstrap
  ]);
  await expect(page.locator("body")).not.toContainText(
    "教师工作台未能启动"
  );
  expect(new URL(page.url()).pathname).toBe("/");

  await assertTeacherFacingChinese(page);
  await expect(
    page.getByText("演示环境", { exact: true })
  ).toHaveCount(1);
  await expect(page.locator(".side-rail")).toHaveCSS(
    "width",
    "84px"
  );

  const headlineBackground = await page
    .locator(".teaching-headline")
    .evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(headlineBackground).toContain("rgb(51, 112, 255)");

  for (const heading of [
    "我的常用",
    "今日待办",
    "教学洞察",
    "最近活动"
  ]) {
    await expect(
      page.getByRole("heading", { name: heading })
    ).toBeVisible();
  }
  const insightTop = await page
    .getByRole("heading", { name: "教学洞察" })
    .evaluate((element) => element.getBoundingClientRect().top);
  expect(insightTop).toBeLessThan(900);

  await page.screenshot({
    path: `${screenshotRoot}/01-workbench-1440x900.png`,
    animations: "disabled"
  });
  await page.screenshot({
    path: `${screenshotRoot}/02-sidebar-collapsed.png`,
    animations: "disabled"
  });
  await page
    .getByRole("heading", { name: "我的常用" })
    .locator("xpath=..")
    .locator("xpath=..")
    .screenshot({
      path: `${screenshotRoot}/03-my-common.png`,
      animations: "disabled"
    });
  await page
    .getByRole("heading", { name: "今日待办" })
    .locator("xpath=..")
    .locator("xpath=..")
    .screenshot({
      path: `${screenshotRoot}/04-today-todos.png`,
      animations: "disabled"
    });

  await page.getByRole("button", { name: "展开侧栏" }).click();
  await expect(page.locator(".side-rail")).toHaveCSS(
    "width",
    "204px"
  );
  await expect(
    page.getByRole("button", { name: "今日工作台" })
  ).toContainText("今日工作台");
  await page.getByRole("button", { name: "收起侧栏" }).click();
  await expect(page.locator(".side-rail")).toHaveCSS(
    "width",
    "84px"
  );

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.screenshot({
    path: `${screenshotRoot}/05-workbench-1920x1080.png`,
    animations: "disabled"
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
  ).toBeLessThanOrEqual(1);
});

test("evidence and assistant present teacher language before technical detail", async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "学习证据" }).click();
  await dismissNavTooltip(page);

  await expect(
    page.getByRole("heading", { name: "学习证据" })
  ).toBeVisible();
  await expect(
    page.getByTestId("evidence-observation")
  ).toHaveCount(2);
  await expect(page.getByTestId("evidence-claim")).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "证据缺口" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "辅助情况" })
  ).toBeVisible();
  await assertTeacherFacingChinese(page);
  await page.screenshot({
    path: `${screenshotRoot}/06-learning-evidence.png`,
    fullPage: true,
    animations: "disabled"
  });

  const detailButton = page
    .getByTestId("evidence-observation")
    .first()
    .getByRole("button", { name: "查看来源与允许用途" });
  await detailButton.click();
  await expect(detailButton).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(page.getByText("不得形成能力定论")).toBeVisible();

  await page.getByRole("button", { name: "教师助手" }).click();
  await dismissNavTooltip(page);
  await expect(
    page.getByText(
      "以下内容为教学建议草稿，需由教师判断和修改。"
    )
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "教师助手" })
  ).toBeVisible();
  await assertTeacherFacingChinese(page);
  await page.screenshot({
    path: `${screenshotRoot}/07-teacher-copilot.png`,
    fullPage: true,
    animations: "disabled"
  });
});

test("teacher reviews strategies, edits a version and keeps implementation semantics unchanged", async ({
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
  await page.goto("/copilot");
  await page.getByTestId("generate-copilot").click();
  await expect(
    page.getByRole("heading", { name: "比较教学策略" })
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("button", { name: /策略 A/ })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /策略 B/ })
  ).toBeVisible();
  await page.getByRole("button", { name: /策略 B/ }).click();
  await expect(
    page
      .getByTestId("strategy-detail")
      .getByRole("heading", { name: /对比样例/ })
  ).toBeVisible();
  await assertTeacherFacingChinese(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${screenshotRoot}/08-strategy-comparison.png`,
    fullPage: true,
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
  await diff.screenshot({
    path: `${screenshotRoot}/09-teaching-plan-diff.png`,
    animations: "disabled"
  });
  await page.getByTestId("diff-view-all").click();
  await expect(diff).toHaveAttribute("data-view-mode", "all");
  await page.getByTestId("diff-view-changes").click();
  await expect(diff).toHaveAttribute("data-view-mode", "changes");

  await page.getByTestId("edit-suggestion").click();
  const changedFields = page.locator(".edit-field textarea");
  expect(await changedFields.count()).toBeGreaterThan(2);
  const followUp = page.getByTestId("edit-follow-up");
  const teacherChange =
    "教师修改：先核对独立解释，再决定是否继续提供句式支架。";
  await followUp.fill(teacherChange);
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

  await page
    .getByRole("button", { name: "教学计划", exact: true })
    .click();
  await dismissNavTooltip(page);
  await expect(
    page.getByRole("heading", { name: "教学计划", exact: true })
  ).toBeVisible();
  await expect(
    page.locator(".plan-document").getByText(teacherChange)
  ).toBeVisible();
  await expect(page.getByText("待审核").first()).toBeVisible();
  await expect(page.getByText("已发布")).toHaveCount(0);
  await assertTeacherFacingChinese(page);
  await page.screenshot({
    path: `${screenshotRoot}/10-teaching-plan.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page
    .getByRole("button", { name: "运行记录", exact: true })
    .click();
  await dismissNavTooltip(page);
  await expect(
    page.getByRole("heading", { name: "本次建议如何形成" })
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText("本地演示助手", { exact: true })
  ).toBeVisible();
  await assertTeacherFacingChinese(page);
  await page.screenshot({
    path: `${screenshotRoot}/11-run-records.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page
    .getByRole("button", { name: "查看可审计技术详情" })
    .click();
  await page
    .getByRole("button", { name: "固定契约与使用的数据" })
    .click();
  await expect(
    page.getByText("ContextManifest", { exact: true })
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(consoleWarnings).toEqual([]);
  expect(nonLocalRequests).toEqual([]);
});

test("routes, local fonts, explicit startup errors and responsive layouts remain stable", async ({
  page
}) => {
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font") {
      fontRequests.push(request.url());
    }
  });

  const routes = [
    ["/", "工作台"],
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
  await page.screenshot({
    path: `${screenshotRoot}/12-style-and-fonts.png`,
    fullPage: true,
    animations: "disabled"
  });

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

async function dismissNavTooltip(page: Page): Promise<void> {
  await page.mouse.move(720, 120);
  await page.waitForTimeout(120);
}

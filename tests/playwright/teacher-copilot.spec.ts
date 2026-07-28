import { mkdir } from "node:fs/promises";

import { apiRoutes } from "@edu-agent/contracts";
import { expect, test, type Page } from "@playwright/test";

const screenshotRoot = "output/playwright/gate2-refactor/final";

test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
});

test("health, bootstrap and browser route contracts are aligned", async ({
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
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /明天的课，先解决“斜率”为什么改变图像/
    })
  ).toBeVisible();
  expect(apiRequests.slice(0, 2)).toEqual([
    apiRoutes.health,
    apiRoutes.demo.bootstrap
  ]);
  await expect(page.locator("body")).not.toContainText(
    "教师工作台未能启动"
  );
  await expect(page.locator("body")).not.toContainText("HTTP 404");
  expect(new URL(page.url()).pathname).toBe("/");
  await page.screenshot({
    path: `${screenshotRoot}/01-home-404-fixed.png`,
    fullPage: true,
    animations: "disabled"
  });
});

test("teacher completes evidence-to-review without creating implementation facts", async ({
  page
}) => {
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const nonLocalRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
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
  await expect(
    page.getByRole("heading", {
      name: /明天的课，先解决“斜率”为什么改变图像/
    })
  ).toBeVisible();
  await expect(
    page.getByText("全部数据为合成数据", { exact: false })
  ).toBeVisible();
  await expect(page.locator(".side-rail")).toHaveCSS(
    "width",
    "240px"
  );
  await page.screenshot({
    path: `${screenshotRoot}/02-dashboard-1440x900.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page
    .getByRole("menuitem", { name: /学习证据/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "学习证据" })
  ).toBeVisible();
  await expect(
    page.getByTestId("evidence-observation")
  ).toHaveCount(2);
  await expect(page.getByTestId("evidence-claim")).toHaveCount(2);
  const firstObservation = page
    .getByTestId("evidence-observation")
    .first();
  const evidenceDisclosure = firstObservation.getByRole("button", {
    name: "查看来源、Assistance 与未知项"
  });
  await evidenceDisclosure.click();
  await expect(evidenceDisclosure).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(
    page.getByText("没有迁移到负斜率情境的证据")
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${screenshotRoot}/04-evidence.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page
    .getByRole("menuitem", { name: /教师助手/ })
    .click();
  await expect(
    page.getByText(
      "这是教学建议草稿，不是正式教学决定，也不表示已实施。"
    )
  ).toBeVisible();
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
  await expect(page.locator(".side-rail")).toHaveCSS(
    "width",
    "240px"
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${screenshotRoot}/05-copilot-strategy-comparison.png`,
    fullPage: true,
    animations: "disabled"
  });

  const diff = page.getByTestId("teaching-plan-diff");
  await expect(diff).toHaveAttribute("data-view-mode", "changes");
  const firstDiffSection = diff
    .locator(".ant-collapse-header")
    .first();
  if (
    (await firstDiffSection.getAttribute("aria-expanded")) !== "true"
  ) {
    await firstDiffSection.click();
  }
  await expect(firstDiffSection).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await diff.screenshot({
    path: `${screenshotRoot}/06-diff-changes-only.png`,
    animations: "disabled"
  });
  await page.getByTestId("diff-view-all").click();
  await expect(diff).toHaveAttribute("data-view-mode", "all");
  await page.getByTestId("diff-view-changes").click();
  await expect(diff).toHaveAttribute("data-view-mode", "changes");

  await page.getByTestId("edit-suggestion").click();
  const changedFields = page.locator(".edit-field textarea");
  expect(await changedFields.count()).toBeGreaterThan(0);
  const followUp = page.getByTestId("edit-follow-up");
  await expect(followUp).toBeVisible();
  const teacherChange =
    "教师修改：先核对独立解释，再决定是否继续提供句式支架。";
  await followUp.fill(teacherChange);
  await expect(page.getByTestId("edit-summary")).toContainText(
    "后续行动"
  );
  await page.screenshot({
    path: `${screenshotRoot}/07-diff-edit-state.png`,
    animations: "disabled"
  });

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
    page.getByRole("dialog", {
      name: "编辑建议中的 TeachingPlan 变更"
    })
  ).toBeHidden();

  await page
    .getByRole("menuitem", { name: /教学计划/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "教学计划", exact: true })
  ).toBeVisible();
  await expect(
    page.locator(".plan-document").getByText(teacherChange)
  ).toBeVisible();
  await expect(page.getByText("in_review").first()).toBeVisible();
  await expect(page.getByText("published")).toHaveCount(0);

  await page
    .getByRole("menuitem", { name: /运行记录/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "运行记录" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "本次建议如何形成" })
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("¥0.00（Mock）")).toBeVisible();
  await expect(page.locator(".side-rail")).toHaveCSS(
    "width",
    "240px"
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${screenshotRoot}/08-run-explanation.png`,
    fullPage: true,
    animations: "disabled"
  });
  await page
    .getByRole("button", {
      name: /固定契约：Contract.*ContextManifest/
    })
    .click();
  await expect(
    page.getByText("ContextManifest", { exact: true })
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(consoleWarnings).toEqual([]);
  expect(nonLocalRequests).toEqual([]);
});

test("all SPA routes refresh, API errors remain explicit, and local fonts are used", async ({
  page
}) => {
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font") {
      fontRequests.push(request.url());
    }
  });
  const routes = [
    ["/", /明天的课/],
    ["/goals", /教学改进 Goal/],
    ["/evidence", /学习证据/],
    ["/copilot", /调整明天课堂/],
    ["/teaching-plan", /教学计划/],
    ["/runs", /运行记录/],
    ["/style-guide", /样式与字体/]
  ] as const;

  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: heading }).first()
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "tenant:other-school"
    );
  }

  await page.goto("/style-guide");
  await expect(
    page.locator('[data-font-probe="traditional"]')
  ).toBeVisible();
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
    traditional
      .filter((font) =>
        font.familyName.includes("Chiron GoRound TC")
      )
      .reduce((sum, font) => sum + font.glyphCount, 0)
  ).toBeGreaterThanOrEqual(9);
  expect(
    traditional
      .filter(
        (font) =>
          !font.familyName.includes("Chiron GoRound TC")
      )
      .reduce((sum, font) => sum + font.glyphCount, 0)
  ).toBeLessThanOrEqual(1);
  expect(
    latin.some(
      (font) =>
        font.familyName.includes("Nunito") &&
        font.isCustomFont
    )
  ).toBe(true);
  expect(
    numbers.some(
      (font) =>
        font.familyName.includes("Nunito") &&
        font.isCustomFont
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
    path: `${screenshotRoot}/09-style-guide-fonts.png`,
    fullPage: true,
    animations: "disabled"
  });

  await page.route(`**${apiRoutes.demo.bootstrap}`, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "BOOTSTRAP_UNAVAILABLE",
        message: "合成的启动服务不可用"
      })
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "教师工作台未能启动" })
  ).toBeVisible();
  await expect(page.getByText("教师工作台启动数据")).toBeVisible();
  await expect(page.getByText("BOOTSTRAP_UNAVAILABLE")).toBeVisible();
  await expect(page.getByText("合成的启动服务不可用")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /重\s*试/ })
  ).toBeVisible();
  await expect(
    page.getByText("查看本地启动指南")
  ).toBeVisible();
});

test("dashboard remains usable at all acceptance viewports", async ({
  page
}) => {
  const viewports = [
    [1280, 720],
    [1440, 900],
    [1920, 1080],
    [2560, 1440]
  ] as const;

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /明天的课，先解决“斜率”为什么改变图像/
      })
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    if (
      (width === 1440 && height === 900) ||
      (width === 1920 && height === 1080)
    ) {
      await page.screenshot({
        path: `${screenshotRoot}/03-dashboard-${width}x${height}.png`,
        fullPage: true,
        animations: "disabled"
      });
    }
  }

  await page.setViewportSize({ width: 980, height: 760 });
  await page.goto("/");
  const sidebarWidth = await page.locator(".side-rail").evaluate(
    (element) => element.getBoundingClientRect().width
  );
  expect(sidebarWidth).toBe(76);
  await expect(page.locator(".brand__copy")).toBeHidden();
  await page.screenshot({
    path: `${screenshotRoot}/10-narrow-sidebar-collapsed.png`,
    fullPage: true,
    animations: "disabled"
  });
});

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
  const { root } = await client.send("DOM.getDocument");
  const { nodeId } = await client.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector
  });
  const result = await client.send("CSS.getPlatformFontsForNode", {
    nodeId
  });
  await client.detach();
  return result.fonts;
}

import { expect, test } from "@playwright/test";

test("teacher completes the evidence-to-TeachingPlan review flow", async ({
  page
}) => {
  const consoleErrors: string[] = [];
  const nonLocalRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
      nonLocalRequests.push(request.url());
    }
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /明天的课，先解决“斜率”为什么改变图像/
    })
  ).toBeVisible();
  await expect(
    page.getByText("全部数据为合成数据", { exact: false })
  ).toBeVisible();
  await expect(page.getByText("Mock 模式")).toBeVisible();
  await expect(
    page.locator('textarea[placeholder*="消息"]')
  ).toHaveCount(0);
  await page.screenshot({
    path: "output/playwright/gate2/01-dashboard.png",
    fullPage: true,
    animations: "disabled"
  });

  await page.getByText("教学改进 Goal", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "教学改进 Goal" })
  ).toBeVisible();
  await expect(
    page.getByText("改进一次函数图像解释质量")
  ).toBeVisible();

  await page.getByText("学习证据", { exact: true }).click();
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
  const answerRelease = firstObservation.getByText("答案释放", {
    exact: true
  });
  await expect(answerRelease).toBeVisible();
  await answerRelease.scrollIntoViewIfNeeded();
  await expect(
    page.getByText("没有迁移到负斜率情境的证据")
  ).toBeVisible();
  await page.screenshot({
    path: "output/playwright/gate2/02-evidence-expanded.png",
    fullPage: true,
    animations: "disabled"
  });

  await page.getByText("Teacher Copilot", { exact: true }).click();
  await page.getByTestId("generate-copilot").click();
  await expect(page.getByText("比较教学策略")).toBeVisible({
    timeout: 20_000
  });
  await expect(
    page.getByText(/策略 A · 多重表征/)
  ).toBeVisible();
  await expect(
    page.getByText(/策略 B · 对比样例/)
  ).toBeVisible();
  await page.getByText(/策略 B · 对比样例/).click();
  await expect(
    page
      .getByTestId("strategy-detail")
      .getByRole("heading", { name: /对比样例/ })
  ).toBeVisible();
  await expect(page.getByTestId("teaching-plan-diff")).toBeVisible();
  await page.screenshot({
    path: "output/playwright/gate2/03-strategy-and-diff.png",
    fullPage: true,
    animations: "disabled"
  });

  await page.getByTestId("edit-suggestion").click();
  const teacherChange =
    "教师修改：先核对独立解释，再决定是否继续提供句式支架。";
  await page.getByTestId("edit-follow-up").fill(teacherChange);
  await page.getByTestId("save-teacher-edits").click();
  await expect(page.getByText("修改后接受")).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByText(/状态 in_review/)).toBeVisible();

  await page.getByText("TeachingPlan", { exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "TeachingPlan",
      exact: true
    })
  ).toBeVisible();
  await expect(page.getByText(teacherChange)).toBeVisible();
  await expect(page.getByText("in_review").first()).toBeVisible();
  await expect(page.getByText("published")).toHaveCount(0);
  await expect(
    page.getByText("strategy:worked-example-contrast", {
      exact: true
    }).first()
  ).toBeVisible();
  await expect(
    page.getByText("教师最终选择：修改后接受", {
      exact: true
    })
  ).toBeVisible();
  await page.screenshot({
    path: "output/playwright/gate2/04-teaching-plan-review.png",
    fullPage: true,
    animations: "disabled"
  });

  await page.getByText("运行记录", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "运行记录" })
  ).toBeVisible();
  await expect(
    page.getByText("ContextManifest", { exact: true }).first()
  ).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByText("¥0.00（Mock）")).toBeVisible();
  await expect(page.getByText("未使用")).toBeVisible();
  await expect(page.getByText("AuditRecord")).toHaveCount(0);
  await expect(
    page.getByText("面向用户的审计时间线")
  ).toBeVisible();
  await page.screenshot({
    path: "output/playwright/gate2/05-run-explanation.png",
    fullPage: true,
    animations: "disabled"
  });
  expect(consoleErrors).toEqual([]);
  expect(nonLocalRequests).toEqual([]);
});

test("all teacher routes render and an API failure is visible", async ({
  page
}) => {
  const routes = [
    ["/", /明天的课/],
    ["/goals", /教学改进 Goal/],
    ["/evidence", /学习证据/],
    ["/copilot", /调整明天课堂/],
    ["/teaching-plan", /TeachingPlan/],
    ["/runs", /运行记录/]
  ] as const;

  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading }).first())
      .toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "tenant:other-school"
    );
  }

  await page.route("**/api/v1/demo/workspace", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        code: "TEST_FAILURE",
        message: "合成的 UI 错误状态"
      })
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "教师工作台未能启动" })
  ).toBeVisible();
  await expect(page.getByText("合成的 UI 错误状态")).toBeVisible();
});

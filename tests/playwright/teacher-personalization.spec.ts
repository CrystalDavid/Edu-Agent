import { mkdir } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { playwrightArtifactPath } from "../config/test-artifacts.js";

const screenshotRoot = playwrightArtifactPath(
  "evidence",
  "phase7a-personalization"
);

test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
});

test("teacher confirms, edits, restores, and revokes a persistent preference", async ({
  page
}) => {
  await page.goto("/settings");
  await expect(page.getByTestId("settings-page")).toBeVisible();
  await page.getByRole("button", { name: "助手偏好" }).click();
  const panel = page.getByTestId("teacher-preference-settings");
  await expect(panel).toBeVisible();

  await panel.getByLabel("偏好类型").click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .filter({ hasText: "教案表达风格" })
    .click();
  await panel.getByPlaceholder("偏好内容，例如 简洁、突出课堂案例")
    .fill("简洁");
  await panel.getByPlaceholder("为什么记录这条偏好")
    .fill("教师希望后续备课建议保持简洁。 ");
  await panel.getByTestId("create-preference-candidate").click();

  const candidate = panel.locator("article.settings-row", {
    hasText: "教案表达风格"
  });
  await expect(candidate).toContainText("简洁");
  await candidate.getByRole("button", { name: /确\s*认/u }).click();

  const preferenceInput = panel.getByLabel("教案表达风格的值");
  await expect(preferenceInput).toHaveValue("简洁");
  await preferenceInput.fill("简洁并优先使用课堂案例");
  await preferenceInput
    .locator("xpath=ancestor::article[contains(@class, 'settings-row')]")
    .getByRole("button", { name: /保存修改/u })
    .click();
  await expect(preferenceInput).toHaveValue("简洁并优先使用课堂案例");

  await page.reload();
  await page.getByRole("button", { name: "助手偏好" }).click();
  await expect(page.getByLabel("教案表达风格的值"))
    .toHaveValue("简洁并优先使用课堂案例");
  await page.screenshot({
    path: `${screenshotRoot}/preference-confirmed.png`,
    fullPage: true
  });

  await page.getByRole("button", { name: /删除并撤销/u }).click();
  await expect(page.getByLabel("教案表达风格的值")).toHaveCount(0);
  await expect(panel).toContainText("已删除");
  await expect(panel).toContainText("简洁并优先使用课堂案例");

  await page.reload();
  await page.getByRole("button", { name: "助手偏好" }).click();
  await expect(page.getByLabel("教案表达风格的值")).toHaveCount(0);
  await expect(page.getByTestId("teacher-preference-settings"))
    .toContainText("简洁并优先使用课堂案例");
});

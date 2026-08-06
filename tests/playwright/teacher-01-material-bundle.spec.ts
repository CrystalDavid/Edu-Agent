import { mkdir } from "node:fs/promises";

import {
  MaterialBundleProjectionSchema,
  apiRoutes
} from "@edu-agent/contracts";
import { expect, test } from "@playwright/test";

import { gate25DemoRefs } from "../../scripts/sample/gate2-5-demo-fixture.js";
import { playwrightArtifactPath } from "../config/test-artifacts.js";

const screenshotRoot = playwrightArtifactPath(
  "evidence",
  "phase8a3-material-bundle"
);

test("approved TeachingPlan produces a versioned, teacher-controlled Material Bundle", async ({
  page
}) => {
  test.setTimeout(90_000);
  await page.goto("/teaching");
  await page.getByTestId("unit-1").click();
  await page.getByTestId("lesson-3").click();

  const panel = page.getByTestId("material-bundle-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("方案批准后，材料由系统先准备");
  await panel.getByTestId("generate-material-bundle").click();

  await expect.poll(async () => {
    const response = await page.request.get(
      apiRoutes.teacher.lessonMaterialBundle(
        gate25DemoRefs.lessonRefs.slopeAndGraph
      )
    );
    const bundle = MaterialBundleProjectionSchema.parse(await response.json());
    return bundle.items.filter((item) => item.status === "draft").length;
  }).toBeGreaterThanOrEqual(4);

  const board = panel.getByTestId("material-item-board_design");
  await expect(board).toContainText("待教师采用");
  const initialBundle = await loadBundle(page);
  const initialBoard = requiredBoard(initialBundle);

  await board.getByRole("button", { name: "调整并重生成" }).click();
  await page.getByTestId("material-adjustment-input").fill(
    "板书减少一些内容，只保留目标、关键步骤和检查。"
  );
  await page.getByRole("button", { name: "重新生成此项" }).click();
  await expect.poll(async () => {
    const latest = requiredBoard(await loadBundle(page));
    return latest.versionNumber;
  }).toBe((initialBoard.versionNumber ?? 0) + 1);

  const regenerated = requiredBoard(await loadBundle(page));
  expect(regenerated.assetRef).toBe(initialBoard.assetRef);
  expect(regenerated.versionRef).not.toBe(initialBoard.versionRef);

  await board.getByRole("button", { name: /预\s*览/u }).click();
  const preview = page.getByRole("dialog").filter({ hasText: "板书设计" });
  await expect(preview).toBeVisible();
  await expect(preview.locator("pre")).toContainText(
    "板书减少一些内容"
  );
  await preview.getByRole("button", { name: /关\s*闭/u }).click();

  const download = page.waitForEvent("download");
  await board.getByRole("button", { name: /下\s*载/u }).click();
  expect((await download).suggestedFilename()).toMatch(/\.md$/u);

  await board.getByTestId("adopt-material-board_design").click();
  await expect.poll(async () =>
    requiredBoard(await loadBundle(page)).status
  ).toBe("adopted");
  await expect(board).toContainText("已采用");

  await mkdir(screenshotRoot, { recursive: true });
  await page.screenshot({
    path: `${screenshotRoot}/01-material-bundle-generated-and-adopted.png`,
    fullPage: true
  });
});

async function loadBundle(page: import("@playwright/test").Page) {
  const response = await page.request.get(
    apiRoutes.teacher.lessonMaterialBundle(
      gate25DemoRefs.lessonRefs.slopeAndGraph
    )
  );
  expect(response.status()).toBe(200);
  return MaterialBundleProjectionSchema.parse(await response.json());
}

function requiredBoard(
  bundle: ReturnType<typeof MaterialBundleProjectionSchema.parse>
) {
  const board = bundle.items.find((item) => item.kind === "board_design");
  expect(board).toBeDefined();
  if (!board) throw new Error("Material Bundle is missing board_design.");
  return board;
}

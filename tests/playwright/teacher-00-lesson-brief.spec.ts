import {
  LessonBriefStateSchema,
  apiRoutes
} from "@edu-agent/contracts";
import { expect, test } from "@playwright/test";

import { gate25DemoRefs } from "../../scripts/sample/gate2-5-demo-fixture.js";

test("Lesson Brief is generated from real authorized context and remains teacher-controlled", async ({
  page
}) => {
  await page.goto("/teaching");
  await page.getByTestId("unit-1").click();
  await page.getByTestId("lesson-3").click();

  const panel = page.getByTestId("lesson-brief-panel");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "生成教学洞察" }).click();
  await expect(panel.locator(".lesson-brief-candidates button").first())
    .toBeVisible();
  await expect(panel).toContainText("待教师判断");
  await panel.locator(".lesson-brief-sources summary").click();
  await expect(panel).toContainText("尚未接入教材知识源");

  const stateResponse = await page.request.get(
    apiRoutes.teacher.lessonBrief(gate25DemoRefs.lessonRefs.slopeAndGraph)
  );
  expect(stateResponse.status()).toBe(200);
  expect(LessonBriefStateSchema.parse(await stateResponse.json()).current)
    .toMatchObject({
      status: "waiting_for_teacher",
      generatedBySkillRef: "lesson-analysis@1"
    });

  await panel.getByRole("button", { name: "暂不采用" }).click();
  await expect.poll(async () => {
    const response = await page.request.get(
      apiRoutes.teacher.lessonBrief(gate25DemoRefs.lessonRefs.slopeAndGraph)
    );
    const state = LessonBriefStateSchema.parse(await response.json());
    return state.current?.status;
  }).toBe("deferred");
  await expect(panel).toHaveCount(0);
});

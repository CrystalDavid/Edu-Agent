import { describe, expect, it } from "vitest";

import {
  lessonPlanProjectionStatusLabel,
  lessonPreparationStatusLabel,
  modelExecutionStatusLabel
} from "../../apps/web/src/presentation.js";
import { parseAppRoute } from "../../apps/web/src/route.js";

describe("teacher product stabilization vocabulary and navigation", () => {
  it("keeps completed, ready and review states semantically distinct", () => {
    expect(lessonPreparationStatusLabel("ready_for_use")).toBe(
      "已准备，待完成"
    );
    expect(lessonPreparationStatusLabel("completed")).toBe("已完成");
    expect(lessonPlanProjectionStatusLabel("active_in_review")).toBe(
      "当前待审核"
    );
    expect(lessonPlanProjectionStatusLabel("current_approved")).toBe(
      "当前已批准"
    );
    expect(modelExecutionStatusLabel("validating")).toBe("正在验证");
  });

  it("restores the selected Lesson and FileAsset from a refreshable URL", () => {
    const route = parseAppRoute(
      "/files",
      "?lesson=lesson%3Aslope-and-graph-change&asset=file-asset%3Aapproved-docx"
    );

    expect(route).toMatchObject({
      route: "/files",
      fileLessonRef: "lesson:slope-and-graph-change",
      fileAssetRef: "file-asset:approved-docx"
    });
  });
});

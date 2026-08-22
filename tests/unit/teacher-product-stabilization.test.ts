import { describe, expect, it } from "vitest";

import {
  cleanTeacherPreviewText,
  lessonPlanProjectionStatusLabel,
  lessonPreparationStatusLabel,
  modelExecutionStatusLabel
} from "../../apps/web/src/presentation.js";
import { parseAppRoute } from "../../apps/web/src/route.js";

describe("teacher product stabilization vocabulary and navigation", () => {
  it("keeps generated material metadata out of the teacher preview", () => {
    const preview = cleanTeacherPreviewText(`---
schema: edu-agent-material-draft@1
kind: slide_outline
lesson: lesson:slope-and-graph-change
teachingPlanRevision: artifact-revision:internal
skill: material-generation@1
agentRun: agent-run:internal
---
# 斜率与图像变化

课堂活动与练习。`);

    expect(preview).toContain("斜率与图像变化");
    expect(preview).toContain("课堂活动与练习");
    expect(preview).not.toContain("artifact-revision");
    expect(preview).not.toContain("agent-run");
    expect(preview).not.toContain("schema:");
  });

  it("collapses implementation states into the shared teacher-facing tri-state", () => {
    expect(lessonPreparationStatusLabel("ready_for_use")).toBe("已完成");
    expect(lessonPreparationStatusLabel("completed")).toBe("已完成");
    expect(lessonPlanProjectionStatusLabel("active_in_review")).toBe("进行中");
    expect(lessonPlanProjectionStatusLabel("current_approved")).toBe("已完成");
    expect(modelExecutionStatusLabel("validating")).toBe("进行中");
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

  it("restores a Reflection Agent workflow from its direct URL", () => {
    expect(parseAppRoute("/agent/reflections/artifact%3Alesson-reflection%3A1"))
      .toMatchObject({
        route: "/agent",
        reflectionRef: "artifact:lesson-reflection:1",
        preparationTaskRef: null
      });
  });
});

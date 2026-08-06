import { describe, expect, it } from "vitest";

import {
  materialGenerationSkillV1,
  type MaterialGenerationSkillInput
} from "../../apps/api/src/agent/skills/material-generation/index.js";

describe("material-generation@1", () => {
  it("is a published, human-controlled Draft skill", () => {
    expect(materialGenerationSkillV1.manifest).toMatchObject({
      ref: "material-generation@1",
      status: "published",
      purpose: "material_generation",
      approvalPolicy: {
        outputKind: "draft",
        humanApprovalRequired: true
      },
      toolPolicy: { mode: "disabled", allowedTools: [] }
    });
  });

  it("generates exactly the requested drafts from authorized context", () => {
    const input = materialInput();
    const context = materialGenerationSkillV1.buildContext(input);
    const output = materialGenerationSkillV1.generate(context.input);
    const validation = materialGenerationSkillV1.validate({
      output,
      requestedKinds: context.input.requestedKinds,
      sources: context.manifest.sourceRefs
    });
    const evaluation = materialGenerationSkillV1.evaluate({
      context,
      validation
    });

    expect(output.drafts.map((draft) => draft.kind)).toEqual([
      "lesson_plan",
      "slide_outline",
      "exercise_set",
      "board_design",
      "differentiated_support"
    ]);
    expect(validation.valid).toBe(true);
    expect(evaluation.passed).toBe(true);
    expect(output.drafts.find((draft) => draft.kind === "slide_outline")
      ?.contentMarkdown).toContain("PPT");
  });

  it("excludes unauthorized Evidence and records why it was omitted", () => {
    const input = materialInput();
    input.evidence.push({
      evidenceRef: "evidence:foreign",
      evidenceType: "observation",
      summary: "This evidence belongs to another workspace.",
      status: "confirmed",
      sourceRefs: ["lesson:foreign"],
      source: source("evidence:foreign", "1", "foreign_workspace")
    });

    const context = materialGenerationSkillV1.buildContext(input);
    const output = materialGenerationSkillV1.generate(context.input);

    expect(context.input.evidence.map((item) => item.evidenceRef)).toEqual([
      "evidence:authorized"
    ]);
    expect(context.manifest.evidenceRefs).toEqual(["evidence:authorized"]);
    expect(context.manifest.sourceRefs).toContainEqual(expect.objectContaining({
      ref: "evidence:foreign",
      included: false,
      provenance: "excluded_by_authorization_or_lesson_scope"
    }));
    expect(JSON.stringify(output)).not.toContain("evidence:foreign");
  });

  it("supports a targeted regeneration request without producing other items", () => {
    const input = materialInput();
    input.requestedKinds = ["board_design"];
    input.teacherAdjustment = "Reduce the board content to three concise sections.";

    const context = materialGenerationSkillV1.buildContext(input);
    const output = materialGenerationSkillV1.generate(context.input);
    expect(output.drafts).toHaveLength(1);
    expect(output.drafts[0]).toMatchObject({ kind: "board_design" });
    expect(output.drafts[0]?.contentMarkdown).toContain(
      input.teacherAdjustment
    );
  });
});

function materialInput(): MaterialGenerationSkillInput {
  return {
    tenantRef: "tenant:school-a",
    actorRef: "teacher:lin",
    lesson: {
      lessonRef: "lesson:linear-function",
      courseRunRef: "course-run:math-8-3",
      unitRef: "unit:linear-function",
      title: "一次函数的应用",
      durationMinutes: 45,
      learningObjectiveRefs: ["objective:linear-function"],
      source: source("lesson:linear-function", "3", "education.lesson")
    },
    approvedTeachingPlan: {
      artifactRef: "teaching-plan:linear-function",
      revisionRef: "teaching-plan-revision:approved-3",
      revisionNumber: 3,
      title: "一次函数的应用教学方案",
      content: {
        objective: "学生能够使用一次函数解释真实情境。",
        lessonFocus: "从变量关系建立函数表达式。",
        openingActivity: "从出租车计费情境导入。",
        teacherQuestions: ["两个变量如何变化？", "如何验证表达式？"],
        studentActivity: "小组比较两种计费方案。",
        supportStrategy: "提供变量表和分步提示。",
        independentCheck: "独立完成一个收费方案比较题。",
        followUp: "根据课堂反馈调整下一课练习。",
        evidenceRefs: ["evidence:authorized"]
      },
      source: source(
        "teaching-plan-revision:approved-3",
        "3:approved",
        "artifact.teaching_plan_revision"
      )
    },
    lessonBrief: null,
    evidence: [{
      evidenceRef: "evidence:authorized",
      evidenceType: "observation",
      summary: "部分学生仍会混淆斜率与截距。",
      status: "confirmed",
      sourceRefs: ["lesson:linear-function"],
      source: source(
        "evidence:authorized",
        "2:confirmed",
        "education.evidence"
      )
    }],
    confirmedPreferences: [{
      preferenceRef: "preference:concise",
      preferenceKey: "lesson_material_style",
      preferenceValue: "Prefer concise materials with one concrete example.",
      version: 1,
      source: source(
        "preference:concise",
        "1:active",
        "personalization.teacher_preference"
      )
    }],
    authorizedEvidenceRefs: ["evidence:authorized"],
    excludedEvidenceRefs: [],
    requestedKinds: [
      "lesson_plan",
      "slide_outline",
      "exercise_set",
      "board_design",
      "differentiated_support"
    ],
    teacherAdjustment: null,
    generatedAt: "2026-08-06T08:00:00.000Z"
  };
}

function source(ref: string, version: string, provenance: string) {
  return {
    ref,
    version,
    contentHash: "a".repeat(64),
    provenance
  };
}

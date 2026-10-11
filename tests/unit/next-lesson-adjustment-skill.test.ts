import { describe, expect, it } from "vitest";

import {
  nextLessonAdjustmentSkillV1,
  type NextLessonAdjustmentSkillInput
} from "../../apps/api/src/agent/skills/next-lesson-adjustment/index.js";

describe("next-lesson-adjustment@1", () => {
  it("is a published, human-controlled Proposal skill", () => {
    expect(nextLessonAdjustmentSkillV1.manifest).toMatchObject({
      ref: "next-lesson-adjustment@1",
      status: "published",
      purpose: "next_lesson_adjustment",
      approvalPolicy: {
        outputKind: "proposal",
        humanApprovalRequired: true
      },
      toolPolicy: { mode: "disabled", allowedTools: [] }
    });
  });

  it("creates at most three source-bound candidates without creating formal actions", () => {
    const context = nextLessonAdjustmentSkillV1.buildContext(skillInput());
    const output = nextLessonAdjustmentSkillV1.generate(context.input);
    const validation = nextLessonAdjustmentSkillV1.validate({
      output,
      sources: context.manifest.sourceRefs,
      targetLessonRef: context.input.targetLesson.lessonRef
    });
    const evaluation = nextLessonAdjustmentSkillV1.evaluate({
      context,
      validation
    });

    expect(output.candidates).toHaveLength(3);
    expect(output.candidates.map((candidate) => candidate.candidateType))
      .toEqual([
        "adjust_next_lesson_focus",
        "create_practice_task",
        "review_student_issue"
      ]);
    expect(output.candidates.every((candidate) =>
      candidate.teacherConfirmationRequired &&
      candidate.basisRefs.includes("reflection-revision:confirmed-1")
    )).toBe(true);
    expect(output).not.toHaveProperty("taskRef");
    expect(output).not.toHaveProperty("assignmentRef");
    expect(validation.valid).toBe(true);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.operation).toMatchObject({
      deterministic: true,
      modelTokens: 0,
      retryCount: 0
    });
  });

  it("excludes unauthorized Evidence and records why it was not used", () => {
    const input = skillInput();
    input.selectedEvidence.push({
      evidenceRef: "evidence:school-b",
      objectiveRef: "objective:foreign",
      summary: "另一个学校的证据。",
      source: source("evidence:school-b", "1", "foreign_workspace")
    });

    const context = nextLessonAdjustmentSkillV1.buildContext(input);

    expect(context.input.selectedEvidence.map((item) => item.evidenceRef))
      .toEqual(["evidence:authorized"]);
    expect(context.manifest.evidenceRefs).toEqual(["evidence:authorized"]);
    expect(context.manifest.sourceRefs).toContainEqual(expect.objectContaining({
      ref: "evidence:school-b",
      included: false,
      provenance: "excluded_by_authorization_or_reflection_scope"
    }));
    expect(context.evaluation).toMatchObject({
      authorizedEvidenceOnly: true,
      excludedEvidenceCount: 1,
      passed: true
    });
  });

  it("rejects a candidate that cites a resource outside the sealed context", () => {
    const context = nextLessonAdjustmentSkillV1.buildContext(skillInput());
    const output = nextLessonAdjustmentSkillV1.generate(context.input);
    const unsafe = structuredClone(output);
    unsafe.candidates[0]!.basisRefs.push("evidence:school-b");

    const validation = nextLessonAdjustmentSkillV1.validate({
      output: unsafe,
      sources: context.manifest.sourceRefs,
      targetLessonRef: context.input.targetLesson.lessonRef
    });

    expect(validation).toMatchObject({ valid: false, category: "scope" });
  });

  it("fails closed when source and target Lessons are from different CourseRuns", () => {
    const input = skillInput();
    input.targetLesson.courseRunRef = "course-run:school-b";

    const context = nextLessonAdjustmentSkillV1.buildContext(input);

    expect(context.evaluation).toMatchObject({
      sameCourseRun: false,
      passed: false
    });
  });
});

function skillInput(): NextLessonAdjustmentSkillInput {
  return {
    tenantRef: "tenant:school-a",
    actorRef: "teacher:lin",
    sourceLesson: {
      lessonRef: "lesson:source",
      courseRunRef: "course-run:math-8-3",
      title: "斜率与图像变化",
      sequence: 3,
      learningObjectiveRefs: ["objective:slope"],
      source: source("lesson:source", "3", "education.lesson")
    },
    targetLesson: {
      lessonRef: "lesson:target",
      courseRunRef: "course-run:math-8-3",
      title: "待定系数法",
      sequence: 4,
      learningObjectiveRefs: ["objective:coefficient"],
      source: source("lesson:target", "4", "education.lesson")
    },
    confirmedReflection: {
      reflectionRef: "reflection:1",
      reflectionRevisionRef: "reflection-revision:confirmed-1",
      content: {
        objectiveAttainment: "多数学生能够判断斜率方向。",
        plannedVsImplemented: "练习环节比计划慢五分钟。",
        effectiveMoves: ["图像对比有效。"],
        ineffectiveMoves: ["独立练习支架不足。"],
        observationSummary: ["部分学生仍混淆斜率和截距。"],
        evidenceAlignment: ["课堂观察与已选作业证据一致。"],
        uncertainties: ["是否需要延长概念复习仍需复核。"],
        nextLessonSuggestions: ["先用一个对比例题复核斜率与截距。"],
        assignmentSuggestions: ["增加一道斜率与截距辨析题。"],
        teacherNotes: "保持方案简洁。"
      },
      source: source(
        "reflection-revision:confirmed-1",
        "1:confirmed",
        "teacher_confirmed_reflection_revision"
      )
    },
    confirmedDelivery: {
      deliveryRevisionRef: "delivery-revision:confirmed-1",
      actualStartAt: "2026-08-06T00:30:00.000Z",
      actualEndAt: "2026-08-06T01:15:00.000Z",
      unresolvedQuestions: ["部分学生仍混淆斜率和截距。"],
      followUpNotes: "下一课先复核基础概念。",
      source: source(
        "delivery-revision:confirmed-1",
        "1:confirmed",
        "teacher_confirmed_delivery_revision"
      )
    },
    selectedEvidence: [{
      evidenceRef: "evidence:authorized",
      objectiveRef: "objective:slope",
      summary: "斜率方向判断题出现重复错误。",
      source: source(
        "evidence:authorized",
        "2:confirmed",
        "reflection_selected_authorized_evidence"
      )
    }],
    confirmedPreferences: [{
      preferenceRef: "teacher-preference:concise",
      preferenceKey: "lesson_plan_detail",
      preferenceValue: "简洁并优先使用例题",
      version: 2,
      source: source(
        "teacher-preference:concise",
        "2",
        "confirmed_teacher_preference"
      )
    }],
    authorizedEvidenceRefs: ["evidence:authorized"],
    excludedEvidenceRefs: [],
    teacherAdjustment: "下一课减少讨论，先巩固基础。",
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

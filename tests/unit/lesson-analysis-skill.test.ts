import { describe, expect, it } from "vitest";

import { lessonAnalysisSkillV1 } from "../../apps/api/src/agent/skills/lesson-analysis/index.js";
import type { LessonAnalysisSkillInput } from "../../apps/api/src/agent/skills/lesson-analysis/input-schema.js";

const now = "2026-08-05T08:00:00.000Z";

describe("lesson-analysis@1", () => {
  it("generates a schema-valid candidate from authorized Lesson sources", () => {
    const context = lessonAnalysisSkillV1.buildContext(input());
    const output = lessonAnalysisSkillV1.generate(context.input);
    const validation = lessonAnalysisSkillV1.validate({
      output,
      sources: context.manifest.sourceRefs
    });

    expect(lessonAnalysisSkillV1.manifest).toMatchObject({
      ref: "lesson-analysis@1",
      status: "published",
      approvalPolicy: { outputKind: "draft", humanApprovalRequired: true }
    });
    expect(validation).toMatchObject({ valid: true });
    expect(output.schemaVersion).toBe("lesson-brief-candidate@1");
    expect(output.objectiveSummaries).toEqual([
      expect.objectContaining({ objectiveRef: "objective:1" })
    ]);
    expect(output.teachingFocusCandidates.length).toBeGreaterThan(0);
    expect(output.teachingFocusCandidates.every((item) => item.candidateOnly)).toBe(true);
  });

  it("reports missing knowledge and Evidence instead of inventing authority", () => {
    const context = lessonAnalysisSkillV1.buildContext(input({
      evidence: [],
      authorizedEvidenceRefs: []
    }));
    const output = lessonAnalysisSkillV1.generate(context.input);

    expect(output.knownGaps).toEqual(expect.arrayContaining([
      "尚未接入教材知识源",
      "尚未接入课程标准知识源",
      "尚未接入考点知识源",
      "当前课时没有已授权且可追溯的班级 Evidence"
    ]));
    expect(JSON.stringify(output)).not.toMatch(/教育部(?:要求|规定|明确)/u);
    expect(output.difficultyCandidates).toEqual([
      expect.objectContaining({ confidence: "low", basisRefs: ["objective:1"] })
    ]);
  });

  it("excludes unauthorized Evidence before building the ContextManifest", () => {
    const foreign = evidence("evidence:foreign", "跨学校未授权观察");
    const context = lessonAnalysisSkillV1.buildContext(input({
      evidence: [evidence("evidence:allowed", "学生容易混淆斜率与截距"), foreign],
      authorizedEvidenceRefs: ["evidence:allowed"]
    }));
    const output = lessonAnalysisSkillV1.generate(context.input);

    expect(context.input.evidence.map((item) => item.evidenceRef)).toEqual([
      "evidence:allowed"
    ]);
    expect(context.manifest.evidenceRefs).toEqual(["evidence:allowed"]);
    expect(context.manifest.sourceRefs).toContainEqual(expect.objectContaining({
      ref: "evidence:foreign",
      included: false,
      provenance: "excluded_by_authorization_or_lesson_scope"
    }));
    expect(JSON.stringify(output)).not.toContain("evidence:foreign");
    expect(context.evaluation).toMatchObject({
      authorizedEvidenceOnly: true,
      excludedEvidenceCount: 1,
      passed: true
    });
  });

  it("rejects a candidate whose basis is outside the ContextManifest", () => {
    const context = lessonAnalysisSkillV1.buildContext(input());
    const output = lessonAnalysisSkillV1.generate(context.input);
    const invalid = {
      ...output,
      teachingFocusCandidates: [{
        ...output.teachingFocusCandidates[0],
        basisRefs: ["evidence:not-authorized"]
      }]
    };

    expect(lessonAnalysisSkillV1.validate({
      output: invalid,
      sources: context.manifest.sourceRefs
    })).toMatchObject({ valid: false, category: "scope" });
  });
});

function input(
  overrides: Partial<LessonAnalysisSkillInput> = {}
): LessonAnalysisSkillInput {
  return {
    tenantRef: "school:1",
    actorRef: "teacher:1",
    lesson: {
      lessonRef: "lesson:1",
      courseRunRef: "course-run:1",
      unitRef: "unit:1",
      title: "一次函数的应用",
      durationMinutes: 45,
      plannedAt: now,
      source: source("lesson:1", "education.lesson")
    },
    objectives: [{
      objectiveRef: "objective:1",
      title: "解释斜率的意义",
      description: "能够结合实际情境解释斜率变化。",
      source: source("objective:1", "education.learning_objective")
    }],
    evidence: [evidence("evidence:allowed", "学生容易混淆斜率与截距")],
    approvedTeachingPlan: null,
    confirmedPreferences: [],
    authorizedEvidenceRefs: ["evidence:allowed"],
    excludedEvidenceRefs: [],
    teacherAdjustment: null,
    generatedAt: now,
    ...overrides
  };
}

function evidence(
  evidenceRef: string,
  summary: string
): LessonAnalysisSkillInput["evidence"][number] {
  return {
    evidenceRef,
    evidenceType: "observation",
    summary,
    objectiveRefs: ["objective:1"],
    observedAt: now,
    status: "confirmed",
    sourceRefs: ["assignment:1"],
    source: source(evidenceRef, "education.evidence")
  };
}

function source(ref: string, provenance: string) {
  return {
    ref,
    version: "1",
    contentHash: "a".repeat(64),
    provenance
  };
}

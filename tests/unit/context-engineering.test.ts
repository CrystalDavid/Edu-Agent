import { describe, expect, it } from "vitest";

import {
  LessonPreparationContextBuildError,
  lessonPreparationSkillV2,
  lessonPreparationSkillV3,
  type LessonPreparationSkillInput
} from "../../apps/api/src/agent/skills/lesson-preparation/index.js";

describe("Phase 6 lesson preparation Context Builder", () => {
  it("builds a deterministic, explainable manifest from authorized snapshots", () => {
    const first = build();
    const second = build();

    expect(first.input).toEqual(second.input);
    expect(first.manifest.contentHash).toBe(second.manifest.contentHash);
    expect(first.evaluation).toMatchObject({
      passed: true,
      authorization: { status: "passed", unauthorizedRefs: [] },
      completeness: { status: "passed", missingResourceKinds: [] },
      budget: { status: "passed" },
      value: {
        status: "passed",
        selectedEvidenceCount: 1,
        matchedEvidenceCount: 1,
        hitRate: 1
      }
    });
    expect(first.manifest.includedResources.map((item) => item.resourceRef))
      .toContain("teaching-plan-revision:approved-1");
    expect(first.manifest.includedResources.find(
      (item) => item.resourceRef === "evidence:observation-1"
    )).toMatchObject({
      resourceType: "authorized_evidence",
      provenance: "education.evidence"
    });
    expect(first.manifest.tokenUsage.estimatedInputTokens).toBeGreaterThan(0);
    expect(JSON.stringify(first.manifest)).not.toContain(
      "多数学生可以解释斜率方向"
    );
  });

  it("fails closed when selected Evidence was not authorized and sealed", () => {
    expect(() => build({ authorizedEvidenceRefs: [] })).toThrow(
      LessonPreparationContextBuildError
    );
    try {
      build({ authorizedEvidenceRefs: [] });
    } catch (error) {
      expect(error).toBeInstanceOf(LessonPreparationContextBuildError);
      expect((error as LessonPreparationContextBuildError).evaluation)
        .toMatchObject({
          passed: false,
          authorization: {
            status: "failed",
            unauthorizedRefs: ["evidence:observation-1"]
          }
        });
    }
  });

  it("compresses long optional text deterministically and records exclusions", () => {
    const result = build({
      evidenceSummary: `观察摘要${"较长内容".repeat(300)}`
    });

    expect(result.input.authorizedEvidence[0]!.summary.endsWith("…")).toBe(true);
    expect(result.input.authorizedEvidence[0]!.summary.length).toBeLessThanOrEqual(800);
    expect(result.manifest.excludedInformation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "token_budget" })
      ])
    );
  });

  it("blocks model invocation planning when required context exceeds budget", () => {
    expect(() => build({ tokenBudget: 10 })).toThrow(
      /exceed budget/u
    );
  });

  it("adds only confirmed, owner-scoped preferences to the versioned Skill input", () => {
    const result = buildPersonalized([{
      tenantRef: "school:1",
      teacherRef: "user:teacher-1",
      preferenceRef: "teacher-preference:1",
      preferenceKey: "lesson_plan_detail",
      preferenceValue: "concise",
      version: 2,
      contentHash: "c".repeat(64),
      sourceCandidateRef: "memory-candidate:1",
      confirmedAt: "2026-08-04T09:00:00.000Z",
      updatedAt: "2026-08-04T10:00:00.000Z"
    }]);

    expect(result.input.confirmedPreferences).toEqual([
      expect.objectContaining({
        preferenceRef: "teacher-preference:1",
        preferenceKey: "lesson_plan_detail",
        preferenceValue: "concise",
        version: 2
      })
    ]);
    expect(result.personalizationManifest.confirmedPreferences).toEqual([
      expect.objectContaining({
        preferenceRef: "teacher-preference:1",
        preferenceKey: "lesson_plan_detail",
        contentHash: "c".repeat(64)
      })
    ]);
    expect(JSON.stringify(result.personalizationManifest)).not.toContain(
      "concise"
    );
    expect(result.preferenceEvaluation).toMatchObject({
      passed: true,
      ownerScope: { status: "passed", rejectedRefs: [] },
      lifecycle: { inputKind: "confirmed_active_only" }
    });
  });

  it("fails closed when a confirmed preference belongs to another tenant", () => {
    expect(() => buildPersonalized([{
      tenantRef: "school:2",
      teacherRef: "user:teacher-1",
      preferenceRef: "teacher-preference:foreign",
      preferenceKey: "lesson_plan_detail",
      preferenceValue: "concise",
      version: 1,
      contentHash: "d".repeat(64),
      sourceCandidateRef: "memory-candidate:foreign",
      confirmedAt: "2026-08-04T09:00:00.000Z",
      updatedAt: "2026-08-04T09:00:00.000Z"
    }])).toThrow(/outside the active owner scope/u);
  });
});

function buildPersonalized(
  confirmedPreferences: Parameters<
    NonNullable<typeof lessonPreparationSkillV3.buildContext>
  >[0]["confirmedPreferences"]
) {
  const skillInput = lessonPreparationInput();
  const resourceRefs = [
    skillInput.courseRun.courseRunRef,
    skillInput.curriculumUnit.unitRef,
    skillInput.lesson.lessonRef,
    ...skillInput.learningObjectives.map((item) => item.objectiveRef),
    "teaching-plan-revision:approved-1"
  ];
  return lessonPreparationSkillV3.buildContext!({
    contextPlan: {
      purpose: "lesson_preparation",
      actorRef: "user:teacher-1",
      tenantRef: "school:1",
      resourceTypes:
        lessonPreparationSkillV3.manifest.contextPolicy.requiredResourceKinds,
      fieldMask: ["lesson", "evidence"],
      authorizationDecisionRef: "authorization-decision:1",
      authorizedResourceRefs: resourceRefs,
      authorizedEvidenceRefs: ["evidence:observation-1"],
      tokenBudget: 8_000,
      timeRange: null,
      workingSetVersion: 1
    },
    sealedContext: {
      contextManifestRef: "context-manifest:1",
      resourceRefs,
      evidenceRefs: ["evidence:observation-1"],
      missingInformation: []
    },
    skillInput,
    baselineRevisionRef: "teaching-plan-revision:approved-1",
    confirmedPreferences
  });
}

function build(overrides: {
  readonly authorizedEvidenceRefs?: readonly string[];
  readonly evidenceSummary?: string;
  readonly tokenBudget?: number;
} = {}) {
  const skillInput = lessonPreparationInput(overrides.evidenceSummary);
  const resourceRefs = [
    skillInput.courseRun.courseRunRef,
    skillInput.curriculumUnit.unitRef,
    skillInput.lesson.lessonRef,
    ...skillInput.learningObjectives.map((item) => item.objectiveRef),
    "teaching-plan-revision:approved-1"
  ];
  const authorizedEvidenceRefs = overrides.authorizedEvidenceRefs ?? [
    "evidence:observation-1"
  ];
  return lessonPreparationSkillV2.buildContext!({
    contextPlan: {
      purpose: "lesson_preparation",
      actorRef: "user:teacher-1",
      tenantRef: "school:1",
      resourceTypes:
        lessonPreparationSkillV2.manifest.contextPolicy.requiredResourceKinds,
      fieldMask: ["lesson", "evidence"],
      authorizationDecisionRef: "authorization-decision:1",
      authorizedResourceRefs: resourceRefs,
      authorizedEvidenceRefs,
      tokenBudget: overrides.tokenBudget ?? 8_000,
      timeRange: null,
      workingSetVersion: 1
    },
    sealedContext: {
      contextManifestRef: "context-manifest:1",
      resourceRefs,
      evidenceRefs: ["evidence:observation-1"],
      missingInformation: ["跨情境迁移尚未观察"]
    },
    skillInput,
    baselineRevisionRef: "teaching-plan-revision:approved-1"
  });
}

function lessonPreparationInput(
  evidenceSummary = "多数学生可以解释斜率方向"
): LessonPreparationSkillInput {
  return {
    invocationRef: "model-execution:1",
    taskRunRef: "task-run:1",
    agentRunRef: "agent-run:1",
    contextManifestRef: "context-manifest:1",
    timeoutMs: 120_000,
    maxOutputTokens: 1_200,
    responseFormat: "json_schema",
    request: {
      requestText: "根据已选择的课堂观察调整下一课。",
      actorRef: "user:teacher-1",
      purpose: "teacher-copilot.adjust-next-lesson",
      courseRunRef: "course-run:1",
      learningObjectiveRefs: ["objective:1"],
      selectedEvidenceRefs: ["evidence:observation-1"],
      curriculumUnitRef: "unit:1",
      lessonRef: "lesson:1",
      preparationTaskRef: "task:1",
      workingSetVersion: 1,
      createdAt: "2026-08-04T08:00:00.000Z",
      requestVersion: 1
    },
    courseRun: {
      courseRunRef: "course-run:1",
      subject: "数学",
      gradeLevel: "八年级",
      className: "3 班",
      academicTerm: "2026 秋季"
    },
    curriculumUnit: {
      unitRef: "unit:1",
      title: "一次函数",
      description: "从变量关系到图像与斜率。"
    },
    lesson: {
      lessonRef: "lesson:1",
      title: "斜率与图像变化",
      sequence: 3,
      durationMinutes: 45
    },
    learningObjectives: [{
      objectiveRef: "objective:1",
      title: "解释斜率变化",
      description: "用图像变化解释斜率的正负和大小。"
    }],
    currentApprovedTeachingPlan: {
      objective: "解释斜率与图像变化的关系",
      lessonFocus: "斜率正负和大小",
      openingActivity: "比较三条一次函数图像",
      teacherQuestions: ["斜率变化时图像怎样变化？"],
      studentActivity: "观察、比较并说明",
      supportStrategy: "提供方向和陡缓两个观察维度",
      independentCheck: "独立解释新图像",
      followUp: "收集解释中的证据缺口",
      evidenceRefs: ["evidence:observation-1"]
    },
    authorizedEvidence: [{
      evidenceRef: "evidence:observation-1",
      kind: "observation",
      summary: evidenceSummary,
      unknowns: ["跨情境迁移尚未观察"]
    }],
    evidenceGaps: ["跨情境迁移尚未观察"],
    interactionContract: {
      contractRef: "interaction-contract:1",
      profileRef: "profile:1",
      policyVersionRef: "policy:1",
      evidenceRuleVersionRef: "evidence-rule:1",
      supportLimit: 2,
      answerReleaseBoundary: "教师审批后形成正式计划"
    },
    taskWorkingSet: {
      version: 1,
      purpose: "lesson-preparation",
      requestedFieldMask: ["lesson", "evidence"]
    }
  };
}

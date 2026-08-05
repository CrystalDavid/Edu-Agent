import { describe, expect, it } from "vitest";

import {
  buildLessonBriefPreparationContext,
  lessonPreparationSkillV4
} from "../../apps/api/src/agent/skills/lesson-preparation/index.js";
import type {
  LessonPreparationSkillInputV3
} from "../../apps/api/src/agent/skills/lesson-preparation/input-schema.js";

describe("Phase 8A-2 Lesson Brief preparation context", () => {
  it("binds only the teacher-adopted Brief selection to the v4 Skill input", () => {
    const result = build();

    expect(result.input.confirmedLessonBrief).toMatchObject({
      briefRef: "lesson-brief-run:agent-run:brief-1",
      lessonRef: "lesson:1",
      selectedCandidateIds: ["brief-focus:1"]
    });
    expect(result.lessonBriefManifest).toMatchObject({
      schemaVersion: 3,
      builderVersion: "lesson-preparation-context-builder@3",
      briefRef: "lesson-brief-run:agent-run:brief-1",
      selectedCandidateIds: ["brief-focus:1"]
    });
    expect(result.lessonBriefEvaluation).toMatchObject({
      passed: true,
      authorization: { status: "passed", unauthorizedRefs: [] },
      lifecycle: { inputKind: "teacher_adopted_only" },
      consistency: { status: "passed", issues: [] }
    });
    expect(result.lessonBriefManifest.contentHashOfManifest).toHaveLength(64);
    expect(result.input.confirmedLessonBrief.teachingFocus).toHaveLength(1);
    expect(result.input.confirmedLessonBrief.difficultyFocus).toEqual([]);
  });

  it("fails closed when the adopted Brief was not authorized and sealed", () => {
    expect(() => build({ includeBriefAuthorization: false })).toThrow(
      /Lesson Brief context is not authorized and sealed/u
    );
  });

  it("fails closed when Brief Evidence was not explicitly authorized", () => {
    expect(() => build({ includeEvidenceAuthorization: false })).toThrow(
      /evidence:observation-1/u
    );
  });
});

function build(overrides: {
  readonly includeBriefAuthorization?: boolean;
  readonly includeEvidenceAuthorization?: boolean;
} = {}) {
  const skillInput = input();
  const includeBriefAuthorization =
    overrides.includeBriefAuthorization ?? true;
  const includeEvidenceAuthorization =
    overrides.includeEvidenceAuthorization ?? true;
  const resourceRefs = [
    skillInput.courseRun.courseRunRef,
    skillInput.curriculumUnit.unitRef,
    skillInput.lesson.lessonRef,
    ...skillInput.learningObjectives.map((item) => item.objectiveRef),
    "teaching-plan-revision:approved-1",
    ...(includeBriefAuthorization
      ? [skillInput.confirmedLessonBrief.briefRef]
      : [])
  ];
  const evidenceRefs = includeEvidenceAuthorization
    ? ["evidence:observation-1"]
    : [];
  return buildLessonBriefPreparationContext({
    contextPlan: {
      purpose: "lesson_preparation",
      actorRef: "user:teacher-1",
      tenantRef: "school:1",
      resourceTypes:
        lessonPreparationSkillV4.manifest.contextPolicy.requiredResourceKinds,
      fieldMask: ["lesson", "evidence"],
      authorizationDecisionRef: "authorization-decision:1",
      authorizedResourceRefs: resourceRefs,
      authorizedEvidenceRefs: evidenceRefs,
      tokenBudget: 8_000,
      timeRange: null,
      workingSetVersion: 2
    },
    sealedContext: {
      contextManifestRef: "context-manifest:preparation-1",
      resourceRefs,
      evidenceRefs,
      missingInformation: ["尚未接入教材知识源"]
    },
    skillInput,
    baselineRevisionRef: "teaching-plan-revision:approved-1",
    confirmedPreferences: []
  });
}

function input(): LessonPreparationSkillInputV3 {
  const focus = {
    candidateId: "brief-focus:1",
    title: "从斜率方向建立核心判断",
    explanation: "先用图像方向连接斜率正负，再进入大小比较。",
    basisRefs: ["objective:1", "evidence:observation-1"],
    confidence: "high" as const,
    candidateOnly: true as const
  };
  return {
    invocationRef: "model-execution:1",
    taskRunRef: "task-run:1",
    agentRunRef: "agent-run:preparation-1",
    contextManifestRef: "context-manifest:preparation-1",
    timeoutMs: 120_000,
    maxOutputTokens: 1_200,
    responseFormat: "json_schema",
    request: {
      requestText: "基于已确认教学洞察生成可比较的方案。",
      actorRef: "user:teacher-1",
      purpose: "teacher-copilot.adjust-next-lesson",
      courseRunRef: "course-run:1",
      learningObjectiveRefs: ["objective:1"],
      selectedEvidenceRefs: ["evidence:observation-1"],
      curriculumUnitRef: "unit:1",
      lessonRef: "lesson:1",
      preparationTaskRef: "task:1",
      workingSetVersion: 2,
      createdAt: "2026-08-05T08:00:00.000Z",
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
      summary: "部分学生仍混淆斜率方向与截距。",
      unknowns: ["迁移到新图像时的判断尚未观察"]
    }],
    evidenceGaps: ["迁移到新图像时的判断尚未观察"],
    interactionContract: {
      contractRef: "interaction-contract:1",
      profileRef: "profile:1",
      policyVersionRef: "policy:1",
      evidenceRuleVersionRef: "evidence-rule:1",
      supportLimit: 2,
      answerReleaseBoundary: "教师审批后形成正式计划"
    },
    taskWorkingSet: {
      version: 2,
      purpose: "lesson-preparation",
      requestedFieldMask: ["lesson", "evidence"],
      sourceResourceRefs: ["lesson-brief-run:agent-run:brief-1"]
    },
    confirmedPreferences: [],
    confirmedLessonBrief: {
      briefRef: "lesson-brief-run:agent-run:brief-1",
      agentRunRef: "agent-run:brief-1",
      lessonRef: "lesson:1",
      contentHash: "a".repeat(64),
      contextManifestRef: "context-manifest:brief-1",
      contextManifestHash: "b".repeat(64),
      generatedBySkillRef: "lesson-analysis@1",
      selectedCandidateIds: [focus.candidateId],
      teachingFocus: [focus],
      difficultyFocus: [],
      attentionPoints: [],
      classEvidenceSummary: [{
        evidenceRef: "evidence:observation-1",
        evidenceType: "observation",
        summary: "部分学生仍混淆斜率方向与截距。",
        objectiveRefs: ["objective:1"],
        observedAt: "2026-08-04T08:00:00.000Z",
        status: "confirmed",
        sourceRefs: ["lesson:previous"]
      }],
      knownGaps: ["尚未接入教材知识源"],
      sourceVersionVector: {
        "lesson:lesson:1": "1",
        "evidence:evidence:observation-1": "1"
      }
    }
  };
}

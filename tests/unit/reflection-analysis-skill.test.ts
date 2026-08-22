import type { StructuredReflectionOutput } from "@edu-agent/contracts";
import { describe, expect, it } from "vitest";

import {
  reflectionAnalysisSkillV1,
  type ReflectionAnalysisSkillInput
} from "../../apps/api/src/agent/skills/reflection-analysis/index.js";
import {
  assembleLessonReflectionModelRequest,
  lessonReflectionPromptBundleV1,
  lessonReflectionPromptBundleV2
} from "../../apps/api/src/modules/capability-integration/application/lesson-reflection-prompt-bundle.js";

describe("reflection-analysis@1", () => {
  it("is a published, human-controlled Draft skill", () => {
    expect(reflectionAnalysisSkillV1.manifest).toMatchObject({
      ref: "reflection-analysis@1",
      status: "published",
      purpose: "reflection_analysis",
      approvalPolicy: {
        outputKind: "draft",
        humanApprovalRequired: true
      },
      toolPolicy: { mode: "disabled", allowedTools: [] }
    });
  });

  it("separates confirmed-source facts, Agent interpretation and action candidates", () => {
    const context = reflectionAnalysisSkillV1.buildContext(skillInput());
    const output = reflectionAnalysisSkillV1.normalize({
      context: context.input,
      modelOutput: modelOutput(),
      knownGaps: context.manifest.missingInformation
    });
    const validation = reflectionAnalysisSkillV1.validate({
      output,
      sources: context.manifest.sourceRefs
    });
    const evaluation = reflectionAnalysisSkillV1.evaluate({
      context,
      validation,
      operation: {
        latencyMs: 120,
        inputTokens: 800,
        outputTokens: 300,
        retryCount: 0,
        estimatedCost: 0.001
      }
    });

    expect(output.schemaVersion).toBe("reflection-analysis-draft@1");
    expect(output.whatHappened.facts.every((fact) =>
      fact.status === "confirmed_source"
    )).toBe(true);
    expect(output.whatItMeans.interpretations.every((item) =>
      item.confidence === "agent_interpretation"
    )).toBe(true);
    expect(output.whatNext.actionCandidates).toHaveLength(3);
    expect(output.whatNext.actionCandidates.map((item) => item.actionType))
      .toEqual([
        "lesson_preparation",
        "assignment_draft",
        "teacher_todo"
      ]);
    expect(output.whatNext.actionCandidates.every((item) =>
      item.status === "candidate" && item.teacherConfirmationRequired
    )).toBe(true);
    expect(validation.valid).toBe(true);
    expect(evaluation.passed).toBe(true);
  });

  it("excludes unselected Evidence and records the missing adopted Brief", () => {
    const input = skillInput();
    input.lessonBrief = null;
    input.selectedEvidence.push({
      evidenceRef: "evidence:school-b",
      objectiveRef: "objective:foreign",
      summary: "This evidence belongs to another workspace.",
      source: source("evidence:school-b", "1", "foreign_workspace")
    });

    const context = reflectionAnalysisSkillV1.buildContext(input);
    const output = reflectionAnalysisSkillV1.normalize({
      context: context.input,
      modelOutput: modelOutput(),
      knownGaps: context.manifest.missingInformation
    });

    expect(context.input.selectedEvidence.map((item) => item.evidenceRef))
      .toEqual(["evidence:authorized"]);
    expect(context.manifest.sourceRefs).toContainEqual(expect.objectContaining({
      ref: "evidence:school-b",
      included: false,
      provenance: "excluded_by_authorization_or_lesson_scope"
    }));
    expect(context.manifest.missingInformation).toContain(
      "当前课时没有教师已采用的 Lesson Brief"
    );
    expect(JSON.stringify(output)).not.toContain("evidence:school-b");
  });

  it("rejects a Draft that cites a resource outside the sealed context", () => {
    const context = reflectionAnalysisSkillV1.buildContext(skillInput());
    const output = reflectionAnalysisSkillV1.normalize({
      context: context.input,
      modelOutput: modelOutput()
    });
    output.whatHappened.facts[0]!.basisRefs.push("delivery:school-b");

    const validation = reflectionAnalysisSkillV1.validate({
      output,
      sources: context.manifest.sourceRefs
    });

    expect(validation).toMatchObject({
      valid: false,
      category: "scope"
    });
  });

  it("adds the adopted Lesson Brief only to prompt V2 and preserves V1 replay", () => {
    const input = skillInput();
    const common = {
      invocationRef: "model-execution:reflection-test",
      taskRunRef: "task-run:reflection-test",
      agentRunRef: "agent-run:reflection-test",
      contextManifestRef: "context-manifest:reflection-test",
      timeoutMs: 10_000,
      maxOutputTokens: 1_000,
      responseFormat: "json_schema" as const,
      teacherNotes: "保持复盘简洁。",
      courseRun: {
        courseRunRef: input.lesson.courseRunRef,
        subject: "数学",
        gradeLevel: "八年级",
        className: "3班"
      },
      lesson: {
        lessonRef: input.lesson.lessonRef,
        title: input.lesson.title,
        durationMinutes: 45
      },
      learningObjectives: [{
        objectiveRef: "objective:linear-function",
        title: "一次函数",
        description: "解释斜率与图像变化的关系。"
      }],
      approvedTeachingPlan: {
        revisionRef: input.approvedTeachingPlan.revisionRef,
        content: input.approvedTeachingPlan.content
      },
      confirmedDelivery: {
        deliveryRevisionRef: input.confirmedDelivery.deliveryRevisionRef,
        actualStartAt: input.confirmedDelivery.actualStartAt,
        actualEndAt: input.confirmedDelivery.actualEndAt,
        steps: input.confirmedDelivery.steps,
        paceNotes: input.confirmedDelivery.paceNotes,
        unresolvedQuestions: input.confirmedDelivery.unresolvedQuestions,
        followUpNotes: input.confirmedDelivery.followUpNotes
      },
      confirmedObservations: input.confirmedObservations.map((item) => ({
        observationRevisionRef: item.observationRevisionRef,
        scope: item.scope,
        scopeRef: item.scopeRef,
        observationType: item.observationType,
        content: item.content,
        observedAt: item.observedAt
      })),
      authorizedEvidence: input.selectedEvidence.map((item) => ({
        evidenceRef: item.evidenceRef,
        objectiveRef: item.objectiveRef,
        summary: item.summary
      })),
      adoptedLessonBrief: input.lessonBrief
        ? {
            briefRef: input.lessonBrief.briefRef,
            teachingFocus: input.lessonBrief.teachingFocus,
            difficultyFocus: input.lessonBrief.difficultyFocus,
            attentionPoints: input.lessonBrief.attentionPoints,
            knownGaps: input.lessonBrief.knownGaps
          }
        : null,
      currentReflectionDraft: input.currentReflectionDraft
    };
    const requestV1 = assembleLessonReflectionModelRequest({
      ...common,
      promptBundleVersion: 1
    });
    const requestV2 = assembleLessonReflectionModelRequest({
      ...common,
      promptBundleVersion: 2
    });
    const bodyV1 = JSON.parse(requestV1.messages[1]!.content) as Record<string, unknown>;
    const bodyV2 = JSON.parse(requestV2.messages[1]!.content) as Record<string, unknown>;

    expect(requestV1.promptBundle).toEqual(lessonReflectionPromptBundleV1);
    expect(requestV2.promptBundle).toEqual(lessonReflectionPromptBundleV2);
    expect(bodyV1).not.toHaveProperty("adoptedLessonBrief");
    expect(bodyV2).toHaveProperty(
      "adoptedLessonBrief.briefRef",
      "lesson-brief-run:1"
    );
  });
});

function skillInput(): ReflectionAnalysisSkillInput {
  return {
    tenantRef: "tenant:school-a",
    actorRef: "teacher:lin",
    lesson: {
      lessonRef: "lesson:linear-function",
      courseRunRef: "course-run:math-8-3",
      title: "一次函数的应用",
      learningObjectiveRefs: ["objective:linear-function"],
      source: source("lesson:linear-function", "ready_for_use", "education.lesson")
    },
    approvedTeachingPlan: {
      revisionRef: "teaching-plan-revision:approved-3",
      content: {
        objective: "解释斜率与图像变化的关系。",
        lessonFocus: "斜率与截距的辨析。",
        openingActivity: "比较两张熟悉的图像。",
        teacherQuestions: ["什么发生了变化？", "如何验证？"],
        studentActivity: "同伴讨论并说明依据。",
        supportStrategy: "提供对比表。",
        independentCheck: "完成一道图像判断题。",
        followUp: "检查离堂反馈。",
        evidenceRefs: ["evidence:authorized"]
      },
      source: source(
        "teaching-plan-revision:approved-3",
        "3:approved",
        "artifact.teaching-plan.current-approved"
      )
    },
    confirmedDelivery: {
      deliveryRevisionRef: "delivery-revision:confirmed-2",
      actualStartAt: "2026-08-06T00:30:00.000Z",
      actualEndAt: "2026-08-06T01:15:00.000Z",
      steps: [{ stepKey: "practice", disposition: "adjusted" }],
      paceNotes: "练习环节比计划慢。",
      unresolvedQuestions: ["部分学生仍混淆斜率与截距。"],
      followUpNotes: "下一课需要先做一次辨析。",
      source: source(
        "delivery-revision:confirmed-2",
        "2:confirmed",
        "education.lesson-delivery.confirmed-revision"
      )
    },
    confirmedObservations: [{
      observationRevisionRef: "observation-revision:confirmed-1",
      scope: "learning_objective",
      scopeRef: "objective:linear-function",
      observationType: "confusion",
      content: "部分学生仍把截距变化与斜率变化混淆。",
      observedAt: "2026-08-06T01:00:00.000Z",
      source: source(
        "observation-revision:confirmed-1",
        "1:confirmed",
        "education.classroom-observation.confirmed-selection"
      )
    }],
    selectedEvidence: [{
      evidenceRef: "evidence:authorized",
      objectiveRef: "objective:linear-function",
      summary: "斜率方向判断题仍有重复错误。",
      source: source(
        "evidence:authorized",
        "2:confirmed",
        "education.assignment-evidence.authorized-selection"
      )
    }],
    lessonBrief: {
      briefRef: "lesson-brief-run:1",
      status: "adopted",
      teachingFocus: ["连接斜率与图像方向"],
      difficultyFocus: ["区分斜率与截距"],
      attentionPoints: ["先确认基础概念"],
      knownGaps: ["尚未接入教材知识源"],
      source: source(
        "lesson-brief-run:1",
        "1:adopted",
        "runtime.lesson-brief.teacher-adopted"
      )
    },
    currentReflectionDraft: {
      objectiveAttainment: "等待系统整理。",
      plannedVsImplemented: "等待系统整理。",
      effectiveMoves: [],
      ineffectiveMoves: [],
      observationSummary: [],
      evidenceAlignment: [],
      uncertainties: [],
      nextLessonSuggestions: [],
      assignmentSuggestions: [],
      teacherNotes: ""
    },
    teacherAdjustment: "保持复盘简洁。",
    authorizedEvidenceRefs: ["evidence:authorized"],
    excludedEvidenceRefs: [],
    generatedAt: "2026-08-06T08:00:00.000Z"
  };
}

function modelOutput(): StructuredReflectionOutput {
  return {
    schemaVersion: "lesson-reflection@1",
    courseRunRef: "course-run:math-8-3",
    lessonRef: "lesson:linear-function",
    teachingPlanRevisionRef: "teaching-plan-revision:approved-3",
    deliveryRevisionRef: "delivery-revision:confirmed-2",
    observationRevisionRefs: ["observation-revision:confirmed-1"],
    evidenceRefs: ["evidence:authorized"],
    teacherApprovalRequired: true,
    objectiveAttainment: "多数学生完成了基础判断，迁移仍需验证。",
    plannedVsImplemented: "课堂按已批准计划实施，练习环节现场增加了支架。",
    effectiveMoves: ["对比图像帮助学生说明斜率方向。"],
    ineffectiveMoves: ["独立练习的支架仍不足。"],
    observationSummary: ["教师确认部分学生仍混淆斜率与截距。"],
    evidenceAlignment: ["已选 Evidence 与课堂观察方向一致。"],
    uncertainties: ["是否需要延长下一课复习时间仍需教师判断。"],
    nextLessonSuggestions: ["下一课先用一个对比例题复核斜率与截距。"],
    assignmentSuggestions: ["增加一道斜率与截距辨析题。"],
    teacherNotes: "保持复盘简洁。"
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

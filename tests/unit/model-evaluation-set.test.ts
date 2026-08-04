import { describe, expect, it } from "vitest";

import {
  lessonPreparationSkillV1
} from "../../apps/api/src/agent/skills/index.js";
import {
  MockModelProvider
} from "../../apps/api/src/modules/capability-integration/infrastructure/mock-model-provider.js";
import {
  gate26aEvaluationDimensions,
  gate26aModelEvaluationCases
} from "../fixtures/gate2-6a-model-evaluation-cases.js";

describe("Gate 2.6A fixed synthetic evaluation set", () => {
  it("contains at least 30 unique synthetic cases and every required evaluation dimension", () => {
    expect(gate26aModelEvaluationCases.length).toBeGreaterThanOrEqual(
      30
    );
    expect(
      new Set(
        gate26aModelEvaluationCases.map((item) => item.id)
      ).size
    ).toBe(gate26aModelEvaluationCases.length);
    expect(gate26aEvaluationDimensions).toEqual(
      expect.arrayContaining([
        "schema",
        "evidenceTraceability",
        "noFabricatedFacts",
        "learningObjectiveAlignment",
        "actionability",
        "explicitUnknowns",
        "teacherApprovalBoundary",
        "failClosed",
        "latency",
        "tokens",
        "estimatedCost"
      ])
    );
    expect(
      JSON.stringify(gate26aModelEvaluationCases)
    ).not.toMatch(
      /(?:真实学校|真实班级|身份证|手机号|家庭住址)/u
    );
  });

  it("keeps every prompt-side case behind the same Mock ModelProvider and local output validator", async () => {
    const provider = new MockModelProvider();
    const promptSideCases =
      gate26aModelEvaluationCases.filter((item) =>
        [
          "validated_suggestion",
          "explicit_unknowns",
          "scope_guard",
          "approval_guard",
          "policy_rejection",
          "alignment_rejection",
          "evidence_rejection"
        ].includes(item.expectedControl)
      );

    for (const evaluationCase of promptSideCases) {
      const request = evaluationRequest(
        evaluationCase.id,
        evaluationCase.requestText
      );
      const result = await provider.invoke(request);
      expect(result.status, evaluationCase.id).toBe("succeeded");
      if (result.status !== "succeeded") continue;
      const validation = lessonPreparationSkillV1.validateOutput({
        outputText: result.outputText,
        request
      });
      expect(validation, evaluationCase.id).toMatchObject({ valid: true });
      const evaluation = lessonPreparationSkillV1.evaluateOutput({
        validation,
        operation: {
          latencyMs: result.latencyMs,
          usage: {
            inputTokens: result.inputTokens ?? 1,
            outputTokens: result.outputTokens ?? 1,
            totalTokens:
              (result.inputTokens ?? 1) + (result.outputTokens ?? 1)
          },
          attemptCount: 1,
          estimatedCostUsd: 0
        }
      });
      expect(evaluation, evaluationCase.id).toMatchObject({
        passedBlockingChecks: true,
        contract: { status: "passed" },
        policy: { status: "passed" },
        quality: { status: "passed" },
        operation: { status: "recorded" }
      });
      expect(request.messages[0]?.content).toContain(
        "不得虚构 Evidence"
      );
      expect(request.messages[0]?.content).toContain(
        "不得批准 TeachingPlan"
      );
      expect(request.messages[1]?.content).toContain(
        evaluationCase.requestText
      );
    }
  });

  it("fails closed on contaminated JSON, missing fields, unauthorized Evidence and scope drift", async () => {
    const request = evaluationRequest(
      "eval-output-faults",
      "合成输出校验"
    );
    const provider = new MockModelProvider();
    const result = await provider.invoke(request);
    if (result.status !== "succeeded") {
      throw new Error("Expected deterministic Mock success.");
    }
    const valid = JSON.parse(result.outputText) as {
      suggestions: {
        evidenceRefs: string[];
        lessonRef: string;
        learningObjectiveRefs: string[];
        title?: string;
      }[];
    };

    expect(
      lessonPreparationSkillV1.validateOutput({
        outputText: `说明：${result.outputText}`,
        request
      })
    ).toMatchObject({ valid: false, category: "schema" });

    const missing = structuredClone(valid);
    delete missing.suggestions[0]?.title;
    expect(
      lessonPreparationSkillV1.validateOutput({
        outputText: JSON.stringify(missing),
        request
      })
    ).toMatchObject({ valid: false, category: "schema" });

    const wrongEvidence = structuredClone(valid);
    wrongEvidence.suggestions[0]!.evidenceRefs = [
      "evidence:not-authorized"
    ];
    expect(
      lessonPreparationSkillV1.validateOutput({
        outputText: JSON.stringify(wrongEvidence),
        request
      })
    ).toMatchObject({ valid: false, category: "evidence" });

    const wrongLesson = structuredClone(valid);
    wrongLesson.suggestions[0]!.lessonRef =
      "lesson:not-authorized";
    expect(
      lessonPreparationSkillV1.validateOutput({
        outputText: JSON.stringify(wrongLesson),
        request
      })
    ).toMatchObject({ valid: false, category: "scope" });

    const wrongObjective = structuredClone(valid);
    wrongObjective.suggestions[0]!.learningObjectiveRefs = [
      "objective:not-authorized"
    ];
    expect(
      lessonPreparationSkillV1.validateOutput({
        outputText: JSON.stringify(wrongObjective),
        request
      })
    ).toMatchObject({ valid: false, category: "scope" });
  });
});

function evaluationRequest(id: string, requestText: string) {
  return lessonPreparationSkillV1.assembleRequest({
    invocationRef: `model-execution:${id}`,
    taskRunRef: `task-run:${id}`,
    agentRunRef: `agent-run:${id}`,
    contextManifestRef: `context-manifest:${id}`,
    timeoutMs: 2_000,
    maxOutputTokens: 512,
    responseFormat: "json_schema",
    request: {
      requestText,
      actorRef: "user:teacher-001",
      purpose: "teacher-copilot.adjust-next-lesson",
      courseRunRef: "course-run:synthetic",
      learningObjectiveRefs: ["objective:synthetic"],
      selectedEvidenceRefs: ["evidence:synthetic"],
      curriculumUnitRef: "unit:synthetic",
      lessonRef: "lesson:synthetic",
      preparationTaskRef: "task:synthetic",
      workingSetVersion: 1,
      createdAt: "2026-07-31T10:00:00.000Z",
      requestVersion: 1
    },
    courseRun: {
      courseRunRef: "course-run:synthetic",
      subject: "数学",
      gradeLevel: "八年级",
      className: "合成班级",
      academicTerm: "合成学期"
    },
    curriculumUnit: {
      unitRef: "unit:synthetic",
      title: "一次函数",
      description: "合成单元"
    },
    lesson: {
      lessonRef: "lesson:synthetic",
      title: "斜率与图像变化",
      sequence: 3,
      durationMinutes: 45
    },
    learningObjectives: [
      {
        objectiveRef: "objective:synthetic",
        title: "解释斜率",
        description: "解释斜率与图像变化"
      }
    ],
    currentApprovedTeachingPlan: {
      objective: "识别斜率方向",
      lessonFocus: "方向",
      openingActivity: "观察合成直线",
      teacherQuestions: ["图像如何变化？"],
      studentActivity: "比较合成图像",
      supportStrategy: "提供句式支架",
      independentCheck: "独立解释",
      followUp: "收集合成解释",
      evidenceRefs: ["evidence:synthetic"]
    },
    authorizedEvidence: [
      {
        evidenceRef: "evidence:synthetic",
        kind: "observation",
        summary: "合成观察",
        unknowns: ["迁移表现未知"]
      }
    ],
    evidenceGaps: ["迁移表现未知"],
    interactionContract: {
      contractRef: "contract:synthetic",
      profileRef: "profile:synthetic",
      policyVersionRef: "policy:synthetic",
      evidenceRuleVersionRef: "evidence-rule:synthetic",
      supportLimit: 2,
      answerReleaseBoundary: "教师审批后释放"
    },
    taskWorkingSet: {
      version: 1,
      purpose: "lesson-preparation",
      requestedFieldMask: ["lesson", "evidence"]
    }
  });
}

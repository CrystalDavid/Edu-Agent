import {
  PedagogicalStrategySchema,
  StructuredTeachingSuggestionOutputSchema,
  type ModelRequestV2,
  type PedagogicalStrategy,
  type StructuredTeachingSuggestion,
  type StructuredTeachingSuggestionOutput,
  type TeachingPlan
} from "@edu-agent/contracts";

export type ModelOutputValidationResult =
  | {
      valid: true;
      output: StructuredTeachingSuggestionOutput;
      strategies: PedagogicalStrategy[];
      strategyPlans: Record<string, TeachingPlan>;
    }
  | {
      valid: false;
      category: "schema" | "evidence" | "scope" | "policy";
      issues: string[];
    };

export const lessonPreparationValidationPolicyVersion =
  "lesson-preparation-output-validation@1";

const prohibitedFactPatterns = [
  /真实学生/u,
  /学生(?:张三|李四|王五)/u,
  /(?:考了|得了|获得)\s*\d{1,3}\s*分/u,
  /(?:已经|已在课堂中)(?:实施|完成|证明|观察到)/u,
  /(?:直接|自动)(?:批准|发布)教学计划/u,
  /(?:读取|访问|修改)(?:数据库|其他班级|其他租户)/u
];

const answerReleasePatterns = [
  /向学生直接公布(?:答案|标准答案)/u,
  /绕过教师审批/u
];

export function validateModelOutput(input: {
  outputText: string;
  request: ModelRequestV2;
}): ModelOutputValidationResult {
  const parsedJson = parseUncontaminatedJsonObject(input.outputText);
  if (!parsedJson.ok) {
    return {
      valid: false,
      category: "schema",
      issues: [parsedJson.issue]
    };
  }
  const schemaResult =
    StructuredTeachingSuggestionOutputSchema.safeParse(
      parsedJson.value
    );
  if (!schemaResult.success) {
    return {
      valid: false,
      category: "schema",
      issues: schemaResult.error.issues.map(
        (issue) =>
          `${issue.path.join(".") || "output"}: ${issue.message}`
      )
    };
  }

  const authorizedEvidence = new Set(
    input.request.scope.evidenceRefs
  );
  const expectedObjectives = normalized(
    input.request.scope.learningObjectiveRefs
  );
  const evidenceIssues: string[] = [];
  const scopeIssues: string[] = [];
  const policyIssues: string[] = [];

  for (const suggestion of schemaResult.data.suggestions) {
    const referencedEvidence = [
      ...suggestion.evidenceRefs,
      ...suggestion.proposedPlanChanges.evidenceRefs
    ];
    for (const evidenceRef of referencedEvidence) {
      if (!authorizedEvidence.has(evidenceRef)) {
        evidenceIssues.push(
          `${suggestion.strategyId} references unauthorized EvidenceRef ${evidenceRef}.`
        );
      }
    }
    if (
      suggestion.courseRunRef !==
      input.request.scope.courseRunRef
    ) {
      scopeIssues.push(
        `${suggestion.strategyId} is not aligned to the authorized CourseRun.`
      );
    }
    if (
      suggestion.lessonRef !== input.request.scope.lessonRef
    ) {
      scopeIssues.push(
        `${suggestion.strategyId} is not aligned to the authorized Lesson.`
      );
    }
    if (
      JSON.stringify(
        normalized(suggestion.learningObjectiveRefs)
      ) !== JSON.stringify(expectedObjectives)
    ) {
      scopeIssues.push(
        `${suggestion.strategyId} is not aligned to the authorized LearningObjectives.`
      );
    }
    const searchable = JSON.stringify(suggestion);
    for (const pattern of [
      ...prohibitedFactPatterns,
      ...answerReleasePatterns
    ]) {
      if (pattern.test(searchable)) {
        policyIssues.push(
          `${suggestion.strategyId} contains a prohibited factual or approval claim.`
        );
      }
    }
  }

  if (evidenceIssues.length > 0) {
    return {
      valid: false,
      category: "evidence",
      issues: evidenceIssues
    };
  }
  if (scopeIssues.length > 0) {
    return {
      valid: false,
      category: "scope",
      issues: scopeIssues
    };
  }
  if (policyIssues.length > 0) {
    return {
      valid: false,
      category: "policy",
      issues: policyIssues
    };
  }

  const strategies = schemaResult.data.suggestions.map(
    toPedagogicalStrategy
  );
  const strategyPlans = Object.fromEntries(
    schemaResult.data.suggestions.map((suggestion) => [
      suggestion.strategyId,
      suggestion.proposedPlanChanges
    ])
  );
  return {
    valid: true,
    output: schemaResult.data,
    strategies,
    strategyPlans
  };
}

function toPedagogicalStrategy(
  suggestion: StructuredTeachingSuggestion
): PedagogicalStrategy {
  return PedagogicalStrategySchema.parse({
    strategyId: suggestion.strategyId,
    title: suggestion.title,
    summary: suggestion.summary,
    rationale: suggestion.rationale,
    evidenceRefs: suggestion.evidenceRefs,
    knownGaps:
      suggestion.knownGaps.length > 0
        ? suggestion.knownGaps
        : [suggestion.uncertaintyNote],
    applicability: suggestion.applicability,
    unsuitableConditions: suggestion.unsuitableConditions,
    suggestedMoves: suggestion.teachingMoves,
    teachingMoves: suggestion.teachingMoves,
    proposedPlanChanges: suggestion.proposedPlanChanges,
    followUpEvidence: suggestion.followUpEvidence,
    confidenceExplanation: suggestion.uncertaintyNote,
    uncertaintyNote: suggestion.uncertaintyNote
  });
}

function parseUncontaminatedJsonObject(
  text: string
):
  | { ok: true; value: unknown }
  | { ok: false; issue: string } {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return {
      ok: false,
      issue:
        "Provider output must be one JSON object without Markdown or explanatory text."
    };
  }
  try {
    const value: unknown = JSON.parse(trimmed);
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      return {
        ok: false,
        issue: "Provider output root must be a JSON object."
      };
    }
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      issue: "Provider output is not valid JSON."
    };
  }
}

function normalized(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

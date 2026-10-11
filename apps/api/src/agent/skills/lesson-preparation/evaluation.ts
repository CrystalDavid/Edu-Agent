import type { ModelOutputValidationResult } from "./validator.js";

export type SkillEvaluationStatus =
  | "passed"
  | "failed"
  | "needs_review"
  | "not_evaluated";

export interface LessonPreparationOperationMetrics {
  readonly latencyMs?: number | null;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  } | null;
  readonly attemptCount?: number | null;
  readonly estimatedCostUsd?: number | null;
}

export interface LessonPreparationSkillEvaluation {
  readonly policyVersion: "lesson-preparation-evaluation@1";
  readonly passedBlockingChecks: boolean;
  readonly contract: {
    readonly status: SkillEvaluationStatus;
    readonly issues: readonly string[];
  };
  readonly policy: {
    readonly status: SkillEvaluationStatus;
    readonly issues: readonly string[];
  };
  readonly quality: {
    readonly status: SkillEvaluationStatus;
    readonly issues: readonly string[];
  };
  readonly operation: {
    readonly status: "recorded" | "incomplete" | "not_recorded";
    readonly latencyMs: number | null;
    readonly inputTokens: number | null;
    readonly outputTokens: number | null;
    readonly totalTokens: number | null;
    readonly attemptCount: number | null;
    readonly estimatedCostUsd: number | null;
  };
}

export function evaluateLessonPreparationOutput(input: {
  readonly validation: ModelOutputValidationResult;
  readonly operation?: LessonPreparationOperationMetrics;
}): LessonPreparationSkillEvaluation {
  const contractIssues =
    !input.validation.valid && input.validation.category === "schema"
      ? input.validation.issues
      : [];
  const policyIssues =
    !input.validation.valid && input.validation.category !== "schema"
      ? input.validation.issues
      : [];
  const qualityIssues = input.validation.valid
    ? evaluateQuality(input.validation.output)
    : [];

  return Object.freeze({
    policyVersion: "lesson-preparation-evaluation@1" as const,
    passedBlockingChecks: input.validation.valid,
    contract: {
      status: contractIssues.length > 0
        ? "failed" as const
        : input.validation.valid
          ? "passed" as const
          : "not_evaluated" as const,
      issues: Object.freeze([...contractIssues])
    },
    policy: {
      status: policyIssues.length > 0
        ? "failed" as const
        : input.validation.valid
          ? "passed" as const
          : "not_evaluated" as const,
      issues: Object.freeze([...policyIssues])
    },
    quality: {
      status: !input.validation.valid
        ? "not_evaluated" as const
        : qualityIssues.length > 0
          ? "needs_review" as const
          : "passed" as const,
      issues: Object.freeze(qualityIssues)
    },
    operation: evaluateOperation(input.operation)
  });
}

function evaluateQuality(
  output: Extract<ModelOutputValidationResult, { valid: true }>["output"]
): string[] {
  const issues: string[] = [];
  for (const suggestion of output.suggestions) {
    if (suggestion.knownGaps.length === 0) {
      issues.push(
        `${suggestion.strategyId} does not list an explicit known gap.`
      );
    }
    if (suggestion.teachingMoves.length === 0) {
      issues.push(
        `${suggestion.strategyId} does not contain an actionable teaching move.`
      );
    }
    if (suggestion.followUpEvidence.length === 0) {
      issues.push(
        `${suggestion.strategyId} does not define follow-up evidence.`
      );
    }
    if (!suggestion.uncertaintyNote.trim()) {
      issues.push(
        `${suggestion.strategyId} does not explain uncertainty.`
      );
    }
  }
  return issues;
}

function evaluateOperation(
  operation: LessonPreparationOperationMetrics | undefined
): LessonPreparationSkillEvaluation["operation"] {
  if (!operation) {
    return Object.freeze({
      status: "not_recorded" as const,
      latencyMs: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      attemptCount: null,
      estimatedCostUsd: null
    });
  }
  const latencyMs = nonNegativeOrNull(operation.latencyMs);
  const inputTokens = nonNegativeOrNull(operation.usage?.inputTokens);
  const outputTokens = nonNegativeOrNull(operation.usage?.outputTokens);
  const totalTokens = nonNegativeOrNull(operation.usage?.totalTokens);
  const attemptCount = positiveOrNull(operation.attemptCount);
  return Object.freeze({
    status:
      latencyMs !== null &&
      inputTokens !== null &&
      outputTokens !== null &&
      totalTokens !== null &&
      attemptCount !== null
        ? "recorded" as const
        : "incomplete" as const,
    latencyMs,
    inputTokens,
    outputTokens,
    totalTokens,
    attemptCount,
    estimatedCostUsd:
      typeof operation.estimatedCostUsd === "number" &&
      operation.estimatedCostUsd >= 0
        ? operation.estimatedCostUsd
        : null
  });
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function nonNegativeOrNull(
  value: number | null | undefined
): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

import type { ReflectionAnalysisContextBuildResult } from "./context-builder.js";
import type { ReflectionAnalysisValidationResult } from "./validator.js";

export interface ReflectionAnalysisOperationMetrics {
  readonly latencyMs: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly retryCount: number;
  readonly estimatedCost: number;
}

export interface ReflectionAnalysisEvaluation {
  readonly contract: { readonly passed: boolean };
  readonly policy: {
    readonly passed: boolean;
    readonly issues: readonly string[];
  };
  readonly quality: {
    readonly passed: boolean;
    readonly factsCount: number;
    readonly interpretationsCount: number;
    readonly actionCandidateCount: number;
    readonly gapsExplicit: boolean;
  };
  readonly operation: ReflectionAnalysisOperationMetrics;
  readonly context: ReflectionAnalysisContextBuildResult["evaluation"];
  readonly passed: boolean;
}

export function evaluateReflectionAnalysis(input: {
  context: ReflectionAnalysisContextBuildResult;
  validation: ReflectionAnalysisValidationResult;
  operation: ReflectionAnalysisOperationMetrics;
}): ReflectionAnalysisEvaluation {
  const output = input.validation.valid ? input.validation.output : null;
  const quality = {
    passed: Boolean(
      output &&
      output.whatHappened.facts.length > 0 &&
      output.whatItMeans.interpretations.length > 0 &&
      output.whatNext.actionCandidates.length <= 3 &&
      output.knownGaps.length > 0
    ),
    factsCount: output?.whatHappened.facts.length ?? 0,
    interpretationsCount: output?.whatItMeans.interpretations.length ?? 0,
    actionCandidateCount: output?.whatNext.actionCandidates.length ?? 0,
    gapsExplicit: Boolean(output?.knownGaps.length)
  };
  return Object.freeze({
    contract: { passed: input.validation.valid },
    policy: {
      passed: input.validation.valid && input.context.evaluation.passed,
      issues: input.validation.valid ? [] : input.validation.issues
    },
    quality,
    operation: input.operation,
    context: input.context.evaluation,
    passed:
      input.validation.valid &&
      input.context.evaluation.passed &&
      quality.passed
  });
}

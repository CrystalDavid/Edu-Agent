import type { LessonAnalysisContextBuildResult } from "./context-builder.js";
import type { LessonAnalysisValidationResult } from "./validator.js";

export interface LessonAnalysisEvaluation {
  readonly contract: { readonly passed: boolean };
  readonly policy: { readonly passed: boolean; readonly issues: readonly string[] };
  readonly quality: {
    readonly passed: boolean;
    readonly objectiveCoverage: number;
    readonly evidenceCoverage: number;
    readonly gapsExplicit: boolean;
  };
  readonly operation: {
    readonly deterministic: true;
    readonly estimatedInputTokens: number;
    readonly modelTokens: 0;
  };
  readonly context: LessonAnalysisContextBuildResult["evaluation"];
  readonly passed: boolean;
}

export function evaluateLessonAnalysis(input: {
  context: LessonAnalysisContextBuildResult;
  validation: LessonAnalysisValidationResult;
}): LessonAnalysisEvaluation {
  const output = input.validation.valid ? input.validation.output : null;
  const quality = {
    passed: Boolean(
      output &&
      output.objectiveSummaries.length === input.context.input.objectives.length &&
      output.knownGaps.length >= 3
    ),
    objectiveCoverage: output?.objectiveSummaries.length ?? 0,
    evidenceCoverage: output?.classEvidenceSummary.length ?? 0,
    gapsExplicit: Boolean(output && output.knownGaps.length >= 3)
  };
  return Object.freeze({
    contract: { passed: input.validation.valid },
    policy: {
      passed: input.validation.valid && input.context.evaluation.passed,
      issues: input.validation.valid ? [] : input.validation.issues
    },
    quality,
    operation: {
      deterministic: true as const,
      estimatedInputTokens: input.context.evaluation.estimatedTokens,
      modelTokens: 0 as const
    },
    context: input.context.evaluation,
    passed: input.validation.valid && input.context.evaluation.passed && quality.passed
  });
}

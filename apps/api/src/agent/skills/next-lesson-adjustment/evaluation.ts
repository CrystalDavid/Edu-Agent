import type { NextLessonAdjustmentContextBuildResult } from "./context-builder.js";
import type { NextLessonAdjustmentValidationResult } from "./validator.js";

export interface NextLessonAdjustmentEvaluation {
  readonly contract: { readonly passed: boolean };
  readonly policy: { readonly passed: boolean; readonly issues: readonly string[] };
  readonly quality: {
    readonly passed: boolean;
    readonly candidateCount: number;
    readonly sourceBound: boolean;
    readonly teacherConfirmationExplicit: boolean;
  };
  readonly operation: {
    readonly deterministic: true;
    readonly estimatedInputTokens: number;
    readonly modelTokens: 0;
    readonly retryCount: 0;
    readonly estimatedCost: 0;
  };
  readonly context: NextLessonAdjustmentContextBuildResult["evaluation"];
  readonly passed: boolean;
}

export function evaluateNextLessonAdjustment(input: {
  context: NextLessonAdjustmentContextBuildResult;
  validation: NextLessonAdjustmentValidationResult;
}): NextLessonAdjustmentEvaluation {
  const output = input.validation.valid ? input.validation.output : null;
  const quality = {
    passed: Boolean(
      output && output.candidates.length > 0 && output.candidates.length <= 3 &&
      output.candidates.every((item) =>
        item.basisRefs.length > 0 && item.teacherConfirmationRequired
      )
    ),
    candidateCount: output?.candidates.length ?? 0,
    sourceBound: Boolean(output?.candidates.every((item) => item.basisRefs.length > 0)),
    teacherConfirmationExplicit: Boolean(
      output?.candidates.every((item) => item.teacherConfirmationRequired)
    )
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
      modelTokens: 0 as const,
      retryCount: 0 as const,
      estimatedCost: 0 as const
    },
    context: input.context.evaluation,
    passed: input.validation.valid && input.context.evaluation.passed && quality.passed
  });
}

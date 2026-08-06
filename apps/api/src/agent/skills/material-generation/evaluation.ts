import type { MaterialGenerationContextBuildResult } from "./context-builder.js";
import type { MaterialGenerationValidationResult } from "./validator.js";

export interface MaterialGenerationEvaluation {
  readonly contract: { readonly passed: boolean };
  readonly policy: {
    readonly passed: boolean;
    readonly issues: readonly string[];
  };
  readonly quality: {
    readonly passed: boolean;
    readonly requestedKinds: number;
    readonly generatedKinds: number;
    readonly gapsExplicit: boolean;
  };
  readonly operation: {
    readonly deterministic: true;
    readonly estimatedInputTokens: number;
    readonly modelTokens: 0;
    readonly retryCount: 0;
    readonly estimatedCost: 0;
  };
  readonly context: MaterialGenerationContextBuildResult["evaluation"];
  readonly passed: boolean;
}

export function evaluateMaterialGeneration(input: {
  context: MaterialGenerationContextBuildResult;
  validation: MaterialGenerationValidationResult;
}): MaterialGenerationEvaluation {
  const output = input.validation.valid ? input.validation.output : null;
  const generatedKinds = output?.drafts.length ?? 0;
  const gapsExplicit = Boolean(
    output?.drafts.every((draft) => draft.knownGaps.length > 0)
  );
  const quality = {
    passed:
      generatedKinds === input.context.input.requestedKinds.length &&
      gapsExplicit,
    requestedKinds: input.context.input.requestedKinds.length,
    generatedKinds,
    gapsExplicit
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
    passed:
      input.validation.valid &&
      input.context.evaluation.passed &&
      quality.passed
  });
}

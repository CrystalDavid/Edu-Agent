import type { ClassroomReflectionContextBuildResult } from "./context-builder.js";
import type { ClassroomReflectionValidationResult } from "./validator.js";

export interface ClassroomReflectionEvaluation {
  readonly contract: { readonly passed: boolean };
  readonly policy: {
    readonly passed: boolean;
    readonly issues: readonly string[];
  };
  readonly quality: {
    readonly passed: boolean;
    readonly stepCount: number;
    readonly candidateCount: number;
    readonly gapsExplicit: boolean;
    readonly teacherConfirmationExplicit: boolean;
  };
  readonly operation: {
    readonly deterministic: true;
    readonly estimatedInputTokens: number;
    readonly modelTokens: 0;
    readonly retryCount: 0;
    readonly estimatedCost: 0;
  };
  readonly context: ClassroomReflectionContextBuildResult["evaluation"];
  readonly passed: boolean;
}

export function evaluateClassroomReflection(input: {
  context: ClassroomReflectionContextBuildResult;
  validation: ClassroomReflectionValidationResult;
}): ClassroomReflectionEvaluation {
  const output = input.validation.valid ? input.validation.output : null;
  const quality = {
    passed: Boolean(
      output &&
      output.deliveryDraft.steps.length === 5 &&
      output.knownGaps.length > 0 &&
      output.observationCandidates.every(
        (candidate) => candidate.teacherConfirmationRequired
      )
    ),
    stepCount: output?.deliveryDraft.steps.length ?? 0,
    candidateCount: output?.observationCandidates.length ?? 0,
    gapsExplicit: Boolean(output?.knownGaps.length),
    teacherConfirmationExplicit: Boolean(
      output?.observationCandidates.every(
        (candidate) => candidate.teacherConfirmationRequired
      )
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
    passed:
      input.validation.valid &&
      input.context.evaluation.passed &&
      quality.passed
  });
}

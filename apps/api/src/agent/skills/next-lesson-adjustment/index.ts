import type { SkillVersionBase } from "../types.js";
import {
  buildNextLessonAdjustmentContext,
  type NextLessonAdjustmentContextBuildResult
} from "./context-builder.js";
import {
  evaluateNextLessonAdjustment,
  type NextLessonAdjustmentEvaluation
} from "./evaluation.js";
import { generateNextLessonActions } from "./generator.js";
import {
  NextLessonAdjustmentSkillInputSchema,
  type NextLessonAdjustmentSkillInput
} from "./input-schema.js";
import { nextLessonAdjustmentSkillManifest } from "./manifest.js";
import {
  NextLessonAdjustmentSkillOutputSchema,
  type NextLessonAdjustmentSkillOutput
} from "./output-schema.js";
import { nextLessonAdjustmentPromptBundle } from "./prompt.js";
import {
  validateNextLessonAdjustmentOutput,
  type NextLessonAdjustmentValidationResult
} from "./validator.js";

export interface NextLessonAdjustmentSkillVersion extends SkillVersionBase {
  readonly inputSchema: typeof NextLessonAdjustmentSkillInputSchema;
  readonly outputSchema: typeof NextLessonAdjustmentSkillOutputSchema;
  readonly promptBundle: typeof nextLessonAdjustmentPromptBundle;
  buildContext(value: unknown): NextLessonAdjustmentContextBuildResult;
  generate(input: NextLessonAdjustmentSkillInput): NextLessonAdjustmentSkillOutput;
  validate(input: {
    output: unknown;
    sources: NextLessonAdjustmentContextBuildResult["manifest"]["sourceRefs"];
    targetLessonRef: string;
  }): NextLessonAdjustmentValidationResult;
  evaluate(input: {
    context: NextLessonAdjustmentContextBuildResult;
    validation: NextLessonAdjustmentValidationResult;
  }): NextLessonAdjustmentEvaluation;
}

export const nextLessonAdjustmentSkillV1: NextLessonAdjustmentSkillVersion =
  Object.freeze({
    manifest: nextLessonAdjustmentSkillManifest,
    inputSchema: NextLessonAdjustmentSkillInputSchema,
    outputSchema: NextLessonAdjustmentSkillOutputSchema,
    promptBundle: nextLessonAdjustmentPromptBundle,
    buildContext: buildNextLessonAdjustmentContext,
    generate: generateNextLessonActions,
    validate: validateNextLessonAdjustmentOutput,
    evaluate: evaluateNextLessonAdjustment
  });

export type {
  NextLessonAdjustmentContextBuildResult,
  NextLessonAdjustmentEvaluation,
  NextLessonAdjustmentSkillInput,
  NextLessonAdjustmentSkillOutput,
  NextLessonAdjustmentValidationResult
};

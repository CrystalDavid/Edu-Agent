import type { SkillVersionBase } from "../types.js";
import {
  buildMaterialGenerationContext,
  type MaterialGenerationContextBuildResult
} from "./context-builder.js";
import {
  evaluateMaterialGeneration,
  type MaterialGenerationEvaluation
} from "./evaluation.js";
import { generateMaterialDrafts } from "./generator.js";
import {
  MaterialGenerationSkillInputSchema,
  type MaterialGenerationSkillInput
} from "./input-schema.js";
import { materialGenerationSkillManifest } from "./manifest.js";
import {
  MaterialGenerationSkillOutputSchema,
  type MaterialGenerationSkillOutput
} from "./output-schema.js";
import { materialGenerationPromptBundle } from "./prompt.js";
import {
  validateMaterialGenerationOutput,
  type MaterialGenerationValidationResult
} from "./validator.js";

export interface MaterialGenerationSkillVersion extends SkillVersionBase {
  readonly inputSchema: typeof MaterialGenerationSkillInputSchema;
  readonly outputSchema: typeof MaterialGenerationSkillOutputSchema;
  readonly promptBundle: typeof materialGenerationPromptBundle;
  buildContext(value: unknown): MaterialGenerationContextBuildResult;
  generate(input: MaterialGenerationSkillInput): MaterialGenerationSkillOutput;
  validate(input: {
    output: unknown;
    requestedKinds: MaterialGenerationSkillInput["requestedKinds"];
    sources: MaterialGenerationContextBuildResult["manifest"]["sourceRefs"];
  }): MaterialGenerationValidationResult;
  evaluate(input: {
    context: MaterialGenerationContextBuildResult;
    validation: MaterialGenerationValidationResult;
  }): MaterialGenerationEvaluation;
}

export const materialGenerationSkillV1: MaterialGenerationSkillVersion =
  Object.freeze({
    manifest: materialGenerationSkillManifest,
    inputSchema: MaterialGenerationSkillInputSchema,
    outputSchema: MaterialGenerationSkillOutputSchema,
    promptBundle: materialGenerationPromptBundle,
    buildContext: buildMaterialGenerationContext,
    generate: generateMaterialDrafts,
    validate: validateMaterialGenerationOutput,
    evaluate: evaluateMaterialGeneration
  });

export type {
  MaterialGenerationContextBuildResult,
  MaterialGenerationEvaluation,
  MaterialGenerationSkillInput,
  MaterialGenerationSkillOutput,
  MaterialGenerationValidationResult
};

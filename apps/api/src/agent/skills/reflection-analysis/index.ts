import type { StructuredReflectionOutput } from "@edu-agent/contracts";

import type { SkillVersionBase } from "../types.js";
import {
  buildReflectionAnalysisContext,
  type ReflectionAnalysisContextBuildResult
} from "./context-builder.js";
import {
  evaluateReflectionAnalysis,
  type ReflectionAnalysisEvaluation,
  type ReflectionAnalysisOperationMetrics
} from "./evaluation.js";
import { normalizeReflectionAnalysisDraft } from "./generator.js";
import {
  ReflectionAnalysisSkillInputSchema,
  type ReflectionAnalysisSkillInput
} from "./input-schema.js";
import { reflectionAnalysisSkillManifest } from "./manifest.js";
import {
  ReflectionAnalysisSkillOutputSchema,
  type ReflectionAnalysisSkillOutput
} from "./output-schema.js";
import { reflectionAnalysisPromptBundle } from "./prompt.js";
import {
  validateReflectionAnalysisOutput,
  type ReflectionAnalysisValidationResult
} from "./validator.js";

export interface ReflectionAnalysisSkillVersion extends SkillVersionBase {
  readonly inputSchema: typeof ReflectionAnalysisSkillInputSchema;
  readonly outputSchema: typeof ReflectionAnalysisSkillOutputSchema;
  readonly promptBundle: typeof reflectionAnalysisPromptBundle;
  buildContext(value: unknown): ReflectionAnalysisContextBuildResult;
  normalize(input: {
    context: ReflectionAnalysisSkillInput;
    modelOutput: StructuredReflectionOutput;
    knownGaps?: readonly string[];
  }): ReflectionAnalysisSkillOutput;
  validate(input: {
    output: unknown;
    sources: ReflectionAnalysisContextBuildResult["manifest"]["sourceRefs"];
  }): ReflectionAnalysisValidationResult;
  evaluate(input: {
    context: ReflectionAnalysisContextBuildResult;
    validation: ReflectionAnalysisValidationResult;
    operation: ReflectionAnalysisOperationMetrics;
  }): ReflectionAnalysisEvaluation;
}

export const reflectionAnalysisSkillV1: ReflectionAnalysisSkillVersion =
  Object.freeze({
    manifest: reflectionAnalysisSkillManifest,
    inputSchema: ReflectionAnalysisSkillInputSchema,
    outputSchema: ReflectionAnalysisSkillOutputSchema,
    promptBundle: reflectionAnalysisPromptBundle,
    buildContext: buildReflectionAnalysisContext,
    normalize: normalizeReflectionAnalysisDraft,
    validate: validateReflectionAnalysisOutput,
    evaluate: evaluateReflectionAnalysis
  });

export type {
  ReflectionAnalysisContextBuildResult,
  ReflectionAnalysisEvaluation,
  ReflectionAnalysisOperationMetrics,
  ReflectionAnalysisSkillInput,
  ReflectionAnalysisSkillOutput,
  ReflectionAnalysisValidationResult
};

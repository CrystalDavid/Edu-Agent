import type { SkillVersionBase } from "../types.js";
import {
  buildLessonAnalysisContext,
  type LessonAnalysisContextBuildResult
} from "./context-builder.js";
import { evaluateLessonAnalysis, type LessonAnalysisEvaluation } from "./evaluation.js";
import { generateLessonBriefCandidate } from "./generator.js";
import {
  LessonAnalysisSkillInputSchema,
  type LessonAnalysisSkillInput
} from "./input-schema.js";
import { lessonAnalysisSkillManifest } from "./manifest.js";
import {
  LessonAnalysisSkillOutputSchema,
  type LessonAnalysisSkillOutput
} from "./output-schema.js";
import { lessonAnalysisPromptBundle } from "./prompt.js";
import {
  validateLessonAnalysisOutput,
  type LessonAnalysisValidationResult
} from "./validator.js";

export interface LessonAnalysisSkillVersion extends SkillVersionBase {
  readonly inputSchema: typeof LessonAnalysisSkillInputSchema;
  readonly outputSchema: typeof LessonAnalysisSkillOutputSchema;
  readonly promptBundle: typeof lessonAnalysisPromptBundle;
  buildContext(value: unknown): LessonAnalysisContextBuildResult;
  generate(input: LessonAnalysisSkillInput): LessonAnalysisSkillOutput;
  validate(input: {
    output: unknown;
    sources: LessonAnalysisContextBuildResult["manifest"]["sourceRefs"];
  }): LessonAnalysisValidationResult;
  evaluate(input: {
    context: LessonAnalysisContextBuildResult;
    validation: LessonAnalysisValidationResult;
  }): LessonAnalysisEvaluation;
}

export const lessonAnalysisSkillV1: LessonAnalysisSkillVersion = Object.freeze({
  manifest: lessonAnalysisSkillManifest,
  inputSchema: LessonAnalysisSkillInputSchema,
  outputSchema: LessonAnalysisSkillOutputSchema,
  promptBundle: lessonAnalysisPromptBundle,
  buildContext: buildLessonAnalysisContext,
  generate: generateLessonBriefCandidate,
  validate: validateLessonAnalysisOutput,
  evaluate: evaluateLessonAnalysis
});

export type {
  LessonAnalysisContextBuildResult,
  LessonAnalysisEvaluation,
  LessonAnalysisSkillInput,
  LessonAnalysisSkillOutput,
  LessonAnalysisValidationResult
};

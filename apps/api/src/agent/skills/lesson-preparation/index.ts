import type {
  ModelRequestV2,
  PromptBundleDescriptor
} from "@edu-agent/contracts";

import type { SkillVersionBase } from "../types.js";
import {
  evaluateLessonPreparationOutput,
  type LessonPreparationOperationMetrics,
  type LessonPreparationSkillEvaluation
} from "./evaluation.js";
import {
  LessonPreparationSkillInputSchema,
  type LessonPreparationSkillInput
} from "./input-schema.js";
import { lessonPreparationSkillManifest } from "./manifest.js";
import {
  LessonPreparationSkillOutputSchema,
  type LessonPreparationSkillOutput
} from "./output-schema.js";
import {
  assembleLessonPreparationModelRequest,
  assembleRepairModelRequest,
  lessonPreparationPromptBundle
} from "./prompt.js";
import {
  validateModelOutput,
  type ModelOutputValidationResult
} from "./validator.js";

export interface LessonPreparationSkillVersion extends SkillVersionBase {
  readonly inputSchema: typeof LessonPreparationSkillInputSchema;
  readonly outputSchema: typeof LessonPreparationSkillOutputSchema;
  readonly promptBundle: PromptBundleDescriptor;
  assembleRequest(input: LessonPreparationSkillInput): ModelRequestV2;
  assembleRepairRequest(input: {
    readonly original: ModelRequestV2;
    readonly invalidOutput: string;
    readonly validationIssues: readonly string[];
  }): ModelRequestV2;
  validateOutput(input: {
    readonly outputText: string;
    readonly request: ModelRequestV2;
  }): ModelOutputValidationResult;
  evaluateOutput(input: {
    readonly validation: ModelOutputValidationResult;
    readonly operation?: LessonPreparationOperationMetrics;
  }): LessonPreparationSkillEvaluation;
}

export const lessonPreparationSkillV1: LessonPreparationSkillVersion =
  Object.freeze({
    manifest: lessonPreparationSkillManifest,
    inputSchema: LessonPreparationSkillInputSchema,
    outputSchema: LessonPreparationSkillOutputSchema,
    promptBundle: lessonPreparationPromptBundle,
    assembleRequest: assembleLessonPreparationModelRequest,
    assembleRepairRequest: assembleRepairModelRequest,
    validateOutput: validateModelOutput,
    evaluateOutput: evaluateLessonPreparationOutput
  });

export type {
  LessonPreparationOperationMetrics,
  LessonPreparationSkillEvaluation,
  LessonPreparationSkillInput,
  LessonPreparationSkillOutput,
  ModelOutputValidationResult
};

import type {
  ModelRequestV2,
  PromptBundleDescriptor
} from "@edu-agent/contracts";

import type { SkillVersionBase } from "../types.js";
import type {
  ConfirmedTeacherPreferenceSnapshot
} from "../../../modules/personalization-memory-analytics/application/personalization-context-provider.js";
import {
  buildLessonPreparationContext,
  type LessonPreparationContextBuildResult,
  type LessonPreparationContextPlan,
  type LessonPreparationSealedContext
} from "./context-builder.js";
import {
  evaluateLessonPreparationOutput,
  type LessonPreparationOperationMetrics,
  type LessonPreparationSkillEvaluation
} from "./evaluation.js";
import {
  LessonPreparationSkillInputSchema,
  LessonPreparationSkillInputSchemaV2,
  LessonPreparationSkillInputSchemaV3,
  LessonPreparationSkillInputSchemaV4,
  LessonPreparationSkillInputSchemaV5,
  LessonPreparationSkillInputSchemaV6,
  type LessonPreparationSkillInput
} from "./input-schema.js";
import {
  lessonPreparationSkillManifest,
  lessonPreparationSkillManifestV2,
  lessonPreparationSkillManifestV3,
  lessonPreparationSkillManifestV4,
  lessonPreparationSkillManifestV5,
  lessonPreparationSkillManifestV6,
  lessonPreparationSkillManifestV7
} from "./manifest.js";
import {
  LessonPreparationSkillOutputSchema,
  type LessonPreparationSkillOutput
} from "./output-schema.js";
import {
  assembleLessonPreparationModelRequest,
  assembleConversationLessonPreparationModelRequest,
  assembleConversationRepairModelRequest,
  assembleTemporaryOverrideLessonPreparationModelRequest,
  assembleTemporaryOverrideRepairModelRequest,
  assembleLessonBriefPreparationModelRequest,
  assembleLessonBriefRepairModelRequest,
  assembleRepairModelRequest,
  assemblePersonalizedLessonPreparationModelRequest,
  assemblePersonalizedRepairModelRequest,
  lessonPreparationPromptBundle,
  conversationLessonPreparationPromptBundle,
  lessonBriefPreparationPromptBundle,
  personalizedLessonPreparationPromptBundle,
  temporaryOverrideLessonPreparationPromptBundle
} from "./prompt.js";
import {
  buildPersonalizedLessonPreparationContext,
  type PersonalizedLessonPreparationContextBuildResult
} from "./personalized-context-builder.js";
import {
  buildLessonBriefPreparationContext,
  type LessonBriefPreparationContextBuildResult
} from "./lesson-brief-context-builder.js";
import {
  buildConversationPreparationContext,
  buildTemporaryOverridePreparationContext,
  type ConversationPreparationContextBuildResult,
  type TemporaryOverridePreparationContextBuildResult
} from "./conversation-context-builder.js";
import {
  validateModelOutput,
  type ModelOutputValidationResult
} from "./validator.js";

export interface LessonPreparationSkillVersion extends SkillVersionBase {
  readonly inputSchema: {
    parse(value: unknown): LessonPreparationSkillInput;
    safeParse(value: unknown):
      | { readonly success: true; readonly data: LessonPreparationSkillInput }
      | { readonly success: false; readonly error: unknown };
  };
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
  buildContext?(input: LessonPreparationContextBuildInput):
    | LessonPreparationContextBuildResult
    | PersonalizedLessonPreparationContextBuildResult
    | LessonBriefPreparationContextBuildResult
    | ConversationPreparationContextBuildResult
    | TemporaryOverridePreparationContextBuildResult;
}

export interface LessonPreparationContextBuildInput {
    readonly contextPlan: LessonPreparationContextPlan;
    readonly sealedContext: LessonPreparationSealedContext;
    readonly skillInput: LessonPreparationSkillInput;
    readonly baselineRevisionRef: string;
    readonly confirmedPreferences?: readonly ConfirmedTeacherPreferenceSnapshot[];
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

export const lessonPreparationSkillV2: LessonPreparationSkillVersion =
  Object.freeze({
    manifest: lessonPreparationSkillManifestV2,
    inputSchema: LessonPreparationSkillInputSchema,
    outputSchema: LessonPreparationSkillOutputSchema,
    promptBundle: lessonPreparationPromptBundle,
    buildContext: buildLessonPreparationContext,
    assembleRequest: assembleLessonPreparationModelRequest,
    assembleRepairRequest: assembleRepairModelRequest,
    validateOutput: validateModelOutput,
    evaluateOutput: evaluateLessonPreparationOutput
  });

export const lessonPreparationSkillV3: LessonPreparationSkillVersion =
  Object.freeze({
    manifest: lessonPreparationSkillManifestV3,
    inputSchema: LessonPreparationSkillInputSchemaV2,
    outputSchema: LessonPreparationSkillOutputSchema,
    promptBundle: personalizedLessonPreparationPromptBundle,
    buildContext: (input: LessonPreparationContextBuildInput) => buildPersonalizedLessonPreparationContext({
      ...input,
      confirmedPreferences: input.confirmedPreferences ?? []
    }),
    assembleRequest: (input: LessonPreparationSkillInput) =>
      assemblePersonalizedLessonPreparationModelRequest(
        LessonPreparationSkillInputSchemaV2.parse(input)
      ),
    assembleRepairRequest: assemblePersonalizedRepairModelRequest,
    validateOutput: validateModelOutput,
    evaluateOutput: evaluateLessonPreparationOutput
  });

export const lessonPreparationSkillV4: LessonPreparationSkillVersion =
  Object.freeze({
    manifest: lessonPreparationSkillManifestV4,
    inputSchema: LessonPreparationSkillInputSchemaV3,
    outputSchema: LessonPreparationSkillOutputSchema,
    promptBundle: lessonBriefPreparationPromptBundle,
    buildContext: (input: LessonPreparationContextBuildInput) =>
      buildLessonBriefPreparationContext({
        ...input,
        confirmedPreferences: input.confirmedPreferences ?? []
      }),
    assembleRequest: (input: LessonPreparationSkillInput) =>
      assembleLessonBriefPreparationModelRequest(
        LessonPreparationSkillInputSchemaV3.parse(input)
      ),
    assembleRepairRequest: assembleLessonBriefRepairModelRequest,
    validateOutput: validateModelOutput,
    evaluateOutput: evaluateLessonPreparationOutput
  });

export const lessonPreparationSkillV5: LessonPreparationSkillVersion =
  Object.freeze({
    manifest: lessonPreparationSkillManifestV5,
    inputSchema: LessonPreparationSkillInputSchemaV4,
    outputSchema: LessonPreparationSkillOutputSchema,
    promptBundle: conversationLessonPreparationPromptBundle,
    buildContext: (input: LessonPreparationContextBuildInput) =>
      buildConversationPreparationContext({
        ...input,
        confirmedPreferences: input.confirmedPreferences ?? []
      }),
    assembleRequest: (input: LessonPreparationSkillInput) =>
      assembleConversationLessonPreparationModelRequest(
        LessonPreparationSkillInputSchemaV4.parse(input)
      ),
    assembleRepairRequest: assembleConversationRepairModelRequest,
    validateOutput: validateModelOutput,
    evaluateOutput: evaluateLessonPreparationOutput
  });

export const lessonPreparationSkillV6: LessonPreparationSkillVersion =
  Object.freeze({
    manifest: lessonPreparationSkillManifestV6,
    inputSchema: LessonPreparationSkillInputSchemaV5,
    outputSchema: LessonPreparationSkillOutputSchema,
    promptBundle: conversationLessonPreparationPromptBundle,
    buildContext: (input: LessonPreparationContextBuildInput) =>
      buildConversationPreparationContext({
        ...input,
        confirmedPreferences: input.confirmedPreferences ?? []
      }),
    assembleRequest: (input: LessonPreparationSkillInput) =>
      assembleConversationLessonPreparationModelRequest(
        LessonPreparationSkillInputSchemaV5.parse(input)
      ),
    assembleRepairRequest: assembleConversationRepairModelRequest,
    validateOutput: validateModelOutput,
    evaluateOutput: evaluateLessonPreparationOutput
  });

export const lessonPreparationSkillV7: LessonPreparationSkillVersion =
  Object.freeze({
    manifest: lessonPreparationSkillManifestV7,
    inputSchema: LessonPreparationSkillInputSchemaV6,
    outputSchema: LessonPreparationSkillOutputSchema,
    promptBundle: temporaryOverrideLessonPreparationPromptBundle,
    buildContext: (input: LessonPreparationContextBuildInput) =>
      buildTemporaryOverridePreparationContext({
        ...input,
        confirmedPreferences: input.confirmedPreferences ?? []
      }),
    assembleRequest: (input: LessonPreparationSkillInput) =>
      assembleTemporaryOverrideLessonPreparationModelRequest(
        LessonPreparationSkillInputSchemaV6.parse(input)
      ),
    assembleRepairRequest: assembleTemporaryOverrideRepairModelRequest,
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
export type {
  LessonPreparationContextBuildResult,
  LessonPreparationContextEvaluation,
  LessonPreparationContextPlan,
  LessonPreparationEngineeringManifest,
  LessonPreparationSealedContext
} from "./context-builder.js";
export type {
  LessonBriefContextEvaluation,
  LessonBriefPreparationContextBuildResult,
  LessonBriefPreparationManifest
} from "./lesson-brief-context-builder.js";
export type {
  ConversationPreparationContextBuildResult,
  ConversationPreparationManifest,
  TemporaryOverridePreparationContextBuildResult,
  TemporaryOverrideConversationPreparationManifest
} from "./conversation-context-builder.js";
export type {
  PersonalizedLessonPreparationContextBuildResult,
  PersonalizedLessonPreparationManifest,
  PreferenceContextEvaluation
} from "./personalized-context-builder.js";
export {
  LessonPreparationContextBuildError,
  buildLessonPreparationContext,
  estimateContextTokens,
  lessonPreparationContextBuilderVersion
} from "./context-builder.js";
export {
  buildLessonBriefPreparationContext,
  lessonBriefPreparationContextBuilderVersion
} from "./lesson-brief-context-builder.js";
export {
  buildConversationPreparationContext,
  conversationPreparationContextBuilderVersion,
  buildTemporaryOverridePreparationContext,
  temporaryOverridePreparationContextBuilderVersion
} from "./conversation-context-builder.js";
export {
  buildPersonalizedLessonPreparationContext,
  personalizedLessonPreparationContextBuilderVersion
} from "./personalized-context-builder.js";

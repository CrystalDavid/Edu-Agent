import { z } from "zod";

import {
  CreateTeacherCopilotTaskRequestSchema,
  TeachingPlanSchema
} from "./gate2.js";

export const ModelProviderNameSchema = z.enum([
  "mock",
  "volcengine-ark"
]);

export const ModelProviderModeSchema = z.enum(["mock", "ark"]);

export const ModelFailureCategorySchema = z.enum([
  "AUTHENTICATION_FAILED",
  "AUTHORIZATION_FAILED",
  "MODEL_NOT_FOUND",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "REQUEST_TIMED_OUT",
  "REQUEST_CANCELLED",
  "INVALID_PROVIDER_RESPONSE",
  "OUTPUT_VALIDATION_FAILED",
  "POLICY_BLOCKED",
  "BUDGET_EXCEEDED",
  "CONFIGURATION_ERROR",
  "UNKNOWN_PROVIDER_ERROR"
]);

export const ModelExecutionStatusSchema = z.enum([
  "queued",
  "running",
  "validating",
  "succeeded",
  "timed_out",
  "retryable_failed",
  "permanently_failed",
  "validation_failed",
  "budget_exceeded",
  "cancel_requested",
  "cancelled"
]);

export const terminalModelExecutionStatuses = [
  "succeeded",
  "timed_out",
  "permanently_failed",
  "validation_failed",
  "budget_exceeded",
  "cancelled"
] as const;

export const PromptBundleDescriptorSchema = z.object({
  promptBundleRef: z.string().min(1),
  version: z.number().int().positive(),
  useCase: z.literal("lesson_preparation"),
  inputFields: z.array(z.string().min(1)).min(1),
  outputSchemaVersion: z.string().min(1),
  safetyPolicyVersion: z.string().min(1),
  createdAt: z.string().datetime(),
  contentHash: z.string().min(16)
});

export const ProposedPlanChangesSchema = TeachingPlanSchema;

export const StructuredTeachingSuggestionSchema = z.object({
  strategyId: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(1200),
  rationale: z.string().min(1).max(1600),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  knownGaps: z.array(z.string().min(1)),
  applicability: z.string().min(1).max(1200),
  unsuitableConditions: z.array(z.string().min(1)).min(1),
  teachingMoves: z.array(z.string().min(1)).min(1),
  proposedPlanChanges: ProposedPlanChangesSchema,
  followUpEvidence: z.array(z.string().min(1)).min(1),
  uncertaintyNote: z.string().min(1).max(1200),
  courseRunRef: z.string().min(1),
  lessonRef: z.string().min(1),
  learningObjectiveRefs: z.array(z.string().min(1)).min(1)
});

export const StructuredTeachingSuggestionOutputSchema = z.object({
  schemaVersion: z.literal("teacher-copilot-suggestions@1"),
  suggestions: z
    .array(StructuredTeachingSuggestionSchema)
    .min(1)
    .max(3)
});

export const ModelRequestSchemaV2 = z.object({
  invocationRef: z.string().min(1),
  taskRunRef: z.string().min(1),
  agentRunRef: z.string().min(1),
  promptBundle: PromptBundleDescriptorSchema,
  contextManifestRef: z.string().min(1),
  expectedOutputSchema: z.literal(
    "teacher-copilot-suggestions@1"
  ),
  timeoutMs: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user"]),
        content: z.string().min(1)
      })
    )
    .min(2),
  responseFormat: z.enum([
    "json_schema",
    "json_object",
    "prompt_json"
  ]),
  scope: z.object({
    courseRunRef: z.string().min(1),
    lessonRef: z.string().min(1),
    learningObjectiveRefs: z.array(z.string().min(1)).min(1),
    evidenceRefs: z.array(z.string().min(1)).min(1)
  })
});

export const ModelResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("succeeded"),
    provider: ModelProviderNameSchema,
    modelId: z.string().min(1),
    providerRequestId: z.string().min(1).optional(),
    outputText: z.string().min(1),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    latencyMs: z.number().int().nonnegative(),
    finishReason: z.string().min(1).optional()
  }),
  z.object({
    status: z.literal("failed"),
    category: ModelFailureCategorySchema,
    retryable: z.boolean(),
    safeMessage: z.string().min(1),
    providerRequestId: z.string().min(1).optional(),
    retryAfterMs: z.number().int().nonnegative().optional()
  })
]);

export const ProviderAvailabilitySchema = z.object({
  requestedMode: ModelProviderModeSchema,
  activeProvider: ModelProviderNameSchema,
  configured: z.boolean(),
  available: z.boolean(),
  fallbackToMock: z.boolean(),
  modelDisplayName: z.string().min(1),
  apiMode: z.literal("chat_completions"),
  liveTestsEnabled: z.boolean(),
  safeReason: z.string().min(1).nullable()
});

export const ProviderCapabilitiesSchema = z.object({
  provider: z.literal("volcengine-ark"),
  modelIdHash: z.string().min(16),
  supportsText: z.boolean(),
  supportsImageUrl: z.boolean(),
  supportsJsonObject: z.boolean(),
  supportsJsonSchema: z.boolean(),
  supportsFunctionCalling: z.boolean(),
  supportsStreaming: z.boolean(),
  reportsUsage: z.boolean(),
  reportsRequestId: z.boolean(),
  reportedModelMatches: z.boolean(),
  checkedAt: z.string().datetime()
});

export const CreateModelInvocationRequestSchema =
  CreateTeacherCopilotTaskRequestSchema;

export const ModelExecutionViewSchema = z.object({
  modelExecutionRef: z.string().min(1),
  status: ModelExecutionStatusSchema,
  provider: ModelProviderNameSchema,
  modelDisplayName: z.string().min(1),
  taskRef: z.string().min(1),
  taskRunRef: z.string().min(1),
  agentRunRef: z.string().min(1),
  promptBundleRef: z.string().min(1),
  promptBundleVersion: z.number().int().positive(),
  contextManifestRef: z.string().min(1),
  authorizedContextPlanRef: z.string().min(1),
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  estimatedCost: z.number().nonnegative().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  providerRequestIdMasked: z.string().min(1).nullable(),
  finishReason: z.string().min(1).nullable(),
  safeErrorCategory: ModelFailureCategorySchema.nullable(),
  safeMessage: z.string().min(1).nullable(),
  outputSchemaVersion: z.string().min(1),
  proposalRevisionRef: z.string().min(1).nullable(),
  retryOfModelExecutionRef: z.string().min(1).nullable(),
  queuedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable()
});

export const CreateModelInvocationResultSchema = z.object({
  replayed: z.boolean(),
  reusedSuccessfulResult: z.boolean(),
  execution: ModelExecutionViewSchema
});

export const CancelModelInvocationRequestSchema = z.object({
  purpose: z.literal("teacher-copilot.cancel-model"),
  idempotencyKey: z.string().min(8),
  expectedStatus: ModelExecutionStatusSchema
});

export const RetryModelInvocationRequestSchema = z.object({
  purpose: z.literal("teacher-copilot.retry-model"),
  idempotencyKey: z.string().min(8),
  expectedStatus: z.enum([
    "timed_out",
    "retryable_failed",
    "permanently_failed",
    "validation_failed",
    "budget_exceeded",
    "cancelled"
  ])
});

export const ModelUsageSummarySchema = z.object({
  provider: ModelProviderNameSchema,
  modelDisplayName: z.string().min(1),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  executionCount: z.number().int().nonnegative(),
  succeededCount: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  estimatedCost: z.number().nonnegative()
});

export const ModelBudgetDecisionSchema = z.object({
  decisionRef: z.string().min(1),
  allowed: z.boolean(),
  reasonCode: z.enum([
    "ALLOWED",
    "MODEL_NOT_ALLOWED",
    "INPUT_LIMIT_EXCEEDED",
    "OUTPUT_LIMIT_EXCEEDED",
    "SINGLE_COST_LIMIT_EXCEEDED",
    "DAILY_BUDGET_EXCEEDED",
    "TEACHER_DAILY_BUDGET_EXCEEDED",
    "CONCURRENCY_LIMIT_EXCEEDED",
    "QUEUE_WAIT_EXCEEDED"
  ]),
  estimatedInputTokens: z.number().int().nonnegative(),
  requestedOutputTokens: z.number().int().nonnegative(),
  estimatedMaximumCost: z.number().nonnegative(),
  checkedAt: z.string().datetime()
});

export const ModelDataManifestSchema = z.object({
  modelDataManifestRef: z.string().min(1),
  purpose: z.literal("teacher-copilot.lesson-preparation"),
  tenantRef: z.literal("tenant:demo-school"),
  actorRef: z.literal("user:teacher-001"),
  taskRunRef: z.string().min(1),
  contextManifestRef: z.string().min(1),
  provider: ModelProviderNameSchema,
  modelIdHash: z.string().min(16),
  dataCategories: z.array(z.string().min(1)).min(1),
  resourceRefs: z.array(z.string().min(1)).min(1),
  fieldNames: z.array(z.string().min(1)).min(1),
  syntheticDataAssertion: z.literal(true),
  authorizationDecisionRef: z.string().min(1),
  retentionPolicy: z.literal(
    "provider-transient-no-local-raw-content"
  ),
  createdAt: z.string().datetime()
});

export type ModelProviderName = z.infer<
  typeof ModelProviderNameSchema
>;
export type ModelProviderMode = z.infer<
  typeof ModelProviderModeSchema
>;
export type ModelFailureCategory = z.infer<
  typeof ModelFailureCategorySchema
>;
export type ModelExecutionStatus = z.infer<
  typeof ModelExecutionStatusSchema
>;
export type PromptBundleDescriptor = z.infer<
  typeof PromptBundleDescriptorSchema
>;
export type StructuredTeachingSuggestion = z.infer<
  typeof StructuredTeachingSuggestionSchema
>;
export type StructuredTeachingSuggestionOutput = z.infer<
  typeof StructuredTeachingSuggestionOutputSchema
>;
export type ModelRequestV2 = z.infer<typeof ModelRequestSchemaV2>;
export type ModelResult = z.infer<typeof ModelResultSchema>;
export type ProviderAvailability = z.infer<
  typeof ProviderAvailabilitySchema
>;
export type ProviderCapabilities = z.infer<
  typeof ProviderCapabilitiesSchema
>;
export type CreateModelInvocationRequest = z.infer<
  typeof CreateModelInvocationRequestSchema
>;
export type ModelExecutionView = z.infer<
  typeof ModelExecutionViewSchema
>;
export type CreateModelInvocationResult = z.infer<
  typeof CreateModelInvocationResultSchema
>;
export type CancelModelInvocationRequest = z.infer<
  typeof CancelModelInvocationRequestSchema
>;
export type RetryModelInvocationRequest = z.infer<
  typeof RetryModelInvocationRequestSchema
>;
export type ModelUsageSummary = z.infer<
  typeof ModelUsageSummarySchema
>;
export type ModelBudgetDecision = z.infer<
  typeof ModelBudgetDecisionSchema
>;
export type ModelDataManifest = z.infer<
  typeof ModelDataManifestSchema
>;

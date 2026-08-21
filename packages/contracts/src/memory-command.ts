import { z } from "zod";

import {
  ConversationThreadViewSchema,
  ConversationTurnViewSchema,
  WorkingMemoryViewSchema
} from "./conversation.js";
import { MemoryScopeSchema } from "./memory-scope.js";
import { TemporaryOverrideReceiptSchema } from "./temporary-memory-override.js";
import {
  MemoryCandidateViewSchema,
  TeacherPreferenceViewSchema
} from "./personalization.js";

export const TeacherMemoryCommandIntentSchema = z.enum([
  "none",
  "remember",
  "forget_requested",
  "temporary_override",
  "unsupported",
  "rejected"
]);

export const ExplicitRememberItemStatusSchema = z.enum([
  "applied",
  "already_remembered",
  "review_required",
  "rejected"
]);

export const ExplicitRememberInterpretedItemSchema = z
  .object({
    canonicalKey: z.string().min(1).max(80),
    preferenceKey: z.string().min(1).max(80),
    canonicalValue: z.string().min(1).max(240),
    safeDisplayValue: z.string().min(1).max(240),
    proposedScope: MemoryScopeSchema,
    consentBasis: z.literal("teacher_explicit_command"),
    consentVersion: z.literal("consent:explicit-remember@1"),
    riskLevel: z.literal("low"),
    parsingRuleId: z.string().min(1).max(120),
    confidence: z.literal(1),
    directActivationEligible: z.boolean()
  })
  .strict();

const interpretationBase = {
  interpreterVersion: z.literal("explicit-memory-command-interpreter@1"),
  catalogVersion: z.literal("teacher-preference-catalog@1"),
  catalogContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  commandContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  sourceTurnRef: z.string().min(1),
  sourceTurnSequence: z.number().int().positive(),
  sourceTurnContentHash: z.string().min(16),
  fullCoverage: z.boolean(),
  durableIntentMarker: z.string().min(1).max(40).nullable(),
  items: z.array(ExplicitRememberInterpretedItemSchema).max(10),
  residualText: z.string().max(2000),
  issues: z.array(z.string().min(1).max(120)).max(20)
};

export const ExplicitTeacherMemoryCommandInterpretationSchema =
  z.discriminatedUnion("intent", [
    z.object({ intent: z.literal("none"), ...interpretationBase }).strict(),
    z.object({ intent: z.literal("remember"), ...interpretationBase }).strict(),
    z.object({ intent: z.literal("forget_requested"), ...interpretationBase }).strict(),
    z.object({ intent: z.literal("temporary_override"), ...interpretationBase }).strict(),
    z.object({ intent: z.literal("unsupported"), ...interpretationBase }).strict(),
    z.object({ intent: z.literal("rejected"), ...interpretationBase }).strict()
  ]);

export const ExplicitRememberCommandItemSchema = z
  .object({
    canonicalKey: z.string().min(1).max(80),
    preferenceKey: z.string().min(1).max(80),
    displayValue: z.string().min(1).max(240),
    previousDisplayValue: z.string().min(1).max(240).nullable(),
    scope: MemoryScopeSchema,
    parsingRuleId: z.string().min(1).max(120),
    status: ExplicitRememberItemStatusSchema,
    candidateRef: z.string().min(1).nullable(),
    preferenceRef: z.string().min(1).nullable(),
    preferenceVersion: z.number().int().positive().nullable(),
    conflictPreferenceRef: z.string().min(1).nullable(),
    conflictPreferenceVersion: z.number().int().positive().nullable(),
    safeReasonCode: z.string().min(1).max(120)
  })
  .strict();

export const ExplicitRememberReceiptStatusSchema = z.enum([
  "applied",
  "already_remembered",
  "review_required",
  "mixed",
  "not_saved",
  "rejected",
  "forget_requested",
  "temporary_override"
]);

export const ExplicitRememberReceiptSchema = z
  .object({
    commandRef: z.string().min(1),
    interpreterVersion: z.literal("explicit-memory-command-interpreter@1"),
    sourceTurnRef: z.string().min(1),
    sourceTurnContentHash: z.string().min(16),
    status: ExplicitRememberReceiptStatusSchema,
    safeReasonCode: z.string().min(1).max(120),
    safeMessage: z.string().min(1).max(1000),
    items: z.array(ExplicitRememberCommandItemSchema).max(10),
    memoryEpochBefore: z.number().int().nonnegative(),
    memoryEpochAfter: z.number().int().nonnegative(),
    createdAt: z.string().datetime()
  })
  .strict();

export const ApplyExplicitRememberResultSchema = z
  .object({
    replayed: z.boolean(),
    receipt: ExplicitRememberReceiptSchema
  })
  .strict();

export const ExplicitForgetIntentSchema = z.enum([
  "forget",
  "none",
  "temporary_override",
  "unsupported",
  "rejected"
]);

export const ExplicitForgetRequestedScopeKindSchema = z.enum([
  "global",
  "course_run",
  "unspecified"
]);

export const ExplicitForgetInterpretedTargetSchema = z
  .object({
    canonicalKey: z.string().min(1).max(80),
    canonicalValue: z.string().min(1).max(240).nullable(),
    requestedScopeKind: ExplicitForgetRequestedScopeKindSchema,
    requestedScopeFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
    parsingRuleId: z.string().min(1).max(120)
  })
  .strict();

const forgetInterpretationBase = {
  interpreterVersion: z.literal("explicit-forget-command-interpreter@1"),
  catalogVersion: z.literal("teacher-preference-catalog@1"),
  catalogContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  commandContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  sourceTurnRef: z.string().min(1),
  sourceTurnSequence: z.number().int().positive(),
  sourceTurnContentHash: z.string().min(16),
  fullCoverage: z.boolean(),
  targets: z.array(ExplicitForgetInterpretedTargetSchema).max(10),
  residualText: z.string().max(2000),
  issues: z.array(z.string().min(1).max(120)).max(20)
};

export const ExplicitTeacherForgetCommandInterpretationSchema =
  z.discriminatedUnion("intent", [
    z.object({ intent: z.literal("forget"), ...forgetInterpretationBase }).strict(),
    z.object({ intent: z.literal("none"), ...forgetInterpretationBase }).strict(),
    z.object({ intent: z.literal("temporary_override"), ...forgetInterpretationBase }).strict(),
    z.object({ intent: z.literal("unsupported"), ...forgetInterpretationBase }).strict(),
    z.object({ intent: z.literal("rejected"), ...forgetInterpretationBase }).strict()
  ]);

export const ExplicitForgetTargetStatusSchema = z.enum([
  "revoked",
  "already_revoked",
  "not_found",
  "selection_required",
  "rejected"
]);

export const ExplicitForgetSelectionOptionSchema = z
  .object({
    preferenceRef: z.string().min(1),
    preferenceVersion: z.number().int().positive(),
    canonicalKey: z.string().min(1).max(80),
    displayValue: z.string().min(1).max(240),
    scope: MemoryScopeSchema,
    validFrom: z.string().datetime(),
    validUntil: z.string().datetime().nullable(),
    currentStatus: z.enum(["active", "revoked"])
  })
  .strict();

export const ExplicitForgetReceiptTargetSchema =
  ExplicitForgetInterpretedTargetSchema.extend({
    status: ExplicitForgetTargetStatusSchema,
    options: z.array(ExplicitForgetSelectionOptionSchema).max(10)
  }).strict();

export const ExplicitForgetReceiptStatusSchema = z.enum([
  "revoked",
  "selection_required",
  "nothing_to_forget",
  "rejected",
  "replayed"
]);

export const ExplicitForgetReceiptSchema = z
  .object({
    commandRef: z.string().min(1),
    interpreterVersion: z.literal("explicit-forget-command-interpreter@1"),
    sourceTurnRef: z.string().min(1),
    sourceTurnContentHash: z.string().min(16),
    status: ExplicitForgetReceiptStatusSchema,
    safeReasonCode: z.string().min(1).max(120),
    targets: z.array(ExplicitForgetReceiptTargetSchema).max(10),
    memoryEpochBefore: z.number().int().nonnegative(),
    memoryEpochAfter: z.number().int().nonnegative(),
    safeMessage: z.string().min(1).max(1000),
    createdAt: z.string().datetime()
  })
  .strict();

export const TeacherMemoryCommandReceiptSchema = z.union([
  ExplicitRememberReceiptSchema,
  ExplicitForgetReceiptSchema
]);

export const ApplyExplicitForgetResultSchema = z
  .object({
    replayed: z.boolean(),
    receipt: ExplicitForgetReceiptSchema
  })
  .strict();

export const DispatchTeacherConversationTurnRequestSchema = z
  .object({
    teacherText: z.string().trim().min(1).max(2000),
    parentTurnRef: z.string().min(1).nullable().default(null),
    expectedConversationVersion: z.number().int().positive(),
    purpose: z.literal("teacher-copilot.conversation.dispatch-turn"),
    idempotencyKey: z.string().min(8).max(200)
  })
  .strict();

const dispatchBase = {
  replayed: z.boolean(),
  conversation: ConversationThreadViewSchema
};

export const DispatchTeacherConversationTurnResultSchema =
  z.discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("model_instruction"),
        ...dispatchBase,
        turn: ConversationTurnViewSchema,
        workingMemory: WorkingMemoryViewSchema,
        turnContext: z
          .object({
            conversationRef: z.string().min(1),
            turnRef: z.string().min(1),
            parentTurnRef: z.string().min(1).nullable(),
            conversationVersion: z.number().int().positive()
          })
          .strict(),
        temporaryOverrideReceipt: TemporaryOverrideReceiptSchema.optional()
      })
      .strict(),
    z
      .object({
        kind: z.literal("memory_command"),
        ...dispatchBase,
        teacherTurn: ConversationTurnViewSchema,
        receiptTurn: ConversationTurnViewSchema,
        receipt: TeacherMemoryCommandReceiptSchema
      })
      .strict(),
    z
      .object({
        kind: z.literal("unsupported_memory_command"),
        ...dispatchBase,
        teacherTurn: ConversationTurnViewSchema,
        receiptTurn: ConversationTurnViewSchema,
        safeReasonCode: z.string().min(1).max(120),
        safeMessage: z.string().min(1).max(1000)
      })
      .strict()
  ]);

export const ConfirmMemoryCandidateReplacementRequestSchema = z
  .object({
    expectedCandidateVersion: z.number().int().positive(),
    expectedPreferenceVersion: z.number().int().positive(),
    purpose: z.literal("personalization.candidate.confirm-replacement"),
    idempotencyKey: z.string().min(8).max(200)
  })
  .strict();

export const ConfirmMemoryCandidateReplacementResultSchema = z
  .object({
    replayed: z.boolean(),
    candidate: MemoryCandidateViewSchema,
    preference: TeacherPreferenceViewSchema
  })
  .strict();

export const ConfirmExplicitForgetSelectionRequestSchema = z
  .object({
    selectedPreferenceRefs: z
      .array(z.string().trim().min(1).max(240))
      .min(1)
      .max(10),
    expectedVersions: z.record(
      z.string().trim().min(1).max(240),
      z.number().int().positive()
    ),
    expectedConversationVersion: z.number().int().positive(),
    purpose: z.literal("personalization.explicit-forget.confirm"),
    idempotencyKey: z.string().min(8).max(200)
  })
  .strict();

export const ConfirmExplicitForgetSelectionResultSchema = z
  .object({
    replayed: z.boolean(),
    conversation: ConversationThreadViewSchema,
    commandTurn: ConversationTurnViewSchema,
    receiptTurn: ConversationTurnViewSchema,
    receipt: ExplicitForgetReceiptSchema
  })
  .strict();

export type TeacherMemoryCommandIntent = z.infer<
  typeof TeacherMemoryCommandIntentSchema
>;
export type ExplicitRememberInterpretedItem = z.infer<
  typeof ExplicitRememberInterpretedItemSchema
>;
export type ExplicitTeacherMemoryCommandInterpretation = z.infer<
  typeof ExplicitTeacherMemoryCommandInterpretationSchema
>;
export type ExplicitRememberCommandItem = z.infer<
  typeof ExplicitRememberCommandItemSchema
>;
export type ExplicitRememberReceipt = z.infer<
  typeof ExplicitRememberReceiptSchema
>;
export type ApplyExplicitRememberResult = z.infer<
  typeof ApplyExplicitRememberResultSchema
>;
export type ExplicitForgetIntent = z.infer<
  typeof ExplicitForgetIntentSchema
>;
export type ExplicitForgetRequestedScopeKind = z.infer<
  typeof ExplicitForgetRequestedScopeKindSchema
>;
export type ExplicitForgetInterpretedTarget = z.infer<
  typeof ExplicitForgetInterpretedTargetSchema
>;
export type ExplicitTeacherForgetCommandInterpretation = z.infer<
  typeof ExplicitTeacherForgetCommandInterpretationSchema
>;
export type ExplicitForgetTargetStatus = z.infer<
  typeof ExplicitForgetTargetStatusSchema
>;
export type ExplicitForgetSelectionOption = z.infer<
  typeof ExplicitForgetSelectionOptionSchema
>;
export type ExplicitForgetReceiptTarget = z.infer<
  typeof ExplicitForgetReceiptTargetSchema
>;
export type ExplicitForgetReceipt = z.infer<
  typeof ExplicitForgetReceiptSchema
>;
export type TeacherMemoryCommandReceipt = z.infer<
  typeof TeacherMemoryCommandReceiptSchema
>;
export type ApplyExplicitForgetResult = z.infer<
  typeof ApplyExplicitForgetResultSchema
>;
export type DispatchTeacherConversationTurnRequest = z.infer<
  typeof DispatchTeacherConversationTurnRequestSchema
>;
export type DispatchTeacherConversationTurnResult = z.infer<
  typeof DispatchTeacherConversationTurnResultSchema
>;
export type ConfirmMemoryCandidateReplacementRequest = z.infer<
  typeof ConfirmMemoryCandidateReplacementRequestSchema
>;
export type ConfirmMemoryCandidateReplacementResult = z.infer<
  typeof ConfirmMemoryCandidateReplacementResultSchema
>;
export type ConfirmExplicitForgetSelectionRequest = z.infer<
  typeof ConfirmExplicitForgetSelectionRequestSchema
>;
export type ConfirmExplicitForgetSelectionResult = z.infer<
  typeof ConfirmExplicitForgetSelectionResultSchema
>;

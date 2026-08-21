import { z } from "zod";

import { MemoryScopeKindSchema } from "./memory-scope.js";
import {
  TemporaryOverrideEffectSchema,
  TemporaryOverrideLifetimeSchema
} from "./temporary-memory-override.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SourceContentHashSchema = z.string().min(16);

export const MemoryApplicationDecisionSchema = z.enum([
  "selected",
  "injected",
  "excluded",
  "overridden"
]);

export const MemoryApplicationReasonCodeSchema = z.enum([
  "current_instruction",
  "same_task_working_memory",
  "active_confirmed_preference",
  "owner_mismatch",
  "duplicate_key",
  "token_budget",
  "skill_not_allowed",
  "current_instruction_override",
  "expired",
  "revoked",
  "superseded",
  "scope_mismatch",
  "not_yet_valid",
  "more_specific_scope",
  "more_specific_skill_scope"
]);

export const MemoryContextSourceKindSchema = z.enum([
  "current_instruction",
  "working_memory",
  "teacher_preference",
  "temporary_override"
]);

export const MemoryApplicationOutcomeStatusSchema = z.enum([
  "adopted",
  "edited",
  "rejected",
  "deferred",
  "unknown"
]);

export const TemporaryOverrideDecisionReasonCodeSchema = z.enum([
  "temporary_override",
  "temporary_suppression"
]);

export const MemoryContextPackOwnerSchema = z
  .object({
    tenantRef: z.string().min(1),
    teacherRef: z.string().min(1)
  })
  .strict();

export const MemoryContextDecisionEntrySchema = z
  .object({
    sourceKind: z.enum(["current_instruction", "working_memory"]),
    sourceRef: z.string().min(1),
    sourceVersion: z.number().int().positive(),
    sourceContentHash: SourceContentHashSchema,
    decision: MemoryApplicationDecisionSchema,
    reasonCode: MemoryApplicationReasonCodeSchema,
    targetFields: z.array(z.string().min(1)),
    allowedEffects: z.array(z.string().min(1)),
    estimatedTokens: z.number().int().nonnegative()
  })
  .strict();

export const MemoryPreferenceDecisionEntrySchema = z
  .object({
    sourceKind: z.literal("teacher_preference"),
    sourceRef: z.string().min(1),
    sourceVersion: z.number().int().positive(),
    sourceContentHash: SourceContentHashSchema,
    decision: MemoryApplicationDecisionSchema,
    reasonCode: MemoryApplicationReasonCodeSchema,
    targetFields: z.array(z.string().min(1)),
    allowedEffects: z.array(z.string().min(1)),
    estimatedTokens: z.number().int().nonnegative()
  })
  .strict();

export const MemoryPreferenceDecisionEntryV2Schema =
  MemoryPreferenceDecisionEntrySchema.extend({
    scopeKind: MemoryScopeKindSchema,
    scopeFingerprint: Sha256Schema,
    matchSpecificity: z.number().int().nonnegative(),
    matchedSkillConstraint: z.boolean()
  }).strict();

export const TemporaryOverrideDecisionEntrySchema = z
  .object({
    sourceKind: z.literal("temporary_override"),
    overrideRef: z.string().min(1),
    sourceTurnRef: z.string().min(1),
    sourceTurnSequence: z.number().int().positive(),
    sourceContentHash: SourceContentHashSchema,
    overrideContentHash: Sha256Schema,
    canonicalKey: z.string().min(1).max(80),
    effect: TemporaryOverrideEffectSchema,
    lifetime: TemporaryOverrideLifetimeSchema,
    decision: MemoryApplicationDecisionSchema,
    reasonCode: TemporaryOverrideDecisionReasonCodeSchema,
    targetFields: z.array(z.string().min(1)),
    allowedEffects: z.array(z.string().min(1)),
    estimatedTokens: z.number().int().nonnegative()
  })
  .strict();

export const MemoryContextPackManifestV1Schema = z
  .object({
    packRef: z.string().min(1),
    packContentHash: Sha256Schema,
    manifestVersion: z.literal(1),
    owner: MemoryContextPackOwnerSchema,
    useCase: z.string().min(1),
    policyVersion: z.string().min(1),
    skillRef: z.string().min(1),
    skillVersion: z.string().min(1),
    skillContentHash: SourceContentHashSchema,
    conversationRef: z.string().min(1),
    currentTurnRef: z.string().min(1),
    currentTurnSequence: z.number().int().positive(),
    currentTurnContentHash: SourceContentHashSchema,
    workingMemorySnapshotRef: z.string().min(1),
    workingMemorySnapshotVersion: z.number().int().positive(),
    workingMemorySnapshotContentHash: SourceContentHashSchema,
    contextDecisions: z.array(MemoryContextDecisionEntrySchema),
    preferenceDecisions: z.array(MemoryPreferenceDecisionEntrySchema),
    excludedCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime()
  })
  .strict();

export const MemoryContextPackManifestV2Schema = z
  .object({
    packRef: z.string().min(1),
    packContentHash: Sha256Schema,
    manifestVersion: z.literal(2),
    owner: MemoryContextPackOwnerSchema,
    useCase: z.string().min(1),
    policyVersion: z.string().min(1),
    retrievalPolicyVersion: z.string().min(1),
    teacherMemoryEpoch: z.number().int().nonnegative(),
    queryScopeHash: Sha256Schema,
    querySkillId: z.string().min(1),
    queryUseCase: z.string().min(1),
    skillRef: z.string().min(1),
    skillVersion: z.string().min(1),
    skillContentHash: SourceContentHashSchema,
    conversationRef: z.string().min(1),
    currentTurnRef: z.string().min(1),
    currentTurnSequence: z.number().int().positive(),
    currentTurnContentHash: SourceContentHashSchema,
    workingMemorySnapshotRef: z.string().min(1),
    workingMemorySnapshotVersion: z.number().int().positive(),
    workingMemorySnapshotContentHash: SourceContentHashSchema,
    contextDecisions: z.array(MemoryContextDecisionEntrySchema),
    preferenceDecisions: z.array(MemoryPreferenceDecisionEntryV2Schema),
    selectedCount: z.number().int().nonnegative(),
    overriddenCount: z.number().int().nonnegative(),
    excludedCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime()
  })
  .strict();

export const MemoryContextPackManifestV3Schema =
  MemoryContextPackManifestV2Schema.extend({
    manifestVersion: z.literal(3),
    overridePolicyVersion: z.literal(
      "temporary-preference-override-policy@1"
    ),
    temporaryOverrideSetHash: Sha256Schema,
    temporaryOverrideDecisions: z.array(
      TemporaryOverrideDecisionEntrySchema
    ).max(10),
    injectedOverrideCount: z.number().int().nonnegative(),
    suppressedPreferenceCount: z.number().int().nonnegative()
  }).strict();

export const MemoryContextPackManifestSchema = z.discriminatedUnion(
  "manifestVersion",
  [
    MemoryContextPackManifestV1Schema,
    MemoryContextPackManifestV2Schema,
    MemoryContextPackManifestV3Schema
  ]
);

export const MemoryContextExplanationSchema = z.object({
  packRef: z.string().min(1),
  packContentHash: Sha256Schema,
  manifestVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  policyVersion: z.string().min(1),
  retrievalPolicyVersion: z.string().min(1).optional(),
  teacherMemoryEpoch: z.number().int().nonnegative().optional(),
  queryScopeHash: Sha256Schema.optional(),
  querySkillId: z.string().min(1).optional(),
  queryUseCase: z.string().min(1).optional(),
  selectedCount: z.number().int().nonnegative().optional(),
  overriddenCount: z.number().int().nonnegative().optional(),
  excludedCount: z.number().int().nonnegative().optional(),
  legacyGlobalContext: z.boolean().optional(),
  skillRef: z.string().min(1),
  skillVersion: z.string().min(1),
  currentTurn: z
    .object({
      turnRef: z.string().min(1),
      sequence: z.number().int().positive(),
      displaySummary: z.string().min(1)
    })
    .nullable(),
  workingMemory: z.array(
    z.object({
      sourceRef: z.string().min(1),
      sourceKind: z.literal("working_memory"),
      displaySummary: z.string().min(1),
      decision: MemoryApplicationDecisionSchema,
      reasonCode: MemoryApplicationReasonCodeSchema
    })
  ),
  durablePreferences: z.array(
    z.object({
      preferenceRef: z.string().min(1),
      preferenceVersion: z.number().int().positive(),
      preferenceKey: z.string().min(1),
      preferenceValue: z.string().min(1),
      currentStatus: z.enum(["active", "revoked"]),
      decision: MemoryApplicationDecisionSchema,
      reasonCode: MemoryApplicationReasonCodeSchema,
      outcomeStatus: MemoryApplicationOutcomeStatusSchema.nullable(),
      targetFields: z.array(z.string().min(1)),
      canonicalKey: z.string().min(1).optional(),
      scopeKind: MemoryScopeKindSchema.optional(),
      scopeFingerprint: Sha256Schema.optional(),
      scopeDisplay: z.string().min(1).optional(),
      matchSpecificity: z.number().int().nonnegative().optional(),
      matchedSkillConstraint: z.boolean().optional()
    })
  ),
  temporaryOverrides: z.array(
    z.object({
      overrideRef: z.string().min(1),
      canonicalKey: z.string().min(1).max(80),
      preferenceKey: z.string().min(1).max(80),
      effect: TemporaryOverrideEffectSchema,
      displayValue: z.string().min(1).max(240),
      lifetime: TemporaryOverrideLifetimeSchema,
      decision: MemoryApplicationDecisionSchema,
      reasonCode: TemporaryOverrideDecisionReasonCodeSchema,
      targetFields: z.array(z.string().min(1))
    }).strict()
  ).default([]),
  excluded: z.array(
    z.object({
      sourceKind: MemoryContextSourceKindSchema,
      sourceRef: z.string().min(1),
      reasonCode: MemoryApplicationReasonCodeSchema
    })
  ),
  outcomeStatus: MemoryApplicationOutcomeStatusSchema.nullable()
});

export type MemoryApplicationDecision = z.infer<
  typeof MemoryApplicationDecisionSchema
>;
export type MemoryApplicationReasonCode = z.infer<
  typeof MemoryApplicationReasonCodeSchema
>;
export type TemporaryOverrideDecisionReasonCode = z.infer<
  typeof TemporaryOverrideDecisionReasonCodeSchema
>;
export type MemoryContextSourceKind = z.infer<
  typeof MemoryContextSourceKindSchema
>;
export type MemoryApplicationOutcomeStatus = z.infer<
  typeof MemoryApplicationOutcomeStatusSchema
>;
export type MemoryContextPackOwner = z.infer<
  typeof MemoryContextPackOwnerSchema
>;
export type MemoryContextDecisionEntry = z.infer<
  typeof MemoryContextDecisionEntrySchema
>;
export type MemoryPreferenceDecisionEntry = z.infer<
  typeof MemoryPreferenceDecisionEntrySchema
>;
export type MemoryPreferenceDecisionEntryV2 = z.infer<
  typeof MemoryPreferenceDecisionEntryV2Schema
>;
export type TemporaryOverrideDecisionEntry = z.infer<
  typeof TemporaryOverrideDecisionEntrySchema
>;
export type MemoryContextPackManifestV1 = z.infer<
  typeof MemoryContextPackManifestV1Schema
>;
export type MemoryContextPackManifestV2 = z.infer<
  typeof MemoryContextPackManifestV2Schema
>;
export type MemoryContextPackManifestV3 = z.infer<
  typeof MemoryContextPackManifestV3Schema
>;
export type MemoryContextPackManifest = z.infer<
  typeof MemoryContextPackManifestSchema
>;
export type MemoryContextExplanation = z.infer<
  typeof MemoryContextExplanationSchema
>;

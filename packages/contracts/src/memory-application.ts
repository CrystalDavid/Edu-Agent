import { z } from "zod";

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
  "superseded"
]);

export const MemoryContextSourceKindSchema = z.enum([
  "current_instruction",
  "working_memory",
  "teacher_preference"
]);

export const MemoryApplicationOutcomeStatusSchema = z.enum([
  "adopted",
  "edited",
  "rejected",
  "deferred",
  "unknown"
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

export const MemoryContextPackManifestSchema = z
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

export const MemoryContextExplanationSchema = z.object({
  packRef: z.string().min(1),
  packContentHash: Sha256Schema,
  manifestVersion: z.literal(1),
  policyVersion: z.string().min(1),
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
      targetFields: z.array(z.string().min(1))
    })
  ),
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
export type MemoryContextPackManifest = z.infer<
  typeof MemoryContextPackManifestSchema
>;
export type MemoryContextExplanation = z.infer<
  typeof MemoryContextExplanationSchema
>;

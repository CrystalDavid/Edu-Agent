import { z } from "zod";

import {
  MemoryScopeDefinitionSchema,
  MemoryScopeSchema,
  globalMemoryScope
} from "./memory-scope.js";

export const TeacherPreferenceExplicitnessSchema = z.enum([
  "teacher_declared",
  "teacher_confirmed_inferred"
]);

export const TeacherPreferenceConsentBasisSchema = z.enum([
  "teacher_settings_confirmed",
  "teacher_explicit_command"
]);

export const TeacherPreferenceConsentProposalSchema = z
  .object({
    basis: TeacherPreferenceConsentBasisSchema,
    version: z.string().min(1).max(120)
  })
  .strict();

export const MemoryCandidateStatusSchema = z.enum([
  "draft",
  "confirmed",
  "rejected",
  "expired"
]);

export const MemoryCandidateTypeSchema = z.enum(["preference", "episodic"]);

export const MemoryCandidateSourceSchema = z.object({
  sourceRef: z.string().min(1),
  sourceType: z.enum([
    "teacher_request",
    "teacher_action",
    "task_run",
    "agent_run",
    "lesson_reflection"
  ]),
  version: z.string().min(1),
  contentHash: z.string().min(16),
  provenance: z.string().min(1)
});

export const MemoryCandidateViewSchema = z.object({
  candidateRef: z.string().min(1),
  type: MemoryCandidateTypeSchema,
  summary: z.string().min(1),
  preferenceKey: z.string().min(1).nullable(),
  preferenceValue: z.string().min(1).nullable(),
  canonicalKey: z.string().min(1).nullable().default(null),
  proposedScope: MemoryScopeSchema.nullable().default(null),
  validFrom: z.string().datetime().nullable().default(null),
  validUntil: z.string().datetime().nullable().default(null),
  consentProposal: TeacherPreferenceConsentProposalSchema.nullable().default(null),
  sourceCommandRef: z.string().min(1).nullable().default(null),
  conflictPreferenceRef: z.string().min(1).nullable().default(null),
  conflictPreferenceVersion: z.number().int().positive().nullable().default(null),
  reviewReason: z.string().min(1).max(120).nullable().default(null),
  parsingRuleId: z.string().min(1).max(120).nullable().default(null),
  sources: z.array(MemoryCandidateSourceSchema).min(1),
  confidence: z.number().min(0).max(1),
  proposedBy: z.enum(["teacher", "agent"]),
  status: MemoryCandidateStatusSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  confirmedAt: z.string().datetime().nullable(),
  rejectedAt: z.string().datetime().nullable(),
  expiredAt: z.string().datetime().nullable(),
  version: z.number().int().positive(),
  contentHash: z.string().min(16)
});

export const TeacherPreferenceStatusSchema = z.enum(["active", "revoked"]);

export const TeacherPreferenceViewSchema = z.object({
  preferenceRef: z.string().min(1),
  preferenceKey: z.string().min(1),
  preferenceValue: z.string().min(1),
  canonicalKey: z.string().min(1).default("preference"),
  scope: MemoryScopeSchema.default(() => ({
    ...globalMemoryScope,
    skillIds: []
  })),
  scopeFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .default(globalMemoryScope.fingerprint),
  validFrom: z.string().datetime().default("1970-01-01T00:00:00.000Z"),
  validUntil: z.string().datetime().nullable().default(null),
  explicitness: TeacherPreferenceExplicitnessSchema.default("teacher_declared"),
  consentBasis: TeacherPreferenceConsentBasisSchema.default(
    "teacher_settings_confirmed"
  ),
  consentVersion: z.string().min(1).default("consent:teacher-settings@1"),
  policyVersion: z.string().min(1).default("teacher-preference-scope@1"),
  sourceCandidateRef: z.string().min(1),
  status: TeacherPreferenceStatusSchema,
  version: z.number().int().positive(),
  confirmedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  contentHash: z.string().min(16)
});

export const TeacherPersonalizationStateSchema = z.object({
  candidates: z.array(MemoryCandidateViewSchema),
  preferences: z.array(TeacherPreferenceViewSchema),
  scopedPreferencesEnabled: z.boolean().default(false),
  explicitRememberEnabled: z.boolean().default(false)
});

export const CreateMemoryCandidateRequestSchema = z.object({
  summary: z.string().trim().min(1).max(280),
  preferenceKey: z.string().trim().min(1).max(80),
  preferenceValue: z.string().trim().min(1).max(240),
  canonicalKey: z.string().trim().min(1).max(80).optional(),
  proposedScope: MemoryScopeDefinitionSchema.optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  consentProposal: TeacherPreferenceConsentProposalSchema.optional(),
  expiresAt: z.string().datetime().optional(),
  purpose: z.literal("personalization.candidate.create"),
  idempotencyKey: z.string().min(8).max(200)
});

export const ReviewMemoryCandidateRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  purpose: z.enum([
    "personalization.candidate.confirm",
    "personalization.candidate.reject"
  ]),
  idempotencyKey: z.string().min(8).max(200)
});

export const UpdateTeacherPreferenceRequestSchema = z.object({
  preferenceValue: z.string().trim().min(1).max(240),
  expectedVersion: z.number().int().positive(),
  purpose: z.literal("personalization.preference.update"),
  idempotencyKey: z.string().min(8).max(200)
});

export const RevokeTeacherPreferenceRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  purpose: z.literal("personalization.preference.revoke"),
  idempotencyKey: z.string().min(8).max(200)
});

export const UpdateTeacherPreferenceScopeRequestSchema = z.object({
  scope: MemoryScopeDefinitionSchema,
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  expectedVersion: z.number().int().positive(),
  purpose: z.literal("personalization.preference.update-scope"),
  idempotencyKey: z.string().min(8).max(200)
});

export const MemoryCandidateMutationResultSchema = z.object({
  replayed: z.boolean(),
  candidate: MemoryCandidateViewSchema,
  preference: TeacherPreferenceViewSchema.nullable()
});

export const TeacherPreferenceMutationResultSchema = z.object({
  replayed: z.boolean(),
  preference: TeacherPreferenceViewSchema
});

export type MemoryCandidateView = z.infer<typeof MemoryCandidateViewSchema>;
export type TeacherPreferenceExplicitness = z.infer<
  typeof TeacherPreferenceExplicitnessSchema
>;
export type TeacherPreferenceConsentBasis = z.infer<
  typeof TeacherPreferenceConsentBasisSchema
>;
export type TeacherPreferenceView = z.infer<typeof TeacherPreferenceViewSchema>;
export type TeacherPersonalizationState = z.infer<typeof TeacherPersonalizationStateSchema>;
export type CreateMemoryCandidateRequest = z.infer<typeof CreateMemoryCandidateRequestSchema>;
export type ReviewMemoryCandidateRequest = z.infer<typeof ReviewMemoryCandidateRequestSchema>;
export type UpdateTeacherPreferenceRequest = z.infer<typeof UpdateTeacherPreferenceRequestSchema>;
export type RevokeTeacherPreferenceRequest = z.infer<typeof RevokeTeacherPreferenceRequestSchema>;
export type UpdateTeacherPreferenceScopeRequest = z.infer<
  typeof UpdateTeacherPreferenceScopeRequestSchema
>;

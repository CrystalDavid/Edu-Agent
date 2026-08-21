import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const TemporaryOverrideEffectSchema = z.enum([
  "replace_value",
  "suppress_preference"
]);

export const TemporaryOverrideLifetimeSchema = z.literal(
  "current_conversation"
);

export const TemporaryPreferenceOverrideSchema = z
  .object({
    overrideRef: z.string().min(1),
    owner: z
      .object({
        tenantRef: z.string().min(1),
        teacherRef: z.string().min(1)
      })
      .strict(),
    canonicalKey: z.string().min(1).max(80),
    preferenceKey: z.string().min(1).max(80),
    effect: TemporaryOverrideEffectSchema,
    canonicalValue: z.string().min(1).max(240).nullable(),
    displayValue: z.string().min(1).max(240),
    sourceTurnRef: z.string().min(1),
    sourceTurnSequence: z.number().int().positive(),
    sourceTurnContentHash: z.string().min(16),
    conversationRef: z.string().min(1),
    taskRef: z.string().min(1),
    courseRunRef: z.string().min(1),
    lessonRef: z.string().min(1),
    skillId: z.literal("lesson-preparation"),
    lifetime: TemporaryOverrideLifetimeSchema,
    validFromTurnSequence: z.number().int().positive(),
    expiresAt: z.string().datetime(),
    eligibleForConsolidation: z.literal(false),
    interpreterVersion: z.literal(
      "temporary-preference-override-interpreter@1"
    ),
    catalogVersion: z.literal("teacher-preference-catalog@1"),
    catalogContentHash: Sha256Schema,
    policyVersion: z.literal("temporary-preference-override-policy@1"),
    contentHash: Sha256Schema
  })
  .strict()
  .superRefine((override, context) => {
    if (
      override.effect === "replace_value" &&
      override.canonicalValue === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["canonicalValue"],
        message: "replace_value requires a canonical Catalog value."
      });
    }
    if (
      override.effect === "suppress_preference" &&
      override.canonicalValue !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["canonicalValue"],
        message: "suppress_preference cannot carry a replacement value."
      });
    }
  });

export const TemporaryOverrideInterpretationStatusSchema = z.enum([
  "none",
  "apply",
  "clear",
  "unsupported",
  "rejected"
]);

const TemporaryOverrideInterpretationBaseSchema = z
  .object({
    interpreterVersion: z.literal(
      "temporary-preference-override-interpreter@1"
    ),
    catalogVersion: z.literal("teacher-preference-catalog@1"),
    catalogContentHash: Sha256Schema,
    policyVersion: z.literal("temporary-preference-override-policy@1"),
    sourceTurnRef: z.string().min(1),
    sourceTurnSequence: z.number().int().positive(),
    sourceTurnContentHash: z.string().min(16),
    fullCoverageOfOverrideClause: z.boolean(),
    overrideItems: z.array(TemporaryPreferenceOverrideSchema).max(10),
    clearCanonicalKeys: z.array(z.string().min(1).max(80)).max(10),
    clearAll: z.boolean(),
    residualInstructionText: z.string().max(2000),
    temporaryMarker: z.string().min(1).max(40).nullable(),
    issues: z.array(z.string().min(1).max(120)).max(20)
  })
  .strict();

export const TemporaryPreferenceOverrideInterpretationSchema =
  z.discriminatedUnion("status", [
    TemporaryOverrideInterpretationBaseSchema.extend({
      status: z.literal("none")
    }).strict(),
    TemporaryOverrideInterpretationBaseSchema.extend({
      status: z.literal("apply")
    }).strict(),
    TemporaryOverrideInterpretationBaseSchema.extend({
      status: z.literal("clear")
    }).strict(),
    TemporaryOverrideInterpretationBaseSchema.extend({
      status: z.literal("unsupported")
    }).strict(),
    TemporaryOverrideInterpretationBaseSchema.extend({
      status: z.literal("rejected")
    }).strict()
  ]);

export const TemporaryOverrideReceiptSchema = z
  .object({
    status: z.enum(["applied", "cleared", "not_applied"]),
    items: z.array(TemporaryPreferenceOverrideSchema).max(10),
    clearedCanonicalKeys: z.array(z.string().min(1).max(80)).max(10),
    lifetime: TemporaryOverrideLifetimeSchema,
    longTermPreferenceChanged: z.literal(false),
    teacherMemoryEpochBefore: z.number().int().nonnegative(),
    teacherMemoryEpochAfter: z.number().int().nonnegative(),
    safeMessage: z.string().min(1).max(1000)
  })
  .strict()
  .superRefine((receipt, context) => {
    if (
      receipt.teacherMemoryEpochBefore !== receipt.teacherMemoryEpochAfter
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["teacherMemoryEpochAfter"],
        message: "Temporary overrides cannot change teacherMemoryEpoch."
      });
    }
  });

export type TemporaryOverrideEffect = z.infer<
  typeof TemporaryOverrideEffectSchema
>;
export type TemporaryOverrideLifetime = z.infer<
  typeof TemporaryOverrideLifetimeSchema
>;
export type TemporaryPreferenceOverride = z.infer<
  typeof TemporaryPreferenceOverrideSchema
>;
export type TemporaryPreferenceOverrideInterpretation = z.infer<
  typeof TemporaryPreferenceOverrideInterpretationSchema
>;
export type TemporaryOverrideReceipt = z.infer<
  typeof TemporaryOverrideReceiptSchema
>;

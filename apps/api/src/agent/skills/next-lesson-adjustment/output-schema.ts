import { z } from "zod";

import { NextLessonActionTypeSchema } from "@edu-agent/contracts";

export const nextLessonAdjustmentOutputSchemaRef =
  "next-lesson-action-candidates@1";

export const NextLessonAdjustmentSkillOutputSchema = z.object({
  schemaVersion: z.literal("next-lesson-action-candidates@1"),
  candidates: z.array(z.object({
    candidateKey: z.string().min(1),
    candidateType: NextLessonActionTypeSchema,
    title: z.string().min(1).max(300),
    reason: z.string().min(1).max(4_000),
    confidence: z.enum(["high", "medium", "low"]),
    targetLessonRef: z.string().min(1).nullable(),
    basisRefs: z.array(z.string().min(1)).min(1),
    teacherConfirmationRequired: z.literal(true)
  })).min(1).max(3),
  knownGaps: z.array(z.string().min(1)),
  teacherConfirmationRequired: z.literal(true)
});

export type NextLessonAdjustmentSkillOutput = z.infer<
  typeof NextLessonAdjustmentSkillOutputSchema
>;

import { z } from "zod";

import { ReflectionContentSchema } from "@edu-agent/contracts";

export const nextLessonAdjustmentInputSchemaRef =
  "next-lesson-adjustment-input@1";

export const NextLessonSourceSnapshotSchema = z.object({
  ref: z.string().min(1),
  version: z.string().min(1),
  contentHash: z.string().min(16),
  provenance: z.string().min(1)
});

const LessonSnapshotSchema = z.object({
  lessonRef: z.string().min(1),
  courseRunRef: z.string().min(1),
  title: z.string().min(1),
  sequence: z.number().int().positive(),
  learningObjectiveRefs: z.array(z.string().min(1)),
  source: NextLessonSourceSnapshotSchema
});

export const NextLessonAdjustmentSkillInputSchema = z.object({
  tenantRef: z.string().min(1),
  actorRef: z.string().min(1),
  sourceLesson: LessonSnapshotSchema,
  targetLesson: LessonSnapshotSchema,
  confirmedReflection: z.object({
    reflectionRef: z.string().min(1),
    reflectionRevisionRef: z.string().min(1),
    content: ReflectionContentSchema,
    source: NextLessonSourceSnapshotSchema
  }),
  confirmedDelivery: z.object({
    deliveryRevisionRef: z.string().min(1),
    actualStartAt: z.string().datetime(),
    actualEndAt: z.string().datetime(),
    unresolvedQuestions: z.array(z.string()),
    followUpNotes: z.string(),
    source: NextLessonSourceSnapshotSchema
  }),
  selectedEvidence: z.array(z.object({
    evidenceRef: z.string().min(1),
    objectiveRef: z.string().min(1),
    summary: z.string().min(1),
    source: NextLessonSourceSnapshotSchema
  })),
  confirmedPreferences: z.array(z.object({
    preferenceRef: z.string().min(1),
    preferenceKey: z.string().min(1),
    preferenceValue: z.string().min(1),
    version: z.number().int().positive(),
    source: NextLessonSourceSnapshotSchema
  })),
  authorizedEvidenceRefs: z.array(z.string().min(1)),
  excludedEvidenceRefs: z.array(z.string().min(1)),
  teacherAdjustment: z.string().trim().max(4_000).nullable(),
  generatedAt: z.string().datetime()
});

export type NextLessonAdjustmentSkillInput = z.infer<
  typeof NextLessonAdjustmentSkillInputSchema
>;

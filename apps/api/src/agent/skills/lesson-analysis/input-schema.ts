import { z } from "zod";

export const lessonAnalysisInputSchemaRef = "lesson-analysis-input@1";

const SourceSnapshotSchema = z.object({
  ref: z.string().min(1),
  version: z.string().min(1),
  contentHash: z.string().min(16),
  provenance: z.string().min(1)
});

export const LessonAnalysisSkillInputSchema = z.object({
  tenantRef: z.string().min(1),
  actorRef: z.string().min(1),
  lesson: z.object({
    lessonRef: z.string().min(1),
    courseRunRef: z.string().min(1),
    unitRef: z.string().min(1),
    title: z.string().min(1),
    durationMinutes: z.number().int().positive(),
    plannedAt: z.string().datetime().nullable(),
    source: SourceSnapshotSchema
  }),
  objectives: z.array(z.object({
    objectiveRef: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    source: SourceSnapshotSchema
  })),
  evidence: z.array(z.object({
    evidenceRef: z.string().min(1),
    evidenceType: z.enum(["observation", "claim"]),
    summary: z.string().min(1),
    objectiveRefs: z.array(z.string().min(1)),
    observedAt: z.string().datetime().nullable(),
    status: z.string().min(1),
    sourceRefs: z.array(z.string().min(1)).min(1),
    source: SourceSnapshotSchema
  })),
  approvedTeachingPlan: z.object({
    revisionRef: z.string().min(1),
    revisionNumber: z.number().int().positive(),
    objective: z.string().min(1),
    lessonFocus: z.string().min(1),
    supportStrategy: z.string().min(1),
    source: SourceSnapshotSchema
  }).nullable(),
  confirmedPreferences: z.array(z.object({
    preferenceRef: z.string().min(1),
    preferenceKey: z.string().min(1),
    preferenceValue: z.string().min(1),
    version: z.number().int().positive(),
    source: SourceSnapshotSchema
  })),
  authorizedEvidenceRefs: z.array(z.string().min(1)),
  excludedEvidenceRefs: z.array(z.string().min(1)),
  teacherAdjustment: z.string().min(1).max(500).nullable(),
  generatedAt: z.string().datetime()
});

export type LessonAnalysisSkillInput = z.infer<
  typeof LessonAnalysisSkillInputSchema
>;

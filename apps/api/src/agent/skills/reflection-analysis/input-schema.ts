import { z } from "zod";

import {
  ReflectionContentSchema,
  TeachingPlanSchema
} from "@edu-agent/contracts";

export const reflectionAnalysisInputSchemaRef = "reflection-analysis-input@1";

export const ReflectionSourceSnapshotSchema = z.object({
  ref: z.string().min(1),
  version: z.string().min(1),
  contentHash: z.string().min(16),
  provenance: z.string().min(1)
});

export const ReflectionAnalysisSkillInputSchema = z.object({
  tenantRef: z.string().min(1),
  actorRef: z.string().min(1),
  lesson: z.object({
    lessonRef: z.string().min(1),
    courseRunRef: z.string().min(1),
    title: z.string().min(1),
    learningObjectiveRefs: z.array(z.string().min(1)),
    source: ReflectionSourceSnapshotSchema
  }),
  approvedTeachingPlan: z.object({
    revisionRef: z.string().min(1),
    content: TeachingPlanSchema,
    source: ReflectionSourceSnapshotSchema
  }),
  confirmedDelivery: z.object({
    deliveryRevisionRef: z.string().min(1),
    actualStartAt: z.string().datetime(),
    actualEndAt: z.string().datetime(),
    steps: z.array(z.record(z.string(), z.unknown())),
    paceNotes: z.string(),
    unresolvedQuestions: z.array(z.string()),
    followUpNotes: z.string(),
    source: ReflectionSourceSnapshotSchema
  }),
  confirmedObservations: z.array(z.object({
    observationRevisionRef: z.string().min(1),
    scope: z.string().min(1),
    scopeRef: z.string().min(1).nullable(),
    observationType: z.string().min(1),
    content: z.string().min(1),
    observedAt: z.string().datetime(),
    source: ReflectionSourceSnapshotSchema
  })),
  selectedEvidence: z.array(z.object({
    evidenceRef: z.string().min(1),
    objectiveRef: z.string().min(1),
    summary: z.string().min(1),
    source: ReflectionSourceSnapshotSchema
  })),
  lessonBrief: z.object({
    briefRef: z.string().min(1),
    status: z.literal("adopted"),
    teachingFocus: z.array(z.string().min(1)),
    difficultyFocus: z.array(z.string().min(1)),
    attentionPoints: z.array(z.string().min(1)),
    knownGaps: z.array(z.string().min(1)),
    source: ReflectionSourceSnapshotSchema
  }).nullable(),
  currentReflectionDraft: ReflectionContentSchema,
  teacherAdjustment: z.string().trim().max(4_000).nullable(),
  authorizedEvidenceRefs: z.array(z.string().min(1)),
  excludedEvidenceRefs: z.array(z.string().min(1)),
  generatedAt: z.string().datetime()
});

export type ReflectionAnalysisSkillInput = z.infer<
  typeof ReflectionAnalysisSkillInputSchema
>;

export type ReflectionSourceSnapshot = z.infer<
  typeof ReflectionSourceSnapshotSchema
>;

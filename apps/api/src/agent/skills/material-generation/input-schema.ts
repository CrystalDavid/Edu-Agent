import { z } from "zod";

import {
  LessonBriefCandidateItemSchema,
  MaterialKindSchema,
  TeachingPlanSchema
} from "@edu-agent/contracts";

export const materialGenerationInputSchemaRef = "material-generation-input@1";

const SourceSnapshotSchema = z.object({
  ref: z.string().min(1),
  version: z.string().min(1),
  contentHash: z.string().min(16),
  provenance: z.string().min(1)
});

export const MaterialGenerationSkillInputSchema = z.object({
  tenantRef: z.string().min(1),
  actorRef: z.string().min(1),
  lesson: z.object({
    lessonRef: z.string().min(1),
    courseRunRef: z.string().min(1),
    unitRef: z.string().min(1),
    title: z.string().min(1),
    durationMinutes: z.number().int().positive(),
    source: SourceSnapshotSchema
  }),
  approvedTeachingPlan: z.object({
    artifactRef: z.string().min(1),
    revisionRef: z.string().min(1),
    revisionNumber: z.number().int().positive(),
    title: z.string().min(1),
    content: TeachingPlanSchema,
    source: SourceSnapshotSchema
  }),
  lessonBrief: z.object({
    agentRunRef: z.string().min(1),
    contentHash: z.string().min(16),
    selectedCandidateIds: z.array(z.string().min(1)).min(1),
    teachingFocus: z.array(LessonBriefCandidateItemSchema),
    difficultyFocus: z.array(LessonBriefCandidateItemSchema),
    attentionPoints: z.array(LessonBriefCandidateItemSchema),
    knownGaps: z.array(z.string().min(1)),
    source: SourceSnapshotSchema
  }).nullable(),
  evidence: z.array(z.object({
    evidenceRef: z.string().min(1),
    evidenceType: z.enum(["observation", "claim"]),
    summary: z.string().min(1),
    status: z.string().min(1),
    sourceRefs: z.array(z.string().min(1)).min(1),
    source: SourceSnapshotSchema
  })),
  confirmedPreferences: z.array(z.object({
    preferenceRef: z.string().min(1),
    preferenceKey: z.string().min(1),
    preferenceValue: z.string().min(1),
    version: z.number().int().positive(),
    source: SourceSnapshotSchema
  })),
  authorizedEvidenceRefs: z.array(z.string().min(1)),
  excludedEvidenceRefs: z.array(z.string().min(1)),
  requestedKinds: z.array(MaterialKindSchema).min(1).max(5),
  teacherAdjustment: z.string().trim().min(1).max(500).nullable(),
  generatedAt: z.string().datetime()
}).superRefine((value, context) => {
  if (new Set(value.requestedKinds).size !== value.requestedKinds.length) {
    context.addIssue({
      code: "custom",
      path: ["requestedKinds"],
      message: "requestedKinds must be unique"
    });
  }
});

export type MaterialGenerationSkillInput = z.infer<
  typeof MaterialGenerationSkillInputSchema
>;

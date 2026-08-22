import { z } from "zod";

import { TeachingPlanSchema } from "@edu-agent/contracts";

export const classroomReflectionInputSchemaRef = "classroom-reflection-input@1";

export const QuickClassroomOverallSchema = z.enum([
  "as_planned",
  "adjusted",
  "incomplete"
]);

export const QuickClassroomPaceSchema = z.enum([
  "on_pace",
  "slower",
  "faster"
]);

export const QuickClassroomStudentResponseSchema = z.enum([
  "attained",
  "partial_difficulty",
  "needs_review"
]);

export const QuickClassroomSectionSchema = z.enum([
  "opening",
  "explanation",
  "activity",
  "practice",
  "summary"
]);

const SourceSnapshotSchema = z.object({
  ref: z.string().min(1),
  version: z.string().min(1),
  contentHash: z.string().min(16),
  provenance: z.string().min(1)
});

const EvidenceSnapshotSchema = z.object({
  evidenceRef: z.string().min(1),
  evidenceType: z.enum(["observation", "claim"]),
  summary: z.string().min(1),
  status: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)),
  source: SourceSnapshotSchema
});

const ObservationDraftSnapshotSchema = z.object({
  observationRevisionRef: z.string().min(1),
  scope: z.enum([
    "class",
    "learning_objective",
    "learner",
    "activity",
    "assignment_item"
  ]),
  scopeRef: z.string().min(1).nullable(),
  observationType: z.enum([
    "achievement",
    "confusion",
    "timing",
    "engagement",
    "activity_effectiveness",
    "unresolved"
  ]),
  content: z.string().min(1),
  source: SourceSnapshotSchema
});

export const ClassroomReflectionSkillInputSchema = z.object({
  tenantRef: z.string().min(1),
  actorRef: z.string().min(1),
  lesson: z.object({
    lessonRef: z.string().min(1),
    courseRunRef: z.string().min(1),
    unitRef: z.string().min(1),
    title: z.string().min(1),
    plannedAt: z.string().datetime().nullable(),
    durationMinutes: z.number().int().positive(),
    learningObjectiveRefs: z.array(z.string().min(1)),
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
  teacherFeedback: z.object({
    overall: QuickClassroomOverallSchema,
    pace: QuickClassroomPaceSchema,
    studentResponse: QuickClassroomStudentResponseSchema,
    abnormalSections: z.array(QuickClassroomSectionSchema).max(5),
    note: z.string().trim().max(500).nullable()
  }).superRefine((value, context) => {
    if (new Set(value.abnormalSections).size !== value.abnormalSections.length) {
      context.addIssue({
        code: "custom",
        path: ["abnormalSections"],
        message: "abnormalSections must be unique"
      });
    }
  }),
  evidence: z.array(EvidenceSnapshotSchema),
  observationDrafts: z.array(ObservationDraftSnapshotSchema),
  confirmedPreferences: z.array(z.object({
    preferenceRef: z.string().min(1),
    preferenceKey: z.string().min(1),
    preferenceValue: z.string().min(1),
    version: z.number().int().positive(),
    source: SourceSnapshotSchema
  })),
  authorizedEvidenceRefs: z.array(z.string().min(1)),
  excludedEvidenceRefs: z.array(z.string().min(1)),
  generatedAt: z.string().datetime()
});

export type ClassroomReflectionSkillInput = z.infer<
  typeof ClassroomReflectionSkillInputSchema
>;

export type QuickClassroomSection = z.infer<
  typeof QuickClassroomSectionSchema
>;

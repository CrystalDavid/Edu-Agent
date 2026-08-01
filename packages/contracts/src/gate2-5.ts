import { z } from "zod";

import { TeachingPlanRevisionViewSchema } from "./gate2.js";

const lessonPreparationStatuses = [
  "planned",
  "in_progress",
  "awaiting_plan_review",
  "ready_for_use",
  "completed",
  "cancelled"
] as const;

export const LessonPreparationStatusSchema = z.enum(
  lessonPreparationStatuses
);

export const LessonPreparationPrioritySchema = z.enum([
  "low",
  "normal",
  "high"
]);

export const LessonPreparationProjectionStateSchema = z.enum([
  "not_started",
  ...lessonPreparationStatuses
]);

export const CourseRunViewSchema = z.object({
  courseRunRef: z.string().min(1),
  subject: z.string().min(1),
  gradeLevel: z.string().min(1),
  className: z.string().min(1),
  academicTerm: z.string().min(1),
  title: z.string().min(1)
});

export const CourseRunListSchema = z.object({
  items: z.array(CourseRunViewSchema)
});

export const CurriculumUnitViewSchema = z.object({
  unitRef: z.string().min(1),
  courseRunRef: z.string().min(1),
  sequence: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
  status: z.enum(["planned", "active", "completed"])
});

export const CurriculumUnitListSchema = z.object({
  items: z.array(CurriculumUnitViewSchema)
});

export const LearningObjectiveSummarySchema = z.object({
  objectiveRef: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1)
});

export const LessonViewSchema = z.object({
  lessonRef: z.string().min(1),
  unitRef: z.string().min(1),
  courseRunRef: z.string().min(1),
  sequence: z.number().int().positive(),
  title: z.string().min(1),
  plannedAt: z.string().datetime().nullable(),
  durationMinutes: z.number().int().positive(),
  preparationState: LessonPreparationProjectionStateSchema,
  learningObjectives: z.array(LearningObjectiveSummarySchema),
  currentEvidenceRefs: z.array(z.string().min(1)),
  currentApprovedPlanRef: z.string().min(1).nullable(),
  activePreparationTaskRef: z.string().min(1).nullable()
});

export const LessonListSchema = z.object({
  items: z.array(LessonViewSchema)
});

export const TaskWorkingSetSchema = z.object({
  taskRef: z.string().min(1),
  version: z.number().int().positive(),
  courseRunRef: z.string().min(1),
  curriculumUnitRef: z.string().min(1),
  lessonRef: z.string().min(1),
  learningObjectiveRefs: z.array(z.string().min(1)).min(1),
  evidenceRefs: z.array(z.string().min(1)),
  baselineTeachingPlanRef: z.string().min(1).nullable(),
  sourceLessonRef: z.string().min(1).nullable().optional(),
  sourceAssignmentRef: z.string().min(1).nullable().optional(),
  sourceAssignmentItemRefs: z.array(z.string().min(1)).optional(),
  purpose: z.string().min(1),
  requestedFieldMask: z.array(z.string().min(1)).min(1),
  updatedAt: z.string().datetime()
});

export const LessonPreparationHistoryEntrySchema = z.object({
  historyRef: z.string().min(1),
  taskRef: z.string().min(1),
  fromStatus: LessonPreparationStatusSchema.nullable(),
  toStatus: LessonPreparationStatusSchema,
  taskVersion: z.number().int().positive(),
  reason: z.string().min(1),
  actorRef: z.string().min(1),
  occurredAt: z.string().datetime()
});

export const LessonPreparationTaskSummarySchema = z.object({
  taskRef: z.string().min(1),
  taskType: z.literal("lesson_preparation"),
  title: z.string().min(1),
  status: LessonPreparationStatusSchema,
  version: z.number().int().positive(),
  courseRunRef: z.string().min(1),
  curriculumUnitRef: z.string().min(1),
  lessonRef: z.string().min(1),
  lessonTitle: z.string().min(1),
  dueAt: z.string().datetime().nullable(),
  priority: LessonPreparationPrioritySchema,
  approvedPlanRef: z.string().min(1).nullable(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const LessonPreparationTaskDetailSchema =
  LessonPreparationTaskSummarySchema.extend({
    workingSet: TaskWorkingSetSchema,
    history: z.array(LessonPreparationHistoryEntrySchema),
    latestProposalRevisionRef: z.string().min(1).nullable(),
    latestTaskRunRef: z.string().min(1).nullable()
  });

export const LessonPreparationTaskListSchema = z.object({
  items: z.array(LessonPreparationTaskSummarySchema)
});

export const CreateLessonPreparationTaskRequestSchema = z.object({
  lessonRef: z.string().min(1),
  dueAt: z.string().datetime().nullable().default(null),
  priority: LessonPreparationPrioritySchema.default("normal"),
  purpose: z.literal("lesson-preparation.create"),
  idempotencyKey: z.string().min(8)
});

export const LessonPreparationTaskActionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  purpose: z.enum([
    "lesson-preparation.start",
    "lesson-preparation.reopen",
    "lesson-preparation.complete",
    "lesson-preparation.cancel"
  ]),
  idempotencyKey: z.string().min(8)
});

export const LessonPreparationTaskResultSchema = z.object({
  replayed: z.boolean(),
  task: LessonPreparationTaskDetailSchema
});

export const TaskResourceSelectionRequestSchema = z.object({
  resourceKind: z.enum(["evidence"]),
  resourceRef: z.string().min(1),
  expectedWorkingSetVersion: z.number().int().positive(),
  purpose: z.enum([
    "lesson-preparation.context.add",
    "lesson-preparation.context.remove"
  ]),
  idempotencyKey: z.string().min(8)
});

export const TaskWorkingSetResultSchema = z.object({
  replayed: z.boolean(),
  workingSet: TaskWorkingSetSchema
});

export const AuthorizedContextPlanSchema = z.object({
  authorizedContextPlanRef: z.string().min(1),
  taskRef: z.string().min(1),
  taskRunRef: z.string().min(1),
  workingSetVersion: z.number().int().positive(),
  authorizedResourceRefs: z.array(z.string().min(1)),
  authorizedEvidenceRefs: z.array(z.string().min(1)),
  deniedResourceRefs: z.array(z.string().min(1)),
  requestedFieldMask: z.array(z.string().min(1)).min(1),
  authorizationDecisionRef: z.string().min(1),
  contentHash: z.string().min(1),
  resolvedAt: z.string().datetime()
});

export const SealedContextManifestSchema = z.object({
  contextManifestRef: z.string().min(1),
  agentRunRef: z.string().min(1),
  taskRef: z.string().min(1),
  authorizedContextPlanRef: z.string().min(1),
  resourceRefs: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)),
  unknowns: z.array(z.string().min(1)),
  requestedFieldMask: z.array(z.string().min(1)).min(1),
  requestVersion: z.number().int().positive(),
  sealedAt: z.string().datetime()
});

export const LessonPreparationSummarySchema = z.object({
  incompleteTasks: z.array(LessonPreparationTaskSummarySchema),
  awaitingPlanReview: z.array(LessonPreparationTaskSummarySchema),
  readyForUse: z.array(LessonPreparationTaskSummarySchema),
  recentLessons: z.array(LessonViewSchema),
  generatedAt: z.string().datetime()
});

export const LessonTeachingPlanStateSchema = z.object({
  lessonRef: z.string().min(1),
  preparationTaskRef: z.string().min(1).nullable(),
  currentApproved: TeachingPlanRevisionViewSchema.nullable(),
  activeInReview: TeachingPlanRevisionViewSchema.nullable(),
  drafts: z.array(TeachingPlanRevisionViewSchema),
  superseded: z.array(TeachingPlanRevisionViewSchema),
  history: z.array(TeachingPlanRevisionViewSchema)
});

export type LessonPreparationStatus = z.infer<
  typeof LessonPreparationStatusSchema
>;
export type CourseRunView = z.infer<typeof CourseRunViewSchema>;
export type CurriculumUnitView = z.infer<
  typeof CurriculumUnitViewSchema
>;
export type LessonView = z.infer<typeof LessonViewSchema>;
export type TaskWorkingSet = z.infer<typeof TaskWorkingSetSchema>;
export type LessonPreparationTaskSummary = z.infer<
  typeof LessonPreparationTaskSummarySchema
>;
export type LessonPreparationTaskDetail = z.infer<
  typeof LessonPreparationTaskDetailSchema
>;
export type LessonPreparationSummary = z.infer<
  typeof LessonPreparationSummarySchema
>;
export type CreateLessonPreparationTaskRequest = z.infer<
  typeof CreateLessonPreparationTaskRequestSchema
>;
export type LessonPreparationTaskActionRequest = z.infer<
  typeof LessonPreparationTaskActionRequestSchema
>;
export type TaskResourceSelectionRequest = z.infer<
  typeof TaskResourceSelectionRequestSchema
>;
export type AuthorizedContextPlan = z.infer<
  typeof AuthorizedContextPlanSchema
>;
export type LessonTeachingPlanState = z.infer<
  typeof LessonTeachingPlanStateSchema
>;

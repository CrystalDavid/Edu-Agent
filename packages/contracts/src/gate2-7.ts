import { z } from "zod";

import { LessonPreparationTaskDetailSchema } from "./gate2-5.js";

export const AssignmentStatusSchema = z.enum([
  "draft",
  "published",
  "closed",
  "archived"
]);

export const AssignmentItemTypeSchema = z.enum([
  "multiple_choice",
  "numeric",
  "short_answer"
]);

export const GradeOutcomeSchema = z.enum([
  "correct",
  "partial",
  "incorrect"
]);

export const GradeDecisionStatusSchema = z.enum([
  "draft",
  "confirmed",
  "superseded"
]);

export const AssignmentOptionSchema = z.object({
  key: z.string().min(1).max(20),
  text: z.string().min(1).max(500)
});

export const AssignmentAnswerKeySchema = z.object({
  choiceKey: z.string().min(1).max(20).optional(),
  numericValue: z.number().finite().optional(),
  tolerance: z.number().nonnegative().optional(),
  referenceAnswer: z.string().min(1).max(2_000).optional()
});

export const AssignmentItemInputSchema = z.object({
  itemRef: z.string().min(1).optional(),
  sequence: z.number().int().positive(),
  itemType: AssignmentItemTypeSchema,
  prompt: z.string().min(1).max(4_000),
  maxScore: z.number().positive().max(100),
  options: z.array(AssignmentOptionSchema).max(12).default([]),
  answerKey: AssignmentAnswerKeySchema,
  gradingCriteria: z.string().max(2_000).default(""),
  objectiveRef: z.string().min(1)
});

export const AssignmentItemViewSchema = AssignmentItemInputSchema.extend({
  itemRef: z.string().min(1),
  assignmentVersionRef: z.string().min(1)
});

export const AssignmentVersionViewSchema = z.object({
  assignmentVersionRef: z.string().min(1),
  assignmentRef: z.string().min(1),
  versionNumber: z.number().int().positive(),
  title: z.string().min(1),
  instructions: z.string().max(8_000),
  dueAt: z.string().datetime().nullable(),
  items: z.array(AssignmentItemViewSchema),
  objectiveRefs: z.array(z.string().min(1)),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime()
});

export const AssignmentSummarySchema = z.object({
  assignmentRef: z.string().min(1),
  tenantRef: z.string().min(1),
  courseRunRef: z.string().min(1),
  curriculumUnitRef: z.string().min(1),
  lessonRef: z.string().min(1),
  lessonTitle: z.string().min(1),
  title: z.string().min(1),
  status: AssignmentStatusSchema,
  version: z.number().int().positive(),
  currentVersionNumber: z.number().int().positive(),
  dueAt: z.string().datetime().nullable(),
  itemCount: z.number().int().nonnegative(),
  enrolledCount: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
  confirmedGradeCount: z.number().int().nonnegative(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const AssignmentDetailSchema = AssignmentSummarySchema.extend({
  currentVersion: AssignmentVersionViewSchema,
  versionHistory: z.array(AssignmentVersionViewSchema)
});

export const AssignmentListSchema = z.object({
  items: z.array(AssignmentSummarySchema)
});

export const CreateAssignmentRequestSchema = z.object({
  courseRunRef: z.string().min(1),
  curriculumUnitRef: z.string().min(1),
  lessonRef: z.string().min(1),
  title: z.string().min(1).max(300),
  instructions: z.string().max(8_000).default(""),
  dueAt: z.string().datetime().nullable().default(null),
  items: z.array(AssignmentItemInputSchema).min(1).max(50),
  purpose: z.literal("assignment.create"),
  idempotencyKey: z.string().min(8)
});

export const UpdateAssignmentDraftRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().min(1).max(300),
  instructions: z.string().max(8_000),
  dueAt: z.string().datetime().nullable(),
  items: z.array(AssignmentItemInputSchema).min(1).max(50),
  purpose: z.literal("assignment.update-draft"),
  idempotencyKey: z.string().min(8)
});

export const AssignmentActionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  purpose: z.enum([
    "assignment.publish",
    "assignment.close",
    "assignment.archive"
  ]),
  idempotencyKey: z.string().min(8)
});

export const AssignmentResultSchema = z.object({
  replayed: z.boolean(),
  assignment: AssignmentDetailSchema
});

export const CourseRunEnrollmentSchema = z.object({
  enrollmentRef: z.string().min(1),
  courseRunRef: z.string().min(1),
  learnerRef: z.string().min(1),
  displayName: z.string().min(1),
  status: z.enum(["active", "withdrawn"]),
  synthetic: z.boolean(),
  enrolledAt: z.string().datetime()
});

export const CourseRunEnrollmentListSchema = z.object({
  items: z.array(CourseRunEnrollmentSchema)
});

export const ItemResponseViewSchema = z.object({
  responseRef: z.string().min(1),
  attemptRef: z.string().min(1),
  itemRef: z.string().min(1),
  responseValue: z.record(z.string(), z.unknown()),
  submittedAt: z.string().datetime()
});

export const SubmissionAttemptViewSchema = z.object({
  attemptRef: z.string().min(1),
  submissionRef: z.string().min(1),
  assignmentVersionRef: z.string().min(1),
  attemptNumber: z.number().int().positive(),
  submittedAt: z.string().datetime(),
  isCurrent: z.boolean(),
  itemResponses: z.array(ItemResponseViewSchema)
});

export const SubmissionSummarySchema = z.object({
  submissionRef: z.string().min(1).nullable(),
  assignmentRef: z.string().min(1),
  learnerRef: z.string().min(1),
  displayName: z.string().min(1),
  submissionState: z.enum(["not_submitted", "submitted", "graded"]),
  latestAttemptRef: z.string().min(1).nullable(),
  attemptCount: z.number().int().nonnegative(),
  submittedAt: z.string().datetime().nullable(),
  gradeDecisionRef: z.string().min(1).nullable(),
  gradeStatus: GradeDecisionStatusSchema.nullable(),
  score: z.number().nonnegative().nullable(),
  maxScore: z.number().positive().nullable()
});

export const SubmissionListSchema = z.object({
  items: z.array(SubmissionSummarySchema)
});

export const SubmissionDetailSchema = SubmissionSummarySchema.extend({
  attempts: z.array(SubmissionAttemptViewSchema)
});

export const SyntheticSubmissionImportRequestSchema = z.object({
  purpose: z.literal("assignment.synthetic-submissions.import"),
  idempotencyKey: z.string().min(8)
});

export const SyntheticSubmissionImportResultSchema = z.object({
  replayed: z.boolean(),
  assignmentRef: z.string().min(1),
  enrolledCount: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
  notSubmittedCount: z.number().int().nonnegative()
});

export const TeacherItemGradeInputSchema = z.object({
  responseRef: z.string().min(1),
  outcome: GradeOutcomeSchema,
  awardedScore: z.number().nonnegative(),
  feedback: z.string().max(2_000).default("")
});

export const TeacherItemGradeViewSchema = TeacherItemGradeInputSchema.extend({
  itemGradeRef: z.string().min(1),
  gradeDecisionRef: z.string().min(1),
  suggestionSource: z.enum(["deterministic", "teacher"])
});

export const TeacherGradeDecisionViewSchema = z.object({
  gradeDecisionRef: z.string().min(1),
  attemptRef: z.string().min(1),
  version: z.number().int().positive(),
  status: GradeDecisionStatusSchema,
  totalScore: z.number().nonnegative(),
  maxScore: z.number().positive(),
  feedback: z.string(),
  previousDecisionRef: z.string().min(1).nullable(),
  itemGrades: z.array(TeacherItemGradeViewSchema),
  confirmedAt: z.string().datetime().nullable(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const SaveGradeDraftRequestSchema = z.object({
  expectedAttemptRef: z.string().min(1),
  expectedDecisionVersion: z.number().int().nonnegative(),
  feedback: z.string().max(4_000).default(""),
  itemGrades: z.array(TeacherItemGradeInputSchema).min(1),
  purpose: z.literal("assignment.grading.save-draft"),
  idempotencyKey: z.string().min(8)
});

export const ConfirmGradeRequestSchema = z.object({
  expectedDecisionVersion: z.number().int().positive(),
  purpose: z.literal("assignment.grading.confirm"),
  idempotencyKey: z.string().min(8)
});

export const ReopenGradeRequestSchema = z.object({
  expectedDecisionVersion: z.number().int().positive(),
  purpose: z.literal("assignment.grading.reopen"),
  idempotencyKey: z.string().min(8)
});

export const GradeDecisionResultSchema = z.object({
  replayed: z.boolean(),
  decision: TeacherGradeDecisionViewSchema
});

export const GradeDecisionHistorySchema = z.object({
  items: z.array(TeacherGradeDecisionViewSchema)
});

export const GradingQueueSchema = z.object({
  items: z.array(SubmissionSummarySchema),
  pendingCount: z.number().int().nonnegative(),
  confirmedCount: z.number().int().nonnegative()
});

export const EvidenceObservationSourceSchema = z.object({
  observationRef: z.string().min(1),
  learnerRef: z.string().min(1),
  displayName: z.string().min(1),
  courseRunRef: z.string().min(1),
  lessonRef: z.string().min(1),
  objectiveRef: z.string().min(1),
  assignmentRef: z.string().min(1),
  assignmentVersionRef: z.string().min(1),
  itemRef: z.string().min(1),
  attemptRef: z.string().min(1),
  responseRef: z.string().min(1),
  gradeDecisionRef: z.string().min(1),
  outcome: GradeOutcomeSchema,
  awardedScore: z.number().nonnegative(),
  maxScore: z.number().positive(),
  confirmationStatus: z.literal("teacher_confirmed"),
  supersedesObservationRef: z.string().min(1).nullable(),
  isCurrent: z.boolean(),
  observedAt: z.string().datetime()
});

export const EvidenceObservationSourceListSchema = z.object({
  items: z.array(EvidenceObservationSourceSchema)
});

export const ItemPerformanceSchema = z.object({
  itemRef: z.string().min(1),
  sequence: z.number().int().positive(),
  prompt: z.string().min(1),
  objectiveRef: z.string().min(1),
  confirmedCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  partialCount: z.number().int().nonnegative(),
  incorrectCount: z.number().int().nonnegative(),
  averageScoreRate: z.number().min(0).max(1).nullable(),
  evidenceRefs: z.array(z.string().min(1))
});

export const ObjectivePerformanceSchema = z.object({
  objectiveRef: z.string().min(1),
  objectiveTitle: z.string().min(1),
  confirmedResponseCount: z.number().int().nonnegative(),
  averageScoreRate: z.number().min(0).max(1).nullable(),
  evidenceRefs: z.array(z.string().min(1))
});

export const CommonErrorSchema = z.object({
  errorRef: z.string().min(1),
  itemRef: z.string().min(1),
  itemSequence: z.number().int().positive(),
  objectiveRef: z.string().min(1),
  summary: z.string().min(1),
  affectedLearnerCount: z.number().int().nonnegative(),
  evidenceRefs: z.array(z.string().min(1))
});

export const AssignmentAnalyticsSchema = z.object({
  assignmentRef: z.string().min(1),
  enrolledCount: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
  notSubmittedCount: z.number().int().nonnegative(),
  confirmedGradeCount: z.number().int().nonnegative(),
  averageScore: z.number().nonnegative().nullable(),
  medianScore: z.number().nonnegative().nullable(),
  maxScore: z.number().positive().nullable(),
  itemPerformance: z.array(ItemPerformanceSchema),
  objectivePerformance: z.array(ObjectivePerformanceSchema),
  commonErrors: z.array(CommonErrorSchema),
  generatedAt: z.string().datetime()
});

export const LearnerRecentEvidenceSchema = z.object({
  enrollment: CourseRunEnrollmentSchema,
  recentAssignments: z.array(SubmissionSummarySchema),
  evidence: z.array(EvidenceObservationSourceSchema),
  needsTeacherReview: z.array(z.string().min(1))
});

export const CreateAdjustmentTaskRequestSchema = z.object({
  assignmentRef: z.string().min(1),
  sourceLessonRef: z.string().min(1),
  targetLessonRef: z.string().min(1),
  selectedEvidenceRefs: z.array(z.string().min(1)).min(1).max(50),
  selectedItemRefs: z.array(z.string().min(1)).min(1).max(50),
  dueAt: z.string().datetime().nullable().default(null),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  purpose: z.literal("assignment.adjust-next-lesson"),
  idempotencyKey: z.string().min(8)
});

export const AdjustmentTaskResultSchema = z.object({
  replayed: z.boolean(),
  task: LessonPreparationTaskDetailSchema
});

export const TeacherAssignmentOverviewSchema = z.object({
  draftCount: z.number().int().nonnegative(),
  publishedCount: z.number().int().nonnegative(),
  pendingGradingCount: z.number().int().nonnegative(),
  notSubmittedCount: z.number().int().nonnegative(),
  recentlyConfirmed: z.array(SubmissionSummarySchema),
  adjustmentCandidates: z.array(CommonErrorSchema),
  generatedAt: z.string().datetime()
});

export type AssignmentStatus = z.infer<typeof AssignmentStatusSchema>;
export type AssignmentItemInput = z.infer<typeof AssignmentItemInputSchema>;
export type AssignmentItemView = z.infer<typeof AssignmentItemViewSchema>;
export type AssignmentVersionView = z.infer<typeof AssignmentVersionViewSchema>;
export type AssignmentSummary = z.infer<typeof AssignmentSummarySchema>;
export type AssignmentDetail = z.infer<typeof AssignmentDetailSchema>;
export type CourseRunEnrollment = z.infer<typeof CourseRunEnrollmentSchema>;
export type SubmissionSummary = z.infer<typeof SubmissionSummarySchema>;
export type SubmissionDetail = z.infer<typeof SubmissionDetailSchema>;
export type TeacherItemGradeInput = z.infer<typeof TeacherItemGradeInputSchema>;
export type TeacherGradeDecisionView = z.infer<typeof TeacherGradeDecisionViewSchema>;
export type AssignmentAnalytics = z.infer<typeof AssignmentAnalyticsSchema>;
export type EvidenceObservationSource = z.infer<typeof EvidenceObservationSourceSchema>;
export type CreateAdjustmentTaskRequest = z.infer<typeof CreateAdjustmentTaskRequestSchema>;
export type TeacherAssignmentOverview = z.infer<typeof TeacherAssignmentOverviewSchema>;
export type CreateAssignmentRequest = z.infer<typeof CreateAssignmentRequestSchema>;
export type UpdateAssignmentDraftRequest = z.infer<typeof UpdateAssignmentDraftRequestSchema>;
export type AssignmentActionRequest = z.infer<typeof AssignmentActionRequestSchema>;
export type SyntheticSubmissionImportRequest = z.infer<typeof SyntheticSubmissionImportRequestSchema>;
export type SaveGradeDraftRequest = z.infer<typeof SaveGradeDraftRequestSchema>;
export type ConfirmGradeRequest = z.infer<typeof ConfirmGradeRequestSchema>;
export type ReopenGradeRequest = z.infer<typeof ReopenGradeRequestSchema>;
export type LearnerRecentEvidence = z.infer<typeof LearnerRecentEvidenceSchema>;

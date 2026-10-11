import { z } from "zod";

import { AssignmentItemInputSchema } from "./gate2-7.js";

export const LessonDeliveryStatusSchema = z.enum([
  "draft",
  "confirmed",
  "superseded"
]);

export const DeliveryStepDispositionSchema = z.enum([
  "adopted",
  "adjusted",
  "skipped",
  "added"
]);

export const DeliveryStepInputSchema = z.object({
  stepKey: z.string().min(1).max(120),
  sequence: z.number().int().positive(),
  title: z.string().min(1).max(240),
  plannedDescription: z.string().max(2_000).default(""),
  actualDescription: z.string().min(1).max(4_000),
  disposition: DeliveryStepDispositionSchema,
  rationale: z.string().max(2_000).default("")
});

export const LessonDeliveryRevisionSchema = z.object({
  deliveryRevisionRef: z.string().min(1),
  deliveryRef: z.string().min(1),
  revisionNumber: z.number().int().positive(),
  revisionVersion: z.number().int().positive(),
  status: LessonDeliveryStatusSchema,
  tenantRef: z.string().min(1),
  courseRunRef: z.string().min(1),
  lessonRef: z.string().min(1),
  lessonTitle: z.string().min(1),
  teacherRef: z.string().min(1),
  teachingPlanRevisionRef: z.string().min(1),
  calendarEventRef: z.string().min(1).nullable(),
  actualStartAt: z.string().datetime(),
  actualEndAt: z.string().datetime(),
  steps: z.array(DeliveryStepInputSchema).min(1),
  paceNotes: z.string().max(4_000),
  unresolvedQuestions: z.array(z.string().min(1).max(1_000)),
  followUpNotes: z.string().max(4_000),
  parentRevisionRef: z.string().min(1).nullable(),
  confirmedBy: z.string().min(1).nullable(),
  confirmedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const LessonDeliveryDetailSchema = z.object({
  deliveryRef: z.string().min(1),
  aggregateVersion: z.number().int().positive(),
  currentDraft: LessonDeliveryRevisionSchema.nullable(),
  currentConfirmed: LessonDeliveryRevisionSchema.nullable(),
  history: z.array(LessonDeliveryRevisionSchema)
});

const DeliveryContentSchema = z.object({
  teachingPlanRevisionRef: z.string().min(1),
  calendarEventRef: z.string().min(1).nullable().default(null),
  actualStartAt: z.string().datetime(),
  actualEndAt: z.string().datetime(),
  steps: z.array(DeliveryStepInputSchema).min(1),
  paceNotes: z.string().max(4_000).default(""),
  unresolvedQuestions: z.array(z.string().min(1).max(1_000)).default([]),
  followUpNotes: z.string().max(4_000).default("")
});

export const CreateLessonDeliveryRequestSchema = DeliveryContentSchema.extend({
  courseRunRef: z.string().min(1),
  lessonRef: z.string().min(1),
  purpose: z.literal("lesson-delivery.create"),
  idempotencyKey: z.string().min(8)
}).refine((value) => new Date(value.actualEndAt) > new Date(value.actualStartAt), {
  message: "actualEndAt must be after actualStartAt",
  path: ["actualEndAt"]
});

export const UpdateLessonDeliveryDraftRequestSchema = DeliveryContentSchema.extend({
  expectedRevisionVersion: z.number().int().positive(),
  purpose: z.literal("lesson-delivery.update-draft"),
  idempotencyKey: z.string().min(8)
}).refine((value) => new Date(value.actualEndAt) > new Date(value.actualStartAt), {
  message: "actualEndAt must be after actualStartAt",
  path: ["actualEndAt"]
});

export const ConfirmLessonDeliveryRequestSchema = z.object({
  expectedRevisionVersion: z.number().int().positive(),
  purpose: z.literal("lesson-delivery.confirm"),
  idempotencyKey: z.string().min(8)
});

export const AmendLessonDeliveryRequestSchema = DeliveryContentSchema.extend({
  parentRevisionRef: z.string().min(1),
  expectedAggregateVersion: z.number().int().positive(),
  purpose: z.literal("lesson-delivery.amend"),
  idempotencyKey: z.string().min(8)
}).refine((value) => new Date(value.actualEndAt) > new Date(value.actualStartAt), {
  message: "actualEndAt must be after actualStartAt",
  path: ["actualEndAt"]
});

export const LessonDeliveryMutationResultSchema = z.object({
  replayed: z.boolean(),
  delivery: LessonDeliveryDetailSchema
});

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

export const GenerateClassroomFeedbackRequestSchema = z.object({
  courseRunRef: z.string().min(1),
  lessonRef: z.string().min(1),
  expectedApprovedTeachingPlanRevisionRef: z.string().min(1),
  overall: QuickClassroomOverallSchema,
  pace: QuickClassroomPaceSchema,
  studentResponse: QuickClassroomStudentResponseSchema,
  abnormalSections: z.array(QuickClassroomSectionSchema).max(5),
  note: z.string().trim().max(500).nullable().default(null),
  purpose: z.literal("lesson-delivery.quick-feedback.generate"),
  idempotencyKey: z.string().min(8)
}).superRefine((value, context) => {
  if (new Set(value.abnormalSections).size !== value.abnormalSections.length) {
    context.addIssue({
      code: "custom",
      path: ["abnormalSections"],
      message: "abnormalSections must be unique"
    });
  }
});

export const ClassroomFeedbackObservationCandidateSchema = z.object({
  candidateId: z.string().min(1),
  status: z.literal("candidate"),
  scope: z.enum(["class", "activity"]),
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
  basisRefs: z.array(z.string().min(1)).min(1),
  confidence: z.literal("teacher_signal"),
  teacherConfirmationRequired: z.literal(true)
});

export const ClassroomFeedbackReflectionInputSchema = z.object({
  plannedVsImplemented: z.array(z.string().min(1)),
  effectiveSegments: z.array(z.string().min(1)),
  uncertainQuestions: z.array(z.string().min(1)),
  suggestedNextActions: z.array(z.string().min(1))
});

export const ClassroomFeedbackRunViewSchema = z.object({
  agentRunRef: z.string().min(1),
  contextManifestRef: z.string().min(1),
  contextManifestHash: z.string().min(16),
  skillRef: z.literal("classroom-reflection@1"),
  lessonRef: z.string().min(1),
  teachingPlanRevisionRef: z.string().min(1),
  deliverySummary: z.string().min(1),
  observationCandidates: z.array(ClassroomFeedbackObservationCandidateSchema),
  reflectionInput: ClassroomFeedbackReflectionInputSchema,
  knownGaps: z.array(z.string().min(1)).min(1),
  createdAt: z.string().datetime()
});

export const GenerateClassroomFeedbackResultSchema =
  ClassroomFeedbackRunViewSchema.extend({
    replayed: z.boolean(),
    delivery: LessonDeliveryDetailSchema
  });

export const LatestClassroomFeedbackResultSchema = z.object({
  item: ClassroomFeedbackRunViewSchema.nullable()
});

export const ObservedPedagogicalMoveSchema = z.object({
  moveRef: z.string().min(1),
  deliveryRevisionRef: z.string().min(1),
  stepKey: z.string().min(1),
  sequence: z.number().int().positive(),
  title: z.string().min(1),
  disposition: DeliveryStepDispositionSchema,
  actualDescription: z.string().min(1),
  observedAt: z.string().datetime(),
  confirmedBy: z.string().min(1)
});

export const InstructionalDecisionSchema = z.object({
  decisionRef: z.string().min(1),
  moveRef: z.string().min(1),
  decisionType: z.enum(["adjusted", "skipped", "added"]),
  rationale: z.string().min(1),
  decidedAt: z.string().datetime(),
  decidedBy: z.string().min(1)
});

export const ClassroomObservationStatusSchema = z.enum([
  "draft",
  "confirmed",
  "superseded"
]);

export const ClassroomObservationScopeSchema = z.enum([
  "class",
  "learning_objective",
  "learner",
  "activity",
  "assignment_item"
]);

export const ClassroomObservationTypeSchema = z.enum([
  "achievement",
  "confusion",
  "timing",
  "engagement",
  "activity_effectiveness",
  "unresolved"
]);

export const ClassroomObservationRevisionSchema = z.object({
  observationRevisionRef: z.string().min(1),
  observationRef: z.string().min(1),
  revisionNumber: z.number().int().positive(),
  revisionVersion: z.number().int().positive(),
  status: ClassroomObservationStatusSchema,
  tenantRef: z.string().min(1),
  courseRunRef: z.string().min(1),
  lessonRef: z.string().min(1),
  deliveryRevisionRef: z.string().min(1),
  scope: ClassroomObservationScopeSchema,
  scopeRef: z.string().min(1).nullable(),
  observationType: ClassroomObservationTypeSchema,
  content: z.string().min(1).max(4_000),
  observedAt: z.string().datetime(),
  teacherRef: z.string().min(1),
  parentRevisionRef: z.string().min(1).nullable(),
  confirmedBy: z.string().min(1).nullable(),
  confirmedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const ClassroomObservationDetailSchema = z.object({
  observationRef: z.string().min(1),
  aggregateVersion: z.number().int().positive(),
  currentDraft: ClassroomObservationRevisionSchema.nullable(),
  currentConfirmed: ClassroomObservationRevisionSchema.nullable(),
  history: z.array(ClassroomObservationRevisionSchema)
});

const ObservationContentSchema = z.object({
  deliveryRevisionRef: z.string().min(1),
  scope: ClassroomObservationScopeSchema,
  scopeRef: z.string().min(1).nullable().default(null),
  observationType: ClassroomObservationTypeSchema,
  content: z.string().min(1).max(4_000),
  observedAt: z.string().datetime()
});

export const CreateClassroomObservationRequestSchema = ObservationContentSchema.extend({
  courseRunRef: z.string().min(1),
  lessonRef: z.string().min(1),
  purpose: z.literal("classroom-observation.create"),
  idempotencyKey: z.string().min(8)
});

export const UpdateClassroomObservationDraftRequestSchema = ObservationContentSchema.extend({
  expectedRevisionVersion: z.number().int().positive(),
  purpose: z.literal("classroom-observation.update-draft"),
  idempotencyKey: z.string().min(8)
});

export const ConfirmClassroomObservationRequestSchema = z.object({
  expectedRevisionVersion: z.number().int().positive(),
  purpose: z.literal("classroom-observation.confirm"),
  idempotencyKey: z.string().min(8)
});

export const SupersedeClassroomObservationRequestSchema = ObservationContentSchema.extend({
  parentRevisionRef: z.string().min(1),
  expectedAggregateVersion: z.number().int().positive(),
  purpose: z.literal("classroom-observation.supersede"),
  idempotencyKey: z.string().min(8)
});

export const ClassroomObservationMutationResultSchema = z.object({
  replayed: z.boolean(),
  observation: ClassroomObservationDetailSchema
});

export const ClassroomObservationListQuerySchema = z.object({
  lessonRef: z.string().min(1),
  objectiveRef: z.string().min(1).optional(),
  learnerRef: z.string().min(1).optional()
});

export const ClassroomObservationListSchema = z.object({
  items: z.array(ClassroomObservationRevisionSchema)
});

export const ReflectionStatusSchema = z.enum([
  "draft",
  "confirmed",
  "superseded"
]);

export const ReflectionContentSchema = z.object({
  objectiveAttainment: z.string().min(1).max(4_000),
  plannedVsImplemented: z.string().min(1).max(4_000),
  effectiveMoves: z.array(z.string().min(1).max(1_000)),
  ineffectiveMoves: z.array(z.string().min(1).max(1_000)),
  observationSummary: z.array(z.string().min(1).max(1_000)),
  evidenceAlignment: z.array(z.string().min(1).max(1_000)),
  uncertainties: z.array(z.string().min(1).max(1_000)),
  nextLessonSuggestions: z.array(z.string().min(1).max(1_000)),
  assignmentSuggestions: z.array(z.string().min(1).max(1_000)),
  teacherNotes: z.string().max(4_000)
});

export const StructuredReflectionOutputSchema = ReflectionContentSchema.extend({
  schemaVersion: z.literal("lesson-reflection@1"),
  courseRunRef: z.string().min(1),
  lessonRef: z.string().min(1),
  teachingPlanRevisionRef: z.string().min(1),
  deliveryRevisionRef: z.string().min(1),
  observationRevisionRefs: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)),
  teacherApprovalRequired: z.literal(true)
});

export const ReflectionRevisionViewSchema = z.object({
  reflectionRevisionRef: z.string().min(1),
  reflectionRef: z.string().min(1),
  revisionNumber: z.number().int().positive(),
  status: ReflectionStatusSchema,
  tenantRef: z.string().min(1),
  courseRunRef: z.string().min(1),
  lessonRef: z.string().min(1),
  teachingPlanRevisionRef: z.string().min(1),
  deliveryRevisionRef: z.string().min(1),
  observationRevisionRefs: z.array(z.string().min(1)),
  assignmentEvidenceRefs: z.array(z.string().min(1)),
  content: ReflectionContentSchema,
  sourceAgentRunRef: z.string().min(1).nullable(),
  parentRevisionRef: z.string().min(1).nullable(),
  confirmedBy: z.string().min(1).nullable(),
  confirmedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});

export const ReflectionDetailSchema = z.object({
  reflectionRef: z.string().min(1),
  reflectionTaskRef: z.string().min(1),
  generationStatus: z.enum([
    "draft",
    "generating",
    "draft_ready",
    "confirmed",
    "cancelled"
  ]),
  currentModelExecutionRef: z.string().min(1).nullable(),
  currentDraft: ReflectionRevisionViewSchema.nullable(),
  currentConfirmed: ReflectionRevisionViewSchema.nullable(),
  history: z.array(ReflectionRevisionViewSchema),
  followUps: z.array(z.object({
    followUpRef: z.string().min(1),
    actionType: z.enum(["lesson_preparation", "assignment_draft", "teacher_todo"]),
    targetRef: z.string().min(1),
    targetStatus: z.string().min(1),
    deepLink: z.string().min(1),
    createdAt: z.string().datetime()
  }))
});

export const CreateReflectionDraftRequestSchema = z.object({
  courseRunRef: z.string().min(1),
  lessonRef: z.string().min(1),
  teachingPlanRevisionRef: z.string().min(1),
  deliveryRevisionRef: z.string().min(1),
  observationRevisionRefs: z.array(z.string().min(1)),
  assignmentEvidenceRefs: z.array(z.string().min(1)),
  content: ReflectionContentSchema,
  purpose: z.literal("lesson-reflection.create-draft"),
  idempotencyKey: z.string().min(8)
});

export const UpdateReflectionDraftRequestSchema = z.object({
  expectedRevisionNumber: z.number().int().positive(),
  content: ReflectionContentSchema,
  purpose: z.literal("lesson-reflection.update-draft"),
  idempotencyKey: z.string().min(8)
});

export const ConfirmReflectionRequestSchema = z.object({
  expectedRevisionNumber: z.number().int().positive(),
  purpose: z.literal("lesson-reflection.confirm"),
  idempotencyKey: z.string().min(8)
});

export const ReflectionMutationResultSchema = z.object({
  replayed: z.boolean(),
  reflection: ReflectionDetailSchema
});

export const GenerateReflectionRequestSchema = z.object({
  reflectionRef: z.string().min(1),
  expectedDraftRevisionNumber: z.number().int().positive(),
  teacherNotes: z.string().max(4_000),
  purpose: z.literal("lesson-reflection.generate"),
  idempotencyKey: z.string().min(8)
});

export const ReflectionGenerationResultSchema = z.object({
  replayed: z.boolean(),
  modelExecutionRef: z.string().min(1),
  status: z.string().min(1),
  reflectionRef: z.string().min(1),
  contextManifestRef: z.string().min(1),
  authorizedContextPlanRef: z.string().min(1)
});

export const ReflectionAgentContextSchema = z.object({
  reflectionRef: z.string().min(1),
  lessonRef: z.string().min(1),
  teachingPlanRevisionRef: z.string().min(1),
  deliveryRevisionRef: z.string().min(1),
  observationRevisionRefs: z.array(z.string().min(1)),
  assignmentEvidenceRefs: z.array(z.string().min(1)),
  learningObjectiveRefs: z.array(z.string().min(1)),
  purpose: z.literal("lesson-reflection.generate"),
  contextManifestRef: z.string().min(1).nullable(),
  authorizedContextPlanRef: z.string().min(1).nullable()
});

const FollowUpBaseSchema = z.object({
  reflectionRevisionRef: z.string().min(1),
  purpose: z.literal("lesson-reflection.create-follow-up"),
  idempotencyKey: z.string().min(8)
});

export const CreateReflectionFollowUpRequestSchema = z.discriminatedUnion("actionType", [
  FollowUpBaseSchema.extend({
    actionType: z.literal("lesson_preparation"),
    targetLessonRef: z.string().min(1),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
    dueAt: z.string().datetime().nullable().default(null)
  }),
  FollowUpBaseSchema.extend({
    actionType: z.literal("assignment_draft"),
    targetLessonRef: z.string().min(1),
    title: z.string().min(1).max(240),
    instructions: z.string().min(1).max(4_000),
    dueAt: z.string().datetime().nullable().default(null),
    items: z.array(AssignmentItemInputSchema).min(1)
  }),
  FollowUpBaseSchema.extend({
    actionType: z.literal("teacher_todo"),
    title: z.string().min(1).max(300),
    description: z.string().max(4_000).default(""),
    priority: z.enum(["high", "normal", "low"]).default("normal"),
    dueAt: z.string().datetime().nullable().default(null)
  })
]);

export const ReflectionFollowUpResultSchema = z.object({
  replayed: z.boolean(),
  followUpRef: z.string().min(1),
  actionType: z.enum(["lesson_preparation", "assignment_draft", "teacher_todo"]),
  targetRef: z.string().min(1),
  deepLink: z.string().min(1)
});

export const NextLessonActionTypeSchema = z.enum([
  "adjust_next_lesson_focus",
  "create_practice_task",
  "create_teacher_todo",
  "review_student_issue"
]);

export const NextLessonActionStatusSchema = z.enum([
  "candidate",
  "accepted",
  "rejected",
  "expired"
]);

export const NextLessonActionCandidateSchema = z.object({
  candidateRef: z.string().min(1),
  tenantRef: z.string().min(1),
  teacherRef: z.string().min(1),
  sourceReflectionRef: z.string().min(1),
  sourceReflectionRevisionRef: z.string().min(1),
  sourceAgentRunRef: z.string().min(1),
  contextManifestRef: z.string().min(1),
  candidateType: NextLessonActionTypeSchema,
  title: z.string().min(1).max(300),
  reason: z.string().min(1).max(4_000),
  confidence: z.enum(["high", "medium", "low"]),
  status: NextLessonActionStatusSchema,
  version: z.number().int().positive(),
  targetLessonRef: z.string().min(1).nullable(),
  targetRef: z.string().min(1).nullable(),
  deepLink: z.string().min(1).nullable(),
  teacherNote: z.string().max(4_000).nullable(),
  sourceRefs: z.array(z.string().min(1)),
  generatedBySkillRef: z.string().min(1),
  expiresAt: z.string().datetime().nullable(),
  decidedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const NextLessonActionListSchema = z.object({
  reflectionRef: z.string().min(1),
  reflectionRevisionRef: z.string().min(1).nullable(),
  items: z.array(NextLessonActionCandidateSchema)
});

export const GenerateNextLessonActionsRequestSchema = z.object({
  reflectionRevisionRef: z.string().min(1),
  targetLessonRef: z.string().min(1),
  teacherAdjustment: z.string().trim().max(4_000).nullable().default(null),
  purpose: z.literal("next-lesson-adjustment.generate"),
  idempotencyKey: z.string().min(8)
});

export const GenerateNextLessonActionsResultSchema = z.object({
  replayed: z.boolean(),
  agentRunRef: z.string().min(1),
  contextManifestRef: z.string().min(1),
  skillRef: z.string().min(1),
  items: z.array(NextLessonActionCandidateSchema).max(3)
});

export const UpdateNextLessonActionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().min(1).max(300),
  reason: z.string().min(1).max(4_000),
  targetLessonRef: z.string().min(1).nullable(),
  teacherNote: z.string().max(4_000).nullable().default(null),
  purpose: z.literal("next-lesson-adjustment.update"),
  idempotencyKey: z.string().min(8)
});

export const AcceptNextLessonActionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  purpose: z.literal("next-lesson-adjustment.accept"),
  idempotencyKey: z.string().min(8)
});

export const RejectNextLessonActionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().max(4_000).nullable().default(null),
  purpose: z.literal("next-lesson-adjustment.reject"),
  idempotencyKey: z.string().min(8)
});

export const NextLessonActionMutationResultSchema = z.object({
  replayed: z.boolean(),
  candidate: NextLessonActionCandidateSchema
});

export const LessonImplementationSummarySchema = z.object({
  lessonRef: z.string().min(1),
  delivery: LessonDeliveryDetailSchema.nullable(),
  currentDelivery: LessonDeliveryRevisionSchema.nullable(),
  observedMoves: z.array(ObservedPedagogicalMoveSchema),
  instructionalDecisions: z.array(InstructionalDecisionSchema),
  observations: z.array(ClassroomObservationRevisionSchema),
  reflection: ReflectionDetailSchema.nullable(),
  implementationPending: z.boolean(),
  reflectionPending: z.boolean()
});

export const PendingReflectionQueueSchema = z.object({
  items: z.array(z.object({
    lessonRef: z.string().min(1),
    lessonTitle: z.string().min(1),
    deliveryRef: z.string().min(1),
    deliveryRevisionRef: z.string().min(1),
    deliveryConfirmedAt: z.string().datetime(),
    reflectionRef: z.string().min(1).nullable(),
    reflectionStatus: z.string().min(1).nullable(),
    deepLink: z.string().min(1)
  }))
});

export type LessonDeliveryRevision = z.infer<typeof LessonDeliveryRevisionSchema>;
export type DeliveryStepInput = z.infer<typeof DeliveryStepInputSchema>;
export type ObservedPedagogicalMove = z.infer<typeof ObservedPedagogicalMoveSchema>;
export type InstructionalDecision = z.infer<typeof InstructionalDecisionSchema>;
export type LessonDeliveryDetail = z.infer<typeof LessonDeliveryDetailSchema>;
export type CreateLessonDeliveryRequest = z.infer<typeof CreateLessonDeliveryRequestSchema>;
export type UpdateLessonDeliveryDraftRequest = z.infer<typeof UpdateLessonDeliveryDraftRequestSchema>;
export type ConfirmLessonDeliveryRequest = z.infer<typeof ConfirmLessonDeliveryRequestSchema>;
export type AmendLessonDeliveryRequest = z.infer<typeof AmendLessonDeliveryRequestSchema>;
export type GenerateClassroomFeedbackRequest = z.infer<typeof GenerateClassroomFeedbackRequestSchema>;
export type GenerateClassroomFeedbackResult = z.infer<typeof GenerateClassroomFeedbackResultSchema>;
export type ClassroomFeedbackRunView = z.infer<typeof ClassroomFeedbackRunViewSchema>;
export type ClassroomFeedbackObservationCandidate = z.infer<typeof ClassroomFeedbackObservationCandidateSchema>;
export type QuickClassroomSection = z.infer<typeof QuickClassroomSectionSchema>;
export type ClassroomObservationRevision = z.infer<typeof ClassroomObservationRevisionSchema>;
export type ClassroomObservationDetail = z.infer<typeof ClassroomObservationDetailSchema>;
export type CreateClassroomObservationRequest = z.infer<typeof CreateClassroomObservationRequestSchema>;
export type UpdateClassroomObservationDraftRequest = z.infer<typeof UpdateClassroomObservationDraftRequestSchema>;
export type ConfirmClassroomObservationRequest = z.infer<typeof ConfirmClassroomObservationRequestSchema>;
export type SupersedeClassroomObservationRequest = z.infer<typeof SupersedeClassroomObservationRequestSchema>;
export type ClassroomObservationListQuery = z.infer<typeof ClassroomObservationListQuerySchema>;
export type ReflectionContent = z.infer<typeof ReflectionContentSchema>;
export type StructuredReflectionOutput = z.infer<typeof StructuredReflectionOutputSchema>;
export type ReflectionRevisionView = z.infer<typeof ReflectionRevisionViewSchema>;
export type ReflectionDetail = z.infer<typeof ReflectionDetailSchema>;
export type CreateReflectionDraftRequest = z.infer<typeof CreateReflectionDraftRequestSchema>;
export type UpdateReflectionDraftRequest = z.infer<typeof UpdateReflectionDraftRequestSchema>;
export type ConfirmReflectionRequest = z.infer<typeof ConfirmReflectionRequestSchema>;
export type GenerateReflectionRequest = z.infer<typeof GenerateReflectionRequestSchema>;
export type CreateReflectionFollowUpRequest = z.infer<typeof CreateReflectionFollowUpRequestSchema>;
export type NextLessonActionType = z.infer<typeof NextLessonActionTypeSchema>;
export type NextLessonActionStatus = z.infer<typeof NextLessonActionStatusSchema>;
export type NextLessonActionCandidate = z.infer<typeof NextLessonActionCandidateSchema>;
export type GenerateNextLessonActionsRequest = z.infer<typeof GenerateNextLessonActionsRequestSchema>;
export type UpdateNextLessonActionRequest = z.infer<typeof UpdateNextLessonActionRequestSchema>;
export type AcceptNextLessonActionRequest = z.infer<typeof AcceptNextLessonActionRequestSchema>;
export type RejectNextLessonActionRequest = z.infer<typeof RejectNextLessonActionRequestSchema>;
export type LessonImplementationSummary = z.infer<typeof LessonImplementationSummarySchema>;

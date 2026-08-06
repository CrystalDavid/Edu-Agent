import { z } from "zod";

export const LessonJourneyStageSchema = z.enum([
  "understand",
  "plan",
  "materials",
  "deliver",
  "reflect",
  "improve"
]);

export const LessonJourneyStatusSchema = z.enum([
  "ready",
  "in_progress",
  "waiting_for_agent",
  "waiting_for_teacher",
  "needs_attention",
  "completed"
]);

export const LessonJourneyMilestoneSchema = z.enum([
  "lesson_context_ready",
  "lesson_brief_adopted",
  "preparation_task_created",
  "proposal_ready",
  "teaching_plan_approved",
  "materials_available",
  "delivery_confirmed",
  "reflection_confirmed",
  "follow_up_created"
]);

export const LessonJourneyActionKindSchema = z.enum([
  "review_lesson_context",
  "generate_lesson_brief",
  "review_lesson_brief",
  "generate_teaching_plan",
  "start_preparation",
  "continue_preparation",
  "view_agent_run",
  "recover_agent_run",
  "review_proposal",
  "review_teaching_plan",
  "prepare_materials",
  "record_delivery",
  "confirm_delivery",
  "start_reflection",
  "review_reflection",
  "choose_follow_up",
  "view_completed_journey"
]);

export const LessonJourneyNextBestActionSchema = z.object({
  kind: LessonJourneyActionKindSchema,
  label: z.string().min(1),
  reason: z.string().min(1),
  href: z.string().min(1)
});

export const LessonJourneySourceKindSchema = z.enum([
  "lesson",
  "lesson_brief_run",
  "preparation_task",
  "proposal",
  "agent_run",
  "model_execution",
  "teaching_plan_revision",
  "file_asset",
  "delivery_revision",
  "reflection_revision",
  "follow_up"
]);

export const LessonJourneySourceRefSchema = z.object({
  kind: LessonJourneySourceKindSchema,
  ref: z.string().min(1),
  version: z.string().min(1)
});

export const LessonJourneyDetailLinksSchema = z.object({
  lesson: z.string().min(1),
  preparationTask: z.string().min(1).nullable(),
  teachingPlan: z.string().min(1).nullable(),
  files: z.string().min(1),
  implementation: z.string().min(1),
  reflection: z.string().min(1).nullable(),
  agentRun: z.string().min(1).nullable()
});

export const LessonJourneyProjectionSchema = z.object({
  lessonRef: z.string().min(1),
  currentStage: LessonJourneyStageSchema,
  status: LessonJourneyStatusSchema,
  nextBestAction: LessonJourneyNextBestActionSchema,
  blockingReasons: z.array(z.string().min(1)),
  completedMilestones: z.array(LessonJourneyMilestoneSchema),
  sourceRefs: z.array(LessonJourneySourceRefSchema),
  sourceVersionVector: z.record(z.string().min(1), z.string().min(1)),
  detailLinks: LessonJourneyDetailLinksSchema,
  generatedAt: z.string().datetime()
});

export const LessonBriefSourceKindSchema = z.enum([
  "lesson",
  "objective",
  "evidence",
  "teaching_plan",
  "preference",
  "teacher_adjustment"
]);

export const LessonBriefSourceRefSchema = z.object({
  kind: LessonBriefSourceKindSchema,
  ref: z.string().min(1),
  version: z.string().min(1),
  contentHash: z.string().min(16),
  provenance: z.string().min(1),
  included: z.boolean()
});

export const LessonBriefObjectiveSummarySchema = z.object({
  objectiveRef: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)).min(1)
});

export const LessonBriefCandidateItemSchema = z.object({
  candidateId: z.string().min(1),
  title: z.string().min(1),
  explanation: z.string().min(1),
  basisRefs: z.array(z.string().min(1)).min(1),
  confidence: z.enum(["high", "medium", "low"]),
  candidateOnly: z.literal(true)
});

export const LessonBriefEvidenceSummarySchema = z.object({
  evidenceRef: z.string().min(1),
  evidenceType: z.enum(["observation", "claim"]),
  summary: z.string().min(1),
  objectiveRefs: z.array(z.string().min(1)),
  observedAt: z.string().datetime().nullable(),
  status: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)).min(1)
});

export const LessonBriefDispositionSchema = z.object({
  action: z.enum(["adopted", "deferred"]),
  selectedCandidateIds: z.array(z.string().min(1)),
  teacherRef: z.string().min(1),
  taskRef: z.string().min(1).nullable(),
  decidedAt: z.string().datetime()
});

export const LessonBriefSnapshotSchema = z.object({
  lessonRef: z.string().min(1),
  status: z.enum(["waiting_for_teacher", "adopted", "deferred"]),
  sourceRefs: z.array(LessonBriefSourceRefSchema).min(1),
  sourceVersionVector: z.record(z.string().min(1), z.string().min(1)),
  objectiveSummaries: z.array(LessonBriefObjectiveSummarySchema),
  teachingFocusCandidates: z.array(LessonBriefCandidateItemSchema),
  difficultyCandidates: z.array(LessonBriefCandidateItemSchema),
  classEvidenceSummary: z.array(LessonBriefEvidenceSummarySchema),
  suggestedAttentionPoints: z.array(LessonBriefCandidateItemSchema),
  knownGaps: z.array(z.string().min(1)),
  generatedBySkillRef: z.literal("lesson-analysis@1"),
  agentRunRef: z.string().min(1),
  contextManifestRef: z.string().min(1),
  contextManifestHash: z.string().min(16),
  contentHash: z.string().min(16),
  teacherAdjustment: z.string().min(1).nullable(),
  disposition: LessonBriefDispositionSchema.nullable(),
  generatedAt: z.string().datetime()
});

export const LessonBriefStateSchema = z.object({
  lessonRef: z.string().min(1),
  current: LessonBriefSnapshotSchema.nullable()
});

export const GenerateLessonBriefRequestSchema = z.object({
  purpose: z.literal("lesson-brief.generate"),
  idempotencyKey: z.string().min(8),
  teacherAdjustment: z.string().trim().min(1).max(500).nullable().default(null)
});

export const GenerateLessonBriefResultSchema = z.object({
  replayed: z.boolean(),
  brief: LessonBriefSnapshotSchema
});

export const DecideLessonBriefRequestSchema = z.object({
  purpose: z.literal("lesson-brief.decide"),
  idempotencyKey: z.string().min(8),
  expectedContentHash: z.string().min(16),
  action: z.enum(["adopt", "defer"]),
  selectedCandidateIds: z.array(z.string().min(1)).default([]),
  preparationTaskRef: z.string().min(1).nullable().default(null),
  expectedWorkingSetVersion: z.number().int().positive().nullable().default(null)
});

export const DecideLessonBriefResultSchema = z.object({
  replayed: z.boolean(),
  brief: LessonBriefSnapshotSchema,
  workingSet: z.object({
    taskRef: z.string().min(1),
    version: z.number().int().positive(),
    sourceResourceRefs: z.array(z.string().min(1))
  }).nullable()
});

export const MaterialKindSchema = z.enum([
  "lesson_plan",
  "slide_outline",
  "exercise_set",
  "board_design",
  "differentiated_support"
]);

export const MaterialContentDraftSchema = z.object({
  kind: MaterialKindSchema,
  title: z.string().min(1).max(180),
  contentMarkdown: z.string().min(80).max(20_000),
  sourceRefs: z.array(z.string().min(1)).min(2),
  knownGaps: z.array(z.string().min(1)).min(1)
});

export type LessonJourneyStage = z.infer<
  typeof LessonJourneyStageSchema
>;
export type LessonJourneyStatus = z.infer<
  typeof LessonJourneyStatusSchema
>;
export type LessonJourneyMilestone = z.infer<
  typeof LessonJourneyMilestoneSchema
>;
export type LessonJourneyActionKind = z.infer<
  typeof LessonJourneyActionKindSchema
>;
export type LessonJourneyProjection = z.infer<
  typeof LessonJourneyProjectionSchema
>;
export type LessonBriefSourceRef = z.infer<typeof LessonBriefSourceRefSchema>;
export type LessonBriefObjectiveSummary = z.infer<
  typeof LessonBriefObjectiveSummarySchema
>;
export type LessonBriefCandidateItem = z.infer<
  typeof LessonBriefCandidateItemSchema
>;
export type LessonBriefEvidenceSummary = z.infer<
  typeof LessonBriefEvidenceSummarySchema
>;
export type LessonBriefSnapshot = z.infer<typeof LessonBriefSnapshotSchema>;
export type LessonBriefState = z.infer<typeof LessonBriefStateSchema>;
export type GenerateLessonBriefRequest = z.infer<
  typeof GenerateLessonBriefRequestSchema
>;
export type DecideLessonBriefRequest = z.infer<
  typeof DecideLessonBriefRequestSchema
>;
export type MaterialKind = z.infer<typeof MaterialKindSchema>;
export type MaterialContentDraft = z.infer<
  typeof MaterialContentDraftSchema
>;

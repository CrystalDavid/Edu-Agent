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


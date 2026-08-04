import {
  ModelRequestSchemaV2,
  TeacherTaskRequestSchema,
  TeachingPlanSchema
} from "@edu-agent/contracts";
import { z } from "zod";

export const lessonPreparationInputSchemaRef =
  "lesson-preparation-input@1";

export const LessonPreparationSkillInputSchema = z.object({
  invocationRef: z.string().min(1),
  taskRunRef: z.string().min(1),
  agentRunRef: z.string().min(1),
  contextManifestRef: z.string().min(1),
  timeoutMs: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  responseFormat: ModelRequestSchemaV2.shape.responseFormat,
  request: TeacherTaskRequestSchema,
  courseRun: z.object({
    courseRunRef: z.string().min(1),
    subject: z.string().min(1),
    gradeLevel: z.string().min(1),
    className: z.string().min(1),
    academicTerm: z.string().min(1)
  }),
  curriculumUnit: z.object({
    unitRef: z.string().min(1),
    title: z.string().min(1),
    description: z.string()
  }),
  lesson: z.object({
    lessonRef: z.string().min(1),
    title: z.string().min(1),
    sequence: z.number().int().positive(),
    durationMinutes: z.number().int().positive()
  }),
  learningObjectives: z.array(z.object({
    objectiveRef: z.string().min(1),
    title: z.string().min(1),
    description: z.string()
  })).min(1),
  currentApprovedTeachingPlan: TeachingPlanSchema,
  authorizedEvidence: z.array(z.object({
    evidenceRef: z.string().min(1),
    kind: z.enum(["observation", "claim"]),
    summary: z.string().min(1),
    status: z.string().optional(),
    unknowns: z.array(z.string().min(1)).optional()
  })),
  evidenceGaps: z.array(z.string().min(1)),
  interactionContract: z.object({
    contractRef: z.string().min(1),
    profileRef: z.string().min(1),
    policyVersionRef: z.string().min(1),
    evidenceRuleVersionRef: z.string().min(1),
    supportLimit: z.number().int().nonnegative(),
    answerReleaseBoundary: z.string().min(1)
  }),
  taskWorkingSet: z.object({
    version: z.number().int().positive(),
    purpose: z.string().min(1),
    requestedFieldMask: z.array(z.string().min(1)),
    sourceLessonRef: z.string().min(1).nullable().optional(),
    sourceAssignmentRef: z.string().min(1).nullable().optional(),
    sourceAssignmentItemRefs: z.array(z.string().min(1)).optional()
  })
});

export type LessonPreparationSkillInput = z.infer<
  typeof LessonPreparationSkillInputSchema
>;

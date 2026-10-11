import {
  LessonBriefCandidateItemSchema,
  LessonBriefEvidenceSummarySchema,
  ModelRequestSchemaV2,
  TeacherTaskRequestSchema,
  TeachingPlanSchema
} from "@edu-agent/contracts";
import { z } from "zod";

export const lessonPreparationInputSchemaRef =
  "lesson-preparation-input@1";
export const lessonPreparationInputSchemaRefV2 =
  "lesson-preparation-input@2";
export const lessonPreparationInputSchemaRefV3 =
  "lesson-preparation-input@3";
export const lessonPreparationInputSchemaRefV4 =
  "lesson-preparation-input@4";

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

export const ConfirmedTeacherPreferenceSchema = z.object({
  preferenceRef: z.string().min(1),
  preferenceKey: z.string().min(1).max(80),
  preferenceValue: z.string().min(1).max(240),
  version: z.number().int().positive(),
  contentHash: z.string().min(16),
  sourceCandidateRef: z.string().min(1)
});

export const LessonPreparationSkillInputSchemaV2 =
  LessonPreparationSkillInputSchema.extend({
    confirmedPreferences: z.array(ConfirmedTeacherPreferenceSchema).max(12)
  });

export const ConfirmedLessonBriefContextSchema = z.object({
  briefRef: z.string().startsWith("lesson-brief-run:"),
  agentRunRef: z.string().min(1),
  lessonRef: z.string().min(1),
  contentHash: z.string().min(16),
  contextManifestRef: z.string().min(1),
  contextManifestHash: z.string().min(16),
  generatedBySkillRef: z.literal("lesson-analysis@1"),
  selectedCandidateIds: z.array(z.string().min(1)).min(1),
  teachingFocus: z.array(LessonBriefCandidateItemSchema),
  difficultyFocus: z.array(LessonBriefCandidateItemSchema),
  attentionPoints: z.array(LessonBriefCandidateItemSchema),
  classEvidenceSummary: z.array(LessonBriefEvidenceSummarySchema),
  knownGaps: z.array(z.string().min(1)),
  sourceVersionVector: z.record(z.string().min(1), z.string().min(1))
});

export const LessonPreparationSkillInputSchemaV3 =
  LessonPreparationSkillInputSchemaV2.extend({
    taskWorkingSet:
      LessonPreparationSkillInputSchema.shape.taskWorkingSet.extend({
        sourceResourceRefs: z.array(z.string().min(1))
      }),
    confirmedLessonBrief: ConfirmedLessonBriefContextSchema
  });

export const ConversationWorkingContextSchema = z.object({
  conversationRef: z.string().min(1),
  turnRef: z.string().min(1),
  workingMemorySnapshotRef: z.string().min(1),
  snapshotContentHash: z.string().min(16),
  sourceTurnSequence: z.number().int().positive(),
  activeGoal: z.object({
    text: z.string().min(1).max(2000),
    sourceTurnRef: z.string().min(1)
  }),
  recentTeacherRequests: z.array(z.object({
    turnRef: z.string().min(1),
    sequence: z.number().int().positive(),
    text: z.string().min(1).max(2000)
  })).max(6),
  referents: z.array(z.object({
    label: z.string().min(1).max(80),
    targetRef: z.string().min(1),
    sourceTurnRef: z.string().min(1)
  })),
  pendingIntents: z.array(z.string().min(1).max(240)),
  selectedOptions: z.array(z.string().min(1).max(240)),
  temporaryOverrides: z.array(z.string().min(1).max(240)),
  latestAssistantResult: z.object({
    turnRef: z.string().min(1),
    surfaceSummary: z.string().min(1).max(1000),
    resultRefs: z.object({
      modelExecutionRef: z.string().min(1).optional(),
      proposalRevisionRef: z.string().min(1).optional()
    })
  }).nullable(),
  rollingSummary: z.string().min(1).max(4000)
});

export const LessonPreparationSkillInputSchemaV4 =
  LessonPreparationSkillInputSchemaV2.extend({
    taskWorkingSet:
      LessonPreparationSkillInputSchema.shape.taskWorkingSet.extend({
        sourceResourceRefs: z.array(z.string().min(1))
      }),
    confirmedLessonBrief: ConfirmedLessonBriefContextSchema.optional(),
    conversationContext: ConversationWorkingContextSchema
  });

export type ConfirmedTeacherPreference = z.infer<
  typeof ConfirmedTeacherPreferenceSchema
>;
export type LessonPreparationSkillInputV2 = z.infer<
  typeof LessonPreparationSkillInputSchemaV2
>;
export type ConfirmedLessonBriefContext = z.infer<
  typeof ConfirmedLessonBriefContextSchema
>;
export type LessonPreparationSkillInputV3 = z.infer<
  typeof LessonPreparationSkillInputSchemaV3
>;
export type ConversationWorkingContext = z.infer<
  typeof ConversationWorkingContextSchema
>;
export type LessonPreparationSkillInputV4 = z.infer<
  typeof LessonPreparationSkillInputSchemaV4
>;

import { z } from "zod";

export const classroomReflectionOutputSchemaRef = "classroom-delivery-draft@1";

const DeliveryStepDraftSchema = z.object({
  stepKey: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  title: z.string().min(1),
  plannedDescription: z.string().min(1),
  actualDescription: z.string().min(1),
  disposition: z.enum(["adopted", "adjusted", "skipped", "added"]),
  rationale: z.string().min(1)
});

export const ClassroomObservationCandidateSchema = z.object({
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

export const ClassroomReflectionSkillOutputSchema = z.object({
  schemaVersion: z.literal("classroom-delivery-draft@1"),
  deliveryDraft: z.object({
    teachingPlanRevisionRef: z.string().min(1),
    calendarEventRef: z.string().min(1).nullable(),
    actualStartAt: z.string().datetime(),
    actualEndAt: z.string().datetime(),
    steps: z.array(DeliveryStepDraftSchema).length(5),
    paceNotes: z.string().min(1),
    unresolvedQuestions: z.array(z.string().min(1)),
    followUpNotes: z.string().min(1)
  }),
  deliverySummary: z.string().min(1),
  observationCandidates: z.array(ClassroomObservationCandidateSchema).max(8),
  reflectionInput: z.object({
    plannedVsImplemented: z.array(z.string().min(1)),
    effectiveSegments: z.array(z.string().min(1)),
    uncertainQuestions: z.array(z.string().min(1)),
    suggestedNextActions: z.array(z.string().min(1))
  }),
  knownGaps: z.array(z.string().min(1)).min(1)
});

export type ClassroomObservationCandidate = z.infer<
  typeof ClassroomObservationCandidateSchema
>;

export type ClassroomReflectionSkillOutput = z.infer<
  typeof ClassroomReflectionSkillOutputSchema
>;

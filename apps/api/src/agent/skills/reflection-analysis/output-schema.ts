import { z } from "zod";

import { ReflectionContentSchema } from "@edu-agent/contracts";

export const reflectionAnalysisOutputSchemaRef = "reflection-analysis-draft@1";

export const ReflectionFactSchema = z.object({
  text: z.string().min(1).max(4_000),
  basisRefs: z.array(z.string().min(1)).min(1),
  status: z.literal("confirmed_source")
});

export const ReflectionInterpretationSchema = z.object({
  text: z.string().min(1).max(4_000),
  basisRefs: z.array(z.string().min(1)).min(1),
  confidence: z.literal("agent_interpretation")
});

export const ReflectionActionCandidateSchema = z.object({
  candidateId: z.string().min(1),
  actionType: z.enum([
    "lesson_preparation",
    "assignment_draft",
    "teacher_todo"
  ]),
  title: z.string().min(1).max(300),
  rationale: z.string().min(1).max(4_000),
  basisRefs: z.array(z.string().min(1)).min(1),
  status: z.literal("candidate"),
  teacherConfirmationRequired: z.literal(true)
});

export const ReflectionAnalysisSkillOutputSchema = z.object({
  schemaVersion: z.literal("reflection-analysis-draft@1"),
  whatHappened: z.object({
    facts: z.array(ReflectionFactSchema).min(1)
  }),
  whatItMeans: z.object({
    interpretations: z.array(ReflectionInterpretationSchema).min(1),
    uncertainties: z.array(z.string().min(1).max(1_000))
  }),
  whatNext: z.object({
    actionCandidates: z.array(ReflectionActionCandidateSchema).max(3)
  }),
  reflectionContent: ReflectionContentSchema,
  knownGaps: z.array(z.string().min(1)),
  teacherConfirmationRequired: z.literal(true)
});

export type ReflectionActionCandidate = z.infer<
  typeof ReflectionActionCandidateSchema
>;

export type ReflectionAnalysisSkillOutput = z.infer<
  typeof ReflectionAnalysisSkillOutputSchema
>;

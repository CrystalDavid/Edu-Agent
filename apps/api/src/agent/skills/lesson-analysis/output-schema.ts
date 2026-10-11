import { z } from "zod";

import {
  LessonBriefCandidateItemSchema,
  LessonBriefEvidenceSummarySchema,
  LessonBriefObjectiveSummarySchema
} from "@edu-agent/contracts";

export const lessonAnalysisOutputSchemaRef = "lesson-brief-candidate@1";

export const LessonAnalysisSkillOutputSchema = z.object({
  schemaVersion: z.literal("lesson-brief-candidate@1"),
  objectiveSummaries: z.array(LessonBriefObjectiveSummarySchema),
  teachingFocusCandidates: z.array(LessonBriefCandidateItemSchema),
  difficultyCandidates: z.array(LessonBriefCandidateItemSchema),
  classEvidenceSummary: z.array(LessonBriefEvidenceSummarySchema),
  suggestedAttentionPoints: z.array(LessonBriefCandidateItemSchema),
  knownGaps: z.array(z.string().min(1))
});

export type LessonAnalysisSkillOutput = z.infer<
  typeof LessonAnalysisSkillOutputSchema
>;

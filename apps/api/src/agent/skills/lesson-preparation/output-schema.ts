import {
  StructuredTeachingSuggestionOutputSchema,
  type StructuredTeachingSuggestionOutput
} from "@edu-agent/contracts";

export const lessonPreparationOutputSchemaRef =
  "teacher-copilot-suggestions@1";

export const LessonPreparationSkillOutputSchema =
  StructuredTeachingSuggestionOutputSchema;

export type LessonPreparationSkillOutput =
  StructuredTeachingSuggestionOutput;

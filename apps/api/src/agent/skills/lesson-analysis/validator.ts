import type { LessonBriefSourceRef } from "@edu-agent/contracts";

import {
  LessonAnalysisSkillOutputSchema,
  type LessonAnalysisSkillOutput
} from "./output-schema.js";

const unsupportedAuthorityPatterns = [
  /教育部(?:要求|规定|明确)/u,
  /课程标准(?:要求|规定|明确)/u,
  /考试(?:要求|规定|明确)/u,
  /教材明确/u
];

export type LessonAnalysisValidationResult =
  | { valid: true; output: LessonAnalysisSkillOutput }
  | { valid: false; category: "schema" | "scope" | "policy"; issues: string[] };

export function validateLessonAnalysisOutput(input: {
  output: unknown;
  sources: readonly LessonBriefSourceRef[];
}): LessonAnalysisValidationResult {
  const parsed = LessonAnalysisSkillOutputSchema.safeParse(input.output);
  if (!parsed.success) {
    return {
      valid: false,
      category: "schema",
      issues: parsed.error.issues.map((issue) =>
        `${issue.path.join(".") || "output"}: ${issue.message}`
      )
    };
  }
  const allowedRefs = new Set(
    input.sources.filter((source) => source.included).map((source) => source.ref)
  );
  const basisRefs = [
    ...parsed.data.teachingFocusCandidates,
    ...parsed.data.difficultyCandidates,
    ...parsed.data.suggestedAttentionPoints
  ].flatMap((item) => item.basisRefs);
  const outside = basisRefs.filter((ref) => !allowedRefs.has(ref));
  if (outside.length > 0) {
    return {
      valid: false,
      category: "scope",
      issues: [`候选引用了未进入 ContextManifest 的来源：${[...new Set(outside)].join("、")}`]
    };
  }
  const text = JSON.stringify(parsed.data);
  if (unsupportedAuthorityPatterns.some((pattern) => pattern.test(text))) {
    return {
      valid: false,
      category: "policy",
      issues: ["当前未接入权威知识源，输出不得声称教育部、课程标准、教材或考试作出明确规定。"]
    };
  }
  return { valid: true, output: parsed.data };
}

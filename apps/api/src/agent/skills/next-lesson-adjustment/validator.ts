import type { NextLessonContextSourceRef } from "./context-builder.js";
import {
  NextLessonAdjustmentSkillOutputSchema,
  type NextLessonAdjustmentSkillOutput
} from "./output-schema.js";

export type NextLessonAdjustmentValidationResult =
  | { valid: true; output: NextLessonAdjustmentSkillOutput }
  | { valid: false; category: "schema" | "scope" | "policy"; issues: string[] };

export function validateNextLessonAdjustmentOutput(input: {
  output: unknown;
  sources: readonly NextLessonContextSourceRef[];
  targetLessonRef: string;
}): NextLessonAdjustmentValidationResult {
  const parsed = NextLessonAdjustmentSkillOutputSchema.safeParse(input.output);
  if (!parsed.success) {
    return {
      valid: false,
      category: "schema",
      issues: parsed.error.issues.map((issue) =>
        `${issue.path.join(".") || "output"}: ${issue.message}`
      )
    };
  }
  const allowed = new Set(
    input.sources.filter((source) => source.included).map((source) => source.ref)
  );
  const outside = parsed.data.candidates
    .flatMap((item) => item.basisRefs)
    .filter((ref) => !allowed.has(ref));
  if (outside.length > 0) {
    return {
      valid: false,
      category: "scope",
      issues: [`行动候选引用了未进入 ContextManifest 的来源：${[...new Set(outside)].join("、")}`]
    };
  }
  if (parsed.data.candidates.some((item) =>
    item.targetLessonRef !== null && item.targetLessonRef !== input.targetLessonRef
  )) {
    return {
      valid: false,
      category: "scope",
      issues: ["行动候选不能指向教师未选择的目标课时。"]
    };
  }
  if (parsed.data.candidates.some((item) => !item.teacherConfirmationRequired)) {
    return {
      valid: false,
      category: "policy",
      issues: ["每个下一课行动候选都必须等待教师确认。"]
    };
  }
  return { valid: true, output: parsed.data };
}

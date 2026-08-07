import type { ReflectionAnalysisContextSourceRef } from "./context-builder.js";
import {
  ReflectionAnalysisSkillOutputSchema,
  type ReflectionAnalysisSkillOutput
} from "./output-schema.js";

const prohibitedAutomaticActions = [
  /已(?:自动)?修改(?:下一课)?教学计划/u,
  /已(?:自动)?创建(?:备课任务|作业|待办)/u,
  /已(?:自动)?发布作业/u,
  /无需教师确认/u
];

export type ReflectionAnalysisValidationResult =
  | { valid: true; output: ReflectionAnalysisSkillOutput }
  | {
      valid: false;
      category: "schema" | "scope" | "policy" | "completeness";
      issues: string[];
    };

export function validateReflectionAnalysisOutput(input: {
  output: unknown;
  sources: readonly ReflectionAnalysisContextSourceRef[];
}): ReflectionAnalysisValidationResult {
  const parsed = ReflectionAnalysisSkillOutputSchema.safeParse(input.output);
  if (!parsed.success) {
    return {
      valid: false,
      category: "schema",
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "output"}: ${issue.message}`
      )
    };
  }
  const allowed = new Set(
    input.sources.filter((item) => item.included).map((item) => item.ref)
  );
  const referenced = [
    ...parsed.data.whatHappened.facts.flatMap((item) => item.basisRefs),
    ...parsed.data.whatItMeans.interpretations.flatMap((item) => item.basisRefs),
    ...parsed.data.whatNext.actionCandidates.flatMap((item) => item.basisRefs)
  ];
  const outside = unique(referenced.filter((ref) => !allowed.has(ref)));
  if (outside.length > 0) {
    return {
      valid: false,
      category: "scope",
      issues: [`Reflection 引用了未进入 ContextManifest 的来源：${outside.join("、")}`]
    };
  }
  const actionTypes = parsed.data.whatNext.actionCandidates.map(
    (item) => item.actionType
  );
  if (new Set(actionTypes).size !== actionTypes.length) {
    return {
      valid: false,
      category: "completeness",
      issues: ["每类后续行动最多只能有一个候选。"]
    };
  }
  const text = JSON.stringify(parsed.data);
  if (prohibitedAutomaticActions.some((pattern) => pattern.test(text))) {
    return {
      valid: false,
      category: "policy",
      issues: ["Reflection Draft 不得声称已执行 Platform 后续动作。"]
    };
  }
  return { valid: true, output: parsed.data };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

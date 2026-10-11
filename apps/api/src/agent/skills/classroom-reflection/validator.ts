import type { ClassroomReflectionContextSourceRef } from "./context-builder.js";
import {
  ClassroomReflectionSkillOutputSchema,
  type ClassroomReflectionSkillOutput
} from "./output-schema.js";

export type ClassroomReflectionValidationResult =
  | { valid: true; output: ClassroomReflectionSkillOutput }
  | {
      valid: false;
      category: "schema" | "scope" | "policy" | "completeness";
      issues: string[];
    };

const expectedStepKeys = [
  "opening",
  "explanation",
  "activity",
  "practice",
  "summary"
];

const forbiddenFactClaims = [
  /已确认(?:课堂|实施|观察)/u,
  /正式(?:课堂|实施|观察)事实/u,
  /长期(?:能力|画像|标签)/u,
  /固定能力标签/u
];

export function validateClassroomReflectionOutput(input: {
  output: unknown;
  sources: readonly ClassroomReflectionContextSourceRef[];
  expectedTeachingPlanRevisionRef: string;
}): ClassroomReflectionValidationResult {
  const parsed = ClassroomReflectionSkillOutputSchema.safeParse(input.output);
  if (!parsed.success) {
    return {
      valid: false,
      category: "schema",
      issues: parsed.error.issues.map((issue) =>
        `${issue.path.join(".") || "output"}: ${issue.message}`
      )
    };
  }
  if (
    parsed.data.deliveryDraft.teachingPlanRevisionRef !==
    input.expectedTeachingPlanRevisionRef
  ) {
    return {
      valid: false,
      category: "scope",
      issues: ["Delivery Draft 必须绑定本次授权的 approved TeachingPlan Revision。"]
    };
  }
  const actualKeys = parsed.data.deliveryDraft.steps.map((step) => step.stepKey);
  if (expectedStepKeys.some((key, index) => actualKeys[index] !== key)) {
    return {
      valid: false,
      category: "completeness",
      issues: ["Delivery Draft 必须按顺序包含导入、讲解、活动、练习和总结。"]
    };
  }
  if (
    new Date(parsed.data.deliveryDraft.actualEndAt).getTime() <=
    new Date(parsed.data.deliveryDraft.actualStartAt).getTime()
  ) {
    return {
      valid: false,
      category: "schema",
      issues: ["Delivery Draft 的结束时间必须晚于开始时间。"]
    };
  }
  const allowedRefs = new Set(
    input.sources.filter((source) => source.included).map((source) => source.ref)
  );
  const outside = parsed.data.observationCandidates
    .flatMap((candidate) => candidate.basisRefs)
    .filter((ref) => !allowedRefs.has(ref));
  if (outside.length > 0) {
    return {
      valid: false,
      category: "scope",
      issues: [
        `Observation Candidate 引用了未进入 ContextManifest 的来源：${[...new Set(outside)].join("、")}`
      ]
    };
  }
  const text = JSON.stringify(parsed.data);
  if (forbiddenFactClaims.some((pattern) => pattern.test(text))) {
    return {
      valid: false,
      category: "policy",
      issues: ["Skill 输出不得声称候选已经成为正式课堂事实或长期能力标签。"]
    };
  }
  return { valid: true, output: parsed.data };
}

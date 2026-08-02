import {
  StructuredReflectionOutputSchema,
  type ModelRequestV2,
  type StructuredReflectionOutput
} from "@edu-agent/contracts";

export type ReflectionOutputValidationResult =
  | { valid: true; output: StructuredReflectionOutput }
  | {
      valid: false;
      category: "schema" | "evidence" | "scope" | "policy";
      issues: string[];
    };

const prohibitedPatterns = [
  /(?:张三|李四|王五|真实学生)/u,
  /(?:考了|得了|获得)\s*\d{1,3}\s*分/u,
  /(?:自动|已经)(?:批准|修改)教学计划/u,
  /(?:已经|已)(?:创建|发布)(?:作业|任务|待办)/u,
  /(?:读取|访问|修改)(?:数据库|其他班级|其他租户)/u,
  /绕过教师(?:确认|审批)/u
];

export function validateReflectionOutput(input: {
  outputText: string;
  request: ModelRequestV2;
  teachingPlanRevisionRef: string;
  deliveryRevisionRef: string;
  observationRevisionRefs: readonly string[];
}): ReflectionOutputValidationResult {
  const trimmed = input.outputText.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return {
      valid: false,
      category: "schema",
      issues: ["Provider output must be one uncontaminated JSON object."]
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return {
      valid: false,
      category: "schema",
      issues: ["Provider output is not valid JSON."]
    };
  }
  const parsed = StructuredReflectionOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      category: "schema",
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "output"}: ${issue.message}`
      )
    };
  }
  const output = parsed.data;
  const scopeIssues: string[] = [];
  if (output.courseRunRef !== input.request.scope.courseRunRef) {
    scopeIssues.push("Reflection is not aligned to the authorized CourseRun.");
  }
  if (output.lessonRef !== input.request.scope.lessonRef) {
    scopeIssues.push("Reflection is not aligned to the authorized Lesson.");
  }
  if (output.teachingPlanRevisionRef !== input.teachingPlanRevisionRef) {
    scopeIssues.push("Reflection changed the approved TeachingPlan revision.");
  }
  if (output.deliveryRevisionRef !== input.deliveryRevisionRef) {
    scopeIssues.push("Reflection changed the confirmed Delivery revision.");
  }
  if (!sameRefs(output.observationRevisionRefs, input.observationRevisionRefs)) {
    scopeIssues.push("Reflection references observations outside the sealed selection.");
  }
  if (scopeIssues.length > 0) {
    return { valid: false, category: "scope", issues: scopeIssues };
  }
  const authorizedEvidence = new Set(input.request.scope.evidenceRefs);
  const invalidEvidence = output.evidenceRefs.filter(
    (reference) => !authorizedEvidence.has(reference)
  );
  if (invalidEvidence.length > 0) {
    return {
      valid: false,
      category: "evidence",
      issues: invalidEvidence.map(
        (reference) => `Unauthorized EvidenceRef ${reference}.`
      )
    };
  }
  const searchable = JSON.stringify(output);
  const policyIssues = prohibitedPatterns
    .filter((pattern) => pattern.test(searchable))
    .map(() => "Reflection contains an unconfirmed fact or prohibited automatic action.");
  if (policyIssues.length > 0 || output.teacherApprovalRequired !== true) {
    return {
      valid: false,
      category: "policy",
      issues:
        policyIssues.length > 0
          ? policyIssues
          : ["Reflection must preserve the teacher confirmation boundary."]
    };
  }
  return { valid: true, output };
}

function sameRefs(left: readonly string[], right: readonly string[]): boolean {
  const normalize = (values: readonly string[]) => [...new Set(values)].sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

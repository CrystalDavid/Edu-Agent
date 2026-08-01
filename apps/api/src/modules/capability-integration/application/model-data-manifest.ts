import { createHash, randomUUID } from "node:crypto";

import {
  ModelDataManifestSchema,
  type ModelDataManifest,
  type ModelProviderName
} from "@edu-agent/contracts";

export type ProhibitedModelInputCategory =
  | "SECRET_MATERIAL"
  | "CONNECTION_INFORMATION"
  | "PERSONAL_IDENTIFIER"
  | "LOCAL_SECRET_REFERENCE";

export function detectProhibitedModelInput(
  value: string
): ProhibitedModelInputCategory | null {
  if (
    /ark-[A-Za-z0-9_-]{8,}/i.test(value) ||
    /Authorization:\s*Bearer\s+\S+/i.test(value) ||
    /ARK_API_KEY\s*=/i.test(value) ||
    /BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY/i.test(value)
  ) {
    return "SECRET_MATERIAL";
  }
  if (
    /(?:DATABASE_URL|postgres(?:ql)?:\/\/|数据库连接(?:串|信息))/i.test(
      value
    )
  ) {
    return "CONNECTION_INFORMATION";
  }
  if (
    /(?:\.env\.local|本地\s*Secret|读取\s*环境变量)/i.test(value)
  ) {
    return "LOCAL_SECRET_REFERENCE";
  }
  if (
    /(?:学生姓名|教师姓名|家长姓名)[：:\s]+[\p{Script=Han}]{2,4}/u.test(
      value
    ) ||
    /\b1[3-9]\d{9}\b/u.test(value) ||
    /\b\d{17}[\dXx]\b/u.test(value) ||
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(
      value
    ) ||
    /真实(?:学生|教师|学校)(?:姓名|文件|数据)/u.test(value)
  ) {
    return "PERSONAL_IDENTIFIER";
  }
  return null;
}

export function createModelDataManifest(input: {
  purpose: string;
  tenantRef: string;
  actorRef: string;
  taskRunRef: string;
  contextManifestRef: string;
  provider: ModelProviderName;
  modelId: string;
  resourceRefs: readonly string[];
  authorizationDecisionRef: string;
  syntheticData: boolean;
  createdAt: string;
}): ModelDataManifest {
  if (
    input.tenantRef !== "tenant:demo-school" ||
    input.actorRef !== "user:teacher-001" ||
    ![
      "teacher-copilot.lesson-preparation",
      "teacher-copilot.lesson-reflection"
    ].includes(input.purpose) ||
    !input.syntheticData
  ) {
    throw new Error(
      "MODEL_DATA_POLICY_BLOCKED: Gate 2.6A only permits the synthetic demo tenant."
    );
  }
  if (
    input.resourceRefs.some((reference) =>
      /secret|database|audit|student-name|school-file/i.test(
        reference
      )
    )
  ) {
    throw new Error(
      "MODEL_DATA_POLICY_BLOCKED: a prohibited resource category was selected."
    );
  }
  return ModelDataManifestSchema.parse({
    modelDataManifestRef: `model-data-manifest:${randomUUID()}`,
    purpose: input.purpose,
    tenantRef: input.tenantRef,
    actorRef: input.actorRef,
    taskRunRef: input.taskRunRef,
    contextManifestRef: input.contextManifestRef,
    provider: input.provider,
    modelIdHash: sha256(input.modelId),
    dataCategories: [
      "synthetic-course",
      "synthetic-lesson",
      "synthetic-learning-objective",
      "synthetic-evidence",
      "synthetic-teaching-plan",
      "demo-teacher-request"
    ],
    resourceRefs: [...input.resourceRefs],
    fieldNames:
      input.purpose === "teacher-copilot.lesson-reflection"
        ? [
            "teacher_notes",
            "course_run",
            "lesson",
            "learning_objectives",
            "approved_teaching_plan",
            "confirmed_delivery",
            "confirmed_observations",
            "authorized_evidence",
            "reflection_draft",
            "task_working_set"
          ]
        : [
            "request_text",
            "course_run",
            "curriculum_unit",
            "lesson",
            "learning_objectives",
            "current_approved_teaching_plan",
            "authorized_evidence",
            "known_gaps",
            "interaction_contract",
            "task_working_set"
          ],
    syntheticDataAssertion: true,
    authorizationDecisionRef: input.authorizationDecisionRef,
    retentionPolicy:
      "provider-transient-no-local-raw-content",
    createdAt: input.createdAt
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

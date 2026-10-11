import { createHash } from "node:crypto";

import {
  ModelRequestSchemaV2,
  PromptBundleDescriptorSchema,
  type ModelRequestV2,
  type PromptBundleDescriptor,
  type ReflectionContent,
  type TeachingPlan
} from "@edu-agent/contracts";

const systemInstruction = [
  "你是学校普通教师端的课后反思草稿助手。",
  "只整理教师已经确认且本次明确授权的合成课堂事实，不推断课堂是否发生。",
  "不得虚构学生、姓名、分数、作业结果、课堂观察、文件或教学成效。",
  "不得把模型建议表述为已实施事实，不得修改或批准 TeachingPlan。",
  "课堂实施与观察只能引用输入中的 confirmedDelivery 和 confirmedObservations。",
  "Assignment Evidence 只能引用 authorizedEvidence 中的 EvidenceRef。",
  "不确定信息必须进入 uncertainties；教师仍需编辑并明确确认 Reflection。",
  "不得调用工具、修改数据库、创建后续任务或输出隐藏思维链。",
  "只返回一个符合 lesson-reflection@1 的 JSON 对象，不得包含 Markdown 或解释性前后缀。"
].join("\n");

const descriptorPayloadV1 = {
  promptBundleRef: "prompt-bundle:lesson-reflection-ark",
  version: 1,
  useCase: "lesson_reflection" as const,
  inputFields: [
    "teacherNotes",
    "courseRun",
    "lesson",
    "learningObjectives",
    "approvedTeachingPlan",
    "confirmedDelivery",
    "confirmedObservations",
    "authorizedEvidence",
    "currentReflectionDraft",
    "contextManifest",
    "teacherConfirmationBoundary"
  ],
  outputSchemaVersion: "lesson-reflection@1",
  safetyPolicyVersion: "model-safety:lesson-reflection@1",
  createdAt: "2026-08-01T00:00:00.000Z"
};

export const lessonReflectionPromptBundleV1: PromptBundleDescriptor =
  PromptBundleDescriptorSchema.parse({
    ...descriptorPayloadV1,
    contentHash: sha256({ ...descriptorPayloadV1, systemInstruction })
  });

const descriptorPayloadV2 = {
  ...descriptorPayloadV1,
  version: 2,
  inputFields: [
    ...descriptorPayloadV1.inputFields.slice(0, 8),
    "adoptedLessonBrief",
    ...descriptorPayloadV1.inputFields.slice(8)
  ],
  createdAt: "2026-08-07T00:00:00.000Z"
};

export const lessonReflectionPromptBundleV2: PromptBundleDescriptor =
  PromptBundleDescriptorSchema.parse({
    ...descriptorPayloadV2,
    contentHash: sha256({ ...descriptorPayloadV2, systemInstruction })
  });

/** Current bundle for new executions. Historical executions remain bound to V1. */
export const lessonReflectionPromptBundle = lessonReflectionPromptBundleV2;

export interface LessonReflectionPromptInput {
  invocationRef: string;
  taskRunRef: string;
  agentRunRef: string;
  contextManifestRef: string;
  timeoutMs: number;
  maxOutputTokens: number;
  responseFormat: ModelRequestV2["responseFormat"];
  teacherNotes: string;
  courseRun: {
    courseRunRef: string;
    subject: string;
    gradeLevel: string;
    className: string;
  };
  lesson: {
    lessonRef: string;
    title: string;
    durationMinutes: number;
  };
  learningObjectives: readonly {
    objectiveRef: string;
    title: string;
    description: string;
  }[];
  approvedTeachingPlan: {
    revisionRef: string;
    content: TeachingPlan;
  };
  confirmedDelivery: {
    deliveryRevisionRef: string;
    actualStartAt: string;
    actualEndAt: string;
    steps: readonly Record<string, unknown>[];
    paceNotes: string;
    unresolvedQuestions: readonly string[];
    followUpNotes: string;
  };
  confirmedObservations: readonly {
    observationRevisionRef: string;
    scope: string;
    scopeRef: string | null;
    observationType: string;
    content: string;
    observedAt: string;
  }[];
  authorizedEvidence: readonly {
    evidenceRef: string;
    summary: string;
    objectiveRef: string;
  }[];
  adoptedLessonBrief?: {
    briefRef: string;
    teachingFocus: readonly string[];
    difficultyFocus: readonly string[];
    attentionPoints: readonly string[];
    knownGaps: readonly string[];
  } | null;
  currentReflectionDraft: ReflectionContent;
  promptBundleVersion?: 1 | 2;
}

export function assembleLessonReflectionModelRequest(
  input: LessonReflectionPromptInput
): ModelRequestV2 {
  const promptBundle = input.promptBundleVersion === 1
    ? lessonReflectionPromptBundleV1
    : lessonReflectionPromptBundleV2;
  return ModelRequestSchemaV2.parse({
    invocationRef: input.invocationRef,
    taskRunRef: input.taskRunRef,
    agentRunRef: input.agentRunRef,
    promptBundle,
    contextManifestRef: input.contextManifestRef,
    expectedOutputSchema: "lesson-reflection@1",
    timeoutMs: input.timeoutMs,
    maxOutputTokens: input.maxOutputTokens,
    responseFormat: input.responseFormat,
    messages: [
      { role: "system", content: systemInstruction },
      {
        role: "user",
        content: JSON.stringify({
          dataMode: "synthetic",
          teacherNotes: input.teacherNotes,
          courseRun: input.courseRun,
          lesson: input.lesson,
          learningObjectives: input.learningObjectives,
          approvedTeachingPlan: input.approvedTeachingPlan,
          confirmedDelivery: input.confirmedDelivery,
          confirmedObservations: input.confirmedObservations,
          authorizedEvidence: input.authorizedEvidence,
          ...(promptBundle.version >= 2
            ? { adoptedLessonBrief: input.adoptedLessonBrief ?? null }
            : {}),
          currentReflectionDraft: input.currentReflectionDraft,
          contextManifest: {
            contextManifestRef: input.contextManifestRef,
            sealed: true
          },
          outputConstraints: {
            schemaVersion: "lesson-reflection@1",
            teacherApprovalRequired: true,
            evidenceRefsMustBeAuthorized: true,
            observationRefsMustBeAuthorized: true,
            unknownsMustBeExplicit: true
          },
          teacherConfirmationBoundary:
            "模型只生成 Reflection Draft；正式课堂事实、反思确认和后续行动均由教师独立确认。"
        })
      }
    ],
    scope: {
      courseRunRef: input.courseRun.courseRunRef,
      lessonRef: input.lesson.lessonRef,
      learningObjectiveRefs: input.learningObjectives.map((item) => item.objectiveRef),
      evidenceRefs: input.authorizedEvidence.map((item) => item.evidenceRef)
    }
  });
}

export function assembleReflectionRepairRequest(input: {
  original: ModelRequestV2;
  invalidOutput: string;
  validationIssues: readonly string[];
}): ModelRequestV2 {
  const original = ModelRequestSchemaV2.parse(input.original);
  return ModelRequestSchemaV2.parse({
    ...original,
    invocationRef: `${original.invocationRef}:repair`,
    messages: [
      {
        role: "system",
        content: [
          systemInstruction,
          "这是同一 ModelExecution 的唯一一次受控修复。",
          "不得增加 Evidence、观察、资源、权限或任务范围。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          invalidOutput: input.invalidOutput.slice(0, 20_000),
          validationIssues: [...input.validationIssues],
          requiredScope: original.scope,
          requiredSchemaVersion: original.expectedOutputSchema
        })
      }
    ]
  });
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

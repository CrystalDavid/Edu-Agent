import { createHash } from "node:crypto";

import {
  ReflectionAnalysisSkillInputSchema,
  type ReflectionAnalysisSkillInput,
  type ReflectionSourceSnapshot
} from "./input-schema.js";

export type ReflectionAnalysisSourceKind =
  | "lesson"
  | "teaching_plan"
  | "delivery"
  | "observation"
  | "evidence"
  | "lesson_brief"
  | "teacher_adjustment";

export interface ReflectionAnalysisContextSourceRef {
  readonly kind: ReflectionAnalysisSourceKind;
  readonly ref: string;
  readonly version: string;
  readonly contentHash: string;
  readonly provenance: string;
  readonly included: boolean;
}

export interface ReflectionAnalysisContextBuildResult {
  readonly input: ReflectionAnalysisSkillInput;
  readonly manifest: {
    readonly purpose: "reflection_analysis";
    readonly resourceRefs: readonly string[];
    readonly evidenceRefs: readonly string[];
    readonly sourceRefs: readonly ReflectionAnalysisContextSourceRef[];
    readonly missingInformation: readonly string[];
    readonly excludedInformation: readonly string[];
    readonly requestedFieldMask: readonly string[];
    readonly estimatedTokens: number;
    readonly contentHash: string;
  };
  readonly evaluation: {
    readonly confirmedDeliveryPresent: boolean;
    readonly authorizedEvidenceOnly: boolean;
    readonly adoptedLessonBriefPresent: boolean;
    readonly excludedEvidenceCount: number;
    readonly estimatedTokens: number;
    readonly withinBudget: boolean;
    readonly passed: boolean;
  };
}

const maxObservations = 12;
const maxEvidence = 12;
const maxEstimatedTokens = 14_000;

export function buildReflectionAnalysisContext(
  value: unknown
): ReflectionAnalysisContextBuildResult {
  const input = ReflectionAnalysisSkillInputSchema.parse(value);
  const authorized = new Set(input.authorizedEvidenceRefs);
  const authorizedEvidence = input.selectedEvidence.filter((item) =>
    authorized.has(item.evidenceRef)
  );
  const unauthorizedEvidence = input.selectedEvidence
    .filter((item) => !authorized.has(item.evidenceRef))
    .map((item) => item.evidenceRef);
  const budgetExcludedEvidence = authorizedEvidence
    .slice(maxEvidence)
    .map((item) => item.evidenceRef);
  const includedEvidence = authorizedEvidence.slice(0, maxEvidence).map(
    (item) => ({ ...item, summary: shorten(item.summary, 360) })
  );
  const excludedEvidenceRefs = unique([
    ...input.excludedEvidenceRefs,
    ...unauthorizedEvidence,
    ...budgetExcludedEvidence
  ]);
  const sanitized = ReflectionAnalysisSkillInputSchema.parse({
    ...input,
    confirmedObservations: input.confirmedObservations
      .slice(0, maxObservations)
      .map((item) => ({ ...item, content: shorten(item.content, 500) })),
    selectedEvidence: includedEvidence,
    excludedEvidenceRefs
  });
  const sourceRefs: ReflectionAnalysisContextSourceRef[] = [
    source("lesson", sanitized.lesson.source, true),
    source("teaching_plan", sanitized.approvedTeachingPlan.source, true),
    source("delivery", sanitized.confirmedDelivery.source, true),
    ...sanitized.confirmedObservations.map((item) =>
      source("observation", item.source, true)
    ),
    ...sanitized.selectedEvidence.map((item) =>
      source("evidence", item.source, true)
    ),
    ...(sanitized.lessonBrief
      ? [source("lesson_brief", sanitized.lessonBrief.source, true)]
      : []),
    ...(sanitized.teacherAdjustment
      ? [{
          kind: "teacher_adjustment" as const,
          ref: `teacher-adjustment:${sha256(sanitized.teacherAdjustment).slice(0, 24)}`,
          version: "1",
          contentHash: sha256(sanitized.teacherAdjustment),
          provenance: "teacher_explicit_adjustment",
          included: true
        }]
      : []),
    ...excludedEvidenceRefs.map((ref) => ({
      kind: "evidence" as const,
      ref,
      version: "excluded",
      contentHash: sha256({ ref, excluded: true }),
      provenance: budgetExcludedEvidence.includes(ref)
        ? "excluded_by_context_budget"
        : "excluded_by_authorization_or_lesson_scope",
      included: false
    }))
  ];
  const missingInformation = unique([
    ...(sanitized.lessonBrief
      ? sanitized.lessonBrief.knownGaps
      : ["当前课时没有教师已采用的 Lesson Brief"]),
    ...(sanitized.confirmedObservations.length === 0
      ? ["本次没有教师明确选择的已确认课堂观察"]
      : []),
    ...(sanitized.selectedEvidence.length === 0
      ? ["本次没有教师明确选择的 Assignment Evidence"]
      : []),
    "尚未接入教材知识源",
    "尚未接入课程标准知识源"
  ]);
  const excludedInformation = excludedEvidenceRefs.map(
    (ref) => `Evidence ${ref} 未进入本次 Reflection Context`
  );
  const requestedFieldMask = [
    "lesson.objectives",
    "teachingPlan.approvedContent",
    "delivery.confirmedImplementation",
    "observation.confirmedSelection",
    "evidence.authorizedSelection",
    "lessonBrief.adoptedSelection",
    "reflection.currentDraft",
    "teacherAdjustment.explicit"
  ];
  const estimatedTokens = Math.ceil(JSON.stringify({
    lesson: sanitized.lesson,
    approvedTeachingPlan: sanitized.approvedTeachingPlan,
    confirmedDelivery: sanitized.confirmedDelivery,
    confirmedObservations: sanitized.confirmedObservations,
    selectedEvidence: sanitized.selectedEvidence,
    lessonBrief: sanitized.lessonBrief,
    currentReflectionDraft: sanitized.currentReflectionDraft,
    teacherAdjustment: sanitized.teacherAdjustment
  }).length / 4);
  const withinBudget = estimatedTokens <= maxEstimatedTokens;
  const manifestContent = {
    purpose: "reflection_analysis" as const,
    resourceRefs: sourceRefs
      .filter((item) => item.included && item.kind !== "evidence")
      .map((item) => item.ref),
    evidenceRefs: sanitized.selectedEvidence.map((item) => item.evidenceRef),
    sourceRefs,
    missingInformation,
    excludedInformation,
    requestedFieldMask,
    estimatedTokens
  };
  const authorizedEvidenceOnly = sanitized.selectedEvidence.every((item) =>
    authorized.has(item.evidenceRef)
  );
  return Object.freeze({
    input: sanitized,
    manifest: Object.freeze({
      ...manifestContent,
      contentHash: sha256(manifestContent)
    }),
    evaluation: Object.freeze({
      confirmedDeliveryPresent:
        sanitized.confirmedDelivery.deliveryRevisionRef.length > 0,
      authorizedEvidenceOnly,
      adoptedLessonBriefPresent: sanitized.lessonBrief?.status === "adopted",
      excludedEvidenceCount: excludedEvidenceRefs.length,
      estimatedTokens,
      withinBudget,
      passed: authorizedEvidenceOnly && withinBudget
    })
  });
}

function source(
  kind: ReflectionAnalysisSourceKind,
  value: ReflectionSourceSnapshot,
  included: boolean
): ReflectionAnalysisContextSourceRef {
  return { kind, ...value, included };
}

function shorten(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

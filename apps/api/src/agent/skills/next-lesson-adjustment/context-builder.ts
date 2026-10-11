import { createHash } from "node:crypto";

import {
  NextLessonAdjustmentSkillInputSchema,
  type NextLessonAdjustmentSkillInput
} from "./input-schema.js";

export type NextLessonContextSourceKind =
  | "source_lesson"
  | "target_lesson"
  | "confirmed_reflection"
  | "confirmed_delivery"
  | "evidence"
  | "preference"
  | "teacher_adjustment";

export interface NextLessonContextSourceRef {
  readonly kind: NextLessonContextSourceKind;
  readonly ref: string;
  readonly version: string;
  readonly contentHash: string;
  readonly provenance: string;
  readonly included: boolean;
}

export interface NextLessonAdjustmentContextBuildResult {
  readonly input: NextLessonAdjustmentSkillInput;
  readonly manifest: {
    readonly purpose: "next_lesson_adjustment";
    readonly resourceRefs: readonly string[];
    readonly evidenceRefs: readonly string[];
    readonly sourceRefs: readonly NextLessonContextSourceRef[];
    readonly missingInformation: readonly string[];
    readonly excludedInformation: readonly string[];
    readonly requestedFieldMask: readonly string[];
    readonly estimatedTokens: number;
    readonly contentHash: string;
  };
  readonly evaluation: {
    readonly confirmedReflectionPresent: boolean;
    readonly confirmedDeliveryPresent: boolean;
    readonly sameCourseRun: boolean;
    readonly authorizedEvidenceOnly: boolean;
    readonly excludedEvidenceCount: number;
    readonly preferenceCount: number;
    readonly estimatedTokens: number;
    readonly withinBudget: boolean;
    readonly passed: boolean;
  };
}

const maxEvidence = 8;
const maxPreferences = 6;
const maxEstimatedTokens = 8_000;

export function buildNextLessonAdjustmentContext(
  value: unknown
): NextLessonAdjustmentContextBuildResult {
  const input = NextLessonAdjustmentSkillInputSchema.parse(value);
  const authorized = new Set(input.authorizedEvidenceRefs);
  const authorizedEvidence = input.selectedEvidence.filter((item) =>
    authorized.has(item.evidenceRef)
  );
  const unauthorized = input.selectedEvidence
    .filter((item) => !authorized.has(item.evidenceRef))
    .map((item) => item.evidenceRef);
  const budgetExcluded = authorizedEvidence
    .slice(maxEvidence)
    .map((item) => item.evidenceRef);
  const selectedEvidence = authorizedEvidence.slice(0, maxEvidence).map(
    (item) => ({ ...item, summary: shorten(item.summary, 360) })
  );
  const confirmedPreferences = input.confirmedPreferences
    .slice(0, maxPreferences)
    .map((item) => ({
      ...item,
      preferenceValue: shorten(item.preferenceValue, 240)
    }));
  const excludedEvidenceRefs = [...new Set([
    ...input.excludedEvidenceRefs,
    ...unauthorized,
    ...budgetExcluded
  ])];
  const sanitized = NextLessonAdjustmentSkillInputSchema.parse({
    ...input,
    selectedEvidence,
    confirmedPreferences,
    excludedEvidenceRefs
  });
  const sourceRefs: NextLessonContextSourceRef[] = [
    source("source_lesson", sanitized.sourceLesson.source, true),
    source("target_lesson", sanitized.targetLesson.source, true),
    source("confirmed_reflection", sanitized.confirmedReflection.source, true),
    source("confirmed_delivery", sanitized.confirmedDelivery.source, true),
    ...sanitized.selectedEvidence.map((item) =>
      source("evidence", item.source, true)
    ),
    ...sanitized.confirmedPreferences.map((item) =>
      source("preference", item.source, true)
    ),
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
      provenance: budgetExcluded.includes(ref)
        ? "excluded_by_context_budget"
        : "excluded_by_authorization_or_reflection_scope",
      included: false
    }))
  ];
  const missingInformation = [
    ...(selectedEvidence.length === 0
      ? ["本次反思没有可用于下一课优化的已授权 Assignment Evidence"]
      : []),
    ...(confirmedPreferences.length === 0
      ? ["当前教师没有已确认且有效的教学偏好"]
      : []),
    "尚未接入教材知识源",
    "尚未接入课程标准知识源"
  ];
  const excludedInformation = excludedEvidenceRefs.map((ref) =>
    `Evidence ${ref} 未进入本次下一课优化上下文`
  );
  const requestedFieldMask = [
    "reflection.confirmedContent",
    "delivery.confirmedSummary",
    "lesson.summary",
    "evidence.authorizedSummary",
    "teacherPreference.confirmed",
    "teacherAdjustment.explicit"
  ];
  const estimatedTokens = Math.ceil(JSON.stringify({
    sourceLesson: sanitized.sourceLesson,
    targetLesson: sanitized.targetLesson,
    reflection: sanitized.confirmedReflection,
    delivery: sanitized.confirmedDelivery,
    evidence: sanitized.selectedEvidence,
    preferences: sanitized.confirmedPreferences,
    teacherAdjustment: sanitized.teacherAdjustment
  }).length / 4);
  const withinBudget = estimatedTokens <= maxEstimatedTokens;
  const sameCourseRun =
    sanitized.sourceLesson.courseRunRef === sanitized.targetLesson.courseRunRef;
  const manifestBase = {
    purpose: "next_lesson_adjustment" as const,
    resourceRefs: sourceRefs.filter((item) => item.included).map((item) => item.ref),
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
      ...manifestBase,
      contentHash: sha256(manifestBase)
    }),
    evaluation: Object.freeze({
      confirmedReflectionPresent:
        sanitized.confirmedReflection.reflectionRevisionRef.length > 0,
      confirmedDeliveryPresent:
        sanitized.confirmedDelivery.deliveryRevisionRef.length > 0,
      sameCourseRun,
      authorizedEvidenceOnly,
      excludedEvidenceCount: excludedEvidenceRefs.length,
      preferenceCount: confirmedPreferences.length,
      estimatedTokens,
      withinBudget,
      passed: sameCourseRun && authorizedEvidenceOnly && withinBudget
    })
  });
}

function source(
  kind: NextLessonContextSourceKind,
  value: { ref: string; version: string; contentHash: string; provenance: string },
  included: boolean
): NextLessonContextSourceRef {
  return { kind, ...value, included };
}

function shorten(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

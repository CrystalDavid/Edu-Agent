import { createHash } from "node:crypto";

import {
  ClassroomReflectionSkillInputSchema,
  type ClassroomReflectionSkillInput
} from "./input-schema.js";

export type ClassroomReflectionContextSourceKind =
  | "lesson"
  | "teaching_plan"
  | "teacher_feedback"
  | "evidence"
  | "observation_draft"
  | "preference";

export interface ClassroomReflectionContextSourceRef {
  readonly kind: ClassroomReflectionContextSourceKind;
  readonly ref: string;
  readonly version: string;
  readonly contentHash: string;
  readonly provenance: string;
  readonly included: boolean;
}

export interface ClassroomReflectionContextManifest {
  readonly purpose: "classroom_reflection";
  readonly resourceRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly sourceRefs: readonly ClassroomReflectionContextSourceRef[];
  readonly missingInformation: readonly string[];
  readonly excludedInformation: readonly string[];
  readonly requestedFieldMask: readonly string[];
  readonly estimatedTokens: number;
  readonly contentHash: string;
}

export interface ClassroomReflectionContextBuildResult {
  readonly input: ClassroomReflectionSkillInput;
  readonly manifest: ClassroomReflectionContextManifest;
  readonly evaluation: {
    readonly currentApprovedPlanPresent: boolean;
    readonly authorizedEvidenceOnly: boolean;
    readonly excludedEvidenceCount: number;
    readonly confirmedPreferenceCount: number;
    readonly estimatedTokens: number;
    readonly withinBudget: boolean;
    readonly passed: boolean;
  };
}

const maxEvidence = 6;
const maxObservationDrafts = 4;
const maxPreferences = 4;
const maxEstimatedTokens = 8_000;

export function buildClassroomReflectionContext(
  value: unknown
): ClassroomReflectionContextBuildResult {
  const input = ClassroomReflectionSkillInputSchema.parse(value);
  const authorized = new Set(input.authorizedEvidenceRefs);
  const authorizedEvidence = input.evidence.filter((item) =>
    authorized.has(item.evidenceRef)
  );
  const unauthorizedEvidence = input.evidence
    .filter((item) => !authorized.has(item.evidenceRef))
    .map((item) => item.evidenceRef);
  const budgetExcludedEvidence = authorizedEvidence
    .slice(maxEvidence)
    .map((item) => item.evidenceRef);
  const includedEvidence = authorizedEvidence.slice(0, maxEvidence).map(
    (item) => ({ ...item, summary: shorten(item.summary, 280) })
  );
  const includedObservationDrafts = input.observationDrafts
    .slice(0, maxObservationDrafts)
    .map((item) => ({ ...item, content: shorten(item.content, 280) }));
  const includedPreferences = input.confirmedPreferences
    .slice(0, maxPreferences)
    .map((item) => ({
      ...item,
      preferenceValue: shorten(item.preferenceValue, 180)
    }));
  const excludedEvidenceRefs = [
    ...new Set([
      ...input.excludedEvidenceRefs,
      ...unauthorizedEvidence,
      ...budgetExcludedEvidence
    ])
  ];
  const sanitizedInput = ClassroomReflectionSkillInputSchema.parse({
    ...input,
    evidence: includedEvidence,
    observationDrafts: includedObservationDrafts,
    confirmedPreferences: includedPreferences,
    excludedEvidenceRefs
  });
  const feedbackSource: ClassroomReflectionContextSourceRef = {
    kind: "teacher_feedback",
    ref: `teacher-feedback:${sha256(sanitizedInput.teacherFeedback).slice(0, 24)}`,
    version: "1",
    contentHash: sha256(sanitizedInput.teacherFeedback),
    provenance: "teacher_explicit_quick_feedback",
    included: true
  };
  const sourceRefs: ClassroomReflectionContextSourceRef[] = [
    source("lesson", sanitizedInput.lesson.source, true),
    source("teaching_plan", sanitizedInput.approvedTeachingPlan.source, true),
    feedbackSource,
    ...sanitizedInput.evidence.map((item) =>
      source("evidence", item.source, true)
    ),
    ...sanitizedInput.observationDrafts.map((item) =>
      source("observation_draft", item.source, true)
    ),
    ...sanitizedInput.confirmedPreferences.map((item) =>
      source("preference", item.source, true)
    ),
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
  const missingInformation = [
    ...(sanitizedInput.evidence.length === 0
      ? ["本次课堂整理没有使用已授权且已确认的作业 Evidence"]
      : []),
    ...(sanitizedInput.observationDrafts.length === 0
      ? ["首次快速反馈尚无绑定本次已确认课堂的 Observation Draft"]
      : []),
    ...(sanitizedInput.confirmedPreferences.length === 0
      ? ["当前没有已确认且有效的教师表达偏好"]
      : []),
    "课堂反馈仅来自教师快速选择，尚未由教师确认成为正式实施事实"
  ];
  const excludedInformation = excludedEvidenceRefs.map((ref) =>
    `Evidence ${ref} 未进入本次课堂反馈上下文`
  );
  const requestedFieldMask = [
    "lesson.summary",
    "teachingPlan.currentApproved",
    "teacherFeedback.explicit",
    "evidence.authorizedConfirmedSummary",
    "classroomObservation.draftAuthorized",
    "teacherPreference.confirmed"
  ];
  const estimatedTokens = Math.ceil(
    JSON.stringify({
      lesson: sanitizedInput.lesson,
      approvedTeachingPlan: sanitizedInput.approvedTeachingPlan,
      teacherFeedback: sanitizedInput.teacherFeedback,
      evidence: sanitizedInput.evidence,
      observationDrafts: sanitizedInput.observationDrafts,
      confirmedPreferences: sanitizedInput.confirmedPreferences
    }).length / 4
  );
  const withinBudget = estimatedTokens <= maxEstimatedTokens;
  const manifestContent = {
    purpose: "classroom_reflection" as const,
    resourceRefs: sourceRefs
      .filter((item) => item.included)
      .map((item) => item.ref),
    evidenceRefs: sanitizedInput.evidence.map((item) => item.evidenceRef),
    sourceRefs,
    missingInformation,
    excludedInformation,
    requestedFieldMask,
    estimatedTokens
  };
  const authorizedEvidenceOnly = sanitizedInput.evidence.every((item) =>
    authorized.has(item.evidenceRef)
  );
  return Object.freeze({
    input: sanitizedInput,
    manifest: Object.freeze({
      ...manifestContent,
      contentHash: sha256(manifestContent)
    }),
    evaluation: Object.freeze({
      currentApprovedPlanPresent:
        sanitizedInput.approvedTeachingPlan.revisionRef.length > 0,
      authorizedEvidenceOnly,
      excludedEvidenceCount: excludedEvidenceRefs.length,
      confirmedPreferenceCount: sanitizedInput.confirmedPreferences.length,
      estimatedTokens,
      withinBudget,
      passed: authorizedEvidenceOnly && withinBudget
    })
  });
}

function source(
  kind: ClassroomReflectionContextSourceKind,
  value: {
    ref: string;
    version: string;
    contentHash: string;
    provenance: string;
  },
  included: boolean
): ClassroomReflectionContextSourceRef {
  return { kind, ...value, included };
}

function shorten(value: string, maximum: number): string {
  return value.length <= maximum
    ? value
    : `${value.slice(0, maximum - 1)}…`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

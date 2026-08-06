import { createHash } from "node:crypto";

import type { MaterialKind } from "@edu-agent/contracts";

import {
  MaterialGenerationSkillInputSchema,
  type MaterialGenerationSkillInput
} from "./input-schema.js";

export type MaterialContextSourceKind =
  | "lesson"
  | "teaching_plan"
  | "lesson_brief"
  | "evidence"
  | "preference"
  | "material_requirement"
  | "teacher_adjustment";

export interface MaterialContextSourceRef {
  readonly kind: MaterialContextSourceKind;
  readonly ref: string;
  readonly version: string;
  readonly contentHash: string;
  readonly provenance: string;
  readonly included: boolean;
}

export interface MaterialGenerationContextManifest {
  readonly purpose: "material_generation";
  readonly resourceRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly sourceRefs: readonly MaterialContextSourceRef[];
  readonly requestedKinds: readonly MaterialKind[];
  readonly missingInformation: readonly string[];
  readonly excludedInformation: readonly string[];
  readonly requestedFieldMask: readonly string[];
  readonly estimatedTokens: number;
  readonly contentHash: string;
}

export interface MaterialGenerationContextBuildResult {
  readonly input: MaterialGenerationSkillInput;
  readonly manifest: MaterialGenerationContextManifest;
  readonly evaluation: {
    readonly currentApprovedPlanPresent: boolean;
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
const maxCandidatesPerGroup = 5;
const maxEstimatedTokens = 12_000;

export function buildMaterialGenerationContext(
  value: unknown
): MaterialGenerationContextBuildResult {
  const input = MaterialGenerationSkillInputSchema.parse(value);
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
    (item) => ({ ...item, summary: shorten(item.summary, 320) })
  );
  const preferences = input.confirmedPreferences
    .slice(0, maxPreferences)
    .map((item) => ({
      ...item,
      preferenceValue: shorten(item.preferenceValue, 240)
    }));
  const lessonBrief = input.lessonBrief
    ? {
        ...input.lessonBrief,
        teachingFocus: input.lessonBrief.teachingFocus.slice(
          0,
          maxCandidatesPerGroup
        ),
        difficultyFocus: input.lessonBrief.difficultyFocus.slice(
          0,
          maxCandidatesPerGroup
        ),
        attentionPoints: input.lessonBrief.attentionPoints.slice(
          0,
          maxCandidatesPerGroup
        ),
        knownGaps: input.lessonBrief.knownGaps.slice(0, 10)
      }
    : null;
  const excludedEvidenceRefs = [
    ...new Set([
      ...input.excludedEvidenceRefs,
      ...unauthorizedEvidence,
      ...budgetExcludedEvidence
    ])
  ];
  const sanitizedInput = MaterialGenerationSkillInputSchema.parse({
    ...input,
    lessonBrief,
    evidence: includedEvidence,
    confirmedPreferences: preferences,
    excludedEvidenceRefs
  });
  const sourceRefs: MaterialContextSourceRef[] = [
    source("lesson", sanitizedInput.lesson.source, true),
    source("teaching_plan", sanitizedInput.approvedTeachingPlan.source, true),
    ...(sanitizedInput.lessonBrief
      ? [source("lesson_brief", sanitizedInput.lessonBrief.source, true)]
      : []),
    ...sanitizedInput.evidence.map((item) =>
      source("evidence", item.source, true)
    ),
    ...sanitizedInput.confirmedPreferences.map((item) =>
      source("preference", item.source, true)
    ),
    ...sanitizedInput.requestedKinds.map((kind) => ({
      kind: "material_requirement" as const,
      ref: `material-kind:${kind}`,
      version: "1",
      contentHash: sha256({ kind }),
      provenance: "teacher_material_generation_request",
      included: true
    })),
    ...(sanitizedInput.teacherAdjustment
      ? [{
          kind: "teacher_adjustment" as const,
          ref: `teacher-adjustment:${sha256(sanitizedInput.teacherAdjustment).slice(0, 24)}`,
          version: "1",
          contentHash: sha256(sanitizedInput.teacherAdjustment),
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
  const missingInformation = [
    ...(sanitizedInput.lessonBrief
      ? sanitizedInput.lessonBrief.knownGaps
      : ["当前 approved TeachingPlan 没有关联教师已采用的 Lesson Brief"]),
    ...(sanitizedInput.evidence.length === 0
      ? ["当前 approved TeachingPlan 没有可用于材料生成的已授权 Evidence 摘要"]
      : []),
    ...(sanitizedInput.confirmedPreferences.length === 0
      ? ["当前教师没有已确认且有效的材料表达偏好"]
      : []),
    "尚未接入教材知识源",
    "尚未接入课程标准知识源"
  ].filter((item, index, all) => item.trim() && all.indexOf(item) === index);
  const excludedInformation = excludedEvidenceRefs.map((ref) =>
    `Evidence ${ref} 未进入本次材料上下文`
  );
  const requestedFieldMask = [
    "lesson.summary",
    "teachingPlan.currentApproved",
    "lessonBrief.teacherConfirmedSelection",
    "evidence.authorizedSummary",
    "teacherPreference.confirmed",
    "materialRequirement.explicit",
    "teacherAdjustment.explicit"
  ];
  const estimatedTokens = Math.ceil(
    JSON.stringify({
      lesson: sanitizedInput.lesson,
      approvedTeachingPlan: sanitizedInput.approvedTeachingPlan,
      lessonBrief: sanitizedInput.lessonBrief,
      evidence: sanitizedInput.evidence,
      confirmedPreferences: sanitizedInput.confirmedPreferences,
      requestedKinds: sanitizedInput.requestedKinds,
      teacherAdjustment: sanitizedInput.teacherAdjustment
    }).length / 4
  );
  const withinBudget = estimatedTokens <= maxEstimatedTokens;
  const manifestContent = {
    purpose: "material_generation" as const,
    resourceRefs: sourceRefs
      .filter((item) => item.included)
      .map((item) => item.ref),
    evidenceRefs: sanitizedInput.evidence.map((item) => item.evidenceRef),
    sourceRefs,
    requestedKinds: sanitizedInput.requestedKinds,
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
      preferenceCount: sanitizedInput.confirmedPreferences.length,
      estimatedTokens,
      withinBudget,
      passed: authorizedEvidenceOnly && withinBudget
    })
  });
}

function source(
  kind: MaterialContextSourceKind,
  value: {
    ref: string;
    version: string;
    contentHash: string;
    provenance: string;
  },
  included: boolean
): MaterialContextSourceRef {
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

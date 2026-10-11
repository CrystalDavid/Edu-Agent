import { createHash } from "node:crypto";

import type { LessonBriefSourceRef } from "@edu-agent/contracts";

import {
  LessonAnalysisSkillInputSchema,
  type LessonAnalysisSkillInput
} from "./input-schema.js";

export interface LessonAnalysisContextManifest {
  readonly purpose: "lesson_analysis";
  readonly resourceRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly sourceRefs: readonly LessonBriefSourceRef[];
  readonly missingInformation: readonly string[];
  readonly excludedInformation: readonly string[];
  readonly requestedFieldMask: readonly string[];
  readonly estimatedTokens: number;
  readonly contentHash: string;
}

export interface LessonAnalysisContextBuildResult {
  readonly input: LessonAnalysisSkillInput;
  readonly manifest: LessonAnalysisContextManifest;
  readonly evaluation: {
    readonly authorizedEvidenceOnly: boolean;
    readonly excludedEvidenceCount: number;
    readonly missingKnowledgeSources: readonly string[];
    readonly estimatedTokens: number;
    readonly passed: boolean;
  };
}

export function buildLessonAnalysisContext(
  value: unknown
): LessonAnalysisContextBuildResult {
  const input = LessonAnalysisSkillInputSchema.parse(value);
  const authorized = new Set(input.authorizedEvidenceRefs);
  const includedEvidence = input.evidence.filter((item) =>
    authorized.has(item.evidenceRef)
  );
  const excludedFromInput = input.evidence
    .filter((item) => !authorized.has(item.evidenceRef))
    .map((item) => item.evidenceRef);
  const excludedEvidenceRefs = [
    ...new Set([...input.excludedEvidenceRefs, ...excludedFromInput])
  ];
  const sanitizedInput = LessonAnalysisSkillInputSchema.parse({
    ...input,
    evidence: includedEvidence,
    excludedEvidenceRefs
  });
  const sourceRefs: LessonBriefSourceRef[] = [
    source("lesson", sanitizedInput.lesson.source, true),
    ...sanitizedInput.objectives.map((item) =>
      source("objective", item.source, true)
    ),
    ...sanitizedInput.evidence.map((item) =>
      source("evidence", item.source, true)
    ),
    ...(sanitizedInput.approvedTeachingPlan
      ? [source("teaching_plan", sanitizedInput.approvedTeachingPlan.source, true)]
      : []),
    ...sanitizedInput.confirmedPreferences.map((item) =>
      source("preference", item.source, true)
    ),
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
      provenance: "excluded_by_authorization_or_lesson_scope",
      included: false
    }))
  ];
  const missingInformation = [
    "尚未接入教材知识源",
    "尚未接入课程标准知识源",
    "尚未接入考点知识源",
    ...(sanitizedInput.evidence.length === 0
      ? ["当前课时没有已授权且可追溯的班级 Evidence"]
      : []),
    ...(sanitizedInput.approvedTeachingPlan
      ? []
      : ["当前课时没有已批准 TeachingPlan 可用于对照"])
  ];
  const requestedFieldMask = [
    "lesson.summary",
    "learningObjective.summary",
    "evidence.authorizedSummary",
    "teachingPlan.approvedSummary",
    "teacherPreference.confirmed",
    "teacherAdjustment.explicit"
  ];
  const estimatedTokens = estimateTokens({
    lesson: sanitizedInput.lesson,
    objectives: sanitizedInput.objectives,
    evidence: sanitizedInput.evidence,
    approvedTeachingPlan: sanitizedInput.approvedTeachingPlan,
    preferences: sanitizedInput.confirmedPreferences,
    teacherAdjustment: sanitizedInput.teacherAdjustment
  });
  const manifestContent = {
    purpose: "lesson_analysis" as const,
    resourceRefs: sourceRefs.filter((item) => item.included).map((item) => item.ref),
    evidenceRefs: sanitizedInput.evidence.map((item) => item.evidenceRef),
    sourceRefs,
    missingInformation,
    excludedInformation: excludedEvidenceRefs.map(
      (ref) => `Evidence ${ref} 未进入本次授权上下文`
    ),
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
      authorizedEvidenceOnly,
      excludedEvidenceCount: excludedEvidenceRefs.length,
      missingKnowledgeSources: missingInformation.filter((item) =>
        item.includes("知识源")
      ),
      estimatedTokens,
      passed: authorizedEvidenceOnly
    })
  });
}

function source(
  kind: LessonBriefSourceRef["kind"],
  value: { ref: string; version: string; contentHash: string; provenance: string },
  included: boolean
): LessonBriefSourceRef {
  return { kind, ...value, included };
}

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

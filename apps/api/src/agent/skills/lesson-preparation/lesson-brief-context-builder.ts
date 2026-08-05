import { createHash } from "node:crypto";

import type {
  ConfirmedTeacherPreferenceSnapshot
} from "../../../modules/personalization-memory-analytics/application/personalization-context-provider.js";
import {
  estimateContextTokens,
  type LessonPreparationContextPlan,
  type LessonPreparationSealedContext
} from "./context-builder.js";
import {
  LessonPreparationSkillInputSchemaV3,
  type LessonPreparationSkillInput,
  type LessonPreparationSkillInputV3
} from "./input-schema.js";
import {
  buildPersonalizedLessonPreparationContext,
  type PersonalizedLessonPreparationContextBuildResult
} from "./personalized-context-builder.js";

export const lessonBriefPreparationContextBuilderVersion =
  "lesson-preparation-context-builder@3" as const;

export interface LessonBriefPreparationManifest {
  readonly schemaVersion: 3;
  readonly builderVersion: typeof lessonBriefPreparationContextBuilderVersion;
  readonly baseManifestHash: string;
  readonly briefRef: string;
  readonly agentRunRef: string;
  readonly lessonRef: string;
  readonly contentHash: string;
  readonly contextManifestRef: string;
  readonly contextManifestHash: string;
  readonly generatedBySkillRef: "lesson-analysis@1";
  readonly selectedCandidateIds: readonly string[];
  readonly sourceVersionVector: Readonly<Record<string, string>>;
  readonly estimatedTokens: number;
  readonly totalEstimatedInputTokens: number;
  readonly contentHashOfManifest: string;
}

export interface LessonBriefContextEvaluation {
  readonly policyVersion: "lesson-brief-preparation-context-evaluation@1";
  readonly passed: boolean;
  readonly authorization: {
    readonly status: "passed" | "failed";
    readonly unauthorizedRefs: readonly string[];
  };
  readonly lifecycle: {
    readonly status: "passed";
    readonly inputKind: "teacher_adopted_only";
  };
  readonly consistency: {
    readonly status: "passed" | "failed";
    readonly issues: readonly string[];
  };
  readonly budget: {
    readonly status: "passed" | "failed";
    readonly tokenBudget: number;
    readonly totalEstimatedInputTokens: number;
  };
  readonly issues: readonly string[];
  readonly contentHash: string;
}

export interface LessonBriefPreparationContextBuildResult
  extends PersonalizedLessonPreparationContextBuildResult {
  readonly input: LessonPreparationSkillInputV3;
  readonly lessonBriefManifest: LessonBriefPreparationManifest;
  readonly lessonBriefEvaluation: LessonBriefContextEvaluation;
}

export function buildLessonBriefPreparationContext(input: {
  readonly contextPlan: LessonPreparationContextPlan;
  readonly sealedContext: LessonPreparationSealedContext;
  readonly skillInput: LessonPreparationSkillInput;
  readonly baselineRevisionRef: string;
  readonly confirmedPreferences: readonly ConfirmedTeacherPreferenceSnapshot[];
}): LessonBriefPreparationContextBuildResult {
  const parsed = LessonPreparationSkillInputSchemaV3.parse(input.skillInput);
  const personalized = buildPersonalizedLessonPreparationContext({
    ...input,
    skillInput: parsed
  });
  const brief = minimizeBrief(parsed.confirmedLessonBrief);
  const planRefs = new Set(input.contextPlan.authorizedResourceRefs);
  const sealedRefs = new Set(input.sealedContext.resourceRefs);
  const unauthorizedRefs = [brief.briefRef].filter(
    (reference) => !planRefs.has(reference) || !sealedRefs.has(reference)
  );
  const consistencyIssues: string[] = [];
  if (brief.lessonRef !== parsed.lesson.lessonRef) {
    consistencyIssues.push("Confirmed Lesson Brief does not belong to the prepared Lesson.");
  }
  if (brief.briefRef !== `lesson-brief-run:${brief.agentRunRef}`) {
    consistencyIssues.push("Confirmed Lesson Brief ref does not match its AgentRun.");
  }
  if (!parsed.taskWorkingSet.sourceResourceRefs.includes(brief.briefRef)) {
    consistencyIssues.push("TaskWorkingSet does not include the confirmed Lesson Brief ref.");
  }
  const candidateIds = unique([
    ...brief.teachingFocus,
    ...brief.difficultyFocus,
    ...brief.attentionPoints
  ].map((candidate) => candidate.candidateId));
  if (
    JSON.stringify(candidateIds) !==
    JSON.stringify(unique(brief.selectedCandidateIds))
  ) {
    consistencyIssues.push("Confirmed Lesson Brief selection does not match the included candidates.");
  }
  const authorizedEvidence = new Set(input.contextPlan.authorizedEvidenceRefs);
  const sealedEvidence = new Set(input.sealedContext.evidenceRefs);
  for (const summary of brief.classEvidenceSummary) {
    if (
      !authorizedEvidence.has(summary.evidenceRef) ||
      !sealedEvidence.has(summary.evidenceRef)
    ) {
      unauthorizedRefs.push(summary.evidenceRef);
    }
  }
  const estimatedTokens = estimateContextTokens(brief);
  const totalEstimatedInputTokens =
    personalized.personalizationManifest.totalEstimatedInputTokens +
    estimatedTokens;
  const issues = [
    ...unique(unauthorizedRefs).map(
      (reference) => `Lesson Brief context is not authorized and sealed: ${reference}`
    ),
    ...consistencyIssues
  ];
  if (totalEstimatedInputTokens > input.contextPlan.tokenBudget) {
    issues.push("Confirmed Lesson Brief exceeds the authorized context token budget.");
  }
  const evaluationPayload = {
    policyVersion: "lesson-brief-preparation-context-evaluation@1" as const,
    passed: issues.length === 0,
    authorization: {
      status: unauthorizedRefs.length === 0 ? "passed" as const : "failed" as const,
      unauthorizedRefs: unique(unauthorizedRefs)
    },
    lifecycle: {
      status: "passed" as const,
      inputKind: "teacher_adopted_only" as const
    },
    consistency: {
      status: consistencyIssues.length === 0 ? "passed" as const : "failed" as const,
      issues: unique(consistencyIssues)
    },
    budget: {
      status: totalEstimatedInputTokens <= input.contextPlan.tokenBudget
        ? "passed" as const
        : "failed" as const,
      tokenBudget: input.contextPlan.tokenBudget,
      totalEstimatedInputTokens
    },
    issues: unique(issues)
  };
  const lessonBriefEvaluation = Object.freeze({
    ...evaluationPayload,
    contentHash: hash(evaluationPayload)
  });
  if (!lessonBriefEvaluation.passed) {
    throw new Error(
      `Lesson Brief preparation context evaluation failed: ${lessonBriefEvaluation.issues.join(" ")}`
    );
  }
  const skillInput = LessonPreparationSkillInputSchemaV3.parse({
    ...personalized.input,
    taskWorkingSet: parsed.taskWorkingSet,
    confirmedLessonBrief: brief
  });
  const manifestPayload = {
    schemaVersion: 3 as const,
    builderVersion: lessonBriefPreparationContextBuilderVersion,
    baseManifestHash: personalized.personalizationManifest.contentHash,
    briefRef: brief.briefRef,
    agentRunRef: brief.agentRunRef,
    lessonRef: brief.lessonRef,
    contentHash: brief.contentHash,
    contextManifestRef: brief.contextManifestRef,
    contextManifestHash: brief.contextManifestHash,
    generatedBySkillRef: brief.generatedBySkillRef,
    selectedCandidateIds: unique(brief.selectedCandidateIds),
    sourceVersionVector: brief.sourceVersionVector,
    estimatedTokens,
    totalEstimatedInputTokens
  };
  const lessonBriefManifest = Object.freeze({
    ...manifestPayload,
    contentHashOfManifest: hash(manifestPayload)
  });
  return Object.freeze({
    ...personalized,
    input: skillInput,
    lessonBriefManifest,
    lessonBriefEvaluation
  });
}

function minimizeBrief(
  brief: LessonPreparationSkillInputV3["confirmedLessonBrief"]
): LessonPreparationSkillInputV3["confirmedLessonBrief"] {
  const candidates = (items: typeof brief.teachingFocus) => items.map((item) => ({
    ...item,
    title: compact(item.title, 180),
    explanation: compact(item.explanation, 520),
    basisRefs: unique(item.basisRefs)
  }));
  return LessonPreparationSkillInputSchemaV3.shape.confirmedLessonBrief.parse({
    ...brief,
    selectedCandidateIds: unique(brief.selectedCandidateIds),
    teachingFocus: candidates(brief.teachingFocus),
    difficultyFocus: candidates(brief.difficultyFocus),
    attentionPoints: candidates(brief.attentionPoints),
    classEvidenceSummary: brief.classEvidenceSummary.map((summary) => ({
      ...summary,
      summary: compact(summary.summary, 600),
      objectiveRefs: unique(summary.objectiveRefs),
      sourceRefs: unique(summary.sourceRefs)
    })),
    knownGaps: unique(brief.knownGaps.map((gap) => compact(gap, 320)))
  });
}

function compact(value: string, maxLength: number): string {
  const normalized = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}


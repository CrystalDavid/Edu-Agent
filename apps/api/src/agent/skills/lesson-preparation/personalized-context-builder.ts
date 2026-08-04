import { createHash } from "node:crypto";

import type {
  ConfirmedTeacherPreferenceSnapshot
} from "../../../modules/personalization-memory-analytics/application/personalization-context-provider.js";
import {
  buildLessonPreparationContext,
  estimateContextTokens,
  type LessonPreparationContextBuildResult,
  type LessonPreparationContextPlan,
  type LessonPreparationSealedContext
} from "./context-builder.js";
import {
  LessonPreparationSkillInputSchemaV2,
  type ConfirmedTeacherPreference,
  type LessonPreparationSkillInput,
  type LessonPreparationSkillInputV2
} from "./input-schema.js";

export const personalizedLessonPreparationContextBuilderVersion =
  "lesson-preparation-context-builder@2" as const;

export interface PersonalizedPreferenceManifestEntry {
  readonly preferenceRef: string;
  readonly preferenceKey: string;
  readonly version: number;
  readonly contentHash: string;
  readonly sourceCandidateRef: string;
  readonly estimatedTokens: number;
}

export interface PersonalizedLessonPreparationManifest {
  readonly schemaVersion: 2;
  readonly builderVersion: typeof personalizedLessonPreparationContextBuilderVersion;
  readonly baseManifestHash: string;
  readonly confirmedPreferences: readonly PersonalizedPreferenceManifestEntry[];
  readonly excludedPreferences: readonly {
    preferenceRef: string;
    reason: "owner_mismatch" | "duplicate_key" | "token_budget";
  }[];
  readonly preferenceTokenUsage: number;
  readonly totalEstimatedInputTokens: number;
  readonly contentHash: string;
}

export interface PreferenceContextEvaluation {
  readonly policyVersion: "teacher-preference-context-evaluation@1";
  readonly passed: boolean;
  readonly ownerScope: {
    readonly status: "passed" | "failed";
    readonly rejectedRefs: readonly string[];
  };
  readonly lifecycle: {
    readonly status: "passed";
    readonly inputKind: "confirmed_active_only";
  };
  readonly minimization: {
    readonly status: "passed" | "needs_review";
    readonly includedCount: number;
    readonly excludedCount: number;
  };
  readonly budget: {
    readonly status: "passed" | "failed";
    readonly tokenBudget: number;
    readonly totalEstimatedInputTokens: number;
  };
  readonly issues: readonly string[];
  readonly contentHash: string;
}

export interface PersonalizedLessonPreparationContextBuildResult
  extends LessonPreparationContextBuildResult {
  readonly input: LessonPreparationSkillInputV2;
  readonly personalizationManifest: PersonalizedLessonPreparationManifest;
  readonly preferenceEvaluation: PreferenceContextEvaluation;
}

export function buildPersonalizedLessonPreparationContext(input: {
  readonly contextPlan: LessonPreparationContextPlan;
  readonly sealedContext: LessonPreparationSealedContext;
  readonly skillInput: LessonPreparationSkillInput;
  readonly baselineRevisionRef: string;
  readonly confirmedPreferences: readonly ConfirmedTeacherPreferenceSnapshot[];
}): PersonalizedLessonPreparationContextBuildResult {
  const base = buildLessonPreparationContext({
    contextPlan: input.contextPlan,
    sealedContext: input.sealedContext,
    skillInput: input.skillInput,
    baselineRevisionRef: input.baselineRevisionRef
  });
  const rejectedRefs = input.confirmedPreferences
    .filter(
      (preference) =>
        preference.tenantRef !== input.contextPlan.tenantRef ||
        preference.teacherRef !== input.contextPlan.actorRef
    )
    .map((preference) => preference.preferenceRef);
  const scoped = input.confirmedPreferences
    .filter((preference) => !rejectedRefs.includes(preference.preferenceRef))
    .sort((left, right) =>
      left.preferenceKey.localeCompare(right.preferenceKey) ||
      right.version - left.version ||
      left.preferenceRef.localeCompare(right.preferenceRef)
    );
  const byKey = new Map<string, ConfirmedTeacherPreferenceSnapshot>();
  const excludedPreferences: Array<{
    preferenceRef: string;
    reason: "owner_mismatch" | "duplicate_key" | "token_budget";
  }> = rejectedRefs.map((preferenceRef) => ({
    preferenceRef,
    reason: "owner_mismatch"
  }));
  for (const preference of scoped) {
    if (byKey.has(preference.preferenceKey)) {
      excludedPreferences.push({
        preferenceRef: preference.preferenceRef,
        reason: "duplicate_key"
      });
      continue;
    }
    byKey.set(preference.preferenceKey, preference);
  }
  const confirmedPreferences: ConfirmedTeacherPreference[] = [];
  let preferenceTokenUsage = 0;
  for (const preference of byKey.values()) {
    const candidate: ConfirmedTeacherPreference = {
      preferenceRef: preference.preferenceRef,
      preferenceKey: preference.preferenceKey,
      preferenceValue: preference.preferenceValue,
      version: preference.version,
      contentHash: preference.contentHash,
      sourceCandidateRef: preference.sourceCandidateRef
    };
    const tokens = estimateContextTokens(candidate);
    if (
      base.manifest.tokenUsage.estimatedInputTokens +
        preferenceTokenUsage +
        tokens >
      input.contextPlan.tokenBudget
    ) {
      excludedPreferences.push({
        preferenceRef: preference.preferenceRef,
        reason: "token_budget"
      });
      continue;
    }
    confirmedPreferences.push(Object.freeze(candidate));
    preferenceTokenUsage += tokens;
  }
  const totalEstimatedInputTokens =
    base.manifest.tokenUsage.estimatedInputTokens + preferenceTokenUsage;
  const issues = [
    ...rejectedRefs.map(
      (reference) => `TeacherPreference is outside the active owner scope: ${reference}`
    )
  ];
  if (totalEstimatedInputTokens > input.contextPlan.tokenBudget) {
    issues.push("Confirmed preferences exceed the authorized context token budget.");
  }
  const evaluationWithoutHash = {
    policyVersion: "teacher-preference-context-evaluation@1" as const,
    passed: issues.length === 0,
    ownerScope: {
      status: rejectedRefs.length === 0 ? "passed" as const : "failed" as const,
      rejectedRefs: unique(rejectedRefs)
    },
    lifecycle: {
      status: "passed" as const,
      inputKind: "confirmed_active_only" as const
    },
    minimization: {
      status: excludedPreferences.length === 0
        ? "passed" as const
        : "needs_review" as const,
      includedCount: confirmedPreferences.length,
      excludedCount: excludedPreferences.length
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
  const preferenceEvaluation = Object.freeze({
    ...evaluationWithoutHash,
    contentHash: hash(evaluationWithoutHash)
  });
  if (!preferenceEvaluation.passed) {
    throw new Error(
      `Teacher Preference context evaluation failed: ${preferenceEvaluation.issues.join(" ")}`
    );
  }
  const inputV2 = LessonPreparationSkillInputSchemaV2.parse({
    ...base.input,
    confirmedPreferences
  });
  const manifestEntries = confirmedPreferences.map((preference) => ({
    preferenceRef: preference.preferenceRef,
    preferenceKey: preference.preferenceKey,
    version: preference.version,
    contentHash: preference.contentHash,
    sourceCandidateRef: preference.sourceCandidateRef,
    estimatedTokens: estimateContextTokens(preference)
  }));
  const manifestWithoutHash = {
    schemaVersion: 2 as const,
    builderVersion: personalizedLessonPreparationContextBuilderVersion,
    baseManifestHash: base.manifest.contentHash,
    confirmedPreferences: manifestEntries,
    excludedPreferences,
    preferenceTokenUsage,
    totalEstimatedInputTokens
  };
  const personalizationManifest = Object.freeze({
    ...manifestWithoutHash,
    contentHash: hash(manifestWithoutHash)
  });
  return Object.freeze({
    ...base,
    input: inputV2,
    personalizationManifest,
    preferenceEvaluation
  });
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

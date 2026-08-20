import type { MemoryScopeQuery } from "@edu-agent/contracts";

import type { TeacherPreference } from "./memory-candidate.js";
import {
  memoryScopeMatches,
  memoryScopeQueryHash,
  memoryScopeRank,
  normalizeMemoryScopeQuery
} from "./memory-scope.js";

export const teacherPreferenceRetrievalPolicyVersion =
  "teacher-preference-retrieval@2" as const;

export type ScopedPreferenceExclusionReason =
  | "scope_mismatch"
  | "not_yet_valid"
  | "expired"
  | "skill_not_allowed"
  | "more_specific_scope"
  | "more_specific_skill_scope"
  | "superseded";

export interface ResolvedTeacherPreference {
  readonly preference: TeacherPreference;
  readonly matchSpecificity: number;
  readonly matchedSkillConstraint: boolean;
}

export interface ExcludedTeacherPreference {
  readonly preferenceRef: string;
  readonly version: number;
  readonly contentHash: string;
  readonly canonicalKey: string;
  readonly scopeFingerprint: string;
  readonly scopeKind: TeacherPreference["scope"]["kind"];
  readonly matchSpecificity: number;
  readonly matchedSkillConstraint: boolean;
  readonly reasonCode: ScopedPreferenceExclusionReason;
  readonly preference?: TeacherPreference;
}

export interface TeacherPreferenceResolution {
  readonly memoryEpoch: number;
  readonly policyVersion: typeof teacherPreferenceRetrievalPolicyVersion;
  readonly queryScopeHash: string;
  readonly query: MemoryScopeQuery;
  readonly selected: readonly ResolvedTeacherPreference[];
  readonly excluded: readonly ExcludedTeacherPreference[];
}

export function resolveTeacherPreferences(input: {
  readonly owner: { readonly tenantRef: string; readonly teacherRef: string };
  readonly preferences: readonly TeacherPreference[];
  readonly memoryEpoch: number;
  readonly useCase: string;
  readonly skillId: string;
  readonly query: MemoryScopeQuery;
  readonly at: string;
}): TeacherPreferenceResolution {
  const at = Date.parse(input.at);
  if (!Number.isFinite(at)) {
    throw new Error("TeacherPreference resolution requires a valid timestamp.");
  }
  const query = normalizeMemoryScopeQuery(input.query);
  const eligible: ResolvedTeacherPreference[] = [];
  const excluded: ExcludedTeacherPreference[] = [];
  for (const preference of input.preferences) {
    if (
      preference.owner.tenantRef !== input.owner.tenantRef ||
      preference.owner.teacherRef !== input.owner.teacherRef
    ) {
      throw new Error("TeacherPreference resolution crossed owner scope.");
    }
    if (preference.status !== "active") continue;
    if (Date.parse(preference.validFrom) > at) {
      excluded.push(minimalExclusion(preference, "not_yet_valid"));
      continue;
    }
    if (
      preference.validUntil !== null &&
      at >= Date.parse(preference.validUntil)
    ) {
      excluded.push(minimalExclusion(preference, "expired"));
      continue;
    }
    if (!memoryScopeMatches(preference.scope, query)) {
      excluded.push(minimalExclusion(preference, "scope_mismatch"));
      continue;
    }
    if (
      preference.scope.skillIds.length > 0 &&
      !preference.scope.skillIds.includes(input.skillId)
    ) {
      excluded.push(minimalExclusion(preference, "skill_not_allowed"));
      continue;
    }
    eligible.push({
      preference,
      matchSpecificity: memoryScopeRank(preference.scope),
      matchedSkillConstraint: preference.scope.skillIds.length > 0
    });
  }

  const selected: ResolvedTeacherPreference[] = [];
  const byCanonicalKey = new Map<string, ResolvedTeacherPreference[]>();
  for (const entry of eligible) {
    const current = byCanonicalKey.get(entry.preference.canonicalKey) ?? [];
    current.push(entry);
    byCanonicalKey.set(entry.preference.canonicalKey, current);
  }
  for (const entries of byCanonicalKey.values()) {
    const ordered = [...entries].sort(comparePreferenceResolution);
    const winner = ordered[0]!;
    selected.push(winner);
    for (const loser of ordered.slice(1)) {
      const reasonCode =
        winner.matchSpecificity > loser.matchSpecificity
          ? "more_specific_scope"
          : winner.matchedSkillConstraint && !loser.matchedSkillConstraint
            ? "more_specific_skill_scope"
            : "superseded";
      excluded.push({
        ...minimalExclusion(loser.preference, reasonCode),
        preference: loser.preference
      });
    }
  }

  selected.sort((left, right) =>
    compareText(
      left.preference.canonicalKey,
      right.preference.canonicalKey
    ) || comparePreferenceResolution(left, right)
  );
  excluded.sort((left, right) =>
    compareText(left.canonicalKey, right.canonicalKey) ||
    compareText(left.preferenceRef, right.preferenceRef) ||
    compareText(left.reasonCode, right.reasonCode)
  );
  return Object.freeze({
    memoryEpoch: input.memoryEpoch,
    policyVersion: teacherPreferenceRetrievalPolicyVersion,
    queryScopeHash: memoryScopeQueryHash({
      owner: input.owner,
      query,
      skillId: input.skillId,
      useCase: input.useCase
    }),
    query,
    selected: Object.freeze(selected),
    excluded: Object.freeze(excluded)
  });
}

function comparePreferenceResolution(
  left: ResolvedTeacherPreference,
  right: ResolvedTeacherPreference
): number {
  return right.matchSpecificity - left.matchSpecificity ||
    Number(right.matchedSkillConstraint) -
      Number(left.matchedSkillConstraint) ||
    explicitnessRank(right.preference.explicitness) -
      explicitnessRank(left.preference.explicitness) ||
    right.preference.version - left.preference.version ||
    right.preference.updatedAt.localeCompare(left.preference.updatedAt) ||
    compareText(
      left.preference.preferenceRef,
      right.preference.preferenceRef
    );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function explicitnessRank(
  value: TeacherPreference["explicitness"]
): number {
  return value === "teacher_declared" ? 2 : 1;
}

function minimalExclusion(
  preference: TeacherPreference,
  reasonCode: ScopedPreferenceExclusionReason
): ExcludedTeacherPreference {
  return {
    preferenceRef: preference.preferenceRef,
    version: preference.version,
    contentHash: preference.contentHash,
    canonicalKey: preference.canonicalKey,
    scopeFingerprint: preference.scopeFingerprint,
    scopeKind: preference.scope.kind,
    matchSpecificity: memoryScopeRank(preference.scope),
    matchedSkillConstraint: preference.scope.skillIds.length > 0,
    reasonCode
  };
}

import type {
  MemoryScope,
  MemoryScopeQuery
} from "@edu-agent/contracts";

export interface ConfirmedTeacherPreferenceSnapshot {
  readonly tenantRef: string;
  readonly teacherRef: string;
  readonly preferenceRef: string;
  readonly preferenceKey: string;
  readonly preferenceValue: string;
  readonly version: number;
  readonly contentHash: string;
  readonly sourceCandidateRef: string;
  readonly confirmedAt: string;
  readonly updatedAt: string;
  readonly canonicalKey?: string;
  readonly scope?: MemoryScope;
  readonly scopeFingerprint?: string;
  readonly validFrom?: string;
  readonly validUntil?: string | null;
  readonly explicitness?:
    | "teacher_declared"
    | "teacher_confirmed_inferred";
  readonly consentBasis?:
    | "teacher_settings_confirmed"
    | "teacher_explicit_command";
  readonly consentVersion?: string;
  readonly policyVersion?: string;
}

export interface ResolvedTeacherPreferenceSnapshot
  extends ConfirmedTeacherPreferenceSnapshot {
  readonly canonicalKey: string;
  readonly scope: MemoryScope;
  readonly scopeFingerprint: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly explicitness:
    | "teacher_declared"
    | "teacher_confirmed_inferred";
  readonly consentBasis:
    | "teacher_settings_confirmed"
    | "teacher_explicit_command";
  readonly consentVersion: string;
  readonly policyVersion: string;
  readonly matchSpecificity: number;
  readonly matchedSkillConstraint: boolean;
}

export interface ExcludedTeacherPreferenceSnapshot {
  readonly preferenceRef: string;
  readonly version: number;
  readonly contentHash: string;
  readonly canonicalKey: string;
  readonly scopeFingerprint: string;
  readonly scopeKind: MemoryScope["kind"];
  readonly matchSpecificity: number;
  readonly matchedSkillConstraint: boolean;
  readonly reasonCode:
    | "scope_mismatch"
    | "not_yet_valid"
    | "expired"
    | "skill_not_allowed"
    | "more_specific_scope"
    | "more_specific_skill_scope"
    | "superseded";
  readonly preferenceKey?: string;
  readonly preferenceValue?: string;
  readonly scope?: MemoryScope;
}

export interface ResolvedConfirmedPreferences {
  readonly memoryEpoch: number;
  readonly policyVersion: string;
  readonly queryScopeHash: string;
  readonly selected: readonly ResolvedTeacherPreferenceSnapshot[];
  readonly excluded: readonly ExcludedTeacherPreferenceSnapshot[];
}

export interface PersonalizationContextProvider {
  listConfirmedPreferences(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
  }): Promise<readonly ConfirmedTeacherPreferenceSnapshot[]>;
  resolveConfirmedPreferences(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly useCase: string;
    readonly skillId: string;
    readonly subject: string | null;
    readonly gradeLevel: string | null;
    readonly courseRunRef: string | null;
    readonly lessonRef: string | null;
    readonly taskRef: string | null;
    readonly at: string;
  }): Promise<ResolvedConfirmedPreferences>;
}

export interface ConfirmedTeacherPreferenceSnapshot {
  readonly preferenceRef: string;
  readonly preferenceKey: string;
  readonly preferenceValue: string;
  readonly version: number;
  readonly contentHash: string;
  readonly sourceCandidateRef: string;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface PersonalizationContextProvider {
  listConfirmedPreferences(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
  }): Promise<readonly ConfirmedTeacherPreferenceSnapshot[]>;
}

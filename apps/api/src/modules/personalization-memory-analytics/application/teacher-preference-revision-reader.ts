import type {
  MemoryApplicationOwner
} from "./memory-application-recorder.js";
import type {
  MemoryScope,
  TeacherPreferenceConsentBasis,
  TeacherPreferenceExplicitness
} from "@edu-agent/contracts";

export interface TeacherPreferenceRevisionResolution {
  readonly preferenceRef: string;
  readonly preferenceVersion: number;
  readonly preferenceKey: string;
  readonly preferenceValue: string;
  readonly canonicalKey: string;
  readonly scope: MemoryScope;
  readonly scopeFingerprint: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly explicitness: TeacherPreferenceExplicitness;
  readonly consentBasis: TeacherPreferenceConsentBasis;
  readonly consentVersion: string;
  readonly policyVersion: string;
  readonly preferenceContentHash: string;
  readonly sourceCandidateRef: string;
  readonly confirmedAt: string;
  readonly updatedAt: string;
  readonly statusAtRun: "active" | "revoked";
  readonly currentStatus: "active" | "revoked";
  readonly currentVersion: number;
  readonly revokedAt: string | null;
}

export interface TeacherPreferenceRevisionReader {
  resolvePreferenceRevision(input: {
    readonly owner: MemoryApplicationOwner;
    readonly preferenceRef: string;
    readonly preferenceVersion: number;
    readonly expectedContentHash: string;
  }): Promise<TeacherPreferenceRevisionResolution | null>;
}

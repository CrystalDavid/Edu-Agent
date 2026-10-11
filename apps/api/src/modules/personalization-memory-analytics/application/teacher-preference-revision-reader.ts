import type {
  MemoryApplicationOwner
} from "./memory-application-recorder.js";

export interface TeacherPreferenceRevisionResolution {
  readonly preferenceRef: string;
  readonly preferenceVersion: number;
  readonly preferenceKey: string;
  readonly preferenceValue: string;
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

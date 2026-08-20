import type {
  MemoryCandidateRepository
} from "../application/memory-candidate-service.js";
import type {
  MemoryCandidate,
  TeacherPreference
} from "../domain/index.js";

export class InMemoryMemoryCandidateRepository
  implements MemoryCandidateRepository
{
  readonly #candidateHistory = new Map<string, MemoryCandidate[]>();
  readonly #preferenceHistory = new Map<string, TeacherPreference[]>();
  readonly #memoryEpochs = new Map<string, number>();

  async getCandidate(candidateRef: string): Promise<MemoryCandidate | null> {
    return this.#candidateHistory.get(candidateRef)?.at(-1) ?? null;
  }

  async saveCandidate(input: {
    readonly candidate: MemoryCandidate;
    readonly expectedPreviousVersion: number | null;
  }): Promise<void> {
    const history = this.#candidateHistory.get(input.candidate.candidateRef) ?? [];
    assertExpectedVersion(history.at(-1)?.version ?? null, input.expectedPreviousVersion);
    history.push(input.candidate);
    this.#candidateHistory.set(input.candidate.candidateRef, history);
  }

  async saveConfirmation(input: {
    readonly candidate: MemoryCandidate;
    readonly expectedCandidateVersion: number;
    readonly preference: TeacherPreference | null;
  }): Promise<void> {
    const candidateHistory = this.#candidateHistory.get(
      input.candidate.candidateRef
    ) ?? [];
    assertExpectedVersion(
      candidateHistory.at(-1)?.version ?? null,
      input.expectedCandidateVersion
    );
    if (input.preference) {
      const preferenceHistory = this.#preferenceHistory.get(
        input.preference.preferenceRef
      ) ?? [];
      assertExpectedVersion(
        preferenceHistory.at(-1)?.version ?? null,
        null
      );
      candidateHistory.push(input.candidate);
      preferenceHistory.push(input.preference);
      this.#candidateHistory.set(
        input.candidate.candidateRef,
        candidateHistory
      );
      this.#preferenceHistory.set(
        input.preference.preferenceRef,
        preferenceHistory
      );
      this.bumpEpoch(input.preference);
      return;
    }
    candidateHistory.push(input.candidate);
    this.#candidateHistory.set(input.candidate.candidateRef, candidateHistory);
  }

  async listCandidateHistory(
    candidateRef: string
  ): Promise<readonly MemoryCandidate[]> {
    return Object.freeze([...(this.#candidateHistory.get(candidateRef) ?? [])]);
  }

  async listCandidates(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly statuses?: readonly MemoryCandidate["status"][];
  }): Promise<readonly MemoryCandidate[]> {
    const statuses = input.statuses ? new Set(input.statuses) : null;
    return Object.freeze(
      [...this.#candidateHistory.values()]
        .map((history) => history.at(-1))
        .filter((candidate): candidate is MemoryCandidate => Boolean(candidate))
        .filter(
          (candidate) =>
            candidate.owner.tenantRef === input.tenantRef &&
            candidate.owner.teacherRef === input.teacherRef &&
            (!statuses || statuses.has(candidate.status))
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    );
  }

  async getPreference(preferenceRef: string): Promise<TeacherPreference | null> {
    return this.#preferenceHistory.get(preferenceRef)?.at(-1) ?? null;
  }

  async getPreferenceByCandidate(
    candidateRef: string
  ): Promise<TeacherPreference | null> {
    for (const history of this.#preferenceHistory.values()) {
      const latest = history.at(-1);
      if (latest?.sourceCandidateRef === candidateRef) return latest;
    }
    return null;
  }

  async savePreference(input: {
    readonly preference: TeacherPreference;
    readonly expectedPreviousVersion: number | null;
  }): Promise<void> {
    const history = this.#preferenceHistory.get(input.preference.preferenceRef) ?? [];
    assertExpectedVersion(history.at(-1)?.version ?? null, input.expectedPreviousVersion);
    history.push(input.preference);
    this.#preferenceHistory.set(input.preference.preferenceRef, history);
    this.bumpEpoch(input.preference);
  }

  async listPreferenceHistory(
    preferenceRef: string
  ): Promise<readonly TeacherPreference[]> {
    return Object.freeze([...(this.#preferenceHistory.get(preferenceRef) ?? [])]);
  }

  async listPreferences(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly statuses?: readonly TeacherPreference["status"][];
  }): Promise<readonly TeacherPreference[]> {
    const statuses = input.statuses ? new Set(input.statuses) : null;
    return Object.freeze(
      [...this.#preferenceHistory.values()]
        .map((history) => history.at(-1))
        .filter((preference): preference is TeacherPreference => Boolean(preference))
        .filter(
          (preference) =>
            preference.owner.tenantRef === input.tenantRef &&
            preference.owner.teacherRef === input.teacherRef &&
            (!statuses || statuses.has(preference.status))
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    );
  }

  async getMemoryEpoch(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
  }): Promise<number> {
    return this.#memoryEpochs.get(ownerKey(input)) ?? 0;
  }

  private bumpEpoch(preference: TeacherPreference): void {
    const key = ownerKey(preference.owner);
    this.#memoryEpochs.set(key, (this.#memoryEpochs.get(key) ?? 0) + 1);
  }
}

function ownerKey(input: {
  readonly tenantRef: string;
  readonly teacherRef: string;
}): string {
  return `${input.tenantRef}|${input.teacherRef}`;
}

function assertExpectedVersion(
  actual: number | null,
  expected: number | null
): void {
  if (actual !== expected) {
    throw new Error(
      `Memory repository version conflict: expected ${String(expected)}, received ${String(actual)}.`
    );
  }
}

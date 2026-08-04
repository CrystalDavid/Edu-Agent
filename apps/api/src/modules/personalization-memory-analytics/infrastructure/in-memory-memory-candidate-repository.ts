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
  }

  async listPreferenceHistory(
    preferenceRef: string
  ): Promise<readonly TeacherPreference[]> {
    return Object.freeze([...(this.#preferenceHistory.get(preferenceRef) ?? [])]);
  }
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

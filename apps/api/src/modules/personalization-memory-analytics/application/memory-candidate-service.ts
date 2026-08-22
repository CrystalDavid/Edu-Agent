import {
  confirmMemoryCandidate,
  createMemoryCandidate,
  evaluateMemoryCandidate,
  expireMemoryCandidate,
  rejectMemoryCandidate,
  revokeTeacherPreference,
  updateTeacherPreference,
  type MemoryCandidate,
  type MemoryCandidateContent,
  type MemoryCandidateType,
  type MemoryOwner,
  type MemorySourceReference,
  type TeacherPreference
} from "../domain/index.js";

export interface MemoryRepository {
  getCandidate(candidateRef: string): Promise<MemoryCandidate | null>;
  saveCandidate(input: {
    readonly candidate: MemoryCandidate;
    readonly expectedPreviousVersion: number | null;
  }): Promise<void>;
  listCandidateHistory(candidateRef: string): Promise<readonly MemoryCandidate[]>;
  listCandidates(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly statuses?: readonly MemoryCandidate["status"][];
  }): Promise<readonly MemoryCandidate[]>;
}

export interface PreferenceRepository {
  getPreference(preferenceRef: string): Promise<TeacherPreference | null>;
  getPreferenceByCandidate(
    candidateRef: string
  ): Promise<TeacherPreference | null>;
  savePreference(input: {
    readonly preference: TeacherPreference;
    readonly expectedPreviousVersion: number | null;
  }): Promise<void>;
  listPreferenceHistory(
    preferenceRef: string
  ): Promise<readonly TeacherPreference[]>;
  listPreferences(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly statuses?: readonly TeacherPreference["status"][];
  }): Promise<readonly TeacherPreference[]>;
}

export interface MemoryConfirmationRepository {
  saveConfirmation(input: {
    readonly candidate: MemoryCandidate;
    readonly expectedCandidateVersion: number;
    readonly preference: TeacherPreference | null;
  }): Promise<void>;
}

export interface MemoryCandidateRepository
  extends MemoryRepository,
    PreferenceRepository,
    MemoryConfirmationRepository {
}

export class MemoryCandidateApplicationError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "MemoryCandidateApplicationError";
  }
}

export class MemoryCandidateService {
  constructor(
    private readonly repository: MemoryCandidateRepository,
    private readonly clock: () => Date = () => new Date()
  ) {}

  async create(input: {
    readonly candidateRef: string;
    readonly owner: MemoryOwner;
    readonly type: MemoryCandidateType;
    readonly content: MemoryCandidateContent;
    readonly sources: readonly MemorySourceReference[];
    readonly confidence: number;
    readonly proposedBy: "teacher" | "agent";
    readonly createdByRef: string;
    readonly expiresAt: string;
  }): Promise<MemoryCandidate> {
    if (await this.repository.getCandidate(input.candidateRef)) {
      throw new MemoryCandidateApplicationError(
        "MEMORY_CANDIDATE_ALREADY_EXISTS",
        `MemoryCandidate ${input.candidateRef} already exists.`
      );
    }
    const candidate = createMemoryCandidate({
      ...input,
      createdAt: this.clock().toISOString()
    });
    const evaluation = evaluateMemoryCandidate({
      candidate,
      at: candidate.createdAt
    });
    if (!evaluation.passed) {
      throw new MemoryCandidateApplicationError(
        "MEMORY_CANDIDATE_POLICY_FAILED",
        evaluation.issues.join(" ")
      );
    }
    await this.repository.saveCandidate({
      candidate,
      expectedPreviousVersion: null
    });
    return candidate;
  }

  async confirm(input: {
    readonly candidateRef: string;
    readonly actorRef: string;
    readonly tenantRef: string;
    readonly expectedVersion: number;
    readonly preferenceRef?: string;
  }): Promise<{
    readonly candidate: MemoryCandidate;
    readonly preference: TeacherPreference | null;
  }> {
    const current = await this.requireCandidate(
      input.candidateRef,
      input.tenantRef
    );
    if (current.status === "confirmed") {
      const preference = await this.repository.getPreferenceByCandidate(
        current.candidateRef
      );
      return Object.freeze({ candidate: current, preference });
    }
    const at = this.clock().toISOString();
    const result = confirmMemoryCandidate({
      candidate: current,
      actorRef: input.actorRef,
      expectedVersion: input.expectedVersion,
      confirmedAt: at,
      ...(input.preferenceRef
        ? { preferenceRef: input.preferenceRef }
        : {})
    });
    await this.repository.saveConfirmation({
      candidate: result.candidate,
      expectedCandidateVersion: current.version,
      preference: result.preference
    });
    return result;
  }

  async reject(input: {
    readonly candidateRef: string;
    readonly actorRef: string;
    readonly tenantRef: string;
    readonly expectedVersion: number;
  }): Promise<MemoryCandidate> {
    const current = await this.requireCandidate(
      input.candidateRef,
      input.tenantRef
    );
    const rejected = rejectMemoryCandidate({
      candidate: current,
      actorRef: input.actorRef,
      expectedVersion: input.expectedVersion,
      rejectedAt: this.clock().toISOString()
    });
    await this.repository.saveCandidate({
      candidate: rejected,
      expectedPreviousVersion: current.version
    });
    return rejected;
  }

  async expire(candidateRef: string): Promise<MemoryCandidate> {
    const current = await this.repository.getCandidate(candidateRef);
    if (!current) throw notFound(candidateRef);
    const expired = expireMemoryCandidate({
      candidate: current,
      at: this.clock().toISOString()
    });
    await this.repository.saveCandidate({
      candidate: expired,
      expectedPreviousVersion: current.version
    });
    return expired;
  }

  async revokePreference(input: {
    readonly preferenceRef: string;
    readonly actorRef: string;
    readonly tenantRef: string;
    readonly expectedVersion: number;
  }): Promise<TeacherPreference> {
    const current = await this.repository.getPreference(input.preferenceRef);
    if (!current || current.owner.tenantRef !== input.tenantRef) {
      throw new MemoryCandidateApplicationError(
        "TEACHER_PREFERENCE_NOT_FOUND",
        "TeacherPreference was not found in the active tenant."
      );
    }
    const revoked = revokeTeacherPreference({
      preference: current,
      actorRef: input.actorRef,
      expectedVersion: input.expectedVersion,
      revokedAt: this.clock().toISOString()
    });
    await this.repository.savePreference({
      preference: revoked,
      expectedPreviousVersion: current.version
    });
    return revoked;
  }

  async updatePreference(input: {
    readonly preferenceRef: string;
    readonly actorRef: string;
    readonly tenantRef: string;
    readonly expectedVersion: number;
    readonly preferenceValue: string;
  }): Promise<TeacherPreference> {
    const current = await this.repository.getPreference(input.preferenceRef);
    if (
      !current ||
      current.owner.tenantRef !== input.tenantRef ||
      current.owner.teacherRef !== input.actorRef
    ) {
      throw new MemoryCandidateApplicationError(
        "TEACHER_PREFERENCE_NOT_FOUND",
        "TeacherPreference was not found in the active tenant."
      );
    }
    const updated = updateTeacherPreference({
      preference: current,
      actorRef: input.actorRef,
      expectedVersion: input.expectedVersion,
      preferenceValue: input.preferenceValue,
      updatedAt: this.clock().toISOString()
    });
    await this.repository.savePreference({
      preference: updated,
      expectedPreviousVersion: current.version
    });
    return updated;
  }

  async listCandidates(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly statuses?: readonly MemoryCandidate["status"][];
  }): Promise<readonly MemoryCandidate[]> {
    return this.repository.listCandidates(input);
  }

  async listPreferences(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly statuses?: readonly TeacherPreference["status"][];
  }): Promise<readonly TeacherPreference[]> {
    return this.repository.listPreferences(input);
  }

  async getCandidateHistory(input: {
    readonly candidateRef: string;
    readonly tenantRef: string;
    readonly teacherRef: string;
  }): Promise<readonly MemoryCandidate[]> {
    const current = await this.requireCandidate(
      input.candidateRef,
      input.tenantRef
    );
    if (current.owner.teacherRef !== input.teacherRef) {
      throw notFound(input.candidateRef);
    }
    return this.repository.listCandidateHistory(input.candidateRef);
  }

  private async requireCandidate(
    candidateRef: string,
    tenantRef: string
  ): Promise<MemoryCandidate> {
    const candidate = await this.repository.getCandidate(candidateRef);
    if (!candidate || candidate.owner.tenantRef !== tenantRef) {
      throw notFound(candidateRef);
    }
    return candidate;
  }
}

function notFound(candidateRef: string): MemoryCandidateApplicationError {
  return new MemoryCandidateApplicationError(
    "MEMORY_CANDIDATE_NOT_FOUND",
    `MemoryCandidate ${candidateRef} was not found in the active tenant.`
  );
}

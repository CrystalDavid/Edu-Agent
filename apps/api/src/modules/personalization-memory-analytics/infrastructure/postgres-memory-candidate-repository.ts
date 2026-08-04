import type { FormalWriteMetadata } from "@edu-agent/contracts";

import type {
  MemoryCandidateRepository
} from "../application/memory-candidate-service.js";
import type {
  MemoryCandidate,
  MemoryCandidateContent,
  MemorySourceReference,
  TeacherPreference
} from "../domain/index.js";
import type { SqlExecutor } from "../../../platform/postgres/types.js";

type MetadataFactory = (suffix: string) => FormalWriteMetadata;

type CandidateRow = {
  candidate_ref: string;
  tenant_ref: string;
  teacher_ref: string;
  candidate_type: MemoryCandidate["type"];
  content: MemoryCandidateContent;
  sources: MemorySourceReference[];
  confidence: string | number;
  proposed_by: MemoryCandidate["proposedBy"];
  created_by_ref: string;
  candidate_status: MemoryCandidate["status"];
  current_version?: number;
  version?: number;
  content_hash: string;
  created_at: Date | string;
  expires_at: Date | string;
  confirmed_at: Date | string | null;
  rejected_at: Date | string | null;
  expired_at: Date | string | null;
};

type PreferenceRow = {
  preference_ref: string;
  tenant_ref: string;
  teacher_ref: string;
  preference_key: string;
  preference_value: string;
  source_candidate_ref: string;
  source_candidate_hash: string;
  preference_status: TeacherPreference["status"];
  current_version?: number;
  version?: number;
  content_hash: string;
  confirmed_by_ref: string;
  confirmed_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
  revoked_at: Date | string | null;
};

const candidateCurrentSelect = `
  SELECT candidate_ref, tenant_ref, teacher_ref, candidate_type, content,
         sources, confidence, proposed_by, created_by_ref, candidate_status,
         current_version, content_hash, created_at, expires_at, confirmed_at,
         rejected_at, expired_at
    FROM personalization.memory_candidate`;

const candidateRevisionSelect = `
  SELECT candidate_ref, tenant_ref, teacher_ref, candidate_type, content,
         sources, confidence, proposed_by, created_by_ref, candidate_status,
         version, content_hash, created_at, expires_at, confirmed_at,
         rejected_at, expired_at
    FROM personalization.memory_candidate_revision`;

const preferenceCurrentSelect = `
  SELECT preference_ref, tenant_ref, teacher_ref, preference_key,
         preference_value, source_candidate_ref, source_candidate_hash,
         preference_status, current_version, content_hash, confirmed_by_ref,
         confirmed_at, created_at, updated_at, revoked_at
    FROM personalization.teacher_preference`;

const preferenceRevisionSelect = `
  SELECT preference_ref, tenant_ref, teacher_ref, preference_key,
         preference_value, source_candidate_ref, source_candidate_hash,
         preference_status, version, content_hash, confirmed_by_ref,
         confirmed_at, created_at, updated_at, revoked_at
    FROM personalization.teacher_preference_revision`;

export class PostgresMemoryCandidateRepository
  implements MemoryCandidateRepository
{
  constructor(
    private readonly executor: SqlExecutor,
    private readonly metadataFactory?: MetadataFactory
  ) {}

  async getCandidate(candidateRef: string): Promise<MemoryCandidate | null> {
    const result = await this.executor.query<CandidateRow>(
      `${candidateCurrentSelect} WHERE candidate_ref = $1`,
      [candidateRef]
    );
    return result.rows[0] ? candidateFromRow(result.rows[0]) : null;
  }

  async saveCandidate(input: {
    readonly candidate: MemoryCandidate;
    readonly expectedPreviousVersion: number | null;
  }): Promise<void> {
    const metadata = this.metadata(`memory-candidate-v${input.candidate.version}`);
    if (input.expectedPreviousVersion === null) {
      await this.insertCandidate(input.candidate, metadata);
    } else {
      const updated = await this.executor.query(
        `UPDATE personalization.memory_candidate
            SET candidate_status = $3,
                current_version = $4,
                content_hash = $5,
                updated_at = $6::timestamptz,
                confirmed_at = $7::timestamptz,
                rejected_at = $8::timestamptz,
                expired_at = $9::timestamptz,
                actor_ref = $10,
                purpose = $11,
                owner_module = $12,
                idempotency_key = $13,
                authorization_decision_ref = $14,
                audit_ref = $15
          WHERE candidate_ref = $1 AND current_version = $2`,
        [
          input.candidate.candidateRef,
          input.expectedPreviousVersion,
          input.candidate.status,
          input.candidate.version,
          input.candidate.contentHash,
          metadata.createdAt,
          input.candidate.confirmedAt,
          input.candidate.rejectedAt,
          input.candidate.expiredAt,
          ...metadataValues(metadata)
        ]
      );
      if ((updated.rowCount ?? 0) !== 1) throw versionConflict();
    }
    await this.insertCandidateRevision(input.candidate, metadata);
  }

  async saveConfirmation(input: {
    readonly candidate: MemoryCandidate;
    readonly expectedCandidateVersion: number;
    readonly preference: TeacherPreference | null;
  }): Promise<void> {
    await this.saveCandidate({
      candidate: input.candidate,
      expectedPreviousVersion: input.expectedCandidateVersion
    });
    if (input.preference) {
      await this.savePreference({
        preference: input.preference,
        expectedPreviousVersion: null
      });
    }
  }

  async listCandidateHistory(candidateRef: string): Promise<readonly MemoryCandidate[]> {
    const result = await this.executor.query<CandidateRow>(
      `${candidateRevisionSelect} WHERE candidate_ref = $1 ORDER BY version`,
      [candidateRef]
    );
    return Object.freeze(result.rows.map(candidateFromRow));
  }

  async listCandidates(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly statuses?: readonly MemoryCandidate["status"][];
  }): Promise<readonly MemoryCandidate[]> {
    const result = await this.executor.query<CandidateRow>(
      `${candidateCurrentSelect}
        WHERE tenant_ref = $1 AND teacher_ref = $2
          AND ($3::text[] IS NULL OR candidate_status = ANY($3::text[]))
        ORDER BY updated_at DESC, candidate_ref`,
      [input.tenantRef, input.teacherRef, input.statuses ?? null]
    );
    return Object.freeze(result.rows.map(candidateFromRow));
  }

  async getPreference(preferenceRef: string): Promise<TeacherPreference | null> {
    const result = await this.executor.query<PreferenceRow>(
      `${preferenceCurrentSelect} WHERE preference_ref = $1`,
      [preferenceRef]
    );
    return result.rows[0] ? preferenceFromRow(result.rows[0]) : null;
  }

  async getPreferenceByCandidate(candidateRef: string): Promise<TeacherPreference | null> {
    const result = await this.executor.query<PreferenceRow>(
      `${preferenceCurrentSelect} WHERE source_candidate_ref = $1`,
      [candidateRef]
    );
    return result.rows[0] ? preferenceFromRow(result.rows[0]) : null;
  }

  async savePreference(input: {
    readonly preference: TeacherPreference;
    readonly expectedPreviousVersion: number | null;
  }): Promise<void> {
    const metadata = this.metadata(`teacher-preference-v${input.preference.version}`);
    if (input.expectedPreviousVersion === null) {
      await this.insertPreference(input.preference, metadata);
    } else {
      const updated = await this.executor.query(
        `UPDATE personalization.teacher_preference
            SET preference_value = $3,
                preference_status = $4,
                current_version = $5,
                content_hash = $6,
                updated_at = $7::timestamptz,
                revoked_at = $8::timestamptz,
                actor_ref = $9,
                purpose = $10,
                owner_module = $11,
                idempotency_key = $12,
                authorization_decision_ref = $13,
                audit_ref = $14
          WHERE preference_ref = $1 AND current_version = $2`,
        [
          input.preference.preferenceRef,
          input.expectedPreviousVersion,
          input.preference.preferenceValue,
          input.preference.status,
          input.preference.version,
          input.preference.contentHash,
          input.preference.updatedAt,
          input.preference.revokedAt,
          ...metadataValues(metadata)
        ]
      );
      if ((updated.rowCount ?? 0) !== 1) throw versionConflict();
    }
    await this.insertPreferenceRevision(input.preference, metadata);
  }

  async listPreferenceHistory(preferenceRef: string): Promise<readonly TeacherPreference[]> {
    const result = await this.executor.query<PreferenceRow>(
      `${preferenceRevisionSelect} WHERE preference_ref = $1 ORDER BY version`,
      [preferenceRef]
    );
    return Object.freeze(result.rows.map(preferenceFromRow));
  }

  async listPreferences(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly statuses?: readonly TeacherPreference["status"][];
  }): Promise<readonly TeacherPreference[]> {
    const result = await this.executor.query<PreferenceRow>(
      `${preferenceCurrentSelect}
        WHERE tenant_ref = $1 AND teacher_ref = $2
          AND ($3::text[] IS NULL OR preference_status = ANY($3::text[]))
        ORDER BY updated_at DESC, preference_ref`,
      [input.tenantRef, input.teacherRef, input.statuses ?? null]
    );
    return Object.freeze(result.rows.map(preferenceFromRow));
  }

  private async insertCandidate(
    candidate: MemoryCandidate,
    metadata: FormalWriteMetadata
  ): Promise<void> {
    await this.executor.query(
      `INSERT INTO personalization.memory_candidate (
         candidate_ref, tenant_ref, teacher_ref, candidate_type, content,
         sources, confidence, proposed_by, created_by_ref, candidate_status,
         current_version, content_hash, created_at, updated_at, expires_at,
         confirmed_at, rejected_at, expired_at, actor_ref, purpose,
         owner_module, idempotency_key, authorization_decision_ref, audit_ref
       ) VALUES (
         $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10,
         $11, $12, $13::timestamptz, $14::timestamptz, $15::timestamptz,
         $16::timestamptz, $17::timestamptz, $18::timestamptz,
         $19, $20, $21, $22, $23, $24
       )`,
      [
        candidate.candidateRef,
        candidate.owner.tenantRef,
        candidate.owner.teacherRef,
        candidate.type,
        JSON.stringify(candidate.content),
        JSON.stringify(candidate.sources),
        candidate.confidence,
        candidate.proposedBy,
        candidate.createdByRef,
        candidate.status,
        candidate.version,
        candidate.contentHash,
        candidate.createdAt,
        metadata.createdAt,
        candidate.expiresAt,
        candidate.confirmedAt,
        candidate.rejectedAt,
        candidate.expiredAt,
        ...metadataValues(metadata)
      ]
    );
  }

  private async insertCandidateRevision(
    candidate: MemoryCandidate,
    metadata: FormalWriteMetadata
  ): Promise<void> {
    await this.executor.query(
      `INSERT INTO personalization.memory_candidate_revision (
         candidate_ref, version, tenant_ref, teacher_ref, candidate_type,
         content, sources, confidence, proposed_by, created_by_ref,
         candidate_status, content_hash, created_at, expires_at, confirmed_at,
         rejected_at, expired_at, actor_ref, purpose, owner_module,
         idempotency_key, authorization_decision_ref, audit_ref,
         revision_created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10,
         $11, $12, $13::timestamptz, $14::timestamptz, $15::timestamptz,
         $16::timestamptz, $17::timestamptz, $18, $19, $20, $21, $22,
         $23, $24::timestamptz
       )`,
      [
        candidate.candidateRef,
        candidate.version,
        candidate.owner.tenantRef,
        candidate.owner.teacherRef,
        candidate.type,
        JSON.stringify(candidate.content),
        JSON.stringify(candidate.sources),
        candidate.confidence,
        candidate.proposedBy,
        candidate.createdByRef,
        candidate.status,
        candidate.contentHash,
        candidate.createdAt,
        candidate.expiresAt,
        candidate.confirmedAt,
        candidate.rejectedAt,
        candidate.expiredAt,
        ...metadataValues(metadata),
        metadata.createdAt
      ]
    );
  }

  private async insertPreference(
    preference: TeacherPreference,
    metadata: FormalWriteMetadata
  ): Promise<void> {
    await this.executor.query(
      `INSERT INTO personalization.teacher_preference (
         preference_ref, tenant_ref, teacher_ref, preference_key,
         preference_value, source_candidate_ref, source_candidate_hash,
         preference_status, current_version, content_hash, confirmed_by_ref,
         confirmed_at, created_at, updated_at, revoked_at, actor_ref, purpose,
         owner_module, idempotency_key, authorization_decision_ref, audit_ref
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         $12::timestamptz, $13::timestamptz, $14::timestamptz,
         $15::timestamptz, $16, $17, $18, $19, $20, $21
       )`,
      [
        preference.preferenceRef,
        preference.owner.tenantRef,
        preference.owner.teacherRef,
        preference.preferenceKey,
        preference.preferenceValue,
        preference.sourceCandidateRef,
        preference.sourceCandidateHash,
        preference.status,
        preference.version,
        preference.contentHash,
        preference.confirmedByRef,
        preference.confirmedAt,
        preference.createdAt,
        preference.updatedAt,
        preference.revokedAt,
        ...metadataValues(metadata)
      ]
    );
  }

  private async insertPreferenceRevision(
    preference: TeacherPreference,
    metadata: FormalWriteMetadata
  ): Promise<void> {
    await this.executor.query(
      `INSERT INTO personalization.teacher_preference_revision (
         preference_ref, version, tenant_ref, teacher_ref, preference_key,
         preference_value, source_candidate_ref, source_candidate_hash,
         preference_status, content_hash, confirmed_by_ref, confirmed_at,
         created_at, updated_at, revoked_at, actor_ref, purpose, owner_module,
         idempotency_key, authorization_decision_ref, audit_ref,
         revision_created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         $12::timestamptz, $13::timestamptz, $14::timestamptz,
         $15::timestamptz, $16, $17, $18, $19, $20, $21,
         $22::timestamptz
       )`,
      [
        preference.preferenceRef,
        preference.version,
        preference.owner.tenantRef,
        preference.owner.teacherRef,
        preference.preferenceKey,
        preference.preferenceValue,
        preference.sourceCandidateRef,
        preference.sourceCandidateHash,
        preference.status,
        preference.contentHash,
        preference.confirmedByRef,
        preference.confirmedAt,
        preference.createdAt,
        preference.updatedAt,
        preference.revokedAt,
        ...metadataValues(metadata),
        metadata.createdAt
      ]
    );
  }

  private metadata(suffix: string): FormalWriteMetadata {
    if (!this.metadataFactory) {
      throw new Error("Postgres Memory repository write metadata is required.");
    }
    return this.metadataFactory(suffix);
  }
}

function candidateFromRow(row: CandidateRow): MemoryCandidate {
  return Object.freeze({
    candidateRef: row.candidate_ref,
    owner: Object.freeze({
      tenantRef: row.tenant_ref,
      teacherRef: row.teacher_ref
    }),
    type: row.candidate_type,
    content: Object.freeze({ ...row.content }),
    sources: Object.freeze(row.sources.map((source) => Object.freeze({ ...source }))),
    confidence: Number(row.confidence),
    proposedBy: row.proposed_by,
    createdByRef: row.created_by_ref,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    status: row.candidate_status,
    confirmedAt: nullableIso(row.confirmed_at),
    rejectedAt: nullableIso(row.rejected_at),
    expiredAt: nullableIso(row.expired_at),
    version: requiredVersion(row.current_version ?? row.version),
    contentHash: row.content_hash
  });
}

function preferenceFromRow(row: PreferenceRow): TeacherPreference {
  return Object.freeze({
    preferenceRef: row.preference_ref,
    owner: Object.freeze({
      tenantRef: row.tenant_ref,
      teacherRef: row.teacher_ref
    }),
    preferenceKey: row.preference_key,
    preferenceValue: row.preference_value,
    sourceCandidateRef: row.source_candidate_ref,
    sourceCandidateHash: row.source_candidate_hash,
    status: row.preference_status,
    version: requiredVersion(row.current_version ?? row.version),
    confirmedByRef: row.confirmed_by_ref,
    confirmedAt: iso(row.confirmed_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    revokedAt: nullableIso(row.revoked_at),
    contentHash: row.content_hash
  });
}

function metadataValues(metadata: FormalWriteMetadata): unknown[] {
  return [
    metadata.actorRef,
    metadata.purpose,
    metadata.owner,
    metadata.idempotencyKey,
    metadata.authorizationDecisionRef,
    metadata.auditRef
  ];
}

function requiredVersion(value: number | undefined): number {
  if (!value) throw new Error("Personalization row has no version.");
  return value;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

function versionConflict(): Error {
  return new Error("Memory repository version conflict.");
}

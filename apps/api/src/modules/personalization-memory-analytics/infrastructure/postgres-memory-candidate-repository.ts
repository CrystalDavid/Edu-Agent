import { createHash } from "node:crypto";

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
import { createMemoryScope } from "../domain/memory-scope.js";
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
  canonical_key: string;
  scope_kind: TeacherPreference["scope"]["kind"];
  scope_subject: string | null;
  scope_grade_level: string | null;
  scope_course_run_ref: string | null;
  scope_lesson_ref: string | null;
  scope_task_ref: string | null;
  scope_skill_ids: string[];
  scope_fingerprint: string;
  valid_from: Date | string;
  valid_until: Date | string | null;
  explicitness: TeacherPreference["explicitness"];
  consent_basis: TeacherPreference["consentBasis"];
  consent_version: string;
  policy_version: string;
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
         preference_value, canonical_key, scope_kind, scope_subject,
         scope_grade_level, scope_course_run_ref, scope_lesson_ref,
         scope_task_ref, scope_skill_ids, scope_fingerprint, valid_from,
         valid_until, explicitness, consent_basis, consent_version,
         policy_version, source_candidate_ref, source_candidate_hash,
         preference_status, current_version, content_hash, confirmed_by_ref,
         confirmed_at, created_at, updated_at, revoked_at
    FROM personalization.teacher_preference`;

const preferenceRevisionSelect = `
  SELECT preference_ref, tenant_ref, teacher_ref, preference_key,
         preference_value, canonical_key, scope_kind, scope_subject,
         scope_grade_level, scope_course_run_ref, scope_lesson_ref,
         scope_task_ref, scope_skill_ids, scope_fingerprint, valid_from,
         valid_until, explicitness, consent_basis, consent_version,
         policy_version, source_candidate_ref, source_candidate_hash,
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
                canonical_key = $4,
                scope_kind = $5,
                scope_subject = $6,
                scope_grade_level = $7,
                scope_course_run_ref = $8,
                scope_lesson_ref = $9,
                scope_task_ref = $10,
                scope_skill_ids = $11::jsonb,
                scope_fingerprint = $12,
                valid_from = $13::timestamptz,
                valid_until = $14::timestamptz,
                explicitness = $15,
                consent_basis = $16,
                 consent_version = $17,
                 policy_version = $18,
                 source_candidate_ref = $19,
                 source_candidate_hash = $20,
                 preference_status = $21,
                 current_version = $22,
                 content_hash = $23,
                 updated_at = $24::timestamptz,
                 revoked_at = $25::timestamptz,
                 actor_ref = $26,
                 purpose = $27,
                 owner_module = $28,
                 idempotency_key = $29,
                 authorization_decision_ref = $30,
                 audit_ref = $31
          WHERE preference_ref = $1 AND current_version = $2`,
        [
          input.preference.preferenceRef,
          input.expectedPreviousVersion,
          input.preference.preferenceValue,
          input.preference.canonicalKey,
          input.preference.scope.kind,
          input.preference.scope.subject,
          input.preference.scope.gradeLevel,
          input.preference.scope.courseRunRef,
          input.preference.scope.lessonRef,
          input.preference.scope.taskRef,
          JSON.stringify(input.preference.scope.skillIds),
          input.preference.scopeFingerprint,
          input.preference.validFrom,
          input.preference.validUntil,
          input.preference.explicitness,
          input.preference.consentBasis,
          input.preference.consentVersion,
          input.preference.policyVersion,
          input.preference.sourceCandidateRef,
          input.preference.sourceCandidateHash,
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
    await this.bumpMemoryEpoch(input.preference, metadata);
  }

  async getMemoryEpoch(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
  }): Promise<number> {
    const result = await this.executor.query<{ memory_epoch: string | number }>(
      `SELECT memory_epoch
         FROM personalization.teacher_memory_state
        WHERE tenant_ref = $1 AND teacher_ref = $2`,
      [input.tenantRef, input.teacherRef]
    );
    return Number(result.rows[0]?.memory_epoch ?? 0);
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

  async listPreferencesForUpdate(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly statuses?: readonly TeacherPreference["status"][];
  }): Promise<readonly TeacherPreference[]> {
    const result = await this.executor.query<PreferenceRow>(
      `${preferenceCurrentSelect}
        WHERE tenant_ref = $1 AND teacher_ref = $2
          AND ($3::text[] IS NULL OR preference_status = ANY($3::text[]))
        ORDER BY preference_ref
        FOR UPDATE`,
      [input.tenantRef, input.teacherRef, input.statuses ?? null]
    );
    return Object.freeze(result.rows.map(preferenceFromRow));
  }

  async getPreferencesByRefsForUpdate(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly preferenceRefs: readonly string[];
  }): Promise<readonly TeacherPreference[]> {
    if (input.preferenceRefs.length === 0) return Object.freeze([]);
    const result = await this.executor.query<PreferenceRow>(
      `${preferenceCurrentSelect}
        WHERE tenant_ref = $1 AND teacher_ref = $2
          AND preference_ref = ANY($3::text[])
        ORDER BY preference_ref
        FOR UPDATE`,
      [input.tenantRef, input.teacherRef, input.preferenceRefs]
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
         preference_value, canonical_key, scope_kind, scope_subject,
         scope_grade_level, scope_course_run_ref, scope_lesson_ref,
         scope_task_ref, scope_skill_ids, scope_fingerprint, valid_from,
         valid_until, explicitness, consent_basis, consent_version,
         policy_version, source_candidate_ref, source_candidate_hash,
         preference_status, current_version, content_hash, confirmed_by_ref,
         confirmed_at, created_at, updated_at, revoked_at, actor_ref, purpose,
         owner_module, idempotency_key, authorization_decision_ref, audit_ref
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13::jsonb, $14, $15::timestamptz, $16::timestamptz,
         $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
         $27::timestamptz, $28::timestamptz, $29::timestamptz,
         $30::timestamptz, $31, $32, $33, $34, $35, $36
       )`,
      [
        preference.preferenceRef,
        preference.owner.tenantRef,
        preference.owner.teacherRef,
        preference.preferenceKey,
        preference.preferenceValue,
        preference.canonicalKey,
        preference.scope.kind,
        preference.scope.subject,
        preference.scope.gradeLevel,
        preference.scope.courseRunRef,
        preference.scope.lessonRef,
        preference.scope.taskRef,
        JSON.stringify(preference.scope.skillIds),
        preference.scopeFingerprint,
        preference.validFrom,
        preference.validUntil,
        preference.explicitness,
        preference.consentBasis,
        preference.consentVersion,
        preference.policyVersion,
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
         preference_value, canonical_key, scope_kind, scope_subject,
         scope_grade_level, scope_course_run_ref, scope_lesson_ref,
         scope_task_ref, scope_skill_ids, scope_fingerprint, valid_from,
         valid_until, explicitness, consent_basis, consent_version,
         policy_version, source_candidate_ref, source_candidate_hash,
         preference_status, content_hash, confirmed_by_ref, confirmed_at,
         created_at, updated_at, revoked_at, actor_ref, purpose, owner_module,
         idempotency_key, authorization_decision_ref, audit_ref,
         revision_created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14::jsonb, $15, $16::timestamptz, $17::timestamptz,
         $18, $19, $20, $21, $22, $23, $24, $25, $26,
         $27::timestamptz, $28::timestamptz, $29::timestamptz,
         $30::timestamptz, $31, $32, $33, $34, $35, $36,
         $37::timestamptz
       )`,
      [
        preference.preferenceRef,
        preference.version,
        preference.owner.tenantRef,
        preference.owner.teacherRef,
        preference.preferenceKey,
        preference.preferenceValue,
        preference.canonicalKey,
        preference.scope.kind,
        preference.scope.subject,
        preference.scope.gradeLevel,
        preference.scope.courseRunRef,
        preference.scope.lessonRef,
        preference.scope.taskRef,
        JSON.stringify(preference.scope.skillIds),
        preference.scopeFingerprint,
        preference.validFrom,
        preference.validUntil,
        preference.explicitness,
        preference.consentBasis,
        preference.consentVersion,
        preference.policyVersion,
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

  private async bumpMemoryEpoch(
    preference: TeacherPreference,
    metadata: FormalWriteMetadata
  ): Promise<void> {
    const contentHash = createHash("sha256").update(JSON.stringify({
      tenantRef: preference.owner.tenantRef,
      teacherRef: preference.owner.teacherRef,
      preferenceRef: preference.preferenceRef,
      preferenceVersion: preference.version,
      policyVersion: "teacher-memory-epoch@1",
      updatedAt: preference.updatedAt
    })).digest("hex");
    await this.executor.query(
      `INSERT INTO personalization.teacher_memory_state (
         tenant_ref, teacher_ref, memory_epoch, policy_version, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, content_hash, created_at
       ) VALUES (
         $1, $2, 1, 'teacher-memory-epoch@1', $3::timestamptz,
         $4, $5, $6, $7, $8, $9, $10, $11::timestamptz
       )
       ON CONFLICT (tenant_ref, teacher_ref) DO UPDATE
         SET memory_epoch =
               personalization.teacher_memory_state.memory_epoch + 1,
             policy_version = EXCLUDED.policy_version,
             updated_at = EXCLUDED.updated_at,
             actor_ref = EXCLUDED.actor_ref,
             purpose = EXCLUDED.purpose,
             owner_module = EXCLUDED.owner_module,
             idempotency_key = EXCLUDED.idempotency_key,
             authorization_decision_ref = EXCLUDED.authorization_decision_ref,
             audit_ref = EXCLUDED.audit_ref,
             content_hash = EXCLUDED.content_hash`,
      [
        preference.owner.tenantRef,
        preference.owner.teacherRef,
        preference.updatedAt,
        metadata.actorRef,
        metadata.purpose,
        metadata.owner,
        metadata.idempotencyKey,
        metadata.authorizationDecisionRef,
        metadata.auditRef,
        contentHash,
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
  const scope = createMemoryScope({
    kind: row.scope_kind,
    subject: row.scope_subject,
    gradeLevel: row.scope_grade_level,
    courseRunRef: row.scope_course_run_ref,
    lessonRef: row.scope_lesson_ref,
    taskRef: row.scope_task_ref,
    skillIds: row.scope_skill_ids
  });
  if (scope.fingerprint !== row.scope_fingerprint) {
    throw new Error("TeacherPreference scope fingerprint mismatch.");
  }
  return Object.freeze({
    preferenceRef: row.preference_ref,
    owner: Object.freeze({
      tenantRef: row.tenant_ref,
      teacherRef: row.teacher_ref
    }),
    preferenceKey: row.preference_key,
    preferenceValue: row.preference_value,
    canonicalKey: row.canonical_key,
    scope,
    scopeFingerprint: row.scope_fingerprint,
    validFrom: iso(row.valid_from),
    validUntil: nullableIso(row.valid_until),
    explicitness: row.explicitness,
    consentBasis: row.consent_basis,
    consentVersion: row.consent_version,
    policyVersion: row.policy_version,
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

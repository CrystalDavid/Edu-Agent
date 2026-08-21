import type {
  MemoryApplicationDecision,
  MemoryApplicationOutcomeStatus,
  MemoryApplicationReasonCode,
  RecordedMemoryApplication,
  RecordedMemoryApplicationOutcome
} from "../application/memory-application-recorder.js";
import type { TeacherPreference } from "../domain/memory-candidate.js";
import { createMemoryScope } from "../domain/memory-scope.js";
import type { SqlExecutor } from "../../../platform/postgres/types.js";

type ApplicationIdentityRow = {
  application_ref: string;
  content_hash: string;
};

type OutcomeIdentityRow = {
  outcome_ref: string;
  content_hash: string;
};

type ApplicationRow = {
  application_ref: string;
  tenant_ref: string;
  teacher_ref: string;
  conversation_ref: string;
  turn_ref: string;
  task_ref: string;
  agent_run_ref: string;
  model_execution_ref: string | null;
  skill_ref: string;
  use_case: string;
  scope_hash: string;
  preference_ref: string;
  preference_version: number;
  preference_content_hash: string;
  pack_ref: string;
  pack_content_hash: string;
  decision: MemoryApplicationDecision;
  reason_code: MemoryApplicationReasonCode;
  target_fields: string[];
  estimated_tokens: number;
  policy_version: string;
  retention_policy_version: string;
  retention_until: Date | string;
  idempotency_key: string;
  authorization_decision_ref: string;
  audit_ref: string;
  content_hash: string;
  created_at: Date | string;
};

type OutcomeRow = {
  outcome_ref: string;
  application_ref: string;
  tenant_ref: string;
  teacher_ref: string;
  source_event_ref: string;
  agent_run_ref: string;
  outcome_status: MemoryApplicationOutcomeStatus;
  resulting_revision_ref: string | null;
  policy_version: string;
  idempotency_key: string;
  authorization_decision_ref: string;
  audit_ref: string;
  content_hash: string;
  created_at: Date | string;
};

type PreferenceRevisionRow = {
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
  version: number;
  content_hash: string;
  confirmed_by_ref: string;
  confirmed_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
  revoked_at: Date | string | null;
  current_status: TeacherPreference["status"];
  current_version: number;
  current_revoked_at: Date | string | null;
};

export interface PreferenceRevisionWithCurrentStatus {
  readonly revision: TeacherPreference;
  readonly currentStatus: TeacherPreference["status"];
  readonly currentVersion: number;
  readonly currentRevokedAt: string | null;
}

const applicationSelect = `
  SELECT application_ref, tenant_ref, teacher_ref, conversation_ref, turn_ref,
         task_ref, agent_run_ref, model_execution_ref, skill_ref, use_case,
         scope_hash, preference_ref, preference_version,
         preference_content_hash, pack_ref, pack_content_hash, decision,
         reason_code, target_fields, estimated_tokens, policy_version,
         retention_policy_version, retention_until, idempotency_key,
         authorization_decision_ref, audit_ref, content_hash, created_at
    FROM personalization.memory_application`;

const outcomeSelect = `
  SELECT outcome_ref, application_ref, tenant_ref, teacher_ref,
         source_event_ref, agent_run_ref, outcome_status,
         resulting_revision_ref, policy_version, idempotency_key,
         authorization_decision_ref, audit_ref, content_hash, created_at
    FROM personalization.memory_application_outcome`;

export class PostgresMemoryApplicationRepository {
  constructor(private readonly executor: SqlExecutor) {}

  async recordSelection(record: RecordedMemoryApplication): Promise<void> {
    const inserted = await this.executor.query<ApplicationIdentityRow>(
      `INSERT INTO personalization.memory_application (
         application_ref, tenant_ref, teacher_ref, conversation_ref, turn_ref,
         task_ref, agent_run_ref, model_execution_ref, skill_ref, use_case,
         scope_hash, preference_ref, preference_version,
         preference_content_hash, pack_ref, pack_content_hash, decision,
         reason_code, target_fields, estimated_tokens, policy_version,
         retention_policy_version, retention_until, idempotency_key,
         actor_ref, purpose, owner_module, authorization_decision_ref,
         audit_ref, content_hash, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18, $19::jsonb, $20, $21, $22,
         $23::timestamptz, $24, $25, $26, $27, $28, $29, $30,
         $31::timestamptz
       )
       ON CONFLICT (
         agent_run_ref, preference_ref, preference_version, decision
       ) DO NOTHING
       RETURNING application_ref, content_hash`,
      [
        record.applicationRef,
        record.owner.tenantRef,
        record.owner.teacherRef,
        record.conversationRef,
        record.turnRef,
        record.taskRef,
        record.agentRunRef,
        record.modelExecutionRef,
        record.skillRef,
        record.useCase,
        record.scopeHash,
        record.preferenceRef,
        record.preferenceVersion,
        record.preferenceContentHash,
        record.packRef,
        record.packContentHash,
        record.decision,
        record.reasonCode,
        JSON.stringify(record.targetFields),
        record.estimatedTokens,
        record.policyVersion,
        record.retentionPolicyVersion,
        record.retentionUntil,
        record.idempotencyKey,
        record.owner.teacherRef,
        "teacher-memory.application-observability",
        "personalization",
        record.authorizationDecisionRef,
        record.auditRef,
        record.contentHash,
        record.createdAt
      ]
    );
    if ((inserted.rowCount ?? 0) === 1) return;
    const existing = await this.executor.query<ApplicationIdentityRow>(
      `SELECT application_ref, content_hash
         FROM personalization.memory_application
        WHERE agent_run_ref = $1
          AND preference_ref = $2
          AND preference_version = $3
          AND decision = $4`,
      [
        record.agentRunRef,
        record.preferenceRef,
        record.preferenceVersion,
        record.decision
      ]
    );
    const replay = existing.rows[0];
    if (
      !replay ||
      replay.application_ref !== record.applicationRef ||
      replay.content_hash !== record.contentHash
    ) {
      throw new Error("Memory application idempotency conflict.");
    }
  }

  async recordOutcome(record: RecordedMemoryApplicationOutcome): Promise<void> {
    const inserted = await this.executor.query<OutcomeIdentityRow>(
      `INSERT INTO personalization.memory_application_outcome (
         outcome_ref, application_ref, tenant_ref, teacher_ref,
         source_event_ref, agent_run_ref, outcome_status,
         resulting_revision_ref, policy_version, idempotency_key,
         actor_ref, purpose, owner_module, authorization_decision_ref,
         audit_ref, content_hash, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17::timestamptz
       )
       ON CONFLICT (source_event_ref, application_ref) DO NOTHING
       RETURNING outcome_ref, content_hash`,
      [
        record.outcomeRef,
        record.applicationRef,
        record.owner.tenantRef,
        record.owner.teacherRef,
        record.sourceEventRef,
        record.agentRunRef,
        record.outcomeStatus,
        record.resultingRevisionRef,
        record.policyVersion,
        record.idempotencyKey,
        record.owner.teacherRef,
        "teacher-memory.application-outcome",
        "personalization",
        record.authorizationDecisionRef,
        record.auditRef,
        record.contentHash,
        record.createdAt
      ]
    );
    if ((inserted.rowCount ?? 0) === 1) return;
    const existing = await this.executor.query<OutcomeIdentityRow>(
      `SELECT outcome_ref, content_hash
         FROM personalization.memory_application_outcome
        WHERE source_event_ref = $1 AND application_ref = $2`,
      [record.sourceEventRef, record.applicationRef]
    );
    const replay = existing.rows[0];
    if (
      !replay ||
      replay.outcome_ref !== record.outcomeRef ||
      replay.content_hash !== record.contentHash
    ) {
      throw new Error("Memory application outcome idempotency conflict.");
    }
  }

  async listInjectedApplications(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly agentRunRef: string;
  }): Promise<readonly RecordedMemoryApplication[]> {
    const result = await this.executor.query<ApplicationRow>(
      `${applicationSelect}
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND agent_run_ref = $3
          AND decision = 'injected'
        ORDER BY preference_ref, preference_version, application_ref`,
      [input.tenantRef, input.teacherRef, input.agentRunRef]
    );
    return Object.freeze(result.rows.map(applicationFromRow));
  }

  async listApplicationsForRun(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly agentRunRef: string;
    readonly asOf: string;
  }): Promise<readonly RecordedMemoryApplication[]> {
    const result = await this.executor.query<ApplicationRow>(
      `${applicationSelect}
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND agent_run_ref = $3
          AND retention_until > $4::timestamptz
        ORDER BY created_at, preference_ref, preference_version, decision`,
      [input.tenantRef, input.teacherRef, input.agentRunRef, input.asOf]
    );
    return Object.freeze(result.rows.map(applicationFromRow));
  }

  async getApplicationForOwner(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly applicationRef: string;
    readonly asOf: string;
  }): Promise<RecordedMemoryApplication | null> {
    const result = await this.executor.query<ApplicationRow>(
      `${applicationSelect}
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND application_ref = $3
          AND retention_until > $4::timestamptz`,
      [
        input.tenantRef,
        input.teacherRef,
        input.applicationRef,
        input.asOf
      ]
    );
    return result.rows[0] ? applicationFromRow(result.rows[0]) : null;
  }

  async listOutcomesForRun(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly agentRunRef: string;
    readonly asOf: string;
  }): Promise<readonly RecordedMemoryApplicationOutcome[]> {
    const result = await this.executor.query<OutcomeRow>(
      `${outcomeSelect} AS outcome
        WHERE outcome.tenant_ref = $1
          AND outcome.teacher_ref = $2
          AND outcome.agent_run_ref = $3
          AND EXISTS (
            SELECT 1
              FROM personalization.memory_application AS application
             WHERE application.application_ref = outcome.application_ref
               AND application.tenant_ref = $1
               AND application.teacher_ref = $2
               AND application.retention_until > $4::timestamptz
          )
        ORDER BY outcome.created_at, outcome.application_ref`,
      [input.tenantRef, input.teacherRef, input.agentRunRef, input.asOf]
    );
    return Object.freeze(result.rows.map(outcomeFromRow));
  }

  async resolvePreferenceRevision(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly preferenceRef: string;
    readonly preferenceVersion: number;
    readonly expectedContentHash: string;
  }): Promise<PreferenceRevisionWithCurrentStatus | null> {
    const result = await this.executor.query<PreferenceRevisionRow>(
      `SELECT revision.preference_ref, revision.tenant_ref,
              revision.teacher_ref, revision.preference_key,
              revision.preference_value, revision.canonical_key,
              revision.scope_kind, revision.scope_subject,
              revision.scope_grade_level, revision.scope_course_run_ref,
              revision.scope_lesson_ref, revision.scope_task_ref,
              revision.scope_skill_ids, revision.scope_fingerprint,
              revision.valid_from, revision.valid_until,
              revision.explicitness, revision.consent_basis,
              revision.consent_version, revision.policy_version,
              revision.source_candidate_ref,
              revision.source_candidate_hash, revision.preference_status,
              revision.version, revision.content_hash,
              revision.confirmed_by_ref, revision.confirmed_at,
              revision.created_at, revision.updated_at, revision.revoked_at,
              current.preference_status AS current_status,
              current.current_version,
              current.revoked_at AS current_revoked_at
         FROM personalization.teacher_preference_revision AS revision
         JOIN personalization.teacher_preference AS current
           ON current.preference_ref = revision.preference_ref
          AND current.tenant_ref = revision.tenant_ref
          AND current.teacher_ref = revision.teacher_ref
        WHERE revision.tenant_ref = $1
          AND revision.teacher_ref = $2
          AND revision.preference_ref = $3
          AND revision.version = $4
          AND revision.content_hash = $5`,
      [
        input.tenantRef,
        input.teacherRef,
        input.preferenceRef,
        input.preferenceVersion,
        input.expectedContentHash
      ]
    );
    const row = result.rows[0];
    if (!row) return null;
    return Object.freeze({
      revision: preferenceRevisionFromRow(row),
      currentStatus: row.current_status,
      currentVersion: row.current_version,
      currentRevokedAt: nullableIso(row.current_revoked_at)
    });
  }
}

function applicationFromRow(row: ApplicationRow): RecordedMemoryApplication {
  return Object.freeze({
    applicationRef: row.application_ref,
    owner: Object.freeze({
      tenantRef: row.tenant_ref,
      teacherRef: row.teacher_ref
    }),
    conversationRef: row.conversation_ref,
    turnRef: row.turn_ref,
    taskRef: row.task_ref,
    agentRunRef: row.agent_run_ref,
    modelExecutionRef: row.model_execution_ref,
    skillRef: row.skill_ref,
    useCase: row.use_case,
    scopeHash: row.scope_hash,
    preferenceRef: row.preference_ref,
    preferenceVersion: row.preference_version,
    preferenceContentHash: row.preference_content_hash,
    packRef: row.pack_ref,
    packContentHash: row.pack_content_hash,
    decision: row.decision,
    reasonCode: row.reason_code,
    targetFields: Object.freeze([...row.target_fields]),
    estimatedTokens: row.estimated_tokens,
    policyVersion: row.policy_version,
    retentionPolicyVersion: row.retention_policy_version,
    retentionUntil: iso(row.retention_until),
    idempotencyKey: row.idempotency_key,
    authorizationDecisionRef: row.authorization_decision_ref,
    auditRef: row.audit_ref,
    contentHash: row.content_hash,
    createdAt: iso(row.created_at)
  });
}

function outcomeFromRow(row: OutcomeRow): RecordedMemoryApplicationOutcome {
  return Object.freeze({
    outcomeRef: row.outcome_ref,
    applicationRef: row.application_ref,
    owner: Object.freeze({
      tenantRef: row.tenant_ref,
      teacherRef: row.teacher_ref
    }),
    sourceEventRef: row.source_event_ref,
    agentRunRef: row.agent_run_ref,
    outcomeStatus: row.outcome_status,
    resultingRevisionRef: row.resulting_revision_ref,
    policyVersion: row.policy_version,
    idempotencyKey: row.idempotency_key,
    authorizationDecisionRef: row.authorization_decision_ref,
    auditRef: row.audit_ref,
    contentHash: row.content_hash,
    createdAt: iso(row.created_at)
  });
}

function preferenceRevisionFromRow(row: PreferenceRevisionRow): TeacherPreference {
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
    version: row.version,
    confirmedByRef: row.confirmed_by_ref,
    confirmedAt: iso(row.confirmed_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    revokedAt: nullableIso(row.revoked_at),
    contentHash: row.content_hash
  });
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

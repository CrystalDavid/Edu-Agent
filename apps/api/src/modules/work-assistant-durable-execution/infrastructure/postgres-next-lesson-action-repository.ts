import {
  NextLessonActionCandidateSchema,
  type FormalWriteMetadata,
  type FormalWriteReceipt,
  type NextLessonActionCandidate,
  type NextLessonActionStatus
} from "@edu-agent/contracts";

import type { PostgresClient, SqlExecutor } from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues,
  toPostgresJson
} from "../../../platform/postgres/write-context.js";

type WorkMetadata = FormalWriteMetadata & { owner: "work" };

export class PostgresNextLessonActionRepository {
  async insertCandidate(
    client: PostgresClient,
    input: {
      candidate: NextLessonActionCandidate;
      metadata: WorkMetadata;
      historyRef: string;
      historyMetadata: WorkMetadata;
    }
  ): Promise<FormalWriteReceipt[]> {
    const candidate = NextLessonActionCandidateSchema.parse(input.candidate);
    await client.query(
      `INSERT INTO work.next_lesson_action_candidate (
         candidate_ref, tenant_ref, teacher_ref,
         source_reflection_ref, source_reflection_revision_ref,
         source_agent_run_ref, context_manifest_ref, candidate_type,
         title, reason, confidence, status, version, target_lesson_ref,
         target_ref, deep_link, teacher_note, source_refs,
         generated_by_skill_ref, expires_at, decided_at, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
         $19, $20::timestamptz, $21::timestamptz, $22::timestamptz,
         $23, $24, $25, $26, $27, $28, $29::timestamptz
       )`,
      [
        candidate.candidateRef,
        candidate.tenantRef,
        candidate.teacherRef,
        candidate.sourceReflectionRef,
        candidate.sourceReflectionRevisionRef,
        candidate.sourceAgentRunRef,
        candidate.contextManifestRef,
        candidate.candidateType,
        candidate.title,
        candidate.reason,
        candidate.confidence,
        candidate.status,
        candidate.version,
        candidate.targetLessonRef,
        candidate.targetRef,
        candidate.deepLink,
        candidate.teacherNote,
        toPostgresJson(candidate.sourceRefs),
        candidate.generatedBySkillRef,
        candidate.expiresAt,
        candidate.decidedAt,
        candidate.updatedAt,
        ...formalMetadataValues(input.metadata)
      ]
    );
    await this.insertHistory(client, {
      historyRef: input.historyRef,
      candidate,
      changeKind: "created",
      metadata: input.historyMetadata
    });
    return [
      createReceipt({
        writeRef: candidate.candidateRef,
        recordType: "NextLessonActionCandidate",
        metadata: input.metadata
      }),
      createReceipt({
        writeRef: input.historyRef,
        recordType: "NextLessonActionHistory",
        metadata: input.historyMetadata
      })
    ];
  }

  async listByReflection(
    executor: SqlExecutor,
    input: { tenantRef: string; teacherRef: string; reflectionRef: string }
  ): Promise<NextLessonActionCandidate[]> {
    const result = await executor.query<NextLessonActionRow>(
      `${candidateSelect}
        WHERE tenant_ref = $1 AND teacher_ref = $2
          AND source_reflection_ref = $3
        ORDER BY created_at DESC, candidate_ref`,
      [input.tenantRef, input.teacherRef, input.reflectionRef]
    );
    return result.rows.map(mapCandidate);
  }

  async get(
    executor: SqlExecutor,
    input: { tenantRef: string; teacherRef: string; candidateRef: string },
    lock = false
  ): Promise<NextLessonActionCandidate | null> {
    const result = await executor.query<NextLessonActionRow>(
      `${candidateSelect}
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND candidate_ref = $3
        ${lock ? "FOR UPDATE" : ""}`,
      [input.tenantRef, input.teacherRef, input.candidateRef]
    );
    return result.rows[0] ? mapCandidate(result.rows[0]) : null;
  }

  async update(
    client: PostgresClient,
    input: {
      current: NextLessonActionCandidate;
      next: Pick<
        NextLessonActionCandidate,
        | "title"
        | "reason"
        | "targetLessonRef"
        | "targetRef"
        | "deepLink"
        | "teacherNote"
        | "decidedAt"
      > & { status: NextLessonActionStatus; updatedAt: string };
      historyRef: string;
      changeKind: "updated" | "accepted" | "rejected" | "expired";
      historyMetadata: WorkMetadata;
    }
  ): Promise<NextLessonActionCandidate | null> {
    const result = await client.query<NextLessonActionRow>(
      `UPDATE work.next_lesson_action_candidate
          SET title = $4, reason = $5, target_lesson_ref = $6,
              target_ref = $7, deep_link = $8, teacher_note = $9,
              status = $10, decided_at = $11::timestamptz,
              version = version + 1, updated_at = $12::timestamptz
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND candidate_ref = $3
          AND version = $13 AND status = 'candidate'
        RETURNING candidate_ref, tenant_ref, teacher_ref,
                  source_reflection_ref, source_reflection_revision_ref,
                  source_agent_run_ref, context_manifest_ref, candidate_type,
                  title, reason, confidence, status, version,
                  target_lesson_ref, target_ref, deep_link, teacher_note,
                  source_refs, generated_by_skill_ref, expires_at,
                  decided_at, created_at, updated_at`,
      [
        input.current.tenantRef,
        input.current.teacherRef,
        input.current.candidateRef,
        input.next.title,
        input.next.reason,
        input.next.targetLessonRef,
        input.next.targetRef,
        input.next.deepLink,
        input.next.teacherNote,
        input.next.status,
        input.next.decidedAt,
        input.next.updatedAt,
        input.current.version
      ]
    );
    const row = result.rows[0];
    if (!row) return null;
    const candidate = mapCandidate(row);
    await this.insertHistory(client, {
      historyRef: input.historyRef,
      candidate,
      changeKind: input.changeKind,
      metadata: input.historyMetadata
    });
    return candidate;
  }

  async insertOutbox(
    client: PostgresClient,
    input: {
      outboxRef: string;
      eventName: string;
      aggregateRef: string;
      payload: Record<string, unknown>;
      metadata: WorkMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO work.outbox_record (
         outbox_ref, event_name, aggregate_ref, payload,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)`,
      [
        input.outboxRef,
        input.eventName,
        input.aggregateRef,
        toPostgresJson(input.payload),
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: input.outboxRef,
      recordType: "OutboxRecord",
      metadata: input.metadata
    });
  }

  private async insertHistory(
    client: PostgresClient,
    input: {
      historyRef: string;
      candidate: NextLessonActionCandidate;
      changeKind: "created" | "updated" | "accepted" | "rejected" | "expired";
      metadata: WorkMetadata;
    }
  ) {
    await client.query(
      `INSERT INTO work.next_lesson_action_history (
         history_ref, candidate_ref, candidate_version, change_kind, snapshot,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12)`,
      [
        input.historyRef,
        input.candidate.candidateRef,
        input.candidate.version,
        input.changeKind,
        toPostgresJson(input.candidate),
        ...formalMetadataValues(input.metadata)
      ]
    );
  }
}

const candidateSelect = `SELECT candidate_ref, tenant_ref, teacher_ref,
  source_reflection_ref, source_reflection_revision_ref,
  source_agent_run_ref, context_manifest_ref, candidate_type,
  title, reason, confidence, status, version, target_lesson_ref,
  target_ref, deep_link, teacher_note, source_refs,
  generated_by_skill_ref, expires_at, decided_at, created_at, updated_at
  FROM work.next_lesson_action_candidate`;

interface NextLessonActionRow {
  candidate_ref: string;
  tenant_ref: string;
  teacher_ref: string;
  source_reflection_ref: string;
  source_reflection_revision_ref: string;
  source_agent_run_ref: string;
  context_manifest_ref: string;
  candidate_type: NextLessonActionCandidate["candidateType"];
  title: string;
  reason: string;
  confidence: NextLessonActionCandidate["confidence"];
  status: NextLessonActionCandidate["status"];
  version: number;
  target_lesson_ref: string | null;
  target_ref: string | null;
  deep_link: string | null;
  teacher_note: string | null;
  source_refs: string[];
  generated_by_skill_ref: string;
  expires_at: Date | null;
  decided_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapCandidate(row: NextLessonActionRow): NextLessonActionCandidate {
  return NextLessonActionCandidateSchema.parse({
    candidateRef: row.candidate_ref,
    tenantRef: row.tenant_ref,
    teacherRef: row.teacher_ref,
    sourceReflectionRef: row.source_reflection_ref,
    sourceReflectionRevisionRef: row.source_reflection_revision_ref,
    sourceAgentRunRef: row.source_agent_run_ref,
    contextManifestRef: row.context_manifest_ref,
    candidateType: row.candidate_type,
    title: row.title,
    reason: row.reason,
    confidence: row.confidence,
    status: row.status,
    version: row.version,
    targetLessonRef: row.target_lesson_ref,
    targetRef: row.target_ref,
    deepLink: row.deep_link,
    teacherNote: row.teacher_note,
    sourceRefs: row.source_refs,
    generatedBySkillRef: row.generated_by_skill_ref,
    expiresAt: row.expires_at?.toISOString() ?? null,
    decidedAt: row.decided_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  });
}

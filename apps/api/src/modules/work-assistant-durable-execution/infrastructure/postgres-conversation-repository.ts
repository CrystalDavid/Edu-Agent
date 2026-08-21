import {
  ConversationTurnViewSchema,
  type ConversationTurnView,
  type FormalWriteMetadata,
  type FormalWriteReceipt
} from "@edu-agent/contracts";

import type {
  PostgresClient,
  SqlExecutor
} from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues
} from "../../../platform/postgres/write-context.js";

type WorkMetadata = FormalWriteMetadata & { owner: "work" };

export interface ConversationThreadRecord {
  conversationRef: string;
  tenantRef: string;
  teacherRef: string;
  taskRef: string;
  purposeFamily: "lesson_preparation";
  status: "active" | "closed" | "expired";
  courseRunRef: string;
  lessonRef: string;
  version: number;
  lastTurnSequence: number;
  lastTurnRef: string | null;
  retentionUntil: string;
  policyVersion: "conversation-retention@1";
  contentHash: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export class PostgresConversationRepository {
  async insertThread(
    client: PostgresClient,
    input: {
      thread: ConversationThreadRecord;
      metadata: WorkMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    const thread = input.thread;
    await client.query(
      `INSERT INTO work.conversation_thread (
         conversation_ref, tenant_ref, teacher_ref, task_ref,
         purpose_family, status, course_run_ref, lesson_ref,
         current_version, last_turn_sequence, last_turn_ref,
         retention_until, policy_version, content_hash, updated_at, closed_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12::timestamptz, $13, $14,
         $15::timestamptz, $16::timestamptz,
         $17, $18, $19, $20, $21, $22, $23::timestamptz
       )`,
      [
        thread.conversationRef,
        thread.tenantRef,
        thread.teacherRef,
        thread.taskRef,
        thread.purposeFamily,
        thread.status,
        thread.courseRunRef,
        thread.lessonRef,
        thread.version,
        thread.lastTurnSequence,
        thread.lastTurnRef,
        thread.retentionUntil,
        thread.policyVersion,
        thread.contentHash,
        thread.updatedAt,
        thread.closedAt,
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: thread.conversationRef,
      recordType: "ConversationThread",
      metadata: input.metadata
    });
  }

  async getThread(
    executor: SqlExecutor,
    input: {
      tenantRef: string;
      teacherRef: string;
      conversationRef: string;
    },
    lock = false
  ): Promise<ConversationThreadRecord | null> {
    const result = await executor.query<ConversationThreadRow>(
      `${threadSelect}
       WHERE tenant_ref = $1 AND teacher_ref = $2 AND conversation_ref = $3
       ${lock ? "FOR UPDATE" : ""}`,
      [input.tenantRef, input.teacherRef, input.conversationRef]
    );
    return result.rows[0] ? mapThread(result.rows[0]) : null;
  }

  async listTurns(
    executor: SqlExecutor,
    conversationRef: string
  ): Promise<ConversationTurnView[]> {
    const result = await executor.query<ConversationTurnRow>(
      `${turnSelect}
       WHERE conversation_ref = $1
       ORDER BY sequence`,
      [conversationRef]
    );
    return result.rows.map(mapTurn);
  }

  async getTurn(
    executor: SqlExecutor,
    conversationRef: string,
    turnRef: string
  ): Promise<ConversationTurnView | null> {
    const result = await executor.query<ConversationTurnRow>(
      `${turnSelect}
       WHERE conversation_ref = $1 AND turn_ref = $2`,
      [conversationRef, turnRef]
    );
    return result.rows[0] ? mapTurn(result.rows[0]) : null;
  }

  async findAssistantResult(
    executor: SqlExecutor,
    conversationRef: string,
    proposalRevisionRef: string
  ): Promise<ConversationTurnView | null> {
    const result = await executor.query<ConversationTurnRow>(
      `${turnSelect}
       WHERE conversation_ref = $1 AND proposal_revision_ref = $2`,
      [conversationRef, proposalRevisionRef]
    );
    return result.rows[0] ? mapTurn(result.rows[0]) : null;
  }

  async insertTurn(
    client: PostgresClient,
    input: {
      turn: ConversationTurnView;
      metadata: WorkMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    const turn = ConversationTurnViewSchema.parse(input.turn);
    await client.query(
      `INSERT INTO work.conversation_turn (
         turn_ref, conversation_ref, sequence, parent_turn_ref,
         actor_kind, content_kind, teacher_text, surface_summary,
         task_run_ref, agent_run_ref, model_execution_ref,
         proposal_revision_ref, memory_candidate_refs,
         teacher_preference_refs, content_hash,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13::text[], $14::text[], $15,
         $16, $17, $18, $19, $20, $21, $22::timestamptz
       )`,
      [
        turn.turnRef,
        turn.conversationRef,
        turn.sequence,
        turn.parentTurnRef,
        turn.actorKind,
        turn.contentKind,
        turn.teacherText,
        turn.surfaceSummary,
        turn.taskRunRef,
        turn.agentRunRef,
        turn.resultRefs.modelExecutionRef ?? null,
        turn.resultRefs.proposalRevisionRef ?? null,
        turn.resultRefs.candidateRefs ?? [],
        turn.resultRefs.preferenceRefs ?? [],
        turn.contentHash,
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: turn.turnRef,
      recordType: "ConversationTurn",
      metadata: input.metadata
    });
  }

  async advanceThread(
    client: PostgresClient,
    input: {
      current: ConversationThreadRecord;
      turnRef: string;
      sequence: number;
      contentHash: string;
      updatedAt: string;
    }
  ): Promise<ConversationThreadRecord | null> {
    const result = await client.query<ConversationThreadRow>(
      `UPDATE work.conversation_thread
          SET current_version = current_version + 1,
              last_turn_sequence = $4,
              last_turn_ref = $5,
              content_hash = $6,
              updated_at = $7::timestamptz
        WHERE tenant_ref = $1 AND teacher_ref = $2
          AND conversation_ref = $3
          AND current_version = $8
          AND last_turn_sequence = $9
          AND status = 'active'
          AND retention_until > $7::timestamptz
        RETURNING conversation_ref, tenant_ref, teacher_ref, task_ref,
                  purpose_family, status, course_run_ref, lesson_ref,
                  current_version, last_turn_sequence, last_turn_ref,
                  retention_until, policy_version, content_hash,
                  created_at, updated_at, closed_at`,
      [
        input.current.tenantRef,
        input.current.teacherRef,
        input.current.conversationRef,
        input.sequence,
        input.turnRef,
        input.contentHash,
        input.updatedAt,
        input.current.version,
        input.current.lastTurnSequence
      ]
    );
    return result.rows[0] ? mapThread(result.rows[0]) : null;
  }

  async closeThread(
    client: PostgresClient,
    input: {
      current: ConversationThreadRecord;
      contentHash: string;
      closedAt: string;
      metadata: WorkMetadata;
    }
  ): Promise<{
    thread: ConversationThreadRecord | null;
    receipt: FormalWriteReceipt;
  }> {
    const result = await client.query<ConversationThreadRow>(
      `UPDATE work.conversation_thread
          SET status = 'closed',
              current_version = current_version + 1,
              content_hash = $5,
              updated_at = $6::timestamptz,
              closed_at = $6::timestamptz
        WHERE tenant_ref = $1 AND teacher_ref = $2
          AND conversation_ref = $3
          AND current_version = $4
          AND status = 'active'
          AND retention_until > $6::timestamptz
        RETURNING conversation_ref, tenant_ref, teacher_ref, task_ref,
                  purpose_family, status, course_run_ref, lesson_ref,
                  current_version, last_turn_sequence, last_turn_ref,
                  retention_until, policy_version, content_hash,
                  created_at, updated_at, closed_at`,
      [
        input.current.tenantRef,
        input.current.teacherRef,
        input.current.conversationRef,
        input.current.version,
        input.contentHash,
        input.closedAt
      ]
    );
    return {
      thread: result.rows[0] ? mapThread(result.rows[0]) : null,
      receipt: createReceipt({
        writeRef: input.current.conversationRef,
        recordType: "ConversationThread",
        metadata: input.metadata
      })
    };
  }
}

const threadSelect = `SELECT conversation_ref, tenant_ref, teacher_ref,
  task_ref, purpose_family, status, course_run_ref, lesson_ref,
  current_version, last_turn_sequence, last_turn_ref, retention_until,
  policy_version, content_hash, created_at, updated_at, closed_at
  FROM work.conversation_thread`;

const turnSelect = `SELECT turn_ref, conversation_ref, sequence,
  parent_turn_ref, actor_kind, content_kind, teacher_text, surface_summary,
  task_run_ref, agent_run_ref, model_execution_ref, proposal_revision_ref,
  memory_candidate_refs, teacher_preference_refs, content_hash, created_at
  FROM work.conversation_turn`;

interface ConversationThreadRow {
  conversation_ref: string;
  tenant_ref: string;
  teacher_ref: string;
  task_ref: string;
  purpose_family: ConversationThreadRecord["purposeFamily"];
  status: ConversationThreadRecord["status"];
  course_run_ref: string;
  lesson_ref: string;
  current_version: number;
  last_turn_sequence: number;
  last_turn_ref: string | null;
  retention_until: Date;
  policy_version: ConversationThreadRecord["policyVersion"];
  content_hash: string;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
}

interface ConversationTurnRow {
  turn_ref: string;
  conversation_ref: string;
  sequence: number;
  parent_turn_ref: string | null;
  actor_kind: ConversationTurnView["actorKind"];
  content_kind: ConversationTurnView["contentKind"];
  teacher_text: string | null;
  surface_summary: string | null;
  task_run_ref: string | null;
  agent_run_ref: string | null;
  model_execution_ref: string | null;
  proposal_revision_ref: string | null;
  memory_candidate_refs: string[];
  teacher_preference_refs: string[];
  content_hash: string;
  created_at: Date;
}

function mapThread(row: ConversationThreadRow): ConversationThreadRecord {
  return {
    conversationRef: row.conversation_ref,
    tenantRef: row.tenant_ref,
    teacherRef: row.teacher_ref,
    taskRef: row.task_ref,
    purposeFamily: row.purpose_family,
    status: row.status,
    courseRunRef: row.course_run_ref,
    lessonRef: row.lesson_ref,
    version: row.current_version,
    lastTurnSequence: row.last_turn_sequence,
    lastTurnRef: row.last_turn_ref,
    retentionUntil: row.retention_until.toISOString(),
    policyVersion: row.policy_version,
    contentHash: row.content_hash,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    closedAt: row.closed_at?.toISOString() ?? null
  };
}

function mapTurn(row: ConversationTurnRow): ConversationTurnView {
  return ConversationTurnViewSchema.parse({
    turnRef: row.turn_ref,
    conversationRef: row.conversation_ref,
    sequence: row.sequence,
    parentTurnRef: row.parent_turn_ref,
    actorKind: row.actor_kind,
    contentKind: row.content_kind,
    teacherText: row.teacher_text,
    surfaceSummary: row.surface_summary,
    taskRunRef: row.task_run_ref,
    agentRunRef: row.agent_run_ref,
    resultRefs: {
      ...(row.model_execution_ref
        ? { modelExecutionRef: row.model_execution_ref }
        : {}),
      ...(row.proposal_revision_ref
        ? { proposalRevisionRef: row.proposal_revision_ref }
        : {}),
      ...(row.memory_candidate_refs.length > 0
        ? { candidateRefs: row.memory_candidate_refs }
        : {}),
      ...(row.teacher_preference_refs.length > 0
        ? { preferenceRefs: row.teacher_preference_refs }
        : {})
    },
    contentHash: row.content_hash,
    createdAt: row.created_at.toISOString()
  });
}

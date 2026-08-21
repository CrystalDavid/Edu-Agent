import {
  WorkingMemoryViewSchema,
  type FormalWriteMetadata,
  type FormalWriteReceipt,
  type WorkingMemoryView
} from "@edu-agent/contracts";

import type {
  PostgresClient,
  SqlExecutor
} from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues,
  toPostgresJson
} from "../../../platform/postgres/write-context.js";

type RuntimeMetadata = FormalWriteMetadata & { owner: "runtime" };

export type PersistedWorkingMemorySnapshot = WorkingMemoryView & {
  readonly version: number;
};

export class PostgresWorkingMemoryRepository {
  async getActive(
    executor: SqlExecutor,
    input: {
      tenantRef: string;
      teacherRef: string;
      conversationRef: string;
      asOf: string;
    }
  ): Promise<PersistedWorkingMemorySnapshot | null> {
    const result = await executor.query<WorkingMemoryRow>(
      `${snapshotSelect}
       WHERE tenant_ref = $1 AND teacher_ref = $2
         AND conversation_ref = $3 AND status = 'active'
         AND expires_at > $4::timestamptz`,
      [
        input.tenantRef,
        input.teacherRef,
        input.conversationRef,
        input.asOf
      ]
    );
    return result.rows[0] ? mapSnapshot(result.rows[0]) : null;
  }

  async getByRef(
    executor: SqlExecutor,
    input: {
      tenantRef: string;
      teacherRef: string;
      conversationRef: string;
      snapshotRef: string;
      asOf: string;
    }
  ): Promise<PersistedWorkingMemorySnapshot | null> {
    const result = await executor.query<WorkingMemoryRow>(
      `${snapshotSelect}
       WHERE tenant_ref = $1 AND teacher_ref = $2
         AND conversation_ref = $3 AND snapshot_ref = $4
         AND status <> 'expired'
         AND expires_at > $5::timestamptz`,
      [
        input.tenantRef,
        input.teacherRef,
        input.conversationRef,
        input.snapshotRef,
        input.asOf
      ]
    );
    return result.rows[0] ? mapSnapshot(result.rows[0]) : null;
  }

  async replaceActive(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      snapshot: WorkingMemoryView;
      sourceRefs: readonly string[];
      sourceRetentionUntil: string;
      metadata: RuntimeMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    const snapshot = WorkingMemoryViewSchema.parse(input.snapshot);
    if (
      Date.parse(snapshot.expiresAt) >
      Date.parse(input.sourceRetentionUntil)
    ) {
      throw new Error(
        "WorkingMemorySnapshot retention cannot outlive its source ConversationTurn."
      );
    }
    await client.query(
      `UPDATE runtime.working_memory_snapshot
          SET status = 'superseded'
        WHERE tenant_ref = $1 AND teacher_ref = $2
          AND conversation_ref = $3 AND status = 'active'`,
      [input.tenantRef, input.teacherRef, snapshot.conversationRef]
    );
    const versionResult = await client.query<{ next_version: number }>(
      `SELECT COALESCE(max(version), 0) + 1 AS next_version
         FROM runtime.working_memory_snapshot
        WHERE tenant_ref = $1 AND teacher_ref = $2
          AND conversation_ref = $3`,
      [input.tenantRef, input.teacherRef, snapshot.conversationRef]
    );
    const version = versionResult.rows[0]?.next_version ?? 1;
    await client.query(
      `INSERT INTO runtime.working_memory_snapshot (
         snapshot_ref, tenant_ref, teacher_ref, conversation_ref,
         source_turn_sequence, status, active_goal,
         recent_teacher_requests, referents, pending_intents,
         selected_options, temporary_overrides, latest_assistant_result,
         rolling_summary, builder_version, policy_version, source_refs,
         expires_at, version, content_hash,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'active', $6::jsonb,
         $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
         $12::jsonb, $13, $14, $15, $16::jsonb, $17::timestamptz,
         $18, $19, $20, $21, $22, $23, $24, $25, $26::timestamptz
       )`,
      [
        snapshot.snapshotRef,
        input.tenantRef,
        input.teacherRef,
        snapshot.conversationRef,
        snapshot.sourceTurnSequence,
        toPostgresJson(snapshot.activeGoal),
        toPostgresJson(snapshot.recentTeacherRequests),
        toPostgresJson(snapshot.referents),
        toPostgresJson(snapshot.pendingIntents),
        toPostgresJson(snapshot.selectedOptions),
        toPostgresJson(snapshot.temporaryOverrides),
        snapshot.latestAssistantResult
          ? toPostgresJson(snapshot.latestAssistantResult)
          : null,
        snapshot.rollingSummary,
        snapshot.builderVersion,
        "working-memory-policy@1",
        toPostgresJson(input.sourceRefs),
        snapshot.expiresAt,
        version,
        snapshot.contentHash,
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: snapshot.snapshotRef,
      recordType: "WorkingMemorySnapshot",
      metadata: input.metadata
    });
  }

  async deactivateActive(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      conversationRef: string;
      status: "invalidated" | "expired";
      metadata: RuntimeMetadata;
    }
  ): Promise<FormalWriteReceipt | null> {
    const result = await client.query<{ snapshot_ref: string }>(
      `UPDATE runtime.working_memory_snapshot
          SET status = $4
        WHERE tenant_ref = $1 AND teacher_ref = $2
          AND conversation_ref = $3 AND status = 'active'
        RETURNING snapshot_ref`,
      [
        input.tenantRef,
        input.teacherRef,
        input.conversationRef,
        input.status
      ]
    );
    const snapshotRef = result.rows[0]?.snapshot_ref;
    return snapshotRef
      ? createReceipt({
          writeRef: snapshotRef,
          recordType: "WorkingMemorySnapshot",
          metadata: input.metadata
        })
      : null;
  }
}

const snapshotSelect = `SELECT snapshot_ref, conversation_ref,
  source_turn_sequence, active_goal, recent_teacher_requests, referents,
  pending_intents, selected_options, temporary_overrides,
  latest_assistant_result, rolling_summary, builder_version,
  version, content_hash, expires_at
  FROM runtime.working_memory_snapshot`;

interface WorkingMemoryRow {
  snapshot_ref: string;
  conversation_ref: string;
  source_turn_sequence: number;
  active_goal: unknown;
  recent_teacher_requests: unknown;
  referents: unknown;
  pending_intents: unknown;
  selected_options: unknown;
  temporary_overrides: unknown;
  latest_assistant_result: unknown | null;
  rolling_summary: string;
  builder_version: string;
  version: number;
  content_hash: string;
  expires_at: Date;
}

function mapSnapshot(
  row: WorkingMemoryRow
): PersistedWorkingMemorySnapshot {
  return {
    ...WorkingMemoryViewSchema.parse({
    snapshotRef: row.snapshot_ref,
    conversationRef: row.conversation_ref,
    sourceTurnSequence: row.source_turn_sequence,
    activeGoal: row.active_goal,
    recentTeacherRequests: row.recent_teacher_requests,
    referents: row.referents,
    pendingIntents: row.pending_intents,
    selectedOptions: row.selected_options,
    temporaryOverrides: row.temporary_overrides,
    latestAssistantResult: row.latest_assistant_result,
    rollingSummary: row.rolling_summary,
    builderVersion: row.builder_version,
    contentHash: row.content_hash,
    expiresAt: row.expires_at.toISOString()
    }),
    version: row.version
  };
}

import type {
  FormalWriteMetadata,
  FormalWriteReceipt
} from "@edu-agent/contracts";

import type { PostgresClient } from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues,
  toPostgresJson
} from "../../../platform/postgres/write-context.js";

export interface PostgresAgentRunBundle {
  agentRun: {
    agentRunRef: string;
    runKind: "QueryRun" | "TaskRun";
    boundRunRef: string;
    status: string;
    modelProvider: string;
    modelProfile: string;
    toolName: string;
    output: Record<string, unknown>;
    metadata: FormalWriteMetadata & { owner: "runtime" };
  };
  manifest: {
    manifestRef: string;
    agentRunRef: string;
    contractRef?: string;
    contextManifestRef?: string;
    promptVersionRef: string;
    policyVersionRef: string;
    capabilityRefs: readonly string[];
    contextRefs: readonly string[];
    contentHash: string;
    metadata: FormalWriteMetadata & { owner: "runtime" };
  };
  outbox: {
    outboxRef: string;
    eventName: string;
    aggregateRef: string;
    payload: Record<string, unknown>;
    metadata: FormalWriteMetadata & { owner: "runtime" };
  };
}

export class PostgresRuntimeRepository {
  async insertAgentRunBundle(
    client: PostgresClient,
    bundle: PostgresAgentRunBundle
  ): Promise<readonly FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO runtime.agent_run (
         agent_run_ref,
         run_kind,
         bound_run_ref,
         status,
         model_provider,
         model_profile,
         tool_name,
         output,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15
       )`,
      [
        bundle.agentRun.agentRunRef,
        bundle.agentRun.runKind,
        bundle.agentRun.boundRunRef,
        bundle.agentRun.status,
        bundle.agentRun.modelProvider,
        bundle.agentRun.modelProfile,
        bundle.agentRun.toolName,
        toPostgresJson(bundle.agentRun.output),
        ...formalMetadataValues(bundle.agentRun.metadata)
      ]
    );
    await client.query(
      `UPDATE runtime.agent_run
          SET updated_at = $2::timestamptz,
              completed_at = CASE
                WHEN status = 'completed'
                  THEN $2::timestamptz
                ELSE NULL
              END
        WHERE agent_run_ref = $1`,
      [
        bundle.agentRun.agentRunRef,
        bundle.agentRun.metadata.createdAt
      ]
    );
    await client.query(
      `INSERT INTO runtime.run_manifest (
         manifest_ref,
         agent_run_ref,
         contract_ref,
         context_manifest_ref,
         prompt_version_ref,
         policy_version_ref,
         capability_refs,
         context_refs,
         content_hash,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16
       )`,
      [
        bundle.manifest.manifestRef,
        bundle.manifest.agentRunRef,
        bundle.manifest.contractRef ?? null,
        bundle.manifest.contextManifestRef ?? null,
        bundle.manifest.promptVersionRef,
        bundle.manifest.policyVersionRef,
        toPostgresJson(bundle.manifest.capabilityRefs),
        toPostgresJson(bundle.manifest.contextRefs),
        bundle.manifest.contentHash,
        ...formalMetadataValues(bundle.manifest.metadata)
      ]
    );
    await client.query(
      `INSERT INTO runtime.outbox_record (
         outbox_ref,
         event_name,
         aggregate_ref,
         payload,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8, $9, $10, $11
       )`,
      [
        bundle.outbox.outboxRef,
        bundle.outbox.eventName,
        bundle.outbox.aggregateRef,
        toPostgresJson(bundle.outbox.payload),
        ...formalMetadataValues(bundle.outbox.metadata)
      ]
    );

    return [
      createReceipt({
        writeRef: bundle.agentRun.agentRunRef,
        recordType: "AgentRun",
        metadata: bundle.agentRun.metadata
      }),
      createReceipt({
        writeRef: bundle.manifest.manifestRef,
        recordType: "RunManifest",
        metadata: bundle.manifest.metadata
      }),
      createReceipt({
        writeRef: bundle.outbox.outboxRef,
        recordType: "OutboxRecord",
        metadata: bundle.outbox.metadata
      })
    ];
  }

  async updateAgentRunStatus(
    client: PostgresClient,
    input: {
      agentRunRef: string;
      status:
        | "queued"
        | "running"
        | "validating"
        | "completed"
        | "failed"
        | "cancelled";
      output?: Record<string, unknown>;
      updatedAt: string;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE runtime.agent_run
          SET status = $2,
              output = COALESCE($3, output),
              updated_at = $4::timestamptz,
              completed_at = CASE
                WHEN $2 IN ('completed', 'failed', 'cancelled')
                  THEN $4::timestamptz
                ELSE NULL
              END
        WHERE agent_run_ref = $1`,
      [
        input.agentRunRef,
        input.status,
        input.output ? toPostgresJson(input.output) : null,
        input.updatedAt
      ]
    );
  }
}

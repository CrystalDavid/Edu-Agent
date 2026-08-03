import type {
  FormalWriteMetadata,
  FormalWriteReceipt
} from "@edu-agent/contracts";

import type { RuntimeCheckpointStore, StoredRuntimeCheckpoint } from
  "../application/runtime-kernel-service.js";
import {
  compatibilityAgentRunStatus,
  parseRuntimeCheckpoint,
  type AgentRunCheckpoint,
  type RuntimeKernelEvent
} from "../domain/runtime-kernel.js";
import type { PostgresClient } from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues,
  toPostgresJson
} from "../../../platform/postgres/write-context.js";

export class PostgresRuntimeCheckpointAdapter
  implements RuntimeCheckpointStore<PostgresClient>
{
  async load(
    client: PostgresClient,
    agentRunRef: string
  ): Promise<StoredRuntimeCheckpoint | null> {
    const result = await client.query<{
      output: Record<string, unknown>;
    }>(
      `SELECT output
         FROM runtime.agent_run
        WHERE agent_run_ref = $1
        FOR UPDATE`,
      [agentRunRef]
    );
    const output = result.rows[0]?.output;
    if (!output || output["runtimeCheckpoint"] === undefined) {
      return null;
    }
    return {
      compatibilityOutput: output,
      checkpoint: parseRuntimeCheckpoint(output["runtimeCheckpoint"])
    };
  }

  async save(
    client: PostgresClient,
    input: {
      readonly current: StoredRuntimeCheckpoint;
      readonly checkpoint: AgentRunCheckpoint;
      readonly compatibilityOutputPatch: Record<string, unknown>;
      readonly outboxRef: string;
      readonly eventType: RuntimeKernelEvent["type"];
      readonly metadata: FormalWriteMetadata & { readonly owner: "runtime" };
    }
  ): Promise<FormalWriteReceipt> {
    const compatibilityStatus = compatibilityAgentRunStatus(
      input.checkpoint.status
    );
    const output = {
      ...input.current.compatibilityOutput,
      ...input.compatibilityOutputPatch,
      runtimeCheckpoint: input.checkpoint
    };
    const updated = await client.query(
      `UPDATE runtime.agent_run
          SET status = $2,
              output = $3,
              updated_at = $4::timestamptz,
              completed_at = CASE
                WHEN $2 IN ('completed', 'failed', 'cancelled')
                  THEN $4::timestamptz
                ELSE NULL
              END
        WHERE agent_run_ref = $1
          AND (output -> 'runtimeCheckpoint' ->> 'checkpointVersion')::integer = $5`,
      [
        input.checkpoint.agentRunRef,
        compatibilityStatus,
        toPostgresJson(output),
        input.checkpoint.updatedAt,
        input.current.checkpoint.checkpointVersion
      ]
    );
    if (updated.rowCount !== 1) {
      throw new Error(
        "Runtime checkpoint version changed before it could be saved."
      );
    }

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
         $1, 'AgentRunCheckpointed', $2, $3,
         $4, $5, $6, $7, $8, $9, $10
       )`,
      [
        input.outboxRef,
        input.checkpoint.agentRunRef,
        toPostgresJson({
          checkpointRef: input.checkpoint.checkpointRef,
          checkpointVersion: input.checkpoint.checkpointVersion,
          checkpointHash: input.checkpoint.contentHash,
          eventType: input.eventType,
          kernelStatus: input.checkpoint.status,
          currentStepRef: input.checkpoint.currentStepRef,
          modelExecutionRef: input.checkpoint.modelExecutionRef,
          proposalRef: input.checkpoint.proposalRef,
          recoveryCount: input.checkpoint.recoveryCount
        }),
        ...formalMetadataValues(input.metadata)
      ]
    );

    return createReceipt({
      writeRef: input.outboxRef,
      recordType: "RuntimeCheckpoint",
      metadata: input.metadata
    });
  }
}

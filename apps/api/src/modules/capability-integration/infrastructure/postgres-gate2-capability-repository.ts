import type {
  FormalWriteMetadata,
  FormalWriteReceipt,
  PedagogicalStrategy
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

export class PostgresGate2CapabilityRepository {
  async insertModelExecutionBundle(
    client: PostgresClient,
    input: {
      execution: {
        executionRef: string;
        provider: "mock";
        modelProfile: string;
        promptBundleRef: string;
        inputSummary: Record<string, unknown>;
        strategies: readonly PedagogicalStrategy[];
        usageSummary: {
          inputUnits: number;
          outputUnits: number;
        };
        metadata: FormalWriteMetadata & { owner: "capability" };
      };
      outbox: {
        outboxRef: string;
        eventName: string;
        aggregateRef: string;
        payload: Record<string, unknown>;
        metadata: FormalWriteMetadata & { owner: "capability" };
      };
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO capability.model_execution (
         execution_ref,
         provider,
         model_profile,
         prompt_bundle_ref,
         input_summary,
         output,
         usage_summary,
         external_network_used,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, false,
         $8, $9, $10, $11, $12, $13, $14
       )`,
      [
        input.execution.executionRef,
        input.execution.provider,
        input.execution.modelProfile,
        input.execution.promptBundleRef,
        toPostgresJson(input.execution.inputSummary),
        toPostgresJson({
          strategies: input.execution.strategies
        }),
        toPostgresJson(input.execution.usageSummary),
        ...formalMetadataValues(input.execution.metadata)
      ]
    );
    await client.query(
      `INSERT INTO capability.outbox_record (
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
        input.outbox.outboxRef,
        input.outbox.eventName,
        input.outbox.aggregateRef,
        toPostgresJson(input.outbox.payload),
        ...formalMetadataValues(input.outbox.metadata)
      ]
    );
    return [
      createReceipt({
        writeRef: input.execution.executionRef,
        recordType: "ModelExecution",
        metadata: input.execution.metadata
      }),
      createReceipt({
        writeRef: input.outbox.outboxRef,
        recordType: "OutboxRecord",
        metadata: input.outbox.metadata
      })
    ];
  }

  async getModelExecution(
    executor: SqlExecutor,
    agentRunRef: string
  ): Promise<
    | {
        executionRef: string;
        provider: "mock";
        modelProfile: string;
        promptBundleRef: string;
        externalNetworkUsed: false;
        usage: {
          inputUnits: number;
          outputUnits: number;
        };
      }
    | undefined
  > {
    const result = await executor.query<{
      execution_ref: string;
      provider: "mock";
      model_profile: string;
      prompt_bundle_ref: string;
      external_network_used: false;
      usage_summary: {
        inputUnits: number;
        outputUnits: number;
      };
    }>(
      `SELECT execution_ref, provider, model_profile,
              prompt_bundle_ref, external_network_used, usage_summary
         FROM capability.model_execution
        WHERE input_summary ->> 'agentRunRef' = $1`,
      [agentRunRef]
    );
    const row = result.rows[0];
    return row
      ? {
          executionRef: row.execution_ref,
          provider: row.provider,
          modelProfile: row.model_profile,
          promptBundleRef: row.prompt_bundle_ref,
          externalNetworkUsed: row.external_network_used,
          usage: row.usage_summary
        }
      : undefined;
  }
}

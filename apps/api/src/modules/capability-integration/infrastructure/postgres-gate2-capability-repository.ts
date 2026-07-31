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
         status,
         model_id,
         model_display_name,
         prompt_bundle_version,
         request_hash,
         attempt_count,
         max_attempts,
         output_schema_version,
         queued_at,
         completed_at,
         updated_at,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, false,
         'succeeded', $3, $3, 1, $1, 1, 1,
         'gate2-legacy-strategies@1', $14, $14, $14,
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
        provider: "mock" | "volcengine-ark";
        modelProfile: string;
        modelId: string;
        modelDisplayName: string;
        status: string;
        promptBundleRef: string;
        promptBundleVersion: number;
        contextManifestRef: string | null;
        externalNetworkUsed: boolean;
        attemptCount: number;
        maxAttempts: number;
        inputTokens: number | null;
        outputTokens: number | null;
        totalTokens: number | null;
        estimatedCost: number | null;
        latencyMs: number | null;
        providerRequestId: string | null;
        finishReason: string | null;
        safeErrorCategory: string | null;
        usage: {
          inputUnits: number;
          outputUnits: number;
        };
      }
    | undefined
  > {
    const result = await executor.query<{
      execution_ref: string;
      provider: "mock" | "volcengine-ark";
      model_profile: string;
      model_id: string;
      model_display_name: string;
      status: string;
      prompt_bundle_ref: string;
      prompt_bundle_version: number;
      context_manifest_ref: string | null;
      external_network_used: boolean;
      attempt_count: number;
      max_attempts: number;
      input_tokens: number | null;
      output_tokens: number | null;
      total_tokens: number | null;
      estimated_cost: string | null;
      latency_ms: number | null;
      provider_request_id: string | null;
      finish_reason: string | null;
      safe_error_category: string | null;
      usage_summary: {
        inputUnits: number;
        outputUnits: number;
      } | null;
    }>(
      `SELECT execution_ref, provider, model_profile, model_id,
              model_display_name, status, prompt_bundle_ref,
              prompt_bundle_version, context_manifest_ref,
              external_network_used, attempt_count, max_attempts,
              input_tokens, output_tokens, total_tokens,
              estimated_cost, latency_ms, provider_request_id,
              finish_reason, safe_error_category, usage_summary
         FROM capability.model_execution
        WHERE agent_run_ref = $1
           OR input_summary ->> 'agentRunRef' = $1
        ORDER BY (agent_run_ref IS NOT NULL) DESC,
                 created_at DESC
        LIMIT 1`,
      [agentRunRef]
    );
    const row = result.rows[0];
    return row
      ? {
          executionRef: row.execution_ref,
          provider: row.provider,
          modelProfile: row.model_profile,
          modelId: row.model_id,
          modelDisplayName: row.model_display_name,
          status: row.status,
          promptBundleRef: row.prompt_bundle_ref,
          promptBundleVersion: row.prompt_bundle_version,
          contextManifestRef: row.context_manifest_ref,
          externalNetworkUsed: row.external_network_used,
          attemptCount: row.attempt_count,
          maxAttempts: row.max_attempts,
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          totalTokens: row.total_tokens,
          estimatedCost:
            row.estimated_cost === null
              ? null
              : Number(row.estimated_cost),
          latencyMs: row.latency_ms,
          providerRequestId: row.provider_request_id,
          finishReason: row.finish_reason,
          safeErrorCategory: row.safe_error_category,
          usage: row.usage_summary ?? {
            inputUnits: row.input_tokens ?? 0,
            outputUnits: row.output_tokens ?? 0
          }
        }
      : undefined;
  }
}

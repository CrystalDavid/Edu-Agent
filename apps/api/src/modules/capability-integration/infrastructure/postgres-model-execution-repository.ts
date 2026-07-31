import type {
  FormalWriteMetadata,
  FormalWriteReceipt,
  ModelBudgetDecision,
  ModelExecutionStatus,
  ModelFailureCategory,
  ModelProviderName,
  ProviderCapabilities,
  StructuredTeachingSuggestionOutput
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

type CapabilityMetadata = FormalWriteMetadata & {
  owner: "capability";
};

export interface StoredModelExecution {
  executionRef: string;
  status: ModelExecutionStatus;
  provider: ModelProviderName;
  modelId: string;
  modelDisplayName: string;
  taskRef: string;
  taskRunRef: string;
  agentRunRef: string;
  promptBundleRef: string;
  promptBundleVersion: number;
  contextManifestRef: string;
  authorizedContextPlanRef: string;
  modelDataManifestRef: string;
  requestHash: string;
  inputSummary: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  timeoutMs: number;
  maxOutputTokens: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCost: number | null;
  latencyMs: number | null;
  providerRequestId: string | null;
  finishReason: string | null;
  safeErrorCategory: ModelFailureCategory | null;
  safeMessage: string | null;
  outputSchemaVersion: string;
  outputHash: string | null;
  validatedOutput: StructuredTeachingSuggestionOutput | null;
  proposalRevisionRef: string | null;
  retryOfExecutionRef: string | null;
  actorRef: string;
  purpose: string;
  idempotencyKey: string;
  authorizationDecisionRef: string;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancellationRequestedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
}

export class PostgresModelExecutionRepository {
  async insertQueued(
    client: PostgresClient,
    input: {
      execution: {
        executionRef: string;
        provider: ModelProviderName;
        modelId: string;
        modelDisplayName: string;
        taskRef: string;
        taskRunRef: string;
        agentRunRef: string;
        promptBundleRef: string;
        promptBundleVersion: number;
        contextManifestRef: string;
        authorizedContextPlanRef: string;
        modelDataManifestRef: string;
        requestHash: string;
        inputSummary: Record<string, unknown>;
        maxAttempts: number;
        timeoutMs: number;
        maxOutputTokens: number;
        outputSchemaVersion: string;
        retryOfExecutionRef?: string;
        metadata: CapabilityMetadata;
      };
      eventRef: string;
      eventMetadata: CapabilityMetadata;
      outboxRef: string;
      outboxMetadata: CapabilityMetadata;
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    const execution = input.execution;
    await client.query(
      `INSERT INTO capability.model_execution (
         execution_ref, provider, model_profile, prompt_bundle_ref,
         input_summary, output, usage_summary, external_network_used,
         status, model_id, model_display_name,
         task_ref, task_run_ref, agent_run_ref,
         prompt_bundle_version, context_manifest_ref,
         authorized_context_plan_ref, model_data_manifest_ref,
         request_hash, attempt_count, max_attempts,
         timeout_ms, max_output_tokens,
         output_schema_version, retry_of_execution_ref,
         queued_at, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, NULL, NULL, $6,
         'queued', $7, $8,
         $9, $10, $11,
         $12, $13, $14, $15,
         $16, 0, $17, $18, $19, $20, $21,
         $22, $22,
         $23, $24, $25, $26, $27, $28, $29
       )`,
      [
        execution.executionRef,
        execution.provider,
        execution.modelDisplayName,
        execution.promptBundleRef,
        toPostgresJson(execution.inputSummary),
        execution.provider === "volcengine-ark",
        execution.modelId,
        execution.modelDisplayName,
        execution.taskRef,
        execution.taskRunRef,
        execution.agentRunRef,
        execution.promptBundleVersion,
        execution.contextManifestRef,
        execution.authorizedContextPlanRef,
        execution.modelDataManifestRef,
        execution.requestHash,
        execution.maxAttempts,
        execution.timeoutMs,
        execution.maxOutputTokens,
        execution.outputSchemaVersion,
        execution.retryOfExecutionRef ?? null,
        execution.metadata.createdAt,
        ...formalMetadataValues(execution.metadata)
      ]
    );
    await this.insertEvent(client, {
      eventRef: input.eventRef,
      executionRef: execution.executionRef,
      fromStatus: null,
      toStatus: "queued",
      attempt: 0,
      safeDetail: {
        provider: execution.provider,
        requestHash: execution.requestHash
      },
      metadata: input.eventMetadata
    });
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: "ModelInvocationQueued",
      aggregateRef: execution.executionRef,
      payload: {
        modelExecutionRef: execution.executionRef,
        provider: execution.provider
      },
      metadata: input.outboxMetadata
    });
    return [
      createReceipt({
        writeRef: execution.executionRef,
        recordType: "ModelExecution",
        metadata: execution.metadata
      }),
      createReceipt({
        writeRef: input.eventRef,
        recordType: "ModelExecutionEvent",
        metadata: input.eventMetadata
      }),
      createReceipt({
        writeRef: input.outboxRef,
        recordType: "OutboxRecord",
        metadata: input.outboxMetadata
      })
    ];
  }

  async get(
    executor: SqlExecutor,
    executionRef: string
  ): Promise<StoredModelExecution | undefined> {
    const result = await executor.query<ModelExecutionRow>(
      `${modelExecutionSelect}
        WHERE execution_ref = $1`,
      [executionRef]
    );
    return result.rows[0]
      ? toStoredExecution(result.rows[0])
      : undefined;
  }

  async lock(
    client: PostgresClient,
    executionRef: string
  ): Promise<StoredModelExecution | undefined> {
    const result = await client.query<ModelExecutionRow>(
      `${modelExecutionSelect}
        WHERE execution_ref = $1
        FOR UPDATE`,
      [executionRef]
    );
    return result.rows[0]
      ? toStoredExecution(result.rows[0])
      : undefined;
  }

  async findSuccessfulByRequestHash(
    executor: SqlExecutor,
    requestHash: string
  ): Promise<StoredModelExecution | undefined> {
    const result = await executor.query<ModelExecutionRow>(
      `${modelExecutionSelect}
        WHERE request_hash = $1
          AND status = 'succeeded'
        ORDER BY completed_at DESC, execution_ref
        LIMIT 1`,
      [requestHash]
    );
    return result.rows[0]
      ? toStoredExecution(result.rows[0])
      : undefined;
  }

  async markRunning(
    client: PostgresClient,
    input: {
      executionRef: string;
      eventRef: string;
      attempt: number;
      metadata: CapabilityMetadata;
    }
  ): Promise<StoredModelExecution> {
    const current = await this.lock(client, input.executionRef);
    if (!current) throw new Error("ModelExecution was not found.");
    if (current.status === "cancel_requested") {
      return current;
    }
    if (
      !["queued", "running", "retryable_failed"].includes(
        current.status
      )
    ) {
      return current;
    }
    await client.query(
      `UPDATE capability.model_execution
          SET status = 'running',
              attempt_count = $2,
              started_at = COALESCE(started_at, $3),
              safe_error_category = NULL,
              safe_message = NULL,
              updated_at = $3
        WHERE execution_ref = $1`,
      [
        input.executionRef,
        input.attempt,
        input.metadata.createdAt
      ]
    );
    await this.insertEvent(client, {
      eventRef: input.eventRef,
      executionRef: input.executionRef,
      fromStatus: current.status,
      toStatus: "running",
      attempt: input.attempt,
      safeDetail: {},
      metadata: input.metadata
    });
    return {
      ...current,
      status: "running",
      attemptCount: input.attempt,
      startedAt: current.startedAt ?? input.metadata.createdAt,
      updatedAt: input.metadata.createdAt
    };
  }

  async markValidating(
    client: PostgresClient,
    input: {
      executionRef: string;
      validatedOutput: StructuredTeachingSuggestionOutput;
      outputHash: string;
      inputTokens?: number;
      outputTokens?: number;
      estimatedCost: number;
      latencyMs: number;
      providerRequestId?: string;
      finishReason?: string;
      eventRef: string;
      metadata: CapabilityMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    const current = await this.lock(client, input.executionRef);
    if (!current) throw new Error("ModelExecution was not found.");
    if (current.status === "cancel_requested") {
      throw new Error("MODEL_EXECUTION_CANCEL_REQUESTED");
    }
    if (!["running", "validating"].includes(current.status)) {
      throw new Error(
        `ModelExecution cannot validate from ${current.status}.`
      );
    }
    const totalTokens =
      input.inputTokens !== undefined ||
      input.outputTokens !== undefined
        ? (current.totalTokens ?? 0) +
          (input.inputTokens ?? 0) +
          (input.outputTokens ?? 0)
        : null;
    const inputTokens =
      input.inputTokens === undefined
        ? current.inputTokens
        : (current.inputTokens ?? 0) + input.inputTokens;
    const outputTokens =
      input.outputTokens === undefined
        ? current.outputTokens
        : (current.outputTokens ?? 0) + input.outputTokens;
    const estimatedCost =
      (current.estimatedCost ?? 0) + input.estimatedCost;
    const latencyMs =
      (current.latencyMs ?? 0) + input.latencyMs;
    await client.query(
      `UPDATE capability.model_execution
          SET status = 'validating',
              output = $2,
              usage_summary = $3,
              input_tokens = $4,
              output_tokens = $5,
              total_tokens = $6,
              estimated_cost = $7,
              latency_ms = $8,
              provider_request_id = $9,
              finish_reason = $10,
              output_hash = $11,
              updated_at = $12
        WHERE execution_ref = $1`,
      [
        input.executionRef,
        toPostgresJson(input.validatedOutput),
        toPostgresJson({
          inputTokens,
          outputTokens,
          totalTokens: totalTokens ?? current.totalTokens
        }),
        inputTokens,
        outputTokens,
        totalTokens ?? current.totalTokens,
        estimatedCost,
        latencyMs,
        input.providerRequestId ?? null,
        input.finishReason ?? null,
        input.outputHash,
        input.metadata.createdAt
      ]
    );
    await this.insertEvent(client, {
      eventRef: input.eventRef,
      executionRef: input.executionRef,
      fromStatus: current.status,
      toStatus: "validating",
      attempt: current.attemptCount,
      safeDetail: {
        outputHash: input.outputHash,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null
      },
      metadata: input.metadata
    });
    return createReceipt({
      writeRef: input.eventRef,
      recordType: "ModelExecutionEvent",
      metadata: input.metadata
    });
  }

  async markRetryableFailed(
    client: PostgresClient,
    input: {
      executionRef: string;
      category: ModelFailureCategory;
      safeMessage: string;
      providerRequestId?: string;
      inputTokens?: number;
      outputTokens?: number;
      estimatedCost?: number;
      latencyMs?: number;
      finishReason?: string;
      eventRef: string;
      metadata: CapabilityMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    const current = await this.lock(client, input.executionRef);
    if (!current) throw new Error("ModelExecution was not found.");
    const inputTokens =
      input.inputTokens === undefined
        ? current.inputTokens
        : (current.inputTokens ?? 0) + input.inputTokens;
    const outputTokens =
      input.outputTokens === undefined
        ? current.outputTokens
        : (current.outputTokens ?? 0) + input.outputTokens;
    const totalTokens =
      input.inputTokens !== undefined ||
      input.outputTokens !== undefined
        ? (current.totalTokens ?? 0) +
          (input.inputTokens ?? 0) +
          (input.outputTokens ?? 0)
        : current.totalTokens;
    await client.query(
      `UPDATE capability.model_execution
          SET status = 'retryable_failed',
              safe_error_category = $2,
              safe_message = $3,
              provider_request_id =
                COALESCE($4, provider_request_id),
              input_tokens = $5,
              output_tokens = $6,
              total_tokens = $7,
              estimated_cost = CASE
                WHEN $8::numeric IS NULL THEN estimated_cost
                ELSE COALESCE(estimated_cost, 0) + $8
              END,
              latency_ms = CASE
                WHEN $9::integer IS NULL THEN latency_ms
                ELSE COALESCE(latency_ms, 0) + $9
              END,
              finish_reason = COALESCE($10, finish_reason),
              updated_at = $11
        WHERE execution_ref = $1`,
      [
        input.executionRef,
        input.category,
        input.safeMessage,
        input.providerRequestId ?? null,
        inputTokens,
        outputTokens,
        totalTokens,
        input.estimatedCost ?? null,
        input.latencyMs ?? null,
        input.finishReason ?? null,
        input.metadata.createdAt
      ]
    );
    await this.insertEvent(client, {
      eventRef: input.eventRef,
      executionRef: input.executionRef,
      fromStatus: current.status,
      toStatus: "retryable_failed",
      attempt: current.attemptCount,
      safeDetail: {
        safeErrorCategory: input.category
      },
      metadata: input.metadata
    });
    return createReceipt({
      writeRef: input.eventRef,
      recordType: "ModelExecutionEvent",
      metadata: input.metadata
    });
  }

  async markTerminal(
    client: PostgresClient,
    input: {
      executionRef: string;
      status: Exclude<
        ModelExecutionStatus,
        "queued" | "running" | "validating" | "cancel_requested"
      >;
      safeErrorCategory?: ModelFailureCategory;
      safeMessage?: string;
      proposalRevisionRef?: string;
      providerRequestId?: string;
      inputTokens?: number;
      outputTokens?: number;
      estimatedCost?: number;
      latencyMs?: number;
      finishReason?: string;
      eventRef: string;
      metadata: CapabilityMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    const current = await this.lock(client, input.executionRef);
    if (!current) throw new Error("ModelExecution was not found.");
    if (
      current.status === "succeeded" &&
      input.status === "succeeded"
    ) {
      return createReceipt({
        writeRef: input.eventRef,
        recordType: "ModelExecutionEvent",
        metadata: input.metadata
      });
    }
    const inputTokens =
      input.inputTokens === undefined
        ? current.inputTokens
        : (current.inputTokens ?? 0) + input.inputTokens;
    const outputTokens =
      input.outputTokens === undefined
        ? current.outputTokens
        : (current.outputTokens ?? 0) + input.outputTokens;
    const totalTokens =
      input.inputTokens !== undefined ||
      input.outputTokens !== undefined
        ? (current.totalTokens ?? 0) +
          (input.inputTokens ?? 0) +
          (input.outputTokens ?? 0)
        : current.totalTokens;
    await client.query(
      `UPDATE capability.model_execution
          SET status = $2,
              safe_error_category = $3,
              safe_message = $4,
              proposal_revision_ref =
                COALESCE($5, proposal_revision_ref),
              provider_request_id =
                COALESCE($6, provider_request_id),
              input_tokens = $7,
              output_tokens = $8,
              total_tokens = $9,
              estimated_cost = CASE
                WHEN $10::numeric IS NULL THEN estimated_cost
                ELSE COALESCE(estimated_cost, 0) + $10
              END,
              latency_ms = CASE
                WHEN $11::integer IS NULL THEN latency_ms
                ELSE COALESCE(latency_ms, 0) + $11
              END,
              finish_reason = COALESCE($12, finish_reason),
              completed_at = $13,
              cancelled_at = CASE
                WHEN $2 = 'cancelled' THEN $13
                ELSE cancelled_at
              END,
              updated_at = $13
        WHERE execution_ref = $1`,
      [
        input.executionRef,
        input.status,
        input.safeErrorCategory ?? null,
        input.safeMessage ?? null,
        input.proposalRevisionRef ?? null,
        input.providerRequestId ?? null,
        inputTokens,
        outputTokens,
        totalTokens,
        input.estimatedCost ?? null,
        input.latencyMs ?? null,
        input.finishReason ?? null,
        input.metadata.createdAt
      ]
    );
    await this.insertEvent(client, {
      eventRef: input.eventRef,
      executionRef: input.executionRef,
      fromStatus: current.status,
      toStatus: input.status,
      attempt: current.attemptCount,
      safeDetail: {
        safeErrorCategory: input.safeErrorCategory ?? null,
        proposalRevisionRef:
          input.proposalRevisionRef ?? null
      },
      metadata: input.metadata
    });
    return createReceipt({
      writeRef: input.eventRef,
      recordType: "ModelExecutionEvent",
      metadata: input.metadata
    });
  }

  async requestCancellation(
    client: PostgresClient,
    input: {
      executionRef: string;
      eventRef: string;
      metadata: CapabilityMetadata;
    }
  ): Promise<{
    previousStatus: ModelExecutionStatus;
    status: ModelExecutionStatus;
    receipt: FormalWriteReceipt;
  }> {
    const current = await this.lock(client, input.executionRef);
    if (!current) throw new Error("ModelExecution was not found.");
    const status =
      current.status === "queued"
        ? ("cancelled" as const)
        : current.status === "running" ||
            current.status === "retryable_failed"
          ? ("cancel_requested" as const)
          : current.status;
    if (status !== current.status) {
      await client.query(
        `UPDATE capability.model_execution
            SET status = $2,
                cancellation_requested_at = $3,
                cancelled_at = CASE
                  WHEN $2 = 'cancelled' THEN $3
                  ELSE cancelled_at
                END,
                completed_at = CASE
                  WHEN $2 = 'cancelled' THEN $3
                  ELSE completed_at
                END,
                updated_at = $3
          WHERE execution_ref = $1`,
        [input.executionRef, status, input.metadata.createdAt]
      );
      await this.insertEvent(client, {
        eventRef: input.eventRef,
        executionRef: input.executionRef,
        fromStatus: current.status,
        toStatus: status,
        attempt: current.attemptCount,
        safeDetail: {},
        metadata: input.metadata
      });
    }
    return {
      previousStatus: current.status,
      status,
      receipt: createReceipt({
        writeRef: input.eventRef,
        recordType: "ModelExecutionEvent",
        metadata: input.metadata
      })
    };
  }

  async insertBudgetDecision(
    client: PostgresClient,
    input: {
      executionRef: string;
      decision: ModelBudgetDecision;
      metadata: CapabilityMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO capability.model_budget_decision (
         decision_ref, execution_ref, allowed, reason_code,
         estimated_input_tokens, requested_output_tokens,
         estimated_maximum_cost,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14
       )
       ON CONFLICT (decision_ref) DO NOTHING`,
      [
        input.decision.decisionRef,
        input.executionRef,
        input.decision.allowed,
        input.decision.reasonCode,
        input.decision.estimatedInputTokens,
        input.decision.requestedOutputTokens,
        input.decision.estimatedMaximumCost,
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: input.decision.decisionRef,
      recordType: "ModelBudgetDecision",
      metadata: input.metadata
    });
  }

  async usageSnapshot(
    executor: SqlExecutor,
    actorRef: string,
    now: string
  ): Promise<{
    dailyCost: number;
    teacherDailyCost: number;
    runningExecutions: number;
  }> {
    const result = await executor.query<{
      daily_cost: string;
      teacher_daily_cost: string;
      running_executions: string;
    }>(
      `SELECT
         COALESCE(sum(estimated_cost) FILTER (
           WHERE created_at >= date_trunc('day', $2::timestamptz)
         ), 0)::text AS daily_cost,
         COALESCE(sum(estimated_cost) FILTER (
           WHERE actor_ref = $1
             AND created_at >= date_trunc('day', $2::timestamptz)
         ), 0)::text AS teacher_daily_cost,
         count(*) FILTER (
           WHERE status IN ('running', 'validating')
         )::text AS running_executions
       FROM capability.model_execution`,
      [actorRef, now]
    );
    const row = result.rows[0];
    return {
      dailyCost: Number(row?.daily_cost ?? 0),
      teacherDailyCost: Number(
        row?.teacher_daily_cost ?? 0
      ),
      runningExecutions: Number(
        row?.running_executions ?? 0
      )
    };
  }

  async saveCapabilitySnapshot(
    client: PostgresClient,
    input: {
      snapshotRef: string;
      capabilities: ProviderCapabilities;
      metadata: CapabilityMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    const value = input.capabilities;
    await client.query(
      `INSERT INTO capability.provider_capability_snapshot (
         snapshot_ref, provider, model_id_hash, live,
         supports_text, supports_image_url, image_url_status,
         supports_json_object, json_object_status,
         supports_json_schema, json_schema_status,
         supports_function_calling, function_calling_status,
         supports_streaming, streaming_status,
         reports_usage, reports_request_id,
         reported_model_matches, checked_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16, $17,
         $18, $19,
         $20, $21, $22, $23, $24, $25, $26
       )`,
      [
        input.snapshotRef,
        value.provider,
        value.modelIdHash,
        value.live,
        value.supportsText,
        value.supportsImageUrl,
        value.imageUrlStatus,
        value.supportsJsonObject,
        value.jsonObjectStatus,
        value.supportsJsonSchema,
        value.jsonSchemaStatus,
        value.supportsFunctionCalling,
        value.functionCallingStatus,
        value.supportsStreaming,
        value.streamingStatus,
        value.reportsUsage,
        value.reportsRequestId,
        value.reportedModelMatches,
        value.checkedAt,
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: input.snapshotRef,
      recordType: "ProviderCapabilitySnapshot",
      metadata: input.metadata
    });
  }

  async latestCapabilitySnapshot(
    executor: SqlExecutor
  ): Promise<ProviderCapabilities | undefined> {
    const result = await executor.query<{
      provider: "volcengine-ark";
      model_id_hash: string;
      live: boolean;
      supports_text: boolean;
      supports_image_url: boolean;
      image_url_status: ProviderCapabilities["imageUrlStatus"];
      supports_json_object: boolean;
      json_object_status: ProviderCapabilities["jsonObjectStatus"];
      supports_json_schema: boolean;
      json_schema_status: ProviderCapabilities["jsonSchemaStatus"];
      supports_function_calling: boolean;
      function_calling_status: ProviderCapabilities["functionCallingStatus"];
      supports_streaming: boolean;
      streaming_status: ProviderCapabilities["streamingStatus"];
      reports_usage: boolean;
      reports_request_id: boolean;
      reported_model_matches: boolean;
      checked_at: Date;
    }>(
      `SELECT provider, model_id_hash, live, supports_text,
              supports_image_url, image_url_status,
              supports_json_object, json_object_status,
              supports_json_schema, json_schema_status,
              supports_function_calling, function_calling_status,
              supports_streaming, streaming_status, reports_usage,
              reports_request_id, reported_model_matches,
              checked_at
         FROM capability.provider_capability_snapshot
        WHERE provider = 'volcengine-ark'
        ORDER BY checked_at DESC, snapshot_ref DESC
        LIMIT 1`
    );
    const row = result.rows[0];
    return row
      ? {
          provider: row.provider,
          modelIdHash: row.model_id_hash,
          live: row.live,
          supportsText: row.supports_text,
          supportsImageUrl: row.supports_image_url,
          imageUrlStatus: row.image_url_status,
          supportsJsonObject: row.supports_json_object,
          jsonObjectStatus: row.json_object_status,
          supportsJsonSchema: row.supports_json_schema,
          jsonSchemaStatus: row.json_schema_status,
          supportsFunctionCalling:
            row.supports_function_calling,
          functionCallingStatus:
            row.function_calling_status,
          supportsStreaming: row.supports_streaming,
          streamingStatus: row.streaming_status,
          reportsUsage: row.reports_usage,
          reportsRequestId: row.reports_request_id,
          reportedModelMatches: row.reported_model_matches,
          checkedAt: row.checked_at.toISOString()
        }
      : undefined;
  }

  async usageSummary(
    executor: SqlExecutor,
    provider: ModelProviderName,
    periodStart: string,
    periodEnd: string
  ): Promise<{
    executionCount: number;
    succeededCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  }> {
    const result = await executor.query<{
      execution_count: string;
      succeeded_count: string;
      input_tokens: string;
      output_tokens: string;
      total_tokens: string;
      estimated_cost: string;
    }>(
      `SELECT count(*)::text AS execution_count,
              count(*) FILTER (
                WHERE status = 'succeeded'
              )::text AS succeeded_count,
              COALESCE(sum(input_tokens), 0)::text AS input_tokens,
              COALESCE(sum(output_tokens), 0)::text AS output_tokens,
              COALESCE(sum(total_tokens), 0)::text AS total_tokens,
              COALESCE(sum(estimated_cost), 0)::text AS estimated_cost
         FROM capability.model_execution
        WHERE provider = $1
          AND created_at >= $2
          AND created_at < $3`,
      [provider, periodStart, periodEnd]
    );
    const row = result.rows[0];
    return {
      executionCount: Number(row?.execution_count ?? 0),
      succeededCount: Number(row?.succeeded_count ?? 0),
      inputTokens: Number(row?.input_tokens ?? 0),
      outputTokens: Number(row?.output_tokens ?? 0),
      totalTokens: Number(row?.total_tokens ?? 0),
      estimatedCost: Number(row?.estimated_cost ?? 0)
    };
  }

  private async insertEvent(
    client: PostgresClient,
    input: {
      eventRef: string;
      executionRef: string;
      fromStatus: ModelExecutionStatus | null;
      toStatus: ModelExecutionStatus;
      attempt: number;
      safeDetail: Record<string, unknown>;
      metadata: CapabilityMetadata;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO capability.model_execution_event (
         event_ref, execution_ref, from_status, to_status,
         attempt, safe_detail,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13
       )
       ON CONFLICT (event_ref) DO NOTHING`,
      [
        input.eventRef,
        input.executionRef,
        input.fromStatus,
        input.toStatus,
        input.attempt,
        toPostgresJson(input.safeDetail),
        ...formalMetadataValues(input.metadata)
      ]
    );
  }

  private async insertOutbox(
    client: PostgresClient,
    input: {
      outboxRef: string;
      eventName: string;
      aggregateRef: string;
      payload: Record<string, unknown>;
      metadata: CapabilityMetadata;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO capability.outbox_record (
         outbox_ref, event_name, aggregate_ref, payload,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8, $9, $10, $11
       )`,
      [
        input.outboxRef,
        input.eventName,
        input.aggregateRef,
        toPostgresJson(input.payload),
        ...formalMetadataValues(input.metadata)
      ]
    );
  }
}

const modelExecutionSelect = `
  SELECT execution_ref, status, provider, model_id,
         model_display_name, task_ref, task_run_ref, agent_run_ref,
         prompt_bundle_ref, prompt_bundle_version,
         context_manifest_ref, authorized_context_plan_ref,
         model_data_manifest_ref, request_hash, input_summary,
         attempt_count, max_attempts, timeout_ms, max_output_tokens,
         input_tokens, output_tokens, total_tokens,
         estimated_cost, latency_ms, provider_request_id,
         finish_reason, safe_error_category, safe_message,
         output_schema_version, output_hash, output,
         proposal_revision_ref, retry_of_execution_ref,
         actor_ref, purpose, idempotency_key,
         authorization_decision_ref,
         queued_at, started_at, completed_at,
         cancellation_requested_at, cancelled_at, updated_at
    FROM capability.model_execution`;

interface ModelExecutionRow {
  execution_ref: string;
  status: ModelExecutionStatus;
  provider: ModelProviderName;
  model_id: string;
  model_display_name: string;
  task_ref: string | null;
  task_run_ref: string | null;
  agent_run_ref: string | null;
  prompt_bundle_ref: string;
  prompt_bundle_version: number;
  context_manifest_ref: string | null;
  authorized_context_plan_ref: string | null;
  model_data_manifest_ref: string | null;
  request_hash: string;
  input_summary: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  timeout_ms: number | null;
  max_output_tokens: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost: string | null;
  latency_ms: number | null;
  provider_request_id: string | null;
  finish_reason: string | null;
  safe_error_category: ModelFailureCategory | null;
  safe_message: string | null;
  output_schema_version: string;
  output_hash: string | null;
  output: unknown;
  proposal_revision_ref: string | null;
  retry_of_execution_ref: string | null;
  actor_ref: string;
  purpose: string;
  idempotency_key: string;
  authorization_decision_ref: string;
  queued_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  cancellation_requested_at: Date | null;
  cancelled_at: Date | null;
  updated_at: Date;
}

function toStoredExecution(
  row: ModelExecutionRow
): StoredModelExecution {
  if (
    !row.task_ref ||
    !row.task_run_ref ||
    !row.agent_run_ref ||
    !row.context_manifest_ref ||
    !row.authorized_context_plan_ref ||
    !row.model_data_manifest_ref ||
    row.timeout_ms === null ||
    row.max_output_tokens === null
  ) {
    throw new Error(
      "Legacy ModelExecution cannot be used as a Gate 2.6A invocation."
    );
  }
  const validated =
    row.output && typeof row.output === "object"
      ? (row.output as StructuredTeachingSuggestionOutput)
      : null;
  return {
    executionRef: row.execution_ref,
    status: row.status,
    provider: row.provider,
    modelId: row.model_id,
    modelDisplayName: row.model_display_name,
    taskRef: row.task_ref,
    taskRunRef: row.task_run_ref,
    agentRunRef: row.agent_run_ref,
    promptBundleRef: row.prompt_bundle_ref,
    promptBundleVersion: row.prompt_bundle_version,
    contextManifestRef: row.context_manifest_ref,
    authorizedContextPlanRef:
      row.authorized_context_plan_ref,
    modelDataManifestRef: row.model_data_manifest_ref,
    requestHash: row.request_hash,
    inputSummary: row.input_summary,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    timeoutMs: row.timeout_ms,
    maxOutputTokens: row.max_output_tokens,
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
    safeMessage: row.safe_message,
    outputSchemaVersion: row.output_schema_version,
    outputHash: row.output_hash,
    validatedOutput: validated,
    proposalRevisionRef: row.proposal_revision_ref,
    retryOfExecutionRef: row.retry_of_execution_ref,
    actorRef: row.actor_ref,
    purpose: row.purpose,
    idempotencyKey: row.idempotency_key,
    authorizationDecisionRef:
      row.authorization_decision_ref,
    queuedAt: row.queued_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    cancellationRequestedAt:
      row.cancellation_requested_at?.toISOString() ?? null,
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString()
  };
}

import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp
} from "drizzle-orm/pg-core";

import { formalWriteColumns } from "../../../platform/database/formal-columns.js";

export const capabilitySchema = pgSchema("capability");

export const toolExecutionTable = capabilitySchema.table(
  "tool_execution",
  {
    executionRef: text("execution_ref").primaryKey(),
    capabilityRef: text("capability_ref").notNull(),
    toolName: text("tool_name").notNull(),
    input: jsonb("input").notNull(),
    output: jsonb("output").notNull(),
    ...formalWriteColumns()
  }
);

export const capabilityOutboxTable = capabilitySchema.table(
  "outbox_record",
  {
    outboxRef: text("outbox_ref").primaryKey(),
    eventName: text("event_name").notNull(),
    aggregateRef: text("aggregate_ref").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
      mode: "string"
    }),
    attemptCount: integer("attempt_count").notNull(),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "string"
    }),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "string"
    }),
    ...formalWriteColumns()
  }
);

export const modelExecutionTable = capabilitySchema.table(
  "model_execution",
  {
    executionRef: text("execution_ref").primaryKey(),
    provider: text("provider").notNull(),
    modelProfile: text("model_profile").notNull(),
    promptBundleRef: text("prompt_bundle_ref").notNull(),
    inputSummary: jsonb("input_summary").notNull(),
    output: jsonb("output"),
    usageSummary: jsonb("usage_summary"),
    externalNetworkUsed: boolean(
      "external_network_used"
    ).notNull(),
    status: text("status").notNull(),
    modelId: text("model_id").notNull(),
    modelDisplayName: text("model_display_name").notNull(),
    taskRef: text("task_ref"),
    taskRunRef: text("task_run_ref"),
    agentRunRef: text("agent_run_ref"),
    promptBundleVersion: integer(
      "prompt_bundle_version"
    ).notNull(),
    contextManifestRef: text("context_manifest_ref"),
    authorizedContextPlanRef: text(
      "authorized_context_plan_ref"
    ),
    modelDataManifestRef: text("model_data_manifest_ref"),
    requestHash: text("request_hash").notNull(),
    attemptCount: integer("attempt_count").notNull(),
    maxAttempts: integer("max_attempts").notNull(),
    timeoutMs: integer("timeout_ms"),
    maxOutputTokens: integer("max_output_tokens"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    estimatedCost: numeric("estimated_cost", {
      precision: 18,
      scale: 8
    }),
    latencyMs: integer("latency_ms"),
    providerRequestId: text("provider_request_id"),
    finishReason: text("finish_reason"),
    safeErrorCategory: text("safe_error_category"),
    safeMessage: text("safe_message"),
    outputSchemaVersion: text(
      "output_schema_version"
    ).notNull(),
    outputHash: text("output_hash"),
    proposalRevisionRef: text("proposal_revision_ref"),
    retryOfExecutionRef: text("retry_of_execution_ref"),
    queuedAt: timestamp("queued_at", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "string"
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string"
    }),
    cancellationRequestedAt: timestamp(
      "cancellation_requested_at",
      { withTimezone: true, mode: "string" }
    ),
    cancelledAt: timestamp("cancelled_at", {
      withTimezone: true,
      mode: "string"
    }),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    ...formalWriteColumns()
  }
);

export const modelExecutionEventTable =
  capabilitySchema.table("model_execution_event", {
    eventRef: text("event_ref").primaryKey(),
    executionRef: text("execution_ref").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    attempt: integer("attempt").notNull(),
    safeDetail: jsonb("safe_detail").notNull(),
    ...formalWriteColumns()
  });

export const modelBudgetDecisionTable =
  capabilitySchema.table("model_budget_decision", {
    decisionRef: text("decision_ref").primaryKey(),
    executionRef: text("execution_ref").notNull(),
    allowed: boolean("allowed").notNull(),
    reasonCode: text("reason_code").notNull(),
    estimatedInputTokens: integer(
      "estimated_input_tokens"
    ).notNull(),
    requestedOutputTokens: integer(
      "requested_output_tokens"
    ).notNull(),
    estimatedMaximumCost: numeric(
      "estimated_maximum_cost",
      { precision: 18, scale: 8 }
    ).notNull(),
    ...formalWriteColumns()
  });

export const providerCapabilitySnapshotTable =
  capabilitySchema.table("provider_capability_snapshot", {
    snapshotRef: text("snapshot_ref").primaryKey(),
    provider: text("provider").notNull(),
    modelIdHash: text("model_id_hash").notNull(),
    live: boolean("live").notNull(),
    supportsText: boolean("supports_text").notNull(),
    supportsImageUrl: boolean(
      "supports_image_url"
    ).notNull(),
    imageUrlStatus: text("image_url_status").notNull(),
    supportsJsonObject: boolean(
      "supports_json_object"
    ).notNull(),
    jsonObjectStatus: text("json_object_status").notNull(),
    supportsJsonSchema: boolean(
      "supports_json_schema"
    ).notNull(),
    jsonSchemaStatus: text("json_schema_status").notNull(),
    supportsFunctionCalling: boolean(
      "supports_function_calling"
    ).notNull(),
    functionCallingStatus: text(
      "function_calling_status"
    ).notNull(),
    supportsStreaming: boolean(
      "supports_streaming"
    ).notNull(),
    streamingStatus: text("streaming_status").notNull(),
    reportsUsage: boolean("reports_usage").notNull(),
    reportsRequestId: boolean(
      "reports_request_id"
    ).notNull(),
    reportedModelMatches: boolean(
      "reported_model_matches"
    ).notNull(),
    checkedAt: timestamp("checked_at", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    ...formalWriteColumns()
  });

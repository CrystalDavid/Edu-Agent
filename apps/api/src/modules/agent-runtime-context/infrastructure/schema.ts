import {
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp
} from "drizzle-orm/pg-core";

import { formalWriteColumns } from "../../../platform/database/formal-columns.js";

export const runtimeSchema = pgSchema("runtime");

export const agentRunTable = runtimeSchema.table("agent_run", {
  agentRunRef: text("agent_run_ref").primaryKey(),
  runKind: text("run_kind").notNull(),
  boundRunRef: text("bound_run_ref").notNull(),
  status: text("status").notNull(),
  modelProvider: text("model_provider").notNull(),
  modelProfile: text("model_profile").notNull(),
  toolName: text("tool_name").notNull(),
  output: jsonb("output").notNull(),
  ...formalWriteColumns()
});

export const runtimeOutboxTable = runtimeSchema.table(
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

export const runManifestTable = runtimeSchema.table("run_manifest", {
  manifestRef: text("manifest_ref").primaryKey(),
  agentRunRef: text("agent_run_ref").notNull().unique(),
  contractRef: text("contract_ref"),
  promptVersionRef: text("prompt_version_ref").notNull(),
  policyVersionRef: text("policy_version_ref").notNull(),
  capabilityRefs: jsonb("capability_refs").notNull(),
  contextRefs: jsonb("context_refs").notNull(),
  contentHash: text("content_hash").notNull(),
  ...formalWriteColumns()
});

import {
  boolean,
  integer,
  jsonb,
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
    output: jsonb("output").notNull(),
    usageSummary: jsonb("usage_summary").notNull(),
    externalNetworkUsed: boolean(
      "external_network_used"
    ).notNull(),
    ...formalWriteColumns()
  }
);

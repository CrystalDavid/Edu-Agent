import { jsonb, pgSchema, text } from "drizzle-orm/pg-core";

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
    ...formalWriteColumns()
  }
);

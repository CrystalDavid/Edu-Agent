import { jsonb, pgSchema, text } from "drizzle-orm/pg-core";

import { formalWriteColumns } from "../../../platform/database/formal-columns.js";

export const capabilitySchema = pgSchema("capability");

export const toolExecutionTable = capabilitySchema.table(
  "tool_execution",
  {
    executionRef: text("execution_ref").primaryKey(),
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
    ...formalWriteColumns()
  }
);

import {
  integer,
  jsonb,
  pgSchema,
  text
} from "drizzle-orm/pg-core";

import { formalWriteColumns } from "../../../platform/database/formal-columns.js";

export const workSchema = pgSchema("work");

export const taskTable = workSchema.table("task", {
  taskRef: text("task_ref").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  ...formalWriteColumns()
});

export const taskRunTable = workSchema.table("task_run", {
  taskRunRef: text("task_run_ref").primaryKey(),
  taskRef: text("task_ref").notNull(),
  attempt: integer("attempt").notNull(),
  status: text("status").notNull(),
  ...formalWriteColumns()
});

export const queryRunTable = workSchema.table("query_run", {
  queryRunRef: text("query_run_ref").primaryKey(),
  queryName: text("query_name").notNull(),
  status: text("status").notNull(),
  resourceRef: text("resource_ref").notNull(),
  requestedFieldMask: jsonb("requested_field_mask").notNull(),
  ...formalWriteColumns()
});

export const idempotencyRecordTable = workSchema.table(
  "idempotency_record",
  {
    idempotencyRef: text("idempotency_ref").primaryKey(),
    rootKey: text("root_key").notNull().unique(),
    requestFingerprint: text("request_fingerprint").notNull(),
    result: jsonb("result").notNull(),
    ...formalWriteColumns()
  }
);

export const workOutboxTable = workSchema.table("outbox_record", {
  outboxRef: text("outbox_ref").primaryKey(),
  eventName: text("event_name").notNull(),
  aggregateRef: text("aggregate_ref").notNull(),
  payload: jsonb("payload").notNull(),
  ...formalWriteColumns()
});

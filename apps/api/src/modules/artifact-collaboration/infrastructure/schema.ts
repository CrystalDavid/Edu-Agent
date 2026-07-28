import {
  integer,
  jsonb,
  pgSchema,
  text
} from "drizzle-orm/pg-core";

import { formalWriteColumns } from "../../../platform/database/formal-columns.js";

export const artifactSchema = pgSchema("artifact");

export const artifactRevisionTable = artifactSchema.table(
  "artifact_revision",
  {
    revisionRef: text("revision_ref").primaryKey(),
    artifactRef: text("artifact_ref").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    artifactType: text("artifact_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    sourceAgentRunRef: text("source_agent_run_ref").notNull(),
    ...formalWriteColumns()
  }
);

export const artifactOutboxTable = artifactSchema.table(
  "outbox_record",
  {
    outboxRef: text("outbox_ref").primaryKey(),
    eventName: text("event_name").notNull(),
    aggregateRef: text("aggregate_ref").notNull(),
    payload: jsonb("payload").notNull(),
    ...formalWriteColumns()
  }
);

import {
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp
} from "drizzle-orm/pg-core";

import { formalWriteColumns } from "../../../platform/database/formal-columns.js";

export const artifactSchema = pgSchema("artifact");

export const artifactTable = artifactSchema.table("artifact", {
  artifactRef: text("artifact_ref").primaryKey(),
  artifactType: text("artifact_type").notNull(),
  latestPublishedRevisionRef: text(
    "latest_published_revision_ref"
  ),
  latestRevisionRef: text("latest_revision_ref"),
  ...formalWriteColumns()
});

export const artifactRevisionTable = artifactSchema.table(
  "artifact_revision",
  {
    revisionRef: text("revision_ref").primaryKey(),
    artifactRef: text("artifact_ref").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    artifactType: text("artifact_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    sourceAgentRunRef: text("source_agent_run_ref"),
    parentRevisionRef: text("parent_revision_ref"),
    revisionState: text("revision_state").notNull(),
    contentHash: text("content_hash").notNull(),
    structuredContent: jsonb("structured_content"),
    changeReason: text("change_reason"),
    evidenceRefs: jsonb("evidence_refs").notNull(),
    teacherSelection: jsonb("teacher_selection").notNull(),
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

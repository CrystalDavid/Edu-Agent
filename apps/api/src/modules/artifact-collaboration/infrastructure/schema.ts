import {
  bigint,
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
  currentApprovedRevisionRef: text(
    "current_approved_revision_ref"
  ),
  currentInReviewRevisionRef: text(
    "current_in_review_revision_ref"
  ),
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

export const teachingPlanScopeLifecycleTable =
  artifactSchema.table("teaching_plan_scope_lifecycle", {
    scopeRef: text("scope_ref").primaryKey(),
    artifactRef: text("artifact_ref").notNull(),
    revisionRef: text("revision_ref").notNull().unique(),
    lessonRef: text("lesson_ref").notNull(),
    preparationTaskRef: text("preparation_task_ref"),
    lifecycleStatus: text("lifecycle_status").notNull(),
    supersededByRevisionRef: text(
      "superseded_by_revision_ref"
    ),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    ...formalWriteColumns()
  });

export const teachingPlanScopeEventTable =
  artifactSchema.table("teaching_plan_scope_event", {
    eventRef: text("event_ref").primaryKey(),
    artifactRef: text("artifact_ref").notNull(),
    revisionRef: text("revision_ref").notNull(),
    lessonRef: text("lesson_ref").notNull(),
    preparationTaskRef: text("preparation_task_ref"),
    eventName: text("event_name").notNull(),
    eventPayload: jsonb("event_payload").notNull(),
    ...formalWriteColumns()
  });

export const fileAssetTable = artifactSchema.table("file_asset", {
  assetRef: text("asset_ref").primaryKey(),
  tenantRef: text("tenant_ref").notNull(),
  displayName: text("display_name").notNull(),
  category: text("category").notNull(),
  source: text("source").notNull(),
  lifecycleStatus: text("lifecycle_status").notNull(),
  currentVersionRef: text("current_version_ref"),
  version: integer("version").notNull(),
  createdBy: text("created_by").notNull(),
  deletedAt: timestamp("deleted_at", {
    withTimezone: true,
    mode: "string"
  }),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "string"
  }).notNull(),
  ...formalWriteColumns()
});

export const fileVersionTable = artifactSchema.table("file_version", {
  versionRef: text("version_ref").primaryKey(),
  assetRef: text("asset_ref").notNull(),
  versionNumber: integer("version_number").notNull(),
  originalFileName: text("original_file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  extension: text("extension").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  objectKey: text("object_key").notNull(),
  contentSummary: text("content_summary"),
  createdBy: text("created_by").notNull(),
  ...formalWriteColumns()
});

export const artifactFileBindingTable = artifactSchema.table(
  "artifact_file_binding",
  {
    bindingRef: text("binding_ref").primaryKey(),
    assetRef: text("asset_ref").notNull(),
    versionRef: text("version_ref").notNull(),
    targetType: text("target_type").notNull(),
    targetRef: text("target_ref").notNull(),
    relationKind: text("relation_kind").notNull(),
    ...formalWriteColumns()
  }
);

export const fileOperationIdempotencyTable = artifactSchema.table(
  "file_operation_idempotency",
  {
    idempotencyRef: text("idempotency_ref").primaryKey(),
    rootKey: text("root_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    status: text("status").notNull(),
    result: jsonb("result"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string"
    }),
    ...formalWriteColumns()
  }
);

export const teachingPlanFileExportTable = artifactSchema.table(
  "teaching_plan_file_export",
  {
    exportRef: text("export_ref").primaryKey(),
    tenantRef: text("tenant_ref").notNull(),
    teachingPlanArtifactRef: text(
      "teaching_plan_artifact_ref"
    ).notNull(),
    teachingPlanRevisionRef: text(
      "teaching_plan_revision_ref"
    ).notNull(),
    lessonRef: text("lesson_ref").notNull(),
    preparationTaskRef: text("preparation_task_ref"),
    assetRef: text("asset_ref").notNull(),
    versionRef: text("version_ref").notNull(),
    exportFormat: text("export_format").notNull(),
    templateVersion: text("template_version").notNull(),
    contentHash: text("content_hash").notNull(),
    ...formalWriteColumns()
  }
);

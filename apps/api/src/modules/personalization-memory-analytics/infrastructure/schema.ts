import {
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp
} from "drizzle-orm/pg-core";

export const personalizationSchema = pgSchema("personalization");

const personalizationWriteColumns = {
  actorRef: text("actor_ref").notNull(),
  purpose: text("purpose").notNull(),
  ownerModule: text("owner_module").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  authorizationDecisionRef: text("authorization_decision_ref").notNull(),
  auditRef: text("audit_ref").notNull()
};

const lifecycleTimestamps = {
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "string"
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "string"
  }).notNull()
};

export const memoryCandidateTable = personalizationSchema.table(
  "memory_candidate",
  {
    candidateRef: text("candidate_ref").primaryKey(),
    tenantRef: text("tenant_ref").notNull(),
    teacherRef: text("teacher_ref").notNull(),
    candidateType: text("candidate_type").notNull(),
    content: jsonb("content").notNull(),
    sources: jsonb("sources").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    proposedBy: text("proposed_by").notNull(),
    createdByRef: text("created_by_ref").notNull(),
    candidateStatus: text("candidate_status").notNull(),
    currentVersion: integer("current_version").notNull(),
    contentHash: text("content_hash").notNull(),
    ...lifecycleTimestamps,
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    confirmedAt: timestamp("confirmed_at", {
      withTimezone: true,
      mode: "string"
    }),
    rejectedAt: timestamp("rejected_at", {
      withTimezone: true,
      mode: "string"
    }),
    expiredAt: timestamp("expired_at", {
      withTimezone: true,
      mode: "string"
    }),
    ...personalizationWriteColumns
  }
);

export const memoryCandidateRevisionTable = personalizationSchema.table(
  "memory_candidate_revision",
  {
    candidateRef: text("candidate_ref").notNull(),
    version: integer("version").notNull(),
    tenantRef: text("tenant_ref").notNull(),
    teacherRef: text("teacher_ref").notNull(),
    candidateType: text("candidate_type").notNull(),
    content: jsonb("content").notNull(),
    sources: jsonb("sources").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    proposedBy: text("proposed_by").notNull(),
    createdByRef: text("created_by_ref").notNull(),
    candidateStatus: text("candidate_status").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    confirmedAt: timestamp("confirmed_at", {
      withTimezone: true,
      mode: "string"
    }),
    rejectedAt: timestamp("rejected_at", {
      withTimezone: true,
      mode: "string"
    }),
    expiredAt: timestamp("expired_at", {
      withTimezone: true,
      mode: "string"
    }),
    ...personalizationWriteColumns,
    revisionCreatedAt: timestamp("revision_created_at", {
      withTimezone: true,
      mode: "string"
    }).notNull()
  },
  (table) => [primaryKey({ columns: [table.candidateRef, table.version] })]
);

export const teacherPreferenceTable = personalizationSchema.table(
  "teacher_preference",
  {
    preferenceRef: text("preference_ref").primaryKey(),
    tenantRef: text("tenant_ref").notNull(),
    teacherRef: text("teacher_ref").notNull(),
    preferenceKey: text("preference_key").notNull(),
    preferenceValue: text("preference_value").notNull(),
    sourceCandidateRef: text("source_candidate_ref").notNull(),
    sourceCandidateHash: text("source_candidate_hash").notNull(),
    preferenceStatus: text("preference_status").notNull(),
    currentVersion: integer("current_version").notNull(),
    contentHash: text("content_hash").notNull(),
    confirmedByRef: text("confirmed_by_ref").notNull(),
    confirmedAt: timestamp("confirmed_at", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    ...lifecycleTimestamps,
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      mode: "string"
    }),
    ...personalizationWriteColumns
  }
);

export const teacherPreferenceRevisionTable = personalizationSchema.table(
  "teacher_preference_revision",
  {
    preferenceRef: text("preference_ref").notNull(),
    version: integer("version").notNull(),
    tenantRef: text("tenant_ref").notNull(),
    teacherRef: text("teacher_ref").notNull(),
    preferenceKey: text("preference_key").notNull(),
    preferenceValue: text("preference_value").notNull(),
    sourceCandidateRef: text("source_candidate_ref").notNull(),
    sourceCandidateHash: text("source_candidate_hash").notNull(),
    preferenceStatus: text("preference_status").notNull(),
    contentHash: text("content_hash").notNull(),
    confirmedByRef: text("confirmed_by_ref").notNull(),
    confirmedAt: timestamp("confirmed_at", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    ...lifecycleTimestamps,
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      mode: "string"
    }),
    ...personalizationWriteColumns,
    revisionCreatedAt: timestamp("revision_created_at", {
      withTimezone: true,
      mode: "string"
    }).notNull()
  },
  (table) => [primaryKey({ columns: [table.preferenceRef, table.version] })]
);

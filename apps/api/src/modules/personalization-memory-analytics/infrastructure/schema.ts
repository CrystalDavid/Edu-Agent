import {
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex
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

export const memoryApplicationTable = personalizationSchema.table(
  "memory_application",
  {
    applicationRef: text("application_ref").primaryKey(),
    tenantRef: text("tenant_ref").notNull(),
    teacherRef: text("teacher_ref").notNull(),
    conversationRef: text("conversation_ref").notNull(),
    turnRef: text("turn_ref").notNull(),
    taskRef: text("task_ref").notNull(),
    agentRunRef: text("agent_run_ref").notNull(),
    modelExecutionRef: text("model_execution_ref"),
    skillRef: text("skill_ref").notNull(),
    useCase: text("use_case").notNull(),
    scopeHash: text("scope_hash").notNull(),
    preferenceRef: text("preference_ref").notNull(),
    preferenceVersion: integer("preference_version").notNull(),
    preferenceContentHash: text("preference_content_hash").notNull(),
    packRef: text("pack_ref").notNull(),
    packContentHash: text("pack_content_hash").notNull(),
    decision: text("decision").notNull(),
    reasonCode: text("reason_code").notNull(),
    targetFields: jsonb("target_fields")
      .$type<readonly string[]>()
      .notNull(),
    estimatedTokens: integer("estimated_tokens").notNull(),
    policyVersion: text("policy_version").notNull(),
    retentionPolicyVersion: text("retention_policy_version").notNull(),
    retentionUntil: timestamp("retention_until", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actorRef: text("actor_ref").notNull(),
    purpose: text("purpose").notNull(),
    ownerModule: text("owner_module").notNull(),
    authorizationDecisionRef: text("authorization_decision_ref").notNull(),
    auditRef: text("audit_ref").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string"
    }).notNull()
  },
  (table) => [
    uniqueIndex("memory_application_idempotency_key_unique")
      .on(table.idempotencyKey),
    uniqueIndex("memory_application_run_preference_decision_unique")
      .on(
        table.agentRunRef,
        table.preferenceRef,
        table.preferenceVersion,
        table.decision
      ),
    foreignKey({
      columns: [table.preferenceRef, table.preferenceVersion],
      foreignColumns: [
        teacherPreferenceRevisionTable.preferenceRef,
        teacherPreferenceRevisionTable.version
      ],
      name: "memory_application_preference_revision_fk"
    }),
    index("memory_application_owner_run_idx")
      .on(table.tenantRef, table.teacherRef, table.agentRunRef, table.createdAt),
    index("memory_application_owner_preference_idx")
      .on(
        table.tenantRef,
        table.teacherRef,
        table.preferenceRef,
        table.preferenceVersion,
        table.createdAt
      ),
    index("memory_application_owner_decision_idx")
      .on(table.tenantRef, table.teacherRef, table.decision, table.createdAt),
    index("memory_application_pack_idx")
      .on(table.tenantRef, table.teacherRef, table.packRef, table.createdAt),
    index("memory_application_retention_idx").on(table.retentionUntil)
  ]
);

export const memoryApplicationOutcomeTable = personalizationSchema.table(
  "memory_application_outcome",
  {
    outcomeRef: text("outcome_ref").primaryKey(),
    applicationRef: text("application_ref")
      .notNull()
      .references(() => memoryApplicationTable.applicationRef),
    tenantRef: text("tenant_ref").notNull(),
    teacherRef: text("teacher_ref").notNull(),
    sourceEventRef: text("source_event_ref").notNull(),
    agentRunRef: text("agent_run_ref").notNull(),
    outcomeStatus: text("outcome_status").notNull(),
    resultingRevisionRef: text("resulting_revision_ref"),
    policyVersion: text("policy_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actorRef: text("actor_ref").notNull(),
    purpose: text("purpose").notNull(),
    ownerModule: text("owner_module").notNull(),
    authorizationDecisionRef: text("authorization_decision_ref").notNull(),
    auditRef: text("audit_ref").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string"
    }).notNull()
  },
  (table) => [
    uniqueIndex("memory_application_outcome_idempotency_key_unique")
      .on(table.idempotencyKey),
    uniqueIndex("memory_application_outcome_source_application_unique")
      .on(table.sourceEventRef, table.applicationRef),
    index("memory_application_outcome_owner_run_idx")
      .on(table.tenantRef, table.teacherRef, table.agentRunRef, table.createdAt),
    index("memory_application_outcome_application_idx")
      .on(table.applicationRef, table.createdAt),
    index("memory_application_outcome_owner_status_idx")
      .on(
        table.tenantRef,
        table.teacherRef,
        table.outcomeStatus,
        table.createdAt
      )
  ]
);

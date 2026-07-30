import {
  boolean,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp
} from "drizzle-orm/pg-core";

import { formalWriteColumns } from "../../../platform/database/formal-columns.js";

export const workSchema = pgSchema("work");

export const taskTable = workSchema.table("task", {
  taskRef: text("task_ref").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  taskKind: text("task_kind").notNull(),
  caseRef: text("case_ref"),
  goalRef: text("goal_ref"),
  requestPayload: jsonb("request_payload").notNull(),
  requestVersion: integer("request_version").notNull(),
  version: integer("version").notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "string"
  }).notNull(),
  ...formalWriteColumns()
});

export const taskRunTable = workSchema.table("task_run", {
  taskRunRef: text("task_run_ref").primaryKey(),
  taskRef: text("task_ref").notNull(),
  attempt: integer("attempt").notNull(),
  status: text("status").notNull(),
  requestPayload: jsonb("request_payload").notNull(),
  requestVersion: integer("request_version").notNull(),
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
});

export const resolvedLearningInteractionContractTable =
  workSchema.table("resolved_learning_interaction_contract", {
    contractRef: text("contract_ref").primaryKey(),
    boundRunKind: text("bound_run_kind").notNull(),
    boundRunRef: text("bound_run_ref").notNull(),
    profileRef: text("profile_ref").notNull(),
    profileVersion: integer("profile_version").notNull(),
    policyVersionRef: text("policy_version_ref").notNull(),
    promptVersionRef: text("prompt_version_ref").notNull(),
    evidenceRuleVersionRef: text(
      "evidence_rule_version_ref"
    ).notNull(),
    participationMode: text("participation_mode").notNull(),
    supportLimit: integer("support_limit").notNull(),
    answerReleaseBoundary: text(
      "answer_release_boundary"
    ).notNull(),
    contractPayload: jsonb("contract_payload").notNull(),
    contentHash: text("content_hash").notNull(),
    ...formalWriteColumns()
  });

export const outboxConsumerEffectTable = workSchema.table(
  "outbox_consumer_effect",
  {
    consumerName: text("consumer_name").notNull(),
    outboxRef: text("outbox_ref").notNull(),
    effectKey: text("effect_key").notNull(),
    effectPayload: jsonb("effect_payload").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string"
    }).notNull()
  }
);

export const caseRecordTable = workSchema.table("case_record", {
  caseRef: text("case_ref").primaryKey(),
  tenantRef: text("tenant_ref").notNull(),
  caseType: text("case_type").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  ...formalWriteColumns()
});

export const goalRecordTable = workSchema.table("goal_record", {
  goalRef: text("goal_ref").primaryKey(),
  tenantRef: text("tenant_ref").notNull(),
  caseRef: text("case_ref"),
  title: text("title").notNull(),
  status: text("status").notNull(),
  successCriteria: jsonb("success_criteria").notNull(),
  ...formalWriteColumns()
});

export const taskResultTable = workSchema.table("task_result", {
  taskResultRef: text("task_result_ref").primaryKey(),
  taskRef: text("task_ref").notNull(),
  taskRunRef: text("task_run_ref").notNull(),
  goalRef: text("goal_ref"),
  proposalArtifactRef: text("proposal_artifact_ref").notNull(),
  proposalRevisionRef: text("proposal_revision_ref").notNull(),
  teachingPlanArtifactRef: text(
    "teaching_plan_artifact_ref"
  ).notNull(),
  draftRevisionRef: text("draft_revision_ref").notNull(),
  ...formalWriteColumns()
});

export const lessonPreparationTaskDetailsTable =
  workSchema.table("lesson_preparation_task_details", {
    taskRef: text("task_ref").primaryKey(),
    tenantRef: text("tenant_ref").notNull(),
    courseRunRef: text("course_run_ref").notNull(),
    curriculumUnitRef: text("curriculum_unit_ref").notNull(),
    lessonRef: text("lesson_ref").notNull(),
    dueAt: timestamp("due_at", {
      withTimezone: true,
      mode: "string"
    }),
    priority: text("priority").notNull(),
    preparationStatus: text("preparation_status").notNull(),
    approvedPlanRef: text("approved_plan_ref"),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    ...formalWriteColumns()
  });

export const taskWorkingSetTable = workSchema.table(
  "task_working_set",
  {
    taskRef: text("task_ref").primaryKey(),
    currentVersion: integer("current_version").notNull(),
    courseRunRef: text("course_run_ref").notNull(),
    curriculumUnitRef: text("curriculum_unit_ref").notNull(),
    lessonRef: text("lesson_ref").notNull(),
    learningObjectiveRefs: jsonb(
      "learning_objective_refs"
    ).notNull(),
    evidenceRefs: jsonb("evidence_refs").notNull(),
    baselineTeachingPlanRef: text(
      "baseline_teaching_plan_ref"
    ),
    contextPurpose: text("context_purpose").notNull(),
    requestedFieldMask: jsonb(
      "requested_field_mask"
    ).notNull(),
    updatedBy: text("updated_by").notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    ...formalWriteColumns()
  }
);

export const taskWorkingSetRevisionTable = workSchema.table(
  "task_working_set_revision",
  {
    workingSetRevisionRef: text(
      "working_set_revision_ref"
    ).primaryKey(),
    taskRef: text("task_ref").notNull(),
    workingSetVersion: integer(
      "working_set_version"
    ).notNull(),
    courseRunRef: text("course_run_ref").notNull(),
    curriculumUnitRef: text("curriculum_unit_ref").notNull(),
    lessonRef: text("lesson_ref").notNull(),
    learningObjectiveRefs: jsonb(
      "learning_objective_refs"
    ).notNull(),
    evidenceRefs: jsonb("evidence_refs").notNull(),
    baselineTeachingPlanRef: text(
      "baseline_teaching_plan_ref"
    ),
    contextPurpose: text("context_purpose").notNull(),
    requestedFieldMask: jsonb(
      "requested_field_mask"
    ).notNull(),
    ...formalWriteColumns()
  }
);

export const preparationStatusHistoryTable = workSchema.table(
  "preparation_status_history",
  {
    historyRef: text("history_ref").primaryKey(),
    taskRef: text("task_ref").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    taskVersion: integer("task_version").notNull(),
    reason: text("reason").notNull(),
    ...formalWriteColumns()
  }
);

export const suggestionDispositionTable = workSchema.table(
  "suggestion_disposition",
  {
    dispositionRef: text("disposition_ref").primaryKey(),
    tenantRef: text("tenant_ref").notNull(),
    taskRef: text("task_ref").notNull(),
    proposalRevisionRef: text("proposal_revision_ref").notNull(),
    dispositionKind: text("disposition_kind").notNull(),
    selectedStrategyId: text("selected_strategy_id").notNull(),
    teacherEdits: jsonb("teacher_edits").notNull(),
    note: text("note"),
    resultingRevisionRef: text("resulting_revision_ref"),
    requestFingerprint: text("request_fingerprint").notNull(),
    implementationObserved: boolean(
      "implementation_observed"
    ).notNull(),
    ...formalWriteColumns()
  }
);

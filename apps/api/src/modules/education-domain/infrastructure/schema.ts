import {
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp
} from "drizzle-orm/pg-core";

import { formalWriteColumns } from "../../../platform/database/formal-columns.js";

export const educationSchema = pgSchema("education");

export const courseRunTable = educationSchema.table("course_run", {
  courseRunRef: text("course_run_ref").primaryKey(),
  tenantRef: text("tenant_ref").notNull(),
  curriculumFrameworkRef: text(
    "curriculum_framework_ref"
  ).notNull(),
  subject: text("subject").notNull(),
  gradeLevel: text("grade_level").notNull(),
  className: text("class_name").notNull(),
  academicTerm: text("academic_term").notNull(),
  ...formalWriteColumns()
});

export const learningObjectiveTable = educationSchema.table(
  "learning_objective",
  {
    objectiveRef: text("objective_ref").primaryKey(),
    courseRunRef: text("course_run_ref").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    knowledgeConceptRefs: jsonb(
      "knowledge_concept_refs"
    ).notNull(),
    competencyRefs: jsonb("competency_refs").notNull(),
    ...formalWriteColumns()
  }
);

export const learningInteractionProfileTable =
  educationSchema.table(
    "learning_interaction_profile",
    {
      profileRef: text("profile_ref").notNull(),
      profileVersion: integer("profile_version").notNull(),
      scopeRef: text("scope_ref").notNull(),
      participationMode: text("participation_mode").notNull(),
      supportLimit: integer("support_limit").notNull(),
      answerReleaseBoundary: text(
        "answer_release_boundary"
      ).notNull(),
      policyVersionRef: text("policy_version_ref").notNull(),
      promptVersionRef: text("prompt_version_ref").notNull(),
      evidenceRuleVersionRef: text(
        "evidence_rule_version_ref"
      ).notNull(),
      profilePayload: jsonb("profile_payload").notNull(),
      contentHash: text("content_hash").notNull(),
      validFrom: timestamp("valid_from", {
        withTimezone: true,
        mode: "string"
      }).notNull(),
      ...formalWriteColumns()
    },
    (table) => [
      primaryKey({
        columns: [table.profileRef, table.profileVersion]
      })
    ]
  );

export const attemptTable = educationSchema.table("attempt", {
  attemptRef: text("attempt_ref").primaryKey(),
  courseRunRef: text("course_run_ref").notNull(),
  objectiveRef: text("objective_ref").notNull(),
  learnerRef: text("learner_ref").notNull(),
  submittedAt: timestamp("submitted_at", {
    withTimezone: true,
    mode: "string"
  }).notNull(),
  responseSummary: jsonb("response_summary").notNull(),
  ...formalWriteColumns()
});

export const evidenceObservationTable = educationSchema.table(
  "evidence_observation",
  {
    observationRef: text("observation_ref").primaryKey(),
    attemptRef: text("attempt_ref").notNull(),
    objectiveRef: text("objective_ref").notNull(),
    observerType: text("observer_type").notNull(),
    observationType: text("observation_type").notNull(),
    observationValue: jsonb("observation_value").notNull(),
    observedAt: timestamp("observed_at", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    sourceRef: text("source_ref").notNull(),
    ...formalWriteColumns()
  }
);

export const evidenceClaimTable = educationSchema.table(
  "evidence_claim",
  {
    claimRef: text("claim_ref").primaryKey(),
    objectiveRef: text("objective_ref").notNull(),
    claimType: text("claim_type").notNull(),
    claimValue: jsonb("claim_value").notNull(),
    confidence: numeric("confidence", {
      precision: 5,
      scale: 4
    }).notNull(),
    validFrom: timestamp("valid_from", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string"
    }),
    status: text("status").notNull(),
    ...formalWriteColumns()
  }
);

export const evidenceClaimObservationTable =
  educationSchema.table(
    "evidence_claim_observation",
    {
      claimRef: text("claim_ref").notNull(),
      observationRef: text("observation_ref").notNull(),
      relationType: text("relation_type").notNull(),
      ...formalWriteColumns()
    },
    (table) => [
      primaryKey({
        columns: [table.claimRef, table.observationRef]
      })
    ]
  );

export const teachingPlanAlignmentTable = educationSchema.table(
  "teaching_plan_alignment",
  {
    alignmentRef: text("alignment_ref").primaryKey(),
    teachingPlanArtifactRef: text(
      "teaching_plan_artifact_ref"
    ).notNull(),
    courseRunRef: text("course_run_ref").notNull(),
    objectiveRef: text("objective_ref").notNull(),
    validationStatus: text("validation_status").notNull(),
    validationResult: jsonb("validation_result").notNull(),
    ...formalWriteColumns()
  }
);

export const educationOutboxTable = educationSchema.table(
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

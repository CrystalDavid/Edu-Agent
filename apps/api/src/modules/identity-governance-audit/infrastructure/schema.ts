import {
  jsonb,
  pgSchema,
  text,
  timestamp
} from "drizzle-orm/pg-core";

import { formalWriteColumns } from "../../../platform/database/formal-columns.js";

export const governanceSchema = pgSchema("governance");

export const authorizationDecisionTable =
  governanceSchema.table("authorization_decision", {
    decisionRef: text("decision_ref").primaryKey(),
    tenantRef: text("tenant_ref").notNull(),
    action: text("action").notNull(),
    resourceRef: text("resource_ref").notNull(),
    effect: text("effect").notNull(),
    reasonCodes: jsonb("reason_codes").notNull(),
    policyVersion: text("policy_version").notNull(),
    requestedFieldMask: jsonb("requested_field_mask").notNull(),
    decidedAt: timestamp("decided_at", {
      withTimezone: true,
      mode: "string"
    }).notNull(),
    ...formalWriteColumns()
  });

export const auditRecordTable = governanceSchema.table(
  "audit_record",
  {
    recordRef: text("record_ref").primaryKey(),
    writeRef: text("write_ref").notNull(),
    recordType: text("record_type").notNull(),
    action: text("action").notNull(),
    ...formalWriteColumns()
  }
);

export const governanceIdempotencyRecordTable =
  governanceSchema.table("idempotency_record", {
    idempotencyRef: text("idempotency_ref").primaryKey(),
    rootKey: text("root_key").notNull().unique(),
    requestFingerprint: text("request_fingerprint").notNull(),
    status: text("status").notNull(),
    result: jsonb("result"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string"
    }),
    ...formalWriteColumns()
  });

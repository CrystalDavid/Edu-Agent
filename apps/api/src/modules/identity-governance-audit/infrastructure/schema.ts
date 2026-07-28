import {
  jsonb,
  pgSchema,
  text
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

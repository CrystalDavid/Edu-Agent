import { text, timestamp } from "drizzle-orm/pg-core";

export function formalWriteColumns() {
  return {
    actorRef: text("actor_ref").notNull(),
    purpose: text("purpose").notNull(),
    ownerModule: text("owner_module").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    authorizationDecisionRef: text(
      "authorization_decision_ref"
    ).notNull(),
    auditRef: text("audit_ref").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string"
    }).notNull()
  };
}

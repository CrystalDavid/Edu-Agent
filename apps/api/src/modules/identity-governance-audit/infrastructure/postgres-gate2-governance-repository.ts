import type {
  AuthorizationDecision,
  RunExplanation
} from "@edu-agent/contracts";

import type { SqlExecutor } from "../../../platform/postgres/types.js";

export class PostgresGate2GovernanceRepository {
  async getAuthorizationDecision(
    executor: SqlExecutor,
    decisionRef: string
  ): Promise<AuthorizationDecision | undefined> {
    const result = await executor.query<{
      decision_ref: string;
      actor_ref: string;
      tenant_ref: string;
      purpose: string;
      action: string;
      resource_ref: string;
      requested_field_mask: string[];
      effect: "allow" | "deny";
      reason_codes: string[];
      policy_version: string;
      decided_at: Date;
    }>(
      `SELECT decision_ref, actor_ref, tenant_ref, purpose, action,
              resource_ref, requested_field_mask, effect,
              reason_codes, policy_version, decided_at
         FROM governance.authorization_decision
        WHERE decision_ref = $1`,
      [decisionRef]
    );
    const row = result.rows[0];
    return row
      ? {
          decisionRef: row.decision_ref,
          actorRef: row.actor_ref,
          tenantRef: row.tenant_ref,
          purpose: row.purpose,
          action: row.action,
          resourceRef: row.resource_ref,
          requestedFieldMask: row.requested_field_mask,
          effect: row.effect,
          reasonCodes: row.reason_codes,
          policyVersion: row.policy_version,
          decidedAt: row.decided_at.toISOString()
        }
      : undefined;
  }

  async listAuditTimeline(
    executor: SqlExecutor,
    decisionRef: string
  ): Promise<RunExplanation["auditTimeline"]> {
    const result = await executor.query<{
      record_ref: string;
      record_type: string;
      action: string;
      actor_ref: string;
      purpose: string;
      created_at: Date;
    }>(
      `SELECT record_ref, record_type, action, actor_ref, purpose,
              created_at
         FROM governance.audit_record
        WHERE authorization_decision_ref = $1
        ORDER BY created_at, record_ref`,
      [decisionRef]
    );
    return result.rows.map((row) => ({
      auditRef: row.record_ref,
      recordType: row.record_type,
      action: row.action,
      actorRef: row.actor_ref,
      purpose: row.purpose,
      occurredAt: row.created_at.toISOString()
    }));
  }
}

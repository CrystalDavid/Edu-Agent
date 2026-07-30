import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

export class PostgresDemoIdentityAuditService {
  constructor(private readonly pool: Pool) {}

  async recordInjection(input: {
    actorRef: string;
    method: string;
    path: string;
    purpose: string;
  }): Promise<string> {
    const nonce = randomUUID();
    const auditRef = `audit:demo-identity-injection:${nonce}`;
    const decisionRef = `decision:demo-identity-injection:${nonce}`;
    await this.pool.query(
      `INSERT INTO governance.audit_record (
         record_ref, write_ref, record_type, action, actor_ref,
         purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, 'DemoIdentityInjection', 'demo.identity.inject',
         $3, $4, 'governance', $5, $6, $1, $7
       )`,
      [
        auditRef,
        `demo-identity:${input.method}:${input.path}:${nonce}`,
        input.actorRef,
        input.purpose,
        `demo-identity-injection:${nonce}`,
        decisionRef,
        new Date()
      ]
    );
    return auditRef;
  }
}

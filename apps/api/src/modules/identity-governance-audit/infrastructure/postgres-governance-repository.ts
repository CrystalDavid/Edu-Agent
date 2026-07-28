import { randomUUID } from "node:crypto";

import type {
  AuthorizationDecision,
  FormalWriteMetadata,
  FormalWriteReceipt
} from "@edu-agent/contracts";

import { IdempotencyConflictError } from "../../../platform/errors.js";
import type {
  PostgresClient,
  SqlExecutor
} from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues,
  toPostgresJson
} from "../../../platform/postgres/write-context.js";

export interface IdempotencyReservation {
  kind: "new" | "replay";
  result?: Record<string, unknown>;
  receipt?: FormalWriteReceipt;
}

export class PostgresGovernanceRepository {
  async reserveIdempotency(
    client: PostgresClient,
    input: {
      idempotencyRef: string;
      rootKey: string;
      requestFingerprint: string;
      metadata: FormalWriteMetadata & { owner: "governance" };
    }
  ): Promise<IdempotencyReservation> {
    const inserted = await client.query(
      `INSERT INTO governance.idempotency_record (
         idempotency_ref,
         root_key,
         request_fingerprint,
         status,
         result,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, 'processing', NULL,
         $4, $5, $6, $7, $8, $9, $10
       )
       ON CONFLICT (root_key) DO NOTHING`,
      [
        input.idempotencyRef,
        input.rootKey,
        input.requestFingerprint,
        ...formalMetadataValues(input.metadata)
      ]
    );
    const row = await client.query<{
      request_fingerprint: string;
      status: "processing" | "completed";
      result: Record<string, unknown> | null;
    }>(
      `SELECT request_fingerprint, status, result
         FROM governance.idempotency_record
        WHERE root_key = $1
        FOR UPDATE`,
      [input.rootKey]
    );
    const record = row.rows[0];
    if (!record) {
      throw new Error("Idempotency reservation disappeared.");
    }
    if (record.request_fingerprint !== input.requestFingerprint) {
      throw new IdempotencyConflictError(
        "The idempotency key was used for a different payload."
      );
    }
    if (inserted.rowCount === 0) {
      if (record.status !== "completed" || !record.result) {
        throw new Error(
          "An incomplete idempotency reservation was committed."
        );
      }
      return {
        kind: "replay",
        result: record.result
      };
    }

    return {
      kind: "new",
      receipt: createReceipt({
        writeRef: input.idempotencyRef,
        recordType: "IdempotencyRecord",
        metadata: input.metadata
      })
    };
  }

  async completeIdempotency(
    client: PostgresClient,
    input: {
      rootKey: string;
      result: Record<string, unknown>;
      completedAt: string;
    }
  ): Promise<void> {
    const updated = await client.query(
      `UPDATE governance.idempotency_record
          SET status = 'completed',
              result = $2,
              completed_at = $3
        WHERE root_key = $1
          AND status = 'processing'`,
      [
        input.rootKey,
        toPostgresJson(input.result),
        input.completedAt
      ]
    );
    if (updated.rowCount !== 1) {
      throw new Error("Idempotency completion did not update one record.");
    }
  }

  async saveDecision(
    client: PostgresClient,
    input: {
      decision: AuthorizationDecision;
      metadata: FormalWriteMetadata & { owner: "governance" };
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO governance.authorization_decision (
         decision_ref,
         tenant_ref,
         action,
         resource_ref,
         effect,
         reason_codes,
         policy_version,
         requested_field_mask,
         decided_at,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16
       )
       ON CONFLICT (decision_ref) DO NOTHING`,
      [
        input.decision.decisionRef,
        input.decision.tenantRef,
        input.decision.action,
        input.decision.resourceRef,
        input.decision.effect,
        toPostgresJson(input.decision.reasonCodes),
        input.decision.policyVersion,
        toPostgresJson(input.decision.requestedFieldMask),
        input.decision.decidedAt,
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: input.decision.decisionRef,
      recordType: "AuthorizationDecision",
      metadata: input.metadata
    });
  }

  async saveAudits(
    client: PostgresClient,
    receipts: readonly FormalWriteReceipt[]
  ): Promise<void> {
    for (const receipt of receipts) {
      const auditMetadata: FormalWriteMetadata = {
        actorRef: receipt.metadata.actorRef,
        purpose: receipt.metadata.purpose,
        owner: "governance",
        idempotencyKey: `${receipt.metadata.idempotencyKey}:audit`,
        authorizationDecisionRef:
          receipt.metadata.authorizationDecisionRef,
        auditRef: receipt.metadata.auditRef,
        createdAt: receipt.metadata.createdAt
      };
      await client.query(
        `INSERT INTO governance.audit_record (
           record_ref,
           write_ref,
           record_type,
           action,
           actor_ref,
           purpose,
           owner_module,
           idempotency_key,
           authorization_decision_ref,
           audit_ref,
           created_at
         ) VALUES (
           $1, $2, $3, 'formal-write',
           $4, $5, $6, $7, $8, $9, $10
         )
         ON CONFLICT (record_ref) DO NOTHING`,
        [
          receipt.metadata.auditRef,
          receipt.writeRef,
          receipt.recordType,
          ...formalMetadataValues(auditMetadata)
        ]
      );
    }
  }

  async countAudits(
    executor: SqlExecutor,
    writeRefs: readonly string[]
  ): Promise<number> {
    if (writeRefs.length === 0) {
      return 0;
    }
    const result = await executor.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM governance.audit_record
        WHERE write_ref = ANY($1::text[])`,
      [[...writeRefs]]
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

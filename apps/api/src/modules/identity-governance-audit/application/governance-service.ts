import type {
  ActingContext,
  AuthorizationDecision,
  AuditRecord,
  FormalWriteReceipt,
  IngressEnvelope,
  TenantContext
} from "@edu-agent/contracts";

import type { Clock, IdGenerator } from "../../../platform/system.js";
import type { AuthorizationDecisionRecord } from "../domain/records.js";

export interface GovernanceRepository {
  saveDecision(record: AuthorizationDecisionRecord): void;
  saveAudits(records: readonly AuditRecord[]): void;
  getDecision(decisionRef: string): AuthorizationDecisionRecord | undefined;
  listAudits(): readonly AuditRecord[];
  listDecisionRecords(): readonly AuthorizationDecisionRecord[];
}

export interface AuthorizationResult {
  record: AuthorizationDecisionRecord;
  receipt: FormalWriteReceipt;
}

export class GovernanceService {
  static readonly policyVersion = "gate1a-demo-policy@1";

  constructor(
    private readonly repository: GovernanceRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator
  ) {}

  authorize(input: {
    envelope: IngressEnvelope;
    tenant: TenantContext;
    acting: ActingContext;
    action: string;
    resourceRef: string;
    requestedFieldMask?: readonly string[];
  }): AuthorizationResult {
    const sameTenant =
      input.envelope.tenantRef === input.tenant.tenantRef &&
      input.acting.tenantRef === input.tenant.tenantRef;
    const sameActor = input.envelope.actorRef === input.acting.actorRef;
    const isTeacher = input.acting.roleRefs.includes("role:math-teacher");
    const syntheticOnly = input.tenant.dataMode === "synthetic";
    const allowedReadFields = new Set([
      "title",
      "body",
      "owner",
      "actorRef",
      "purpose"
    ]);
    const fieldsAllowed = (input.requestedFieldMask ?? []).every(
      (field) => allowedReadFields.has(field)
    );
    const purposeAllowed = input.envelope.purpose.startsWith("gate1a.");
    const allowed =
      sameTenant &&
      sameActor &&
      isTeacher &&
      syntheticOnly &&
      fieldsAllowed &&
      purposeAllowed;
    const decisionRef = this.ids.next("authorization-decision");
    const auditRef = this.ids.next("audit");
    const decidedAt = this.clock.now();

    const decision: AuthorizationDecision = {
      decisionRef,
      actorRef: input.acting.actorRef,
      tenantRef: input.tenant.tenantRef,
      purpose: input.envelope.purpose,
      action: input.action,
      resourceRef: input.resourceRef,
      requestedFieldMask: [...(input.requestedFieldMask ?? [])],
      effect: allowed ? "allow" : "deny",
      reasonCodes: allowed
        ? ["synthetic-demo-teacher-policy"]
        : ["tenant-actor-role-or-data-mode-mismatch"],
      policyVersion: GovernanceService.policyVersion,
      decidedAt
    };

    const record: AuthorizationDecisionRecord = {
      decision,
      metadata: {
        actorRef: input.acting.actorRef,
        purpose: input.envelope.purpose,
        owner: "governance",
        idempotencyKey: `${input.envelope.idempotencyKey}:authorization`,
        authorizationDecisionRef: decisionRef,
        auditRef,
        createdAt: decidedAt
      }
    };

    this.repository.saveDecision(record);

    return {
      record,
      receipt: {
        writeRef: decisionRef,
        recordType: "AuthorizationDecision",
        owner: "governance",
        metadata: record.metadata
      }
    };
  }

  audit(receipts: readonly FormalWriteReceipt[]): readonly AuditRecord[] {
    const audits = receipts.map<AuditRecord>((receipt) => ({
      auditRef: receipt.metadata.auditRef,
      writeRef: receipt.writeRef,
      recordType: receipt.recordType,
      action: "formal-write",
      metadata: {
        actorRef: receipt.metadata.actorRef,
        purpose: receipt.metadata.purpose,
        owner: "governance",
        idempotencyKey: `${receipt.metadata.idempotencyKey}:audit`,
        authorizationDecisionRef:
          receipt.metadata.authorizationDecisionRef,
        auditRef: receipt.metadata.auditRef,
        createdAt: receipt.metadata.createdAt
      }
    }));

    this.repository.saveAudits(audits);
    return audits;
  }
}

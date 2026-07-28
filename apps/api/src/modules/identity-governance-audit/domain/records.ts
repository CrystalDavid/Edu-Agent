import type {
  AuditRecord,
  AuthorizationDecision,
  FormalWriteMetadata
} from "@edu-agent/contracts";

export interface AuthorizationDecisionRecord {
  decision: AuthorizationDecision;
  metadata: FormalWriteMetadata;
}

export type GovernanceAuditRecord = AuditRecord;

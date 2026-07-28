import type { AuditRecord } from "@edu-agent/contracts";

import type {
  GovernanceRepository
} from "../application/governance-service.js";
import type { AuthorizationDecisionRecord } from "../domain/records.js";

export class InMemoryGovernanceRepository
  implements GovernanceRepository
{
  private readonly decisions = new Map<
    string,
    AuthorizationDecisionRecord
  >();
  private readonly audits = new Map<string, AuditRecord>();

  saveDecision(record: AuthorizationDecisionRecord): void {
    this.decisions.set(record.decision.decisionRef, record);
  }

  saveAudits(records: readonly AuditRecord[]): void {
    for (const record of records) {
      this.audits.set(record.auditRef, record);
    }
  }

  getDecision(
    decisionRef: string
  ): AuthorizationDecisionRecord | undefined {
    return this.decisions.get(decisionRef);
  }

  listAudits(): readonly AuditRecord[] {
    return [...this.audits.values()];
  }

  listDecisionRecords(): readonly AuthorizationDecisionRecord[] {
    return [...this.decisions.values()];
  }
}

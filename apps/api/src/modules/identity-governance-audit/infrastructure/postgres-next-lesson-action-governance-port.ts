import { PostgresGovernanceRepository } from "./postgres-governance-repository.js";

/**
 * Transaction-aware governance operations used by the next-Lesson workflow.
 * The cross-module coordinator never receives the Governance repository itself.
 */
export class PostgresNextLessonActionGovernancePort {
  constructor(
    private readonly repository = new PostgresGovernanceRepository()
  ) {}

  reserveIdempotency(
    ...args: Parameters<PostgresGovernanceRepository["reserveIdempotency"]>
  ) {
    return this.repository.reserveIdempotency(...args);
  }

  saveDecision(
    ...args: Parameters<PostgresGovernanceRepository["saveDecision"]>
  ) {
    return this.repository.saveDecision(...args);
  }

  completeIdempotency(
    ...args: Parameters<PostgresGovernanceRepository["completeIdempotency"]>
  ) {
    return this.repository.completeIdempotency(...args);
  }

  saveAudits(
    ...args: Parameters<PostgresGovernanceRepository["saveAudits"]>
  ) {
    return this.repository.saveAudits(...args);
  }
}

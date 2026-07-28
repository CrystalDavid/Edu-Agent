import type { OutboxRecord } from "@edu-agent/contracts";

import type { RuntimeRepository } from "../application/runtime-service.js";
import type { AgentRunRecord } from "../domain/agent-run.js";

export class InMemoryRuntimeRepository implements RuntimeRepository {
  private readonly agentRuns = new Map<string, AgentRunRecord>();
  private readonly outbox = new Map<string, OutboxRecord>();

  saveAgentRun(agentRun: AgentRunRecord, outbox: OutboxRecord): void {
    this.agentRuns.set(agentRun.agentRunRef, agentRun);
    this.outbox.set(outbox.outboxRef, outbox);
  }

  listAgentRuns(): readonly AgentRunRecord[] {
    return [...this.agentRuns.values()];
  }

  listOutbox(): readonly OutboxRecord[] {
    return [...this.outbox.values()];
  }
}

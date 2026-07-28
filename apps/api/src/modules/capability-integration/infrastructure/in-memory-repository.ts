import type { OutboxRecord } from "@edu-agent/contracts";

import type { CapabilityRepository } from "../application/capability-service.js";
import type { ToolExecutionRecord } from "../domain/capability.js";

export class InMemoryCapabilityRepository
  implements CapabilityRepository
{
  private readonly executions = new Map<string, ToolExecutionRecord>();
  private readonly outbox = new Map<string, OutboxRecord>();

  saveExecution(
    execution: ToolExecutionRecord,
    outbox: OutboxRecord
  ): void {
    this.executions.set(execution.executionRef, execution);
    this.outbox.set(outbox.outboxRef, outbox);
  }

  listExecutions(): readonly ToolExecutionRecord[] {
    return [...this.executions.values()];
  }

  listOutbox(): readonly OutboxRecord[] {
    return [...this.outbox.values()];
  }
}

import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import {
  PostgresOutboxWorker,
  type ClaimedOutboxEvent,
  type OutboxBusinessEffect,
  type OutboxOwner
} from "../platform/postgres/outbox-worker.js";

const gate24Events = {
  work: [
    "TeacherCopilotTaskCompleted",
    "SuggestionDisposed",
    "TeachingPlanApproved"
  ],
  runtime: ["AgentRunCompleted"],
  capability: ["MockModelExecutionCompleted"],
  artifact: [
    "PedagogicalSuggestionProposed",
    "TeachingPlanDraftProposed",
    "TeachingPlanSubmittedForReview",
    "TeachingPlanApproved"
  ]
} as const satisfies Partial<
  Record<OutboxOwner, readonly string[]>
>;

export class LocalCopilotOutboxWorker {
  private readonly workers: PostgresOutboxWorker[];
  private timer: NodeJS.Timeout | null = null;
  private activeTick: Promise<void> | null = null;
  private stopping = false;

  constructor(
    pool: Pool,
    workerId = `copilot-local:${randomUUID()}`,
    private readonly pollMilliseconds = 100
  ) {
    this.workers = Object.entries(gate24Events).map(
      ([owner, eventNames]) =>
        new PostgresOutboxWorker(
          pool,
          `${workerId}:${owner}`,
          "teacher-copilot-local-worker-v1",
          1_000,
          eventNames,
          owner as OutboxOwner
        )
    );
  }

  start(): void {
    if (this.timer || this.stopping) return;
    this.timer = setInterval(
      () => this.requestTick(),
      this.pollMilliseconds
    );
    this.timer.unref();
    this.requestTick();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.activeTick;
  }

  async processAvailable(limit = 25): Promise<number> {
    let processed = 0;
    let foundWork = true;
    while (processed < limit && foundWork) {
      foundWork = false;
      for (const worker of this.workers) {
        if (processed >= limit) break;
        const outcome = await worker.processOne(handleEvent);
        if (outcome === "processed") {
          processed += 1;
          foundWork = true;
        }
      }
    }
    return processed;
  }

  private requestTick(): void {
    if (this.stopping || this.activeTick) return;
    this.activeTick = this.processAvailable()
      .then(() => undefined)
      .catch((error: unknown) => {
        process.stderr.write(
          `Teacher Copilot outbox worker will retry: ${
            error instanceof Error ? error.message : String(error)
          }\n`
        );
      })
      .finally(() => {
        this.activeTick = null;
      });
  }
}

async function handleEvent(
  event: ClaimedOutboxEvent
): Promise<OutboxBusinessEffect> {
  return {
    effectKey: `teacher-copilot-local:${event.outboxRef}`,
    effectPayload: {
      outcome: "consumed",
      eventName: event.eventName,
      aggregateRef: event.aggregateRef,
      attemptCount: event.attemptCount,
      projectionMode: "none-business-state-synchronous"
    }
  };
}

export const localCopilotOutboxEventNames = gate24Events;

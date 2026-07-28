import type { OutboxRecord } from "@edu-agent/contracts";

import type { WorkRepository } from "../application/walking-skeleton-service.js";
import type {
  IdempotencyRecord,
  QueryIdempotencyRecord,
  QueryRunRecord,
  TaskRecord,
  TaskRunRecord
} from "../domain/records.js";

export class InMemoryWorkRepository implements WorkRepository {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly taskRuns = new Map<string, TaskRunRecord>();
  private readonly queryRuns = new Map<string, QueryRunRecord>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly queryIdempotency = new Map<
    string,
    QueryIdempotencyRecord
  >();
  private readonly outbox = new Map<string, OutboxRecord>();

  findIdempotency(rootKey: string): IdempotencyRecord | undefined {
    return this.idempotency.get(rootKey);
  }

  saveCommand(input: {
    task: TaskRecord;
    taskRun: TaskRunRecord;
    idempotency: IdempotencyRecord;
    outbox: OutboxRecord;
  }): void {
    this.tasks.set(input.task.taskRef, input.task);
    this.taskRuns.set(input.taskRun.taskRunRef, input.taskRun);
    this.idempotency.set(input.idempotency.rootKey, input.idempotency);
    this.outbox.set(input.outbox.outboxRef, input.outbox);
  }

  findQueryIdempotency(
    rootKey: string
  ): QueryIdempotencyRecord | undefined {
    return this.queryIdempotency.get(rootKey);
  }

  saveQuery(input: {
    queryRun: QueryRunRecord;
    idempotency: QueryIdempotencyRecord;
  }): void {
    this.queryRuns.set(input.queryRun.queryRunRef, input.queryRun);
    this.queryIdempotency.set(
      input.idempotency.rootKey,
      input.idempotency
    );
  }

  listTasks(): readonly TaskRecord[] {
    return [...this.tasks.values()];
  }

  listTaskRuns(): readonly TaskRunRecord[] {
    return [...this.taskRuns.values()];
  }

  listQueryRuns(): readonly QueryRunRecord[] {
    return [...this.queryRuns.values()];
  }

  listIdempotencyRecords(): readonly IdempotencyRecord[] {
    return [...this.idempotency.values()];
  }

  listOutbox(): readonly OutboxRecord[] {
    return [...this.outbox.values()];
  }
}

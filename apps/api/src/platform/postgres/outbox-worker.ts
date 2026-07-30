import type { Pool } from "pg";

import { toPostgresJson } from "./write-context.js";

export interface ClaimedOutboxEvent {
  outboxRef: string;
  eventName: string;
  aggregateRef: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  leaseOwner: string;
}

export interface OutboxBusinessEffect {
  effectKey: string;
  effectPayload: Record<string, unknown>;
}

export type OutboxOwner =
  | "work"
  | "runtime"
  | "capability"
  | "artifact"
  | "education";

export class PostgresOutboxWorker {
  constructor(
    private readonly pool: Pool,
    private readonly workerId: string,
    private readonly consumerName: string,
    private readonly leaseMilliseconds = 250,
    private readonly eventNames?: readonly string[],
    private readonly owner: OutboxOwner = "work"
  ) {
    if (
      ![
        "work",
        "runtime",
        "capability",
        "artifact",
        "education"
      ].includes(owner)
    ) {
      throw new Error("Unsupported Outbox owner.");
    }
  }

  async claimOne(): Promise<ClaimedOutboxEvent | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{
        outbox_ref: string;
        event_name: string;
        aggregate_ref: string;
        payload: Record<string, unknown>;
        attempt_count: number;
        lease_owner: string;
      }>(
        `WITH candidate AS (
           SELECT outbox_ref
             FROM ${this.owner}.outbox_record
            WHERE processed_at IS NULL
              AND (
                $3::text[] IS NULL
                OR event_name = ANY($3::text[])
              )
              AND (
                status IN ('pending', 'retry')
                OR (
                  status = 'processing'
                  AND lease_expires_at < clock_timestamp()
                )
              )
            ORDER BY created_at, outbox_ref
            FOR UPDATE SKIP LOCKED
            LIMIT 1
         )
         UPDATE ${this.owner}.outbox_record AS outbox
            SET status = 'processing',
                lease_owner = $1,
                lease_expires_at =
                  clock_timestamp() +
                  ($2::text || ' milliseconds')::interval,
                attempt_count = outbox.attempt_count + 1,
                last_error = NULL
           FROM candidate
          WHERE outbox.outbox_ref = candidate.outbox_ref
         RETURNING
           outbox.outbox_ref,
           outbox.event_name,
           outbox.aggregate_ref,
           outbox.payload,
           outbox.attempt_count,
           outbox.lease_owner`,
        [
          this.workerId,
          this.leaseMilliseconds,
          this.eventNames ? [...this.eventNames] : null
        ]
      );
      await client.query("COMMIT");
      const row = result.rows[0];
      return row
        ? {
            outboxRef: row.outbox_ref,
            eventName: row.event_name,
            aggregateRef: row.aggregate_ref,
            payload: row.payload,
            attemptCount: row.attempt_count,
            leaseOwner: row.lease_owner
          }
        : undefined;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async complete(
    event: ClaimedOutboxEvent,
    effect: OutboxBusinessEffect
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO work.outbox_consumer_effect (
           consumer_name,
           outbox_ref,
           effect_key,
           effect_payload
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (consumer_name, outbox_ref) DO NOTHING`,
        [
          this.consumerName,
          event.outboxRef,
          effect.effectKey,
          toPostgresJson(effect.effectPayload)
        ]
      );
      const completed = await client.query(
        `UPDATE ${this.owner}.outbox_record
            SET status = 'processed',
                processed_at = clock_timestamp(),
                published_at = clock_timestamp(),
                lease_owner = NULL,
                lease_expires_at = NULL,
                last_error = NULL
          WHERE outbox_ref = $1
            AND lease_owner = $2
            AND processed_at IS NULL`,
        [event.outboxRef, this.workerId]
      );
      if (completed.rowCount !== 1) {
        throw new Error("Outbox lease was lost before completion.");
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async fail(
    event: ClaimedOutboxEvent,
    error: unknown
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : "Unknown worker error";
    await this.pool.query(
      `UPDATE ${this.owner}.outbox_record
          SET status = 'retry',
              lease_owner = NULL,
              lease_expires_at = NULL,
              last_error = left($3, 2000)
        WHERE outbox_ref = $1
          AND lease_owner = $2
          AND processed_at IS NULL`,
      [event.outboxRef, this.workerId, message]
    );
  }

  async processOne(
    handler: (
      event: ClaimedOutboxEvent
    ) => Promise<OutboxBusinessEffect>
  ): Promise<"empty" | "processed"> {
    const event = await this.claimOne();
    if (!event) {
      return "empty";
    }
    try {
      const effect = await handler(event);
      await this.complete(event, effect);
      return "processed";
    } catch (error) {
      await this.fail(event, error);
      throw error;
    }
  }
}

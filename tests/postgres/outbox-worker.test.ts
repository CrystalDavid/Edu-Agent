import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  PostgresGate1BCommandService
} from "../../apps/api/src/composition/postgres-gate1b-command-service.js";
import {
  PostgresOutboxWorker
} from "../../apps/api/src/platform/postgres/outbox-worker.js";
import {
  poolFor,
  resetGate1BData,
  uniqueSuffix,
  wait
} from "./support/database.js";

const adminPool = poolFor("admin");
const appPool = poolFor("app");
const workerPoolA = poolFor("worker");
const workerPoolB = poolFor("worker");
const commandService = new PostgresGate1BCommandService(appPool);

async function createPendingOutbox(suffix: string): Promise<void> {
  await commandService.execute({
    tenantRef: "tenant:demo-school",
    actorRef: "user:teacher-001",
    purpose: "gate1b.outbox-worker",
    idempotencyKey: `idempotency:${suffix}`,
    title: "Outbox worker",
    body: "Synthetic event"
  });
}

beforeEach(async () => {
  await resetGate1BData(adminPool);
});

afterAll(async () => {
  await Promise.all([
    workerPoolB.end(),
    workerPoolA.end(),
    appPool.end(),
    adminPool.end()
  ]);
});

describe("PostgreSQL Outbox workers", () => {
  it("lets two Workers produce one business effect for one event", async () => {
    await createPendingOutbox(uniqueSuffix("dual-worker"));
    const workerA = new PostgresOutboxWorker(
      workerPoolA,
      "worker:A",
      "consumer:gate1b",
      200
    );
    const workerB = new PostgresOutboxWorker(
      workerPoolB,
      "worker:B",
      "consumer:gate1b",
      200
    );
    const handler = async (event: { outboxRef: string }) => ({
      effectKey: `effect:${event.outboxRef}`,
      effectPayload: {
        processed: true
      }
    });

    const results = await Promise.all([
      workerA.processOne(handler),
      workerB.processOne(handler)
    ]);

    expect(results.sort()).toEqual(["empty", "processed"]);
    const effects = await workerPoolA.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM work.outbox_consumer_effect`
    );
    expect(Number(effects.rows[0]?.count)).toBe(1);
    const outbox = await workerPoolA.query<{
      status: string;
      attempt_count: number;
      processed_at: Date | null;
    }>(
      `SELECT status, attempt_count, processed_at
         FROM work.outbox_record`
    );
    expect(outbox.rows[0]).toMatchObject({
      status: "processed",
      attempt_count: 1
    });
    expect(outbox.rows[0]?.processed_at).toBeInstanceOf(Date);
  });

  it("reclaims an expired lease after a Worker crash without losing or duplicating the effect", async () => {
    await createPendingOutbox(uniqueSuffix("crash-recovery"));
    const crashedWorker = new PostgresOutboxWorker(
      workerPoolA,
      "worker:crashed",
      "consumer:recovery",
      100
    );
    const recoveryWorker = new PostgresOutboxWorker(
      workerPoolB,
      "worker:recovery",
      "consumer:recovery",
      100
    );

    const abandoned = await crashedWorker.claimOne();
    expect(abandoned?.attemptCount).toBe(1);
    await wait(180);

    const recovered = await recoveryWorker.processOne(
      async (event) => {
        expect(event.outboxRef).toBe(abandoned?.outboxRef);
        expect(event.attemptCount).toBe(2);
        return {
          effectKey: `recovered:${event.outboxRef}`,
          effectPayload: {
            recoveredBy: "worker:recovery"
          }
        };
      }
    );
    expect(recovered).toBe("processed");

    const state = await workerPoolB.query<{
      attempt_count: number;
      status: string;
      effect_count: string;
    }>(
      `SELECT
         outbox.attempt_count,
         outbox.status,
         (
           SELECT count(*)::text
             FROM work.outbox_consumer_effect
            WHERE outbox_ref = outbox.outbox_ref
         ) AS effect_count
       FROM work.outbox_record AS outbox`
    );
    expect(state.rows[0]).toMatchObject({
      attempt_count: 2,
      status: "processed",
      effect_count: "1"
    });

    const restartedWorker = new PostgresOutboxWorker(
      workerPoolA,
      "worker:restarted",
      "consumer:recovery"
    );
    await expect(
      restartedWorker.processOne(async () => {
        throw new Error("Processed events must not replay.");
      })
    ).resolves.toBe("empty");
  });

  it("records an observable retry state when the handler fails", async () => {
    await createPendingOutbox(uniqueSuffix("handler-failure"));
    const worker = new PostgresOutboxWorker(
      workerPoolA,
      "worker:failing",
      "consumer:failing"
    );

    await expect(
      worker.processOne(async () => {
        throw new Error("synthetic handler failure");
      })
    ).rejects.toThrow("synthetic handler failure");

    const state = await workerPoolA.query<{
      status: string;
      attempt_count: number;
      last_error: string | null;
    }>(
      `SELECT status, attempt_count, last_error
         FROM work.outbox_record`
    );
    expect(state.rows[0]).toMatchObject({
      status: "retry",
      attempt_count: 1,
      last_error: "synthetic handler failure"
    });
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  dockerCompose,
  poolFor,
  resetGate1BData,
  wait
} from "./support/database.js";

const adminPool = poolFor("admin");

beforeEach(async () => {
  await resetGate1BData(adminPool);
});

afterAll(async () => {
  await adminPool.end();
});

describe("PostgreSQL connection pool", () => {
  it("serves concurrent requests with a bounded pool and releases clients", async () => {
    const pool = poolFor("app", {
      max: 2,
      connectionTimeoutMillis: 1_000,
      idleTimeoutMillis: 1_000
    });
    try {
      await Promise.all(
        Array.from({ length: 12 }, () =>
          pool.query("SELECT pg_sleep(0.02), 1 AS value")
        )
      );
      await wait(30);
      expect(pool.totalCount).toBeLessThanOrEqual(2);
      expect(pool.idleCount).toBe(pool.totalCount);
      expect(pool.waitingCount).toBe(0);
    } finally {
      await pool.end();
    }
    expect(pool.totalCount).toBe(0);
  });

  it("fails with an explicit timeout when the pool is exhausted and recovers after release", async () => {
    const pool = poolFor("app", {
      max: 2,
      connectionTimeoutMillis: 250,
      idleTimeoutMillis: 1_000
    });
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await expect(pool.connect()).rejects.toThrow(
        /timeout exceeded when trying to connect/i
      );
    } finally {
      first.release();
      second.release();
    }
    await expect(pool.query("SELECT 1 AS value")).resolves.toMatchObject({
      rowCount: 1
    });
    await pool.end();
    expect(pool.totalCount).toBe(0);
  });

  it("fails clearly while PostgreSQL is paused and accepts new requests after recovery", async () => {
    const healthyPool = poolFor("app", {
      max: 1,
      connectionTimeoutMillis: 500
    });
    await healthyPool.query("SELECT 1");
    await healthyPool.end();

    dockerCompose("pause");
    const pausedPool = poolFor("app", {
      max: 1,
      connectionTimeoutMillis: 500
    });
    try {
      await expect(pausedPool.query("SELECT 1")).rejects.toThrow();
    } finally {
      dockerCompose("unpause");
      await pausedPool.end();
    }

    const recoveredPool = poolFor("app", {
      max: 1,
      connectionTimeoutMillis: 1_000
    });
    try {
      await expect(
        recoveredPool.query("SELECT 1 AS recovered")
      ).resolves.toMatchObject({
        rows: [{ recovered: 1 }]
      });
    } finally {
      await recoveredPool.end();
    }
  });
});

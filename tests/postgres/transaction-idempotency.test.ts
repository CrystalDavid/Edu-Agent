import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  PostgresGate1BCommandService,
  type PostgresWalkingSkeletonCommand
} from "../../apps/api/src/composition/postgres-gate1b-command-service.js";
import { IdempotencyConflictError } from "../../apps/api/src/platform/errors.js";
import {
  poolFor,
  resetGate1BData,
  tableCount,
  uniqueSuffix
} from "./support/database.js";

const adminPool = poolFor("admin");
const appPool = poolFor("app", {
  max: 6
});
const service = new PostgresGate1BCommandService(appPool);

function command(
  suffix: string,
  body = "用合成数据验证一次函数斜率与图像关系。"
): PostgresWalkingSkeletonCommand {
  return {
    tenantRef: "tenant:demo-school",
    actorRef: "user:teacher-001",
    purpose: "gate1b.postgres-walking-skeleton",
    idempotencyKey: `idempotency:${suffix}`,
    title: "Gate 1B PostgreSQL 验证",
    body
  };
}

beforeEach(async () => {
  await resetGate1BData(adminPool);
});

afterAll(async () => {
  await Promise.all([appPool.end(), adminPool.end()]);
});

describe("real PostgreSQL transaction and idempotency", () => {
  it("rolls back Task + TaskRun + Outbox at a deliberate mid-transaction failure", async () => {
    await expect(
      service.execute(command(uniqueSuffix("atomic")), {
        failPoint: "after-task"
      })
    ).rejects.toThrow("Intentional transaction fail point");

    await expect(tableCount(appPool, "work.task")).resolves.toBe(0);
    await expect(tableCount(appPool, "work.task_run")).resolves.toBe(0);
    await expect(
      tableCount(appPool, "work.outbox_record")
    ).resolves.toBe(0);
    await expect(
      tableCount(appPool, "governance.idempotency_record")
    ).resolves.toBe(0);
    await expect(
      tableCount(appPool, "governance.audit_record")
    ).resolves.toBe(0);
  });

  it("commits its business records and Outbox together", async () => {
    const result = await service.execute(
      command(uniqueSuffix("outbox-consistency"))
    );

    expect(result.replayed).toBe(false);
    await expect(tableCount(appPool, "work.task")).resolves.toBe(1);
    await expect(tableCount(appPool, "work.task_run")).resolves.toBe(1);
    await expect(
      tableCount(appPool, "work.outbox_record")
    ).resolves.toBe(1);
    await expect(
      tableCount(appPool, "artifact.outbox_record")
    ).resolves.toBe(1);
  });

  it("serializes two identical concurrent Commands to one result", async () => {
    const input = command(uniqueSuffix("concurrent"));
    const results = await Promise.all([
      service.execute(input),
      service.execute(input)
    ]);

    expect(results.map((result) => result.replayed).sort()).toEqual([
      false,
      true
    ]);
    expect(new Set(results.map((result) => result.taskRef)).size).toBe(1);
    expect(
      new Set(results.map((result) => result.artifactRef)).size
    ).toBe(1);
    expect(
      new Set(results.map((result) => result.toolExecutionRef)).size
    ).toBe(1);

    await expect(tableCount(appPool, "work.task")).resolves.toBe(1);
    await expect(
      tableCount(appPool, "artifact.artifact")
    ).resolves.toBe(1);
    await expect(
      tableCount(appPool, "capability.tool_execution")
    ).resolves.toBe(1);
    await expect(
      tableCount(appPool, "governance.idempotency_record")
    ).resolves.toBe(1);
  });

  it("fails closed when one key is reused for a different payload", async () => {
    const suffix = uniqueSuffix("collision");
    await service.execute(command(suffix, "first payload"));

    await expect(
      service.execute(command(suffix, "different payload"))
    ).rejects.toBeInstanceOf(IdempotencyConflictError);

    await expect(tableCount(appPool, "work.task")).resolves.toBe(1);
    await expect(
      tableCount(appPool, "artifact.artifact")
    ).resolves.toBe(1);
    await expect(
      tableCount(appPool, "capability.tool_execution")
    ).resolves.toBe(1);
  });

  it("replay never duplicates Task, Artifact, ToolExecution or Audit", async () => {
    const input = command(uniqueSuffix("replay"));
    const first = await service.execute(input);
    const auditCount = await tableCount(
      appPool,
      "governance.audit_record"
    );
    const replay = await service.execute(input);

    expect(replay).toMatchObject({
      ...first,
      replayed: true
    });
    await expect(tableCount(appPool, "work.task")).resolves.toBe(1);
    await expect(
      tableCount(appPool, "artifact.artifact")
    ).resolves.toBe(1);
    await expect(
      tableCount(appPool, "capability.tool_execution")
    ).resolves.toBe(1);
    await expect(
      tableCount(appPool, "governance.audit_record")
    ).resolves.toBe(auditCount);
  });
});

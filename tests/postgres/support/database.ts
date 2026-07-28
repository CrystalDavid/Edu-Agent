import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

import {
  readPostgresEnvironment
} from "../../../apps/api/src/platform/postgres/config.js";
import {
  createRolePool,
  type Pool,
  type PostgresRole
} from "../../../apps/api/src/platform/postgres/pool.js";

export const postgresEnvironment = readPostgresEnvironment();

export function poolFor(
  role: PostgresRole,
  overrides: Parameters<typeof createRolePool>[2] = {}
): Pool {
  return createRolePool(postgresEnvironment, role, overrides);
}

export function uniqueSuffix(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export async function resetGate1BData(
  adminPool: Pool
): Promise<void> {
  await adminPool.query(`
    TRUNCATE TABLE
      governance.audit_record,
      governance.idempotency_record,
      governance.authorization_decision,
      work.outbox_consumer_effect,
      work.suggestion_disposition,
      work.task_result,
      work.resolved_learning_interaction_contract,
      work.outbox_record,
      work.idempotency_record,
      work.query_run,
      work.task_run,
      work.task,
      work.goal_record,
      work.case_record,
      runtime.context_manifest,
      runtime.run_manifest,
      runtime.outbox_record,
      runtime.agent_run,
      capability.outbox_record,
      capability.model_execution,
      capability.tool_execution,
      education.evidence_claim_observation,
      education.evidence_claim,
      education.evidence_observation,
      education.attempt,
      education.learning_interaction_profile,
      education.teaching_plan_alignment,
      education.outbox_record,
      education.learning_objective,
      education.course_run,
      artifact.outbox_record,
      artifact.artifact_revision,
      artifact.artifact
    RESTART IDENTITY CASCADE
  `);
}

export async function tableCount(
  pool: Pool,
  qualifiedTable: string
): Promise<number> {
  if (
    !/^(governance|work|runtime|capability|artifact|education)\.[a-z_]+$/.test(
      qualifiedTable
    )
  ) {
    throw new Error("Unsafe test table name.");
  }
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${qualifiedTable}`
  );
  return Number(result.rows[0]?.count ?? 0);
}

export function dockerCompose(
  action: "pause" | "unpause",
  service = "postgres"
): void {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      "infra/docker/.env.local",
      "-f",
      "infra/docker/compose.postgres.yml",
      action,
      service
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      windowsHide: true
    }
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `docker compose ${action} failed without exposing credentials.`
    );
  }
}

export function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

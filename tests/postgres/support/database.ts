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
      artifact.teaching_plan_file_export,
      artifact.artifact_file_binding,
      artifact.file_operation_idempotency,
      artifact.file_version,
      artifact.file_asset,
      artifact.teaching_plan_scope_event,
      artifact.teaching_plan_scope_lifecycle,
      runtime.authorized_context_plan,
      work.calendar_event_status_history,
      work.teacher_todo_status_history,
      work.teacher_work_preference,
      work.teacher_work_projection,
      work.todo_calendar_link,
      work.calendar_event,
      work.teacher_todo_resource_link,
      work.teacher_todo,
      work.preparation_status_history,
      work.task_working_set_revision,
      work.task_working_set,
      work.assignment_grading_task_details,
      work.lesson_preparation_task_details,
      education.assignment_evidence_source,
      education.teacher_item_grade,
      education.teacher_grade_decision,
      education.item_response,
      education.submission_attempt_details,
      education.submission,
      education.assignment_objective_link,
      education.assignment_item,
      education.assignment_version,
      education.assignment,
      education.course_run_enrollment,
      education.lesson_teaching_plan_binding,
      education.lesson_evidence_link,
      education.lesson_learning_objective_link,
      education.lesson,
      education.curriculum_unit,
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
  const projectName = process.env.COMPOSE_PROJECT_NAME;
  const volumeName = process.env.POSTGRES_VOLUME_NAME;
  if (
    !projectName?.startsWith("edu-agent-e2e-") ||
    !volumeName?.startsWith(`${projectName}-`)
  ) {
    throw new Error(
      "PostgreSQL tests may only control their isolated E2E Compose project."
    );
  }
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--project-name",
      projectName,
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

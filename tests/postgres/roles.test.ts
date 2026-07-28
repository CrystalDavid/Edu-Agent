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
  uniqueSuffix
} from "./support/database.js";

const adminPool = poolFor("admin");
const appPool = poolFor("app");
const runtimePool = poolFor("runtime");
const workerPool = poolFor("worker");

beforeEach(async () => {
  await resetGate1BData(adminPool);
});

afterAll(async () => {
  await Promise.all([
    workerPool.end(),
    runtimePool.end(),
    appPool.end(),
    adminPool.end()
  ]);
});

async function expectPermissionDenied(
  query: Promise<unknown>
): Promise<void> {
  try {
    await query;
    throw new Error("Expected PostgreSQL to deny the operation.");
  } catch (error) {
    expect(error).toMatchObject({
      code: "42501"
    });
  }
}

describe("real PostgreSQL role isolation", () => {
  it("creates seven Schemas and non-superuser login roles", async () => {
    const schemas = await appPool.query<{ schema_name: string }>(
      `SELECT schema_name
         FROM information_schema.schemata
        WHERE schema_name = ANY($1::text[])
        ORDER BY schema_name`,
      [[
        "governance",
        "work",
        "runtime",
        "capability",
        "artifact",
        "education",
        "personalization"
      ]]
    );
    expect(schemas.rows.map((row) => row.schema_name)).toEqual([
      "artifact",
      "capability",
      "education",
      "governance",
      "personalization",
      "runtime",
      "work"
    ]);

    const roles = await adminPool.query<{
      rolname: string;
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
    }>(
      `SELECT rolname, rolsuper, rolcreaterole, rolcreatedb
         FROM pg_roles
        WHERE rolname = ANY($1::text[])
        ORDER BY rolname`,
      [["edu_app", "edu_migrator", "edu_runtime", "edu_worker"]]
    );
    expect(roles.rows).toHaveLength(4);
    for (const role of roles.rows) {
      expect(role).toMatchObject({
        rolsuper: false,
        rolcreaterole: false,
        rolcreatedb: false
      });
    }

    const current = await appPool.query<{ current_user: string }>(
      "SELECT current_user"
    );
    expect(current.rows[0]?.current_user).toBe("edu_app");
  });

  it("assigns each module table to its migration owner", async () => {
    const owners = await adminPool.query<{
      schemaname: string;
      tablename: string;
      tableowner: string;
    }>(
      `SELECT schemaname, tablename, tableowner
         FROM pg_tables
        WHERE schemaname = ANY($1::text[])
          AND tablename <> 'schema_migration'`,
      [[
        "governance",
        "work",
        "runtime",
        "capability",
        "artifact",
        "education",
        "personalization"
      ]]
    );
    for (const table of owners.rows) {
      expect(table.tableowner).toBe(
        `edu_owner_${table.schemaname}`
      );
    }
  });

  it("allows Runtime to write its own run table", async () => {
    await runtimePool.query(
      `INSERT INTO runtime.agent_run (
         agent_run_ref,
         run_kind,
         bound_run_ref,
         status,
         model_provider,
         model_profile,
         tool_name,
         output,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, 'TaskRun', $2, 'completed', 'mock', 'mock@1',
         'fake.echo', '{}'::jsonb, $3, $4, 'runtime',
         $5, $6, $7, now()
       )`,
      [
        `agent-run:${uniqueSuffix("role")}`,
        "task-run:role-probe",
        "user:teacher-001",
        "gate1b.role-probe",
        `idempotency:${uniqueSuffix("runtime")}`,
        "authorization-decision:role-probe",
        `audit:${uniqueSuffix("runtime")}`
      ]
    );
  });

  it.each([
    {
      schema: "governance",
      insert: `INSERT INTO governance.authorization_decision (
        decision_ref, tenant_ref, action, resource_ref, effect,
        reason_codes, policy_version, requested_field_mask, decided_at,
        actor_ref, purpose, owner_module, idempotency_key,
        authorization_decision_ref, audit_ref, created_at
      ) VALUES (
        'forbidden', 'tenant', 'write', 'resource', 'allow',
        '[]', 'policy', '[]', now(), 'actor', 'purpose',
        'governance', 'forbidden-key', 'forbidden', 'audit', now()
      )`,
      update:
        "UPDATE governance.authorization_decision SET effect = 'deny'",
      delete: "DELETE FROM governance.authorization_decision"
    },
    {
      schema: "education",
      insert: `INSERT INTO education.course_run (
        course_run_ref, tenant_ref, curriculum_framework_ref, subject,
        grade_level, academic_term, actor_ref, purpose, owner_module,
        idempotency_key, authorization_decision_ref, audit_ref, created_at
      ) VALUES (
        'forbidden', 'tenant', 'curriculum', 'math', '8', 'term',
        'actor', 'purpose', 'education', 'forbidden-key',
        'forbidden', 'audit', now()
      )`,
      update: "UPDATE education.course_run SET subject = 'forbidden'",
      delete: "DELETE FROM education.course_run"
    },
    {
      schema: "personalization",
      insert: `INSERT INTO personalization.schema_migration (
        migration_name, content_sha256
      ) VALUES ('forbidden', 'forbidden')`,
      update:
        "UPDATE personalization.schema_migration SET content_sha256 = 'forbidden'",
      delete: "DELETE FROM personalization.schema_migration"
    }
  ])(
    "denies Runtime INSERT/UPDATE/DELETE in $schema",
    async ({ insert, update, delete: remove }) => {
      await expectPermissionDenied(runtimePool.query(insert));
      await expectPermissionDenied(runtimePool.query(update));
      await expectPermissionDenied(runtimePool.query(remove));
    }
  );

  it("limits Worker to Outbox processing data", async () => {
    const commandService = new PostgresGate1BCommandService(appPool);
    await commandService.execute({
      tenantRef: "tenant:demo-school",
      actorRef: "user:teacher-001",
      purpose: "gate1b.worker-role",
      idempotencyKey: `idempotency:${uniqueSuffix("worker-role")}`,
      title: "Worker role probe",
      body: "Synthetic"
    });
    const worker = new PostgresOutboxWorker(
      workerPool,
      "worker:role-probe",
      "consumer:role-probe"
    );
    const claimed = await worker.claimOne();
    expect(claimed).toBeDefined();

    await expectPermissionDenied(
      workerPool.query(
        `INSERT INTO work.task (
           task_ref, title, status, actor_ref, purpose, owner_module,
           idempotency_key, authorization_decision_ref, audit_ref,
           created_at
         ) VALUES (
           'forbidden', 'forbidden', 'created', 'actor', 'purpose',
           'work', 'forbidden-key', 'forbidden', 'audit', now()
         )`
      )
    );
  });
});

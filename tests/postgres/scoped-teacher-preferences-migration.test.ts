import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  moduleMigrations
} from "../../apps/api/src/database/migrations.js";
import {
  createMemoryScope
} from "../../apps/api/src/modules/personalization-memory-analytics/domain/index.js";
import {
  postgresUrls
} from "../../apps/api/src/platform/postgres/config.js";
import {
  Pool
} from "../../apps/api/src/platform/postgres/pool.js";
import {
  poolFor,
  postgresEnvironment
} from "./support/database.js";

const adminPool = poolFor("admin");
const workspaceRoot = resolve(import.meta.dirname, "../..");
const scopeMigration = moduleMigrations.find((migration) =>
  migration.relativePath.endsWith(
    "0004_teacher_preference_scope_and_epoch.sql"
  )
)!;
const baselineMigrations = moduleMigrations.filter(
  (migration) =>
    migration !== scopeMigration &&
    !migration.relativePath.endsWith(
      "0013_explicit_memory_command_turn.sql"
    )
);

afterAll(async () => {
  await adminPool.end();
});

describe("scoped TeacherPreference PostgreSQL migration", () => {
  it("upgrades a real 49-migration database to 50 without losing legacy semantics", async () => {
    expect(moduleMigrations).toHaveLength(51);
    expect(baselineMigrations).toHaveLength(49);
    expect(scopeMigration.relativePath).toMatch(
      /0004_teacher_preference_scope_and_epoch\.sql$/u
    );

    const databaseName = temporaryDatabaseName();
    await adminPool.query(`CREATE DATABASE ${databaseName}`);
    const upgradePool = new Pool({
      connectionString: databaseUrl(databaseName),
      max: 1,
      connectionTimeoutMillis: 5_000
    });
    try {
      for (const migration of baselineMigrations) {
        await applyMigration(upgradePool, migration);
      }
      expect(await migrationCount(upgradePool)).toBe(49);

      const confirmedAt = "2026-08-19T08:00:00.000Z";
      await insertLegacyPreference(upgradePool, confirmedAt);
      await applyMigration(upgradePool, scopeMigration);
      expect(await migrationCount(upgradePool)).toBe(50);

      const globalScope = createMemoryScope({
        kind: "global",
        subject: null,
        gradeLevel: null,
        courseRunRef: null,
        lessonRef: null,
        taskRef: null,
        skillIds: []
      });
      const rows = await upgradePool.query<{
        source_kind: string;
        canonical_key: string;
        scope_kind: string;
        scope_subject: string | null;
        scope_grade_level: string | null;
        scope_course_run_ref: string | null;
        scope_lesson_ref: string | null;
        scope_task_ref: string | null;
        scope_skill_ids: unknown;
        scope_fingerprint: string;
        valid_from: Date;
        valid_until: Date | null;
        explicitness: string;
        consent_basis: string;
        consent_version: string;
        policy_version: string;
      }>(
        `SELECT 'current' AS source_kind, canonical_key, scope_kind,
                scope_subject, scope_grade_level, scope_course_run_ref,
                scope_lesson_ref, scope_task_ref, scope_skill_ids,
                scope_fingerprint, valid_from, valid_until, explicitness,
                consent_basis, consent_version, policy_version
           FROM personalization.teacher_preference
          WHERE preference_ref = 'teacher-preference:legacy-synthetic'
         UNION ALL
         SELECT 'revision' AS source_kind, canonical_key, scope_kind,
                scope_subject, scope_grade_level, scope_course_run_ref,
                scope_lesson_ref, scope_task_ref, scope_skill_ids,
                scope_fingerprint, valid_from, valid_until, explicitness,
                consent_basis, consent_version, policy_version
           FROM personalization.teacher_preference_revision
          WHERE preference_ref = 'teacher-preference:legacy-synthetic'
          ORDER BY source_kind`,
        []
      );
      expect(rows.rows).toHaveLength(2);
      for (const row of rows.rows) {
        expect(row).toMatchObject({
          canonical_key: "lesson_plan_detail",
          scope_kind: "global",
          scope_subject: null,
          scope_grade_level: null,
          scope_course_run_ref: null,
          scope_lesson_ref: null,
          scope_task_ref: null,
          scope_skill_ids: [],
          scope_fingerprint: globalScope.fingerprint,
          valid_until: null,
          explicitness: "teacher_declared",
          consent_basis: "teacher_settings_confirmed",
          consent_version: "consent:teacher-settings@1",
          policy_version: "teacher-preference-scope@1"
        });
        expect(row.valid_from.toISOString()).toBe(confirmedAt);
      }

      const epoch = await upgradePool.query<{
        memory_epoch: string;
        policy_version: string;
      }>(
        `SELECT memory_epoch::text, policy_version
           FROM personalization.teacher_memory_state
          WHERE tenant_ref = 'tenant:legacy-synthetic'
            AND teacher_ref = 'teacher:legacy-synthetic'`,
        []
      );
      expect(epoch.rows).toEqual([{
        memory_epoch: "1",
        policy_version: "teacher-memory-epoch@1"
      }]);

      const index = await upgradePool.query<{
        indexdef: string;
      }>(
        `SELECT indexdef
           FROM pg_indexes
          WHERE schemaname = 'personalization'
            AND indexname = 'teacher_preference_active_scope_key_unique'`,
        []
      );
      expect(index.rows[0]?.indexdef).toContain(
        "tenant_ref, teacher_ref, canonical_key, scope_fingerprint"
      );
      expect(index.rows[0]?.indexdef).toContain(
        "WHERE (preference_status = 'active'::text)"
      );

      const crossSchemaForeignKeys = await upgradePool.query<{
        count: string;
      }>(
        `SELECT count(*)::text AS count
           FROM pg_constraint AS constraint_record
           JOIN pg_class AS source_table
             ON source_table.oid = constraint_record.conrelid
           JOIN pg_namespace AS source_schema
             ON source_schema.oid = source_table.relnamespace
           JOIN pg_class AS target_table
             ON target_table.oid = constraint_record.confrelid
           JOIN pg_namespace AS target_schema
             ON target_schema.oid = target_table.relnamespace
          WHERE constraint_record.contype = 'f'
            AND source_schema.nspname = 'personalization'
            AND target_schema.nspname <> 'personalization'`,
        []
      );
      expect(crossSchemaForeignKeys.rows[0]?.count).toBe("0");
    } finally {
      await upgradePool.end();
      await adminPool.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
    }
  }, 60_000);
});

async function applyMigration(
  pool: Pool,
  migration: (typeof moduleMigrations)[number]
): Promise<void> {
  const owner = migration.owner;
  if (!/^[a-z]+$/u.test(owner)) {
    throw new Error("Unsafe synthetic migration owner.");
  }
  const sql = await readFile(
    resolve(workspaceRoot, migration.relativePath),
    "utf8"
  );
  const name = basename(migration.relativePath);
  const hash = createHash("sha256").update(sql).digest("hex");
  await pool.query("BEGIN");
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${owner}`);
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${owner}.schema_migration (
         migration_name text PRIMARY KEY,
         content_sha256 text NOT NULL,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`
    );
    await pool.query(sql);
    await pool.query(
      `INSERT INTO ${owner}.schema_migration (
         migration_name, content_sha256
       ) VALUES ($1, $2)`,
      [name, hash]
    );
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function migrationCount(pool: Pool): Promise<number> {
  const schemas = [...new Set(moduleMigrations.map((entry) => entry.owner))];
  let count = 0;
  for (const schema of schemas) {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${schema}.schema_migration`,
      []
    );
    count += Number(result.rows[0]?.count ?? 0);
  }
  return count;
}

async function insertLegacyPreference(
  pool: Pool,
  confirmedAt: string
): Promise<void> {
  await pool.query(
    `INSERT INTO personalization.memory_candidate (
       candidate_ref, tenant_ref, teacher_ref, candidate_type, content,
       sources, confidence, proposed_by, created_by_ref, candidate_status,
       current_version, content_hash, created_at, updated_at, expires_at,
       confirmed_at, actor_ref, purpose, owner_module, idempotency_key,
       authorization_decision_ref, audit_ref
     ) VALUES (
       'memory-candidate:legacy-synthetic', 'tenant:legacy-synthetic',
       'teacher:legacy-synthetic', 'preference',
       '{"summary":"Synthetic legacy preference"}'::jsonb, '[]'::jsonb,
       1, 'teacher', 'teacher:legacy-synthetic', 'confirmed', 2,
       $1, $2::timestamptz, $2::timestamptz,
       '2026-12-01T00:00:00.000Z'::timestamptz, $2::timestamptz,
       'teacher:legacy-synthetic', 'synthetic.migration-upgrade',
       'personalization', 'idempotency:legacy-candidate',
       'authorization-decision:legacy', 'audit:legacy'
     )`,
    ["a".repeat(64), confirmedAt]
  );
  await pool.query(
    `INSERT INTO personalization.teacher_preference (
       preference_ref, tenant_ref, teacher_ref, preference_key,
       preference_value, source_candidate_ref, source_candidate_hash,
       preference_status, current_version, content_hash, confirmed_by_ref,
       confirmed_at, created_at, updated_at, actor_ref, purpose,
       owner_module, idempotency_key, authorization_decision_ref, audit_ref
     ) VALUES (
       'teacher-preference:legacy-synthetic', 'tenant:legacy-synthetic',
       'teacher:legacy-synthetic', ' Lesson_Plan_Detail ', '简洁',
       'memory-candidate:legacy-synthetic', $1, 'active', 1, $2,
       'teacher:legacy-synthetic', $3::timestamptz, $3::timestamptz,
       $3::timestamptz, 'teacher:legacy-synthetic',
       'synthetic.migration-upgrade', 'personalization',
       'idempotency:legacy-preference', 'authorization-decision:legacy',
       'audit:legacy'
     )`,
    ["a".repeat(64), "b".repeat(64), confirmedAt]
  );
  await pool.query(
    `INSERT INTO personalization.teacher_preference_revision (
       preference_ref, version, tenant_ref, teacher_ref, preference_key,
       preference_value, source_candidate_ref, source_candidate_hash,
       preference_status, content_hash, confirmed_by_ref, confirmed_at,
       created_at, updated_at, actor_ref, purpose, owner_module,
       idempotency_key, authorization_decision_ref, audit_ref,
       revision_created_at
     ) VALUES (
       'teacher-preference:legacy-synthetic', 1,
       'tenant:legacy-synthetic', 'teacher:legacy-synthetic',
       ' Lesson_Plan_Detail ', '简洁',
       'memory-candidate:legacy-synthetic', $1, 'active', $2,
       'teacher:legacy-synthetic', $3::timestamptz, $3::timestamptz,
       $3::timestamptz, 'teacher:legacy-synthetic',
       'synthetic.migration-upgrade', 'personalization',
       'idempotency:legacy-preference-revision',
       'authorization-decision:legacy', 'audit:legacy', $3::timestamptz
     )`,
    ["a".repeat(64), "b".repeat(64), confirmedAt]
  );
}

function temporaryDatabaseName(): string {
  const name = `edu_agent_m2a_upgrade_${randomUUID().replaceAll("-", "")}`;
  if (!/^edu_agent_m2a_upgrade_[a-f0-9]{32}$/u.test(name)) {
    throw new Error("Unsafe synthetic PostgreSQL database name.");
  }
  return name;
}

function databaseUrl(databaseName: string): string {
  const url = new URL(postgresUrls(postgresEnvironment).admin);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

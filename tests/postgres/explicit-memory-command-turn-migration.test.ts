import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  moduleMigrations
} from "../../apps/api/src/database/migrations.js";
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
const commandMigration = moduleMigrations.find((migration) =>
  migration.relativePath.endsWith(
    "0013_explicit_memory_command_turn.sql"
  )
)!;
const baselineMigrations = moduleMigrations.filter(
  (migration) => migration !== commandMigration
);

afterAll(async () => {
  await adminPool.end();
});

describe("explicit memory command Turn PostgreSQL migration", () => {
  it("upgrades 50 to 51 while preserving Turns and enforcing actor/content truth", async () => {
    expect(moduleMigrations).toHaveLength(51);
    expect(baselineMigrations).toHaveLength(50);

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
      expect(await migrationCount(upgradePool)).toBe(50);
      await insertConversationFixture(upgradePool);

      const oldConstraint = await constraintDefinition(
        upgradePool,
        "conversation_turn_check"
      );
      expect(oldConstraint).toContain("content_kind = 'teacher_text'::text");
      expect(oldConstraint).toContain(
        "actor_kind = ANY (ARRAY['assistant_surface'::text, 'system_event'::text])"
      );

      await applyMigration(upgradePool, commandMigration);
      expect(await migrationCount(upgradePool)).toBe(51);
      await expect(
        constraintDefinition(upgradePool, "conversation_turn_check")
      ).resolves.toBeNull();
      const newConstraint = await constraintDefinition(
        upgradePool,
        "conversation_turn_actor_content_check"
      );
      expect(newConstraint).toContain(
        "content_kind = ANY (ARRAY['teacher_text'::text, 'command'::text])"
      );
      expect(newConstraint).toContain(
        "content_kind = ANY (ARRAY['safe_surface_summary'::text, 'command'::text, 'result_link'::text])"
      );
      expect(newConstraint).toContain(
        "content_kind = ANY (ARRAY['safe_surface_summary'::text, 'result_link'::text])"
      );
      const resultRefsConstraint = await constraintDefinition(
        upgradePool,
        "conversation_turn_memory_result_refs_check"
      );
      expect(resultRefsConstraint).toContain(
        "cardinality(memory_candidate_refs)"
      );
      expect(resultRefsConstraint).toContain(
        "content_kind = ANY (ARRAY['command'::text, 'result_link'::text])"
      );

      const historical = await upgradePool.query<{
        turn_ref: string;
        actor_kind: string;
        content_kind: string;
        memory_candidate_refs: string[];
        teacher_preference_refs: string[];
      }>(
        `SELECT turn_ref, actor_kind, content_kind,
                memory_candidate_refs, teacher_preference_refs
           FROM work.conversation_turn
          ORDER BY sequence`,
        []
      );
      expect(historical.rows).toEqual([
        {
          turn_ref: "turn:upgrade:teacher",
          actor_kind: "teacher",
          content_kind: "teacher_text",
          memory_candidate_refs: [],
          teacher_preference_refs: []
        },
        {
          turn_ref: "turn:upgrade:result",
          actor_kind: "assistant_surface",
          content_kind: "result_link",
          memory_candidate_refs: [],
          teacher_preference_refs: []
        }
      ]);

      const allowed = [
        ["teacher", "teacher_text", "生成一份合成教案", null],
        ["teacher", "command", "记住以后教案简洁", null],
        [
          "assistant_surface",
          "safe_surface_summary",
          null,
          "合成安全摘要"
        ],
        ["assistant_surface", "command", null, "已记住合成偏好"],
        ["assistant_surface", "result_link", null, "合成结果链接"],
        ["system_event", "safe_surface_summary", null, "合成系统摘要"],
        ["system_event", "result_link", null, "合成系统结果链接"]
      ] as const;
      for (const [index, value] of allowed.entries()) {
        await insertTurn(upgradePool, {
          suffix: `allowed:${index}`,
          sequence: index + 3,
          actorKind: value[0],
          contentKind: value[1],
          teacherText: value[2],
          surfaceSummary: value[3]
        });
      }
      await insertTurn(upgradePool, {
        suffix: "command-result-refs",
        sequence: 15,
        actorKind: "assistant_surface",
        contentKind: "command",
        teacherText: null,
        surfaceSummary: "已记住两条合成偏好",
        memoryCandidateRefs: ["memory-candidate:one", "memory-candidate:two"],
        teacherPreferenceRefs: ["teacher-preference:one"]
      });
      const persistedRefs = await upgradePool.query<{
        memory_candidate_refs: string[];
        teacher_preference_refs: string[];
      }>(
        `SELECT memory_candidate_refs, teacher_preference_refs
           FROM work.conversation_turn
          WHERE turn_ref = 'turn:upgrade:command-result-refs'`
      );
      expect(persistedRefs.rows[0]).toEqual({
        memory_candidate_refs: [
          "memory-candidate:one",
          "memory-candidate:two"
        ],
        teacher_preference_refs: ["teacher-preference:one"]
      });
      await expect(insertTurn(upgradePool, {
        suffix: "refs-on-teacher-text",
        sequence: 16,
        actorKind: "teacher",
        contentKind: "teacher_text",
        teacherText: "普通教师要求",
        surfaceSummary: null,
        memoryCandidateRefs: ["memory-candidate:not-allowed"]
      })).rejects.toMatchObject({
        constraint: "conversation_turn_memory_result_refs_check"
      });
      await expect(insertTurn(upgradePool, {
        suffix: "empty-result-ref",
        sequence: 17,
        actorKind: "assistant_surface",
        contentKind: "command",
        teacherText: null,
        surfaceSummary: "非法空引用",
        memoryCandidateRefs: [""]
      })).rejects.toMatchObject({
        constraint: "conversation_turn_memory_result_refs_check"
      });
      await expect(insertTurn(upgradePool, {
        suffix: "too-many-result-refs",
        sequence: 18,
        actorKind: "assistant_surface",
        contentKind: "command",
        teacherText: null,
        surfaceSummary: "非法过量引用",
        memoryCandidateRefs: Array.from(
          { length: 11 },
          (_, index) => `memory-candidate:${index}`
        )
      })).rejects.toMatchObject({
        constraint: "conversation_turn_memory_result_refs_check"
      });

      const rejected = [
        ["assistant_surface", "teacher_text", null, "非法摘要"],
        ["system_event", "command", null, "非法系统命令"],
        ["teacher", "safe_surface_summary", "非法教师摘要", null],
        ["teacher", "command", null, null],
        ["assistant_surface", "command", null, null],
        ["teacher", "teacher_text", "教师文本", "不应共存的摘要"]
      ] as const;
      for (const [index, value] of rejected.entries()) {
        await expect(insertTurn(upgradePool, {
          suffix: `rejected:${index}`,
          sequence: index + 20,
          actorKind: value[0],
          contentKind: value[1],
          teacherText: value[2],
          surfaceSummary: value[3]
        })).rejects.toMatchObject({
          constraint: "conversation_turn_actor_content_check"
        });
      }

      await expect(
        upgradePool.query(
          `UPDATE work.conversation_turn
              SET surface_summary = '不允许修改'
            WHERE turn_ref = 'turn:upgrade:allowed:3'`
        )
      ).rejects.toThrow(/ConversationTurn is immutable/u);
      await expect(
        upgradePool.query(
          `DELETE FROM work.conversation_turn
            WHERE turn_ref = 'turn:upgrade:allowed:3'`
        )
      ).rejects.toThrow(/ConversationTurn is immutable/u);
      await expect(insertTurn(upgradePool, {
        suffix: "duplicate-sequence",
        sequence: 3,
        actorKind: "teacher",
        contentKind: "teacher_text",
        teacherText: "重复序号",
        surfaceSummary: null
      })).rejects.toMatchObject({
        constraint: "conversation_turn_conversation_ref_sequence_key"
      });
      await expect(insertTurn(upgradePool, {
        suffix: "foreign-conversation",
        sequence: 40,
        conversationRef: "conversation:missing",
        actorKind: "teacher",
        contentKind: "teacher_text",
        teacherText: "不存在的对话",
        surfaceSummary: null
      })).rejects.toMatchObject({
        constraint: "conversation_turn_conversation_ref_fkey"
      });

      const owner = await upgradePool.query<{
        tenant_ref: string;
        teacher_ref: string;
        task_ref: string;
      }>(
        `SELECT tenant_ref, teacher_ref, task_ref
           FROM work.conversation_thread
          WHERE conversation_ref = 'conversation:upgrade'`,
        []
      );
      expect(owner.rows).toEqual([{
        tenant_ref: "tenant:upgrade",
        teacher_ref: "teacher:upgrade",
        task_ref: "task:upgrade"
      }]);
      const resultReferenceColumns = await upgradePool.query<{
        column_name: string;
      }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'work'
            AND table_name = 'conversation_turn'
            AND column_name IN (
              'memory_candidate_refs',
              'teacher_preference_refs'
            )
          ORDER BY column_name`,
        []
      );
      expect(resultReferenceColumns.rows).toEqual([
        { column_name: "memory_candidate_refs" },
        { column_name: "teacher_preference_refs" }
      ]);
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
  let count = 0;
  for (const schema of [
    ...new Set(moduleMigrations.map((entry) => entry.owner))
  ]) {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${schema}.schema_migration`,
      []
    );
    count += Number(result.rows[0]?.count ?? 0);
  }
  return count;
}

async function constraintDefinition(
  pool: Pool,
  constraintName: string
): Promise<string | null> {
  const result = await pool.query<{ definition: string }>(
    `SELECT pg_get_constraintdef(constraint_record.oid) AS definition
       FROM pg_constraint AS constraint_record
       JOIN pg_class AS table_record
         ON table_record.oid = constraint_record.conrelid
       JOIN pg_namespace AS schema_record
         ON schema_record.oid = table_record.relnamespace
      WHERE schema_record.nspname = 'work'
        AND table_record.relname = 'conversation_turn'
        AND constraint_record.conname = $1`,
    [constraintName]
  );
  return result.rows[0]?.definition ?? null;
}

async function insertConversationFixture(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO work.task (
       task_ref, title, status, actor_ref, purpose, owner_module,
       idempotency_key, authorization_decision_ref, audit_ref, created_at
     ) VALUES (
       'task:upgrade', 'Synthetic migration task', 'active',
       'teacher:upgrade', 'synthetic.migration-command', 'work',
       'idempotency:upgrade:task', 'decision:upgrade',
       'audit:upgrade:task', '2026-08-21T08:00:00.000Z'
     )`
  );
  await pool.query(
    `INSERT INTO work.conversation_thread (
       conversation_ref, tenant_ref, teacher_ref, task_ref, purpose_family,
       status, course_run_ref, lesson_ref, current_version,
       last_turn_sequence, last_turn_ref, retention_until, policy_version,
       content_hash, updated_at, actor_ref, purpose, owner_module,
       idempotency_key, authorization_decision_ref, audit_ref, created_at
     ) VALUES (
       'conversation:upgrade', 'tenant:upgrade', 'teacher:upgrade',
       'task:upgrade', 'lesson_preparation', 'active',
       'course-run:upgrade', 'lesson:upgrade', 1, 0, NULL,
       '2026-09-21T08:00:00.000Z', 'conversation-retention@1', $1,
       '2026-08-21T08:00:00.000Z', 'teacher:upgrade',
       'synthetic.migration-command', 'work',
       'idempotency:upgrade:conversation', 'decision:upgrade',
       'audit:upgrade:conversation', '2026-08-21T08:00:00.000Z'
     )`,
    ["a".repeat(64)]
  );
  await insertTurn(pool, {
    suffix: "teacher",
    sequence: 1,
    actorKind: "teacher",
    contentKind: "teacher_text",
    teacherText: "生成一份合成教案",
    surfaceSummary: null
  });
  await insertTurn(pool, {
    suffix: "result",
    sequence: 2,
    actorKind: "assistant_surface",
    contentKind: "result_link",
    teacherText: null,
    surfaceSummary: "合成教案建议已生成"
  });
}

async function insertTurn(
  pool: Pool,
  input: {
    suffix: string;
    sequence: number;
    conversationRef?: string;
    actorKind: "teacher" | "assistant_surface" | "system_event";
    contentKind:
      | "teacher_text"
      | "safe_surface_summary"
      | "command"
      | "result_link";
    teacherText: string | null;
    surfaceSummary: string | null;
    memoryCandidateRefs?: string[];
    teacherPreferenceRefs?: string[];
  }
): Promise<void> {
  if (
    input.memoryCandidateRefs === undefined &&
    input.teacherPreferenceRefs === undefined
  ) {
    await pool.query(
      `INSERT INTO work.conversation_turn (
         turn_ref, conversation_ref, sequence, parent_turn_ref,
         actor_kind, content_kind, teacher_text, surface_summary,
         content_hash, actor_ref, purpose, owner_module,
         idempotency_key, authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, NULL, $4, $5, $6, $7, $8,
         'teacher:upgrade', 'synthetic.migration-command', 'work', $9,
         'decision:upgrade', $10, '2026-08-21T08:05:00.000Z'
       )`,
      [
        `turn:upgrade:${input.suffix}`,
        input.conversationRef ?? "conversation:upgrade",
        input.sequence,
        input.actorKind,
        input.contentKind,
        input.teacherText,
        input.surfaceSummary,
        createHash("sha256").update(input.suffix).digest("hex"),
        `idempotency:upgrade:${input.suffix}`,
        `audit:upgrade:${input.suffix}`
      ]
    );
    return;
  }
  await pool.query(
    `INSERT INTO work.conversation_turn (
       turn_ref, conversation_ref, sequence, parent_turn_ref,
       actor_kind, content_kind, teacher_text, surface_summary,
       memory_candidate_refs, teacher_preference_refs, content_hash,
       actor_ref, purpose, owner_module,
       idempotency_key, authorization_decision_ref, audit_ref, created_at
     ) VALUES (
       $1, $2, $3, NULL, $4, $5, $6, $7, $8::text[], $9::text[], $10,
       'teacher:upgrade', 'synthetic.migration-command', 'work', $11,
       'decision:upgrade', $12, '2026-08-21T08:05:00.000Z'
     )`,
    [
      `turn:upgrade:${input.suffix}`,
      input.conversationRef ?? "conversation:upgrade",
      input.sequence,
      input.actorKind,
      input.contentKind,
      input.teacherText,
      input.surfaceSummary,
      input.memoryCandidateRefs ?? [],
      input.teacherPreferenceRefs ?? [],
      createHash("sha256").update(input.suffix).digest("hex"),
      `idempotency:upgrade:${input.suffix}`,
      `audit:upgrade:${input.suffix}`
    ]
  );
}

function temporaryDatabaseName(): string {
  const name = `edu_agent_m2b_upgrade_${randomUUID().replaceAll("-", "")}`;
  if (!/^edu_agent_m2b_upgrade_[a-f0-9]{32}$/u.test(name)) {
    throw new Error("Unsafe synthetic PostgreSQL database name.");
  }
  return name;
}

function databaseUrl(databaseName: string): string {
  const url = new URL(postgresUrls(postgresEnvironment).admin);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

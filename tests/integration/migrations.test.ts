import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import type { FormalWriteMetadata } from "@edu-agent/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { moduleMigrations } from "../../apps/api/src/database/migrations.js";
import {
  confirmMemoryCandidate,
  createMemoryCandidate,
  revokeTeacherPreference,
  updateTeacherPreference,
  updateTeacherPreferenceScope
} from "../../apps/api/src/modules/personalization-memory-analytics/domain/index.js";
import {
  PostgresMemoryCandidateRepository
} from "../../apps/api/src/modules/personalization-memory-analytics/infrastructure/postgres-memory-candidate-repository.js";
import type {
  SqlExecutor
} from "../../apps/api/src/platform/postgres/types.js";

const databases: PGlite[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("PostgreSQL module migrations", () => {
  it("registers exactly 51 forward-only migrations", () => {
    expect(moduleMigrations).toHaveLength(51);
    expect(moduleMigrations).toContainEqual({
      owner: "work",
      relativePath:
        "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0013_explicit_memory_command_turn.sql"
    });
  });

  it("upgrades the 50-migration Conversation schema without changing historical Turns", async () => {
    const database = new PGlite();
    databases.push(database);
    const commandMigration = moduleMigrations.find((migration) =>
      migration.relativePath.endsWith(
        "0013_explicit_memory_command_turn.sql"
      )
    );
    expect(commandMigration).toBeTruthy();
    for (const migration of moduleMigrations.filter(
      (entry) => entry !== commandMigration
    )) {
      await database.exec(readFileSync(
        resolve(import.meta.dirname, "../..", migration.relativePath),
        "utf8"
      ));
    }
    await insertSyntheticConversationFixture(database);

    await database.exec(readFileSync(
      resolve(
        import.meta.dirname,
        "../..",
        commandMigration!.relativePath
      ),
      "utf8"
    ));

    const historical = await database.query<{
      turn_ref: string;
      actor_kind: string;
      content_kind: string;
    }>(
      `SELECT turn_ref, actor_kind, content_kind
         FROM work.conversation_turn
        ORDER BY sequence`,
      []
    );
    expect(historical.rows).toEqual([
      {
        turn_ref: "turn:migration:teacher",
        actor_kind: "teacher",
        content_kind: "teacher_text"
      },
      {
        turn_ref: "turn:migration:result",
        actor_kind: "assistant_surface",
        content_kind: "result_link"
      }
    ]);
    await database.query(
      `INSERT INTO work.conversation_turn (
         turn_ref, conversation_ref, sequence, parent_turn_ref,
         actor_kind, content_kind, teacher_text, surface_summary,
         content_hash, actor_ref, purpose, owner_module,
         idempotency_key, authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         'turn:migration:command', 'conversation:migration', 3,
         'turn:migration:result', 'teacher', 'command', '记住以后教案简洁',
         NULL, $1, 'teacher:migration', 'synthetic.migration-command',
         'work', 'idempotency:migration:command', 'decision:migration',
         'audit:migration:command', '2026-08-21T08:02:00.000Z'
       )`,
      ["c".repeat(64)]
    );
    await database.query(
      `INSERT INTO work.conversation_turn (
         turn_ref, conversation_ref, sequence, parent_turn_ref,
         actor_kind, content_kind, teacher_text, surface_summary,
         content_hash, actor_ref, purpose, owner_module,
         idempotency_key, authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         'turn:migration:receipt', 'conversation:migration', 4,
         'turn:migration:command', 'assistant_surface', 'command', NULL,
         '已记住：教案详细程度为简洁。', $1, 'teacher:migration',
         'synthetic.migration-command', 'work',
         'idempotency:migration:receipt', 'decision:migration',
         'audit:migration:receipt', '2026-08-21T08:03:00.000Z'
       )`,
      ["d".repeat(64)]
    );
  });

  it("creates seven Schemas and the Gate 1A tables", async () => {
    const database = new PGlite();
    databases.push(database);

    for (const migration of moduleMigrations) {
      const sql = readFileSync(
        resolve(import.meta.dirname, "../..", migration.relativePath),
        "utf8"
      );
      await database.exec(sql);
    }

    const schemaRows = await database.query<{ schema_name: string }>(
      `SELECT schema_name
         FROM information_schema.schemata
        WHERE schema_name IN (
          'governance',
          'work',
          'runtime',
          'capability',
          'artifact',
          'education',
          'personalization'
        )
        ORDER BY schema_name`,
      []
    );
    expect(schemaRows.rows.map((row) => row.schema_name)).toEqual([
      "artifact",
      "capability",
      "education",
      "governance",
      "personalization",
      "runtime",
      "work"
    ]);

    const tableRows = await database.query<{
      table_schema: string;
      table_name: string;
    }>(
      `SELECT table_schema, table_name
         FROM information_schema.tables
        WHERE table_schema IN (
          'governance',
          'work',
          'runtime',
          'capability',
          'artifact',
          'education'
        )
        ORDER BY table_schema, table_name`,
      []
    );
    expect(
      tableRows.rows.map(
        (row) => `${row.table_schema}.${row.table_name}`
      )
    ).toEqual(
      expect.arrayContaining([
        "governance.authorization_decision",
        "governance.audit_record",
        "governance.idempotency_record",
        "work.task",
        "work.task_run",
        "work.query_run",
        "work.idempotency_record",
        "work.outbox_record",
        "work.outbox_consumer_effect",
        "work.resolved_learning_interaction_contract",
        "work.lesson_preparation_task_details",
        "work.task_working_set",
        "work.task_working_set_revision",
        "work.preparation_status_history",
        "runtime.agent_run",
        "runtime.run_manifest",
        "runtime.outbox_record",
        "runtime.authorized_context_plan",
        "capability.tool_execution",
        "capability.outbox_record",
        "artifact.artifact",
        "artifact.artifact_revision",
        "artifact.outbox_record",
        "artifact.teaching_plan_scope_lifecycle",
        "artifact.teaching_plan_scope_event",
        "education.course_run",
        "education.curriculum_unit",
        "education.lesson",
        "education.lesson_learning_objective_link",
        "education.lesson_evidence_link",
        "education.lesson_teaching_plan_binding",
        "education.learning_objective",
        "education.learning_interaction_profile",
        "education.attempt",
        "education.evidence_observation",
        "education.evidence_claim",
        "education.evidence_claim_observation",
        "education.teaching_plan_alignment",
        "education.outbox_record"
      ])
    );

    const evidenceProjection = await database.query<{
      table_name: string;
      table_type: string;
    }>(
      `SELECT table_name, table_type
         FROM information_schema.tables
        WHERE table_schema = 'education'
          AND table_name IN (
            'learning_evidence',
            'learning_evidence_view'
          )
        ORDER BY table_name`,
      []
    );
    expect(evidenceProjection.rows).toEqual([
      {
        table_name: "learning_evidence_view",
        table_type: "VIEW"
      }
    ]);
  });

  it("backfills existing TeacherPreference rows as valid global scope", async () => {
    const database = new PGlite();
    databases.push(database);
    const scopeMigration = moduleMigrations.find((migration) =>
      migration.relativePath.endsWith(
        "0004_teacher_preference_scope_and_epoch.sql"
      )
    );
    expect(scopeMigration).toBeTruthy();
    for (const migration of moduleMigrations.filter((entry) =>
      entry !== scopeMigration
    )) {
      await database.exec(readFileSync(
        resolve(import.meta.dirname, "../..", migration.relativePath),
        "utf8"
      ));
    }
    const timestamp = "2026-08-19T08:00:00.000Z";
    await database.query(
      `INSERT INTO personalization.memory_candidate (
         candidate_ref, tenant_ref, teacher_ref, candidate_type, content,
         sources, confidence, proposed_by, created_by_ref, candidate_status,
         current_version, content_hash, created_at, updated_at, expires_at,
         confirmed_at, actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref
       ) VALUES (
         'candidate:legacy', 'tenant:synthetic', 'teacher:synthetic',
         'preference', '{"summary":"synthetic"}'::jsonb,
         '[]'::jsonb, 1, 'teacher', 'teacher:synthetic', 'confirmed', 2,
         $1, $2::timestamptz, $2::timestamptz,
         '2026-12-01T00:00:00.000Z'::timestamptz, $2::timestamptz,
         'teacher:synthetic', 'synthetic.migration-test', 'personalization',
         'idempotency:candidate:legacy', 'decision:legacy', 'audit:legacy'
       )`,
      ["a".repeat(64), timestamp]
    );
    await database.query(
      `INSERT INTO personalization.teacher_preference (
         preference_ref, tenant_ref, teacher_ref, preference_key,
         preference_value, source_candidate_ref, source_candidate_hash,
         preference_status, current_version, content_hash, confirmed_by_ref,
         confirmed_at, created_at, updated_at, actor_ref, purpose,
         owner_module, idempotency_key, authorization_decision_ref, audit_ref
       ) VALUES (
         'preference:legacy', 'tenant:synthetic', 'teacher:synthetic',
         'Lesson_Plan_Detail', '简洁', 'candidate:legacy', $1, 'active', 1,
         $2, 'teacher:synthetic', $3::timestamptz, $3::timestamptz,
         $3::timestamptz, 'teacher:synthetic', 'synthetic.migration-test',
         'personalization', 'idempotency:preference:legacy',
         'decision:legacy', 'audit:legacy'
       )`,
      ["a".repeat(64), "b".repeat(64), timestamp]
    );
    await database.query(
      `INSERT INTO personalization.teacher_preference_revision (
         preference_ref, version, tenant_ref, teacher_ref, preference_key,
         preference_value, source_candidate_ref, source_candidate_hash,
         preference_status, content_hash, confirmed_by_ref, confirmed_at,
         created_at, updated_at, actor_ref, purpose, owner_module,
         idempotency_key, authorization_decision_ref, audit_ref,
         revision_created_at
       ) VALUES (
         'preference:legacy', 1, 'tenant:synthetic', 'teacher:synthetic',
         'Lesson_Plan_Detail', '简洁', 'candidate:legacy', $1, 'active', $2,
         'teacher:synthetic', $3::timestamptz, $3::timestamptz,
         $3::timestamptz, 'teacher:synthetic', 'synthetic.migration-test',
         'personalization', 'idempotency:preference-revision:legacy',
         'decision:legacy', 'audit:legacy', $3::timestamptz
       )`,
      ["a".repeat(64), "b".repeat(64), timestamp]
    );
    await database.exec(readFileSync(
      resolve(import.meta.dirname, "../..", scopeMigration!.relativePath),
      "utf8"
    ));
    const result = await database.query<{
      canonical_key: string;
      scope_kind: string;
      scope_fingerprint: string;
      valid_from: Date | string;
      memory_epoch: string | number;
      content_hash: string;
    }>(
      `SELECT preference.canonical_key, preference.scope_kind,
              preference.scope_fingerprint, preference.valid_from,
              state.memory_epoch, preference.content_hash
         FROM personalization.teacher_preference AS preference
         JOIN personalization.teacher_memory_state AS state
           ON state.tenant_ref = preference.tenant_ref
          AND state.teacher_ref = preference.teacher_ref
        WHERE preference.preference_ref = 'preference:legacy'`,
      []
    );
    expect(result.rows[0]).toMatchObject({
      canonical_key: "lesson_plan_detail",
      scope_kind: "global",
      scope_fingerprint:
        "9236aceb0f398f41960671056c4c44d8de8de8169ba34dddd251fc885cad8a2b",
      memory_epoch: 1,
      content_hash: "b".repeat(64)
    });
    expect(new Date(result.rows[0]!.valid_from).toISOString()).toBe(timestamp);
  });

  it("persists scoped revisions and increments memoryEpoch through the PostgreSQL repository", async () => {
    const database = new PGlite();
    databases.push(database);
    for (const migration of moduleMigrations) {
      await database.exec(readFileSync(
        resolve(import.meta.dirname, "../..", migration.relativePath),
        "utf8"
      ));
    }
    const executor = pgliteExecutor(database);
    let writeSequence = 0;
    const repository = new PostgresMemoryCandidateRepository(
      executor,
      (suffix): FormalWriteMetadata => ({
        actorRef: "teacher:repository-synthetic",
        purpose: "synthetic.scoped-preference-repository-test",
        owner: "personalization",
        idempotencyKey: `synthetic:${++writeSequence}:${suffix}`,
        authorizationDecisionRef: "decision:repository-synthetic",
        auditRef: `audit:repository-synthetic:${writeSequence}`,
        createdAt: "2026-08-20T08:00:00.000Z"
      })
    );
    const owner = {
      tenantRef: "tenant:repository-synthetic",
      teacherRef: "teacher:repository-synthetic"
    };
    const candidate = createMemoryCandidate({
      candidateRef: "candidate:repository-synthetic",
      owner,
      type: "preference",
      content: {
        summary: "Synthetic scoped preference repository test.",
        preferenceKey: "lesson_plan_detail",
        preferenceValue: "concise"
      },
      sources: [{
        sourceRef: "teacher-setting:repository-synthetic",
        sourceType: "teacher_request",
        version: "1",
        contentHash: "a".repeat(64),
        provenance: "synthetic-test"
      }],
      confidence: 1,
      proposedBy: "teacher",
      createdByRef: owner.teacherRef,
      createdAt: "2026-08-20T07:00:00.000Z",
      expiresAt: "2026-08-21T07:00:00.000Z"
    });
    await repository.saveCandidate({
      candidate,
      expectedPreviousVersion: null
    });
    const confirmation = confirmMemoryCandidate({
      candidate,
      actorRef: owner.teacherRef,
      expectedVersion: candidate.version,
      confirmedAt: "2026-08-20T07:01:00.000Z",
      preferenceRef: "preference:repository-synthetic"
    });
    await repository.saveConfirmation({
      candidate: confirmation.candidate,
      expectedCandidateVersion: candidate.version,
      preference: confirmation.preference
    });
    expect(await repository.getMemoryEpoch(owner)).toBe(1);

    const scoped = updateTeacherPreferenceScope({
      preference: confirmation.preference!,
      actorRef: owner.teacherRef,
      expectedVersion: 1,
      scope: {
        kind: "course_run",
        subject: null,
        gradeLevel: null,
        courseRunRef: "course-run:repository-synthetic",
        lessonRef: null,
        taskRef: null,
        skillIds: ["lesson-preparation"]
      },
      updatedAt: "2026-08-20T07:02:00.000Z"
    });
    await repository.savePreference({
      preference: scoped,
      expectedPreviousVersion: 1
    });
    const updated = updateTeacherPreference({
      preference: scoped,
      actorRef: owner.teacherRef,
      expectedVersion: 2,
      preferenceValue: "detailed",
      updatedAt: "2026-08-20T07:03:00.000Z"
    });
    await repository.savePreference({
      preference: updated,
      expectedPreviousVersion: 2
    });
    const revoked = revokeTeacherPreference({
      preference: updated,
      actorRef: owner.teacherRef,
      expectedVersion: 3,
      revokedAt: "2026-08-20T07:04:00.000Z"
    });
    await repository.savePreference({
      preference: revoked,
      expectedPreviousVersion: 3
    });

    expect(await repository.getMemoryEpoch(owner)).toBe(4);
    await expect(repository.getPreference(revoked.preferenceRef)).resolves
      .toMatchObject({
        status: "revoked",
        version: 4,
        preferenceValue: "detailed",
        scope: {
          kind: "course_run",
          courseRunRef: "course-run:repository-synthetic",
          skillIds: ["lesson-preparation"]
        }
      });
    await expect(repository.listPreferenceHistory(revoked.preferenceRef))
      .resolves.toHaveLength(4);
  });
});

function pgliteExecutor(database: PGlite): SqlExecutor {
  return {
    async query(text, values = []) {
      const result = await database.query(text, values as never[]);
      return {
        ...result,
        command: "",
        rowCount: result.affectedRows ?? result.rows.length,
        oid: 0,
        fields: []
      } as never;
    }
  };
}

async function insertSyntheticConversationFixture(
  database: PGlite
): Promise<void> {
  await database.query(
    `INSERT INTO work.task (
       task_ref, title, status, actor_ref, purpose, owner_module,
       idempotency_key, authorization_decision_ref, audit_ref, created_at
     ) VALUES (
       'task:migration', 'Synthetic migration task', 'active',
       'teacher:migration', 'synthetic.migration-command', 'work',
       'idempotency:migration:task', 'decision:migration',
       'audit:migration:task', '2026-08-21T08:00:00.000Z'
     )`,
    []
  );
  await database.query(
    `INSERT INTO work.conversation_thread (
       conversation_ref, tenant_ref, teacher_ref, task_ref, purpose_family,
       status, course_run_ref, lesson_ref, current_version,
       last_turn_sequence, last_turn_ref, retention_until, policy_version,
       content_hash, updated_at, actor_ref, purpose, owner_module,
       idempotency_key, authorization_decision_ref, audit_ref, created_at
     ) VALUES (
       'conversation:migration', 'tenant:migration', 'teacher:migration',
       'task:migration', 'lesson_preparation', 'active',
       'course-run:migration', 'lesson:migration', 1, 0, NULL,
       '2026-09-21T08:00:00.000Z', 'conversation-retention@1', $1,
       '2026-08-21T08:00:00.000Z', 'teacher:migration',
       'synthetic.migration-command', 'work',
       'idempotency:migration:conversation', 'decision:migration',
       'audit:migration:conversation', '2026-08-21T08:00:00.000Z'
     )`,
    ["a".repeat(64)]
  );
  await database.query(
    `INSERT INTO work.conversation_turn (
       turn_ref, conversation_ref, sequence, parent_turn_ref,
       actor_kind, content_kind, teacher_text, surface_summary,
       content_hash, actor_ref, purpose, owner_module,
       idempotency_key, authorization_decision_ref, audit_ref, created_at
     ) VALUES
       (
         'turn:migration:teacher', 'conversation:migration', 1, NULL,
         'teacher', 'teacher_text', '生成一份合成教案', NULL, $1,
         'teacher:migration', 'synthetic.migration-command', 'work',
         'idempotency:migration:teacher', 'decision:migration',
         'audit:migration:teacher', '2026-08-21T08:00:00.000Z'
       ),
       (
         'turn:migration:result', 'conversation:migration', 2,
         'turn:migration:teacher', 'assistant_surface', 'result_link', NULL,
         '合成教案建议已生成。', $2, 'teacher:migration',
         'synthetic.migration-command', 'work',
         'idempotency:migration:result', 'decision:migration',
         'audit:migration:result', '2026-08-21T08:01:00.000Z'
       )`,
    ["b".repeat(64), "c".repeat(64)]
  );
}

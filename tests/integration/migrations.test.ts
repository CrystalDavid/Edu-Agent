import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { moduleMigrations } from "../../apps/api/src/database/migrations.js";

const databases: PGlite[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("PostgreSQL module migrations", () => {
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
        "runtime.agent_run",
        "runtime.run_manifest",
        "runtime.outbox_record",
        "capability.tool_execution",
        "capability.outbox_record",
        "artifact.artifact",
        "artifact.artifact_revision",
        "artifact.outbox_record",
        "education.course_run",
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
});

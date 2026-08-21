import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const migrationPath =
  "apps/api/src/modules/work-assistant-durable-execution/" +
  "infrastructure/migrations/0013_explicit_memory_command_turn.sql";

describe("PR-2B explicit memory command Turn migration boundaries", () => {
  it("adds only the Work-owned 0013 migration", () => {
    const migrations = migrationFiles();
    expect(migrations).toHaveLength(51);
    expect(migrations.filter((path) =>
      path.endsWith("0013_explicit_memory_command_turn.sql")
    )).toHaveLength(1);
    expect(source("apps/api/src/database/migrations.ts")).toContain(
      migrationPath
    );
  });

  it("leaves all 50 pre-PR-2B migrations byte-for-byte unchanged", () => {
    const baseline = migrationFiles()
      .filter((path) =>
        !path.endsWith("0013_explicit_memory_command_turn.sql")
      )
      .sort();
    expect(baseline).toHaveLength(50);
    const aggregate = createHash("sha256");
    for (const path of baseline) {
      aggregate.update(relative(root, path).replaceAll("\\", "/"));
      aggregate.update("\0");
      aggregate.update(readFileSync(path));
      aggregate.update("\0");
    }
    expect(aggregate.digest("hex")).toBe(
      "2f299407465fbd6f7ba5aa82eac9ac04db6bed39e58c8d401ecb6acead3cb26a"
    );
  });

  it("replaces the exact old CHECK with one fixed actor/content CHECK", () => {
    const migration = source(migrationPath);
    expect(migration).toContain(
      "DROP CONSTRAINT conversation_turn_check"
    );
    expect(migration).toContain(
      "ADD CONSTRAINT conversation_turn_actor_content_check CHECK"
    );
    expect(migration).toContain(
      "content_kind IN ('teacher_text', 'command')"
    );
    expect(migration).toContain(
      "content_kind IN ('safe_surface_summary', 'result_link')"
    );
    expect(migration).not.toContain("DROP TRIGGER");
    expect(migration).not.toMatch(/(?:DELETE|UPDATE)\s+work\.conversation_turn/iu);
    expect(migration).not.toContain("personalization.");
    expect(migration).not.toContain("FOREIGN KEY");
    expect(migration).not.toContain("memory_candidate_refs");
    expect(migration).not.toContain("teacher_preference_refs");
  });

  it("does not introduce runtime DDL or cross-schema Work writes", () => {
    const apiSources = filesUnder(join(root, "apps/api/src"))
      .filter((path) => path.endsWith(".ts"));
    for (const path of apiSources) {
      expect(readFileSync(path, "utf8"), relative(root, path)).not.toMatch(
        /ALTER\s+TABLE\s+work\.conversation_turn/iu
      );
    }
    const workSources = filesUnder(join(
      root,
      "apps/api/src/modules/work-assistant-durable-execution"
    )).filter((path) => path.endsWith(".ts"));
    for (const path of workSources) {
      expect(readFileSync(path, "utf8"), relative(root, path)).not.toMatch(
        /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+personalization\./iu
      );
    }
  });
});

function migrationFiles(): string[] {
  return filesUnder(join(root, "apps/api/src/modules"))
    .filter((path) => /[\\/]migrations[\\/].+\.sql$/u.test(path));
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function source(projectPath: string): string {
  return readFileSync(join(root, projectPath), "utf8");
}

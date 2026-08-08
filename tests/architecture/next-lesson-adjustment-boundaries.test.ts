import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const skillRoot = join(
  root,
  "apps/api/src/agent/skills/next-lesson-adjustment"
);

describe("Phase 8A-6 next Lesson optimization boundaries", () => {
  it("keeps the Skill free of repositories, PostgreSQL and Platform writes", () => {
    for (const path of filesUnder(skillRoot).filter((item) => item.endsWith(".ts"))) {
      const content = readFileSync(path, "utf8");
      const imports = [...content.matchAll(/from\s+["']([^"']+)["']/gu)]
        .map((match) => match[1]);
      expect(imports, relative(root, path)).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /(?:repository|postgres|education-domain|artifact-collaboration|^pg$|^drizzle-orm$)/iu
          )
        ])
      );
      expect(content, relative(root, path)).not.toMatch(/\.query\s*\(/u);
      expect(content, relative(root, path)).not.toMatch(
        /(?:createTask|createAssignment|createFollowUp|confirmReflection)\s*\(/u
      );
    }
  });

  it("keeps Runtime orchestration on ports instead of PostgreSQL adapters", () => {
    const service = source(
      "apps/api/src/modules/agent-runtime-context/application/next-lesson-optimization-service.ts"
    );
    const store = source(
      "apps/api/src/composition/postgres-next-lesson-action-store.ts"
    );

    expect(service).toContain("NextLessonOptimizationSourceReader");
    expect(service).toContain("NextLessonActionStore");
    expect(service).toContain("NextLessonActionTargetPort");
    expect(service).toContain("loadNextLessonAdjustmentSkill");
    expect(service).not.toMatch(/from\s+["'][^"']*(?:postgres|repository)/iu);
    expect(service).not.toContain("createFollowUp(");
    expect(store).toContain("PostgresNextLessonActionGovernancePort");
    expect(store).toContain("PostgresNextLessonActionRuntimePort");
    expect(store).toContain("PostgresNextLessonActionWorkPort");
    expect(store).not.toMatch(
      /modules\/.+\/infrastructure\/postgres-.+-repository/iu
    );
  });

  it("keeps transaction-aware persistence ports inside their owning modules", () => {
    const ports = [
      source(
        "apps/api/src/modules/identity-governance-audit/infrastructure/postgres-next-lesson-action-governance-port.ts"
      ),
      source(
        "apps/api/src/modules/agent-runtime-context/infrastructure/postgres-next-lesson-action-runtime-port.ts"
      ),
      source(
        "apps/api/src/modules/work-assistant-durable-execution/infrastructure/postgres-next-lesson-action-work-port.ts"
      )
    ];

    expect(ports[0]).not.toContain("../identity-governance-audit/");
    expect(ports[0]).not.toContain("../work-assistant-durable-execution/");
    expect(ports[1]).not.toContain("../identity-governance-audit/");
    expect(ports[1]).not.toContain("../work-assistant-durable-execution/");
    expect(ports[2]).not.toContain("../agent-runtime-context/");
    expect(ports[2]).not.toContain("../identity-governance-audit/");
  });

  it("routes accepted candidates through the existing formal follow-up service", () => {
    const adapter = source(
      "apps/api/src/composition/next-lesson-action-target-adapter.ts"
    );

    expect(adapter).toContain("this.classroom.createFollowUp");
    expect(adapter).toContain('actionType: "lesson_preparation"');
    expect(adapter).toContain('actionType: "assignment_draft"');
    expect(adapter).toContain('actionType: "teacher_todo"');
    expect(adapter).not.toMatch(/\.query\s*\(/u);
    expect(adapter).not.toContain("INSERT INTO");
  });

  it("does not generate candidates while confirming Reflection", () => {
    const reflectionService = source(
      "apps/api/src/composition/postgres-classroom-reflection-service.ts"
    );
    const confirmation = reflectionService.slice(
      reflectionService.indexOf("async confirmReflection"),
      reflectionService.indexOf("async createFollowUp")
    );

    expect(confirmation).not.toContain("nextLessonOptimization");
    expect(confirmation).not.toContain("NextLessonActionCandidate");
  });

  it("adds one Work-owned candidate table while preserving 43 verified Migrations", () => {
    const migrations = filesUnder(join(root, "apps/api/src/modules"))
      .filter((path) => /[\\/]migrations[\\/].+\.sql$/u.test(path));
    const verified = migrations.filter((path) =>
      !path.endsWith("0002_phase7a_memory_persistence.sql") &&
      !path.endsWith("0010_calendar_event_categories.sql") &&
      !path.endsWith("0011_next_lesson_action_candidates.sql")
    );
    const migration = source(
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0011_next_lesson_action_candidates.sql"
    );

    expect(migrations).toHaveLength(46);
    expect(verified).toHaveLength(43);
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS work.next_lesson_action_candidate"
    );
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS work.next_lesson_action_history"
    );
    expect(migration).toContain("work.reject_teacher_work_history_mutation");
    expect(migration).not.toMatch(/CREATE\s+TABLE\s+education\./iu);
    expect(migration).not.toMatch(/CREATE\s+TABLE\s+artifact\./iu);
  });
});

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function source(projectPath: string): string {
  return readFileSync(join(root, projectPath), "utf8");
}

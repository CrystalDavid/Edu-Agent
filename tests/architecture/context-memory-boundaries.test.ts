import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const personalizationRoot = join(
  root,
  "apps/api/src/modules/personalization-memory-analytics"
);

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function source(projectPath: string): string {
  return readFileSync(join(root, projectPath), "utf8");
}

describe("Phase 6 Context and Memory boundaries", () => {
  it("requires authorization proof before the Skill-aware Context Builder can assemble input", () => {
    const builder = source(
      "apps/api/src/agent/skills/lesson-preparation/context-builder.ts"
    );
    expect(builder).toContain("authorizationDecisionRef");
    expect(builder).toContain("authorizedResourceRefs");
    expect(builder).toContain("authorizedEvidenceRefs");
    expect(builder).toContain("sealedContext");
    expect(builder).toContain("tokenBudget");
    expect(builder).not.toMatch(
      /(?:repository|infrastructure[\/]|platform[\/]postgres|from\s+["'](?:pg|drizzle-orm|openai)["'])/iu
    );
  });

  it("keeps Skill Context access snapshot-only and repository-free", () => {
    const skillFiles = filesUnder(
      join(root, "apps/api/src/agent/skills")
    ).filter((path) => path.endsWith(".ts"));
    for (const path of skillFiles) {
      const code = readFileSync(path, "utf8");
      expect(code, relative(root, path)).not.toMatch(
        /(?:postgres|Repository|\.query\(|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b)/u
      );
    }
  });

  it("prevents Personalization from importing or writing Platform state owners", () => {
    const forbiddenModules = [
      "education-domain",
      "artifact-collaboration",
      "work-assistant-durable-execution",
      "agent-runtime-context",
      "capability-integration",
      "identity-governance-audit"
    ];
    for (const path of filesUnder(personalizationRoot).filter((item) =>
      item.endsWith(".ts")
    )) {
      const code = readFileSync(path, "utf8");
      for (const moduleName of forbiddenModules) {
        expect(
          code,
          `${relative(root, path)} imports ${moduleName}`
        ).not.toContain(moduleName);
      }
      expect(code, relative(root, path)).not.toMatch(
        /\b(?:INSERT|UPDATE|DELETE)\b[\s\S]{0,100}\b(?:education|artifact|work|runtime|capability|governance)\./iu
      );
    }
  });

  it("does not create automatic learner profiles or wire ephemeral Memory into production", () => {
    const personalization = filesUnder(personalizationRoot)
      .filter((path) => path.endsWith(".ts"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const productContainer = source(
      "apps/api/src/composition/product-container.ts"
    );
    expect(personalization).not.toMatch(
      /(?:StudentProfile|LearnerStateEstimate|automaticLearnerProfile)/u
    );
    expect(productContainer).not.toContain(
      "InMemoryMemoryCandidateRepository"
    );
    expect(productContainer).not.toContain("MemoryCandidateService");
  });

  it("keeps 43 historical Migrations and adds exactly one forward Phase 7A Migration", () => {
    const migrations = filesUnder(join(root, "apps/api/src/modules"))
      .filter((path) => /[\\/]migrations[\\/].+\.sql$/u.test(path));
    const phase7a = migrations.filter((path) =>
      path.endsWith("0002_phase7a_memory_persistence.sql")
    );
    const calendarCategoryMigration = migrations.filter((path) =>
      path.endsWith("0010_calendar_event_categories.sql")
    );
    const nextLessonActionMigration = migrations.filter((path) =>
      path.endsWith("0011_next_lesson_action_candidates.sql")
    );
    expect(migrations).toHaveLength(46);
    expect(phase7a).toHaveLength(1);
    expect(calendarCategoryMigration).toHaveLength(1);
    expect(nextLessonActionMigration).toHaveLength(1);
    expect(migrations.filter((path) =>
      !phase7a.includes(path) &&
      !calendarCategoryMigration.includes(path) &&
      !nextLessonActionMigration.includes(path)
    )).toHaveLength(43);
  });

  it("allows only active confirmed preferences through an owner-scoped Context Port", () => {
    const provider = source(
      "apps/api/src/modules/personalization-memory-analytics/application/personalization-context-provider.ts"
    );
    const service = source(
      "apps/api/src/composition/postgres-personalization-service.ts"
    );
    const personalizedBuilder = source(
      "apps/api/src/agent/skills/lesson-preparation/personalized-context-builder.ts"
    );
    expect(provider).toContain("ConfirmedTeacherPreferenceSnapshot");
    expect(provider).not.toContain("MemoryCandidate");
    expect(service).toContain('statuses: ["active"]');
    expect(personalizedBuilder).toContain("owner_mismatch");
    expect(personalizedBuilder).not.toMatch(/Repository|postgres|\.query\(/u);
  });
});

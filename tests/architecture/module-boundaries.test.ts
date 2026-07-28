import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const modulesRoot = join(root, "apps/api/src/modules");
const modules = {
  "identity-governance-audit": "governance",
  "work-assistant-durable-execution": "work",
  "agent-runtime-context": "runtime",
  "capability-integration": "capability",
  "artifact-collaboration": "artifact",
  "education-domain": "education",
  "personalization-memory-analytics": "personalization"
} as const;

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("seven-module modular monolith", () => {
  it("contains exactly the seven accepted module roots", () => {
    const actual = readdirSync(modulesRoot)
      .filter((entry) => statSync(join(modulesRoot, entry)).isDirectory())
      .sort();
    expect(actual).toEqual(Object.keys(modules).sort());
  });

  it("keeps Runtime independent from restricted state-owner modules", () => {
    const runtimeFiles = filesUnder(
      join(modulesRoot, "agent-runtime-context")
    ).filter((path) => path.endsWith(".ts"));
    const forbidden = [
      "identity-governance-audit",
      "education-domain",
      "personalization-memory-analytics"
    ];

    for (const path of runtimeFiles) {
      const source = readFileSync(path, "utf8");
      for (const segment of forbidden) {
        expect(
          source,
          `${relative(root, path)} imports restricted module ${segment}`
        ).not.toContain(segment);
      }
      expect(source).not.toMatch(
        /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b[\s\S]*\b(?:governance|education|personalization)\./i
      );
    }
  });

  it("keeps all cross-module wiring in the composition root", () => {
    for (const moduleName of Object.keys(modules)) {
      const moduleFiles = filesUnder(join(modulesRoot, moduleName))
        .filter((path) => path.endsWith(".ts"))
        .filter((path) => !path.endsWith("schema.ts"));
      for (const path of moduleFiles) {
        const source = readFileSync(path, "utf8");
        for (const otherModule of Object.keys(modules)) {
          if (otherModule === moduleName) continue;
          expect(
            source,
            `${relative(root, path)} imports module ${otherModule}`
          ).not.toContain(otherModule);
        }
      }
    }
  });

  it("keeps PostgreSQL Repository writes inside the owning Schema", () => {
    for (const [moduleName, schemaName] of Object.entries(modules)) {
      const repositoryFiles = filesUnder(join(modulesRoot, moduleName))
        .filter((path) => path.endsWith(".ts"))
        .filter((path) =>
          /postgres-[^\\/]*repository\.ts$/.test(path)
        );
      for (const path of repositoryFiles) {
        const source = readFileSync(path, "utf8");
        for (const otherSchema of Object.values(modules)) {
          if (otherSchema === schemaName) continue;
          expect(
            source,
            `${relative(root, path)} writes ${otherSchema}.*`
          ).not.toMatch(
            new RegExp(
              `\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|TRUNCATE\\s+TABLE)\\s+${otherSchema}\\.`,
              "i"
            )
          );
        }
      }
    }
  });

  it("gives every module one migration owner and no cross-Schema DDL", () => {
    for (const [moduleName, schemaName] of Object.entries(modules)) {
      const migrationDir = join(
        modulesRoot,
        moduleName,
        "infrastructure/migrations"
      );
      const sqlFiles = filesUnder(migrationDir).filter((path) =>
        path.endsWith(".sql")
      );
      expect(sqlFiles.length).toBeGreaterThan(0);
      const moduleSql = sqlFiles
        .map((path) => readFileSync(path, "utf8"))
        .join("\n");
      expect(moduleSql).toMatch(
        new RegExp(
          `CREATE\\s+SCHEMA\\s+IF\\s+NOT\\s+EXISTS\\s+${schemaName}`,
          "i"
        )
      );

      for (const path of sqlFiles) {
        const sql = readFileSync(path, "utf8");
        for (const otherSchema of Object.values(modules)) {
          if (otherSchema === schemaName) continue;
          expect(
            sql,
            `${relative(root, path)} touches ${otherSchema}.*`
          ).not.toMatch(
            new RegExp(
              `\\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\\b[\\s\\S]{0,80}\\b${otherSchema}\\.`,
              "i"
            )
          );
        }
      }
    }
  });

  it("does not create a writable generic LearningEvidence table", () => {
    const migrations = filesUnder(modulesRoot).filter((path) =>
      path.endsWith(".sql")
    );
    for (const path of migrations) {
      expect(readFileSync(path, "utf8")).not.toMatch(
        /CREATE\s+TABLE[\s\S]{0,80}\blearning_evidence\b/i
      );
    }
  });
});

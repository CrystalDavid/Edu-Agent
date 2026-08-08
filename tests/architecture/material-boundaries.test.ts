import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const skillRoot = join(
  root,
  "apps/api/src/agent/skills/material-generation"
);

describe("Phase 8A-3 material boundaries", () => {
  it("keeps Material Generation free of File, Repository, SQL and SDK writes", () => {
    for (const path of filesUnder(skillRoot).filter((item) =>
      item.endsWith(".ts")
    )) {
      const content = readFileSync(path, "utf8");
      const imports = [...content.matchAll(/from\s+["']([^"']+)["']/gu)]
        .map((match) => match[1]);
      expect(imports, relative(root, path)).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /(?:artifact-collaboration|repository|postgres|^pg$|^drizzle-orm$)/iu
          )
        ])
      );
      expect(content, relative(root, path)).not.toMatch(
        /\.query\s*\(/u
      );
    }
  });

  it("keeps Runtime orchestration behind source, run-store and Artifact ports", () => {
    const service = source(
      "apps/api/src/modules/agent-runtime-context/application/material-generation-service.ts"
    );
    expect(service).toContain("interface MaterialGenerationSourceReader");
    expect(service).toContain("interface MaterialGenerationRunStore");
    expect(service).toContain("interface MaterialBundleArtifactPort");
    expect(service).not.toMatch(
      /(?:postgres|repository|object-store|artifact-collaboration\/infrastructure)/iu
    );
  });

  it("keeps MaterialBundleProjection rebuildable and write-free", () => {
    const projection = source(
      "apps/api/src/modules/artifact-collaboration/application/material-bundle-projection.ts"
    );
    expect(projection).toContain("projectMaterialBundle");
    expect(projection).not.toMatch(
      /(?:INSERT|UPDATE|DELETE|CREATE TABLE|\.query\(|Repository)/u
    );
  });

  it("adds no Material Bundle table and preserves all 46 existing Migrations", () => {
    const migrations = filesUnder(join(root, "apps/api/src/modules"))
      .filter((path) => /[\\/]migrations[\\/].+\.sql$/u.test(path));
    expect(migrations).toHaveLength(46);
    const sql = migrations.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(sql).not.toMatch(
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+\w+\.(?:material_bundle|lesson_material)/iu
    );
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

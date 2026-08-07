import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const skillRoot = join(root, "apps/api/src/agent/skills/reflection-analysis");

describe("Phase 8A-5 Reflection analysis boundaries", () => {
  it("keeps reflection-analysis free of repositories, PostgreSQL and Platform writes", () => {
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
    }
  });

  it("binds Runtime execution to the versioned Skill and waits for the teacher", () => {
    const service = source(
      "apps/api/src/composition/postgres-model-invocation-service.ts"
    );

    expect(service).toContain("loadReflectionAnalysisSkill");
    expect(service).toContain("reflectionAnalysisSkillRef");
    expect(service).toContain('runtimeStatus: "waiting_for_human"');
    expect(service).toContain("reflectionAnalysis: analysisDraft");
    expect(service).not.toContain("this.classroom.confirmReflection");
    expect(service).not.toContain("this.classroom.createFollowUp");
  });

  it("requires a confirmed Reflection before any explicit follow-up command", () => {
    const formalService = source(
      "apps/api/src/composition/postgres-classroom-reflection-service.ts"
    );

    expect(formalService).toContain("CONFIRMED_REFLECTION_REQUIRED");
    expect(formalService).toContain('reflection.status !== "confirmed"');
    expect(formalService).toContain("createFollowUpTarget");
  });

  it("adds no Reflection analysis fact table and preserves 45 Migrations", () => {
    const migrations = filesUnder(join(root, "apps/api/src/modules"))
      .filter((path) => /[\\/]migrations[\\/].+\.sql$/u.test(path));
    expect(migrations).toHaveLength(45);
    const sql = migrations.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(sql).not.toMatch(
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+\w+\.(?:reflection_analysis|reflection_draft|action_candidate)/iu
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

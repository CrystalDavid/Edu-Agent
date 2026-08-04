import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const skillRoot = join(root, "apps/api/src/agent/skills");

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function source(projectPath: string): string {
  return readFileSync(join(root, projectPath), "utf8");
}

describe("Phase 5 Skill boundaries", () => {
  it("keeps Skills independent from repositories, SQL and provider SDKs", () => {
    const forbidden =
      /(?:[\/]infrastructure[\/]|repository|platform[\/]postgres|from\s+["'](?:pg|openai|drizzle-orm)["']|@edu-agent\/(?:sample-data|test-fixtures))/iu;
    for (const path of filesUnder(skillRoot).filter((item) =>
      item.endsWith(".ts")
    )) {
      expect(readFileSync(path, "utf8"), relative(root, path)).not.toMatch(
        forbidden
      );
    }
  });

  it("keeps Runtime dependent on its Loader Port rather than a concrete Skill", () => {
    const runtimeService = source(
      "apps/api/src/modules/agent-runtime-context/application/runtime-kernel-service.ts"
    );
    const runtimeDomain = source(
      "apps/api/src/modules/agent-runtime-context/domain/runtime-kernel.ts"
    );

    expect(runtimeService).toContain("interface RuntimeSkillLoaderPort");
    expect(runtimeService).toContain("loadPublishedBinding");
    expect(runtimeService).not.toMatch(/agent[\/]skills/u);
    expect(runtimeDomain).not.toMatch(/agent[\/]skills/u);
    expect(runtimeDomain).not.toContain(
      'if (skill === "lesson-preparation")'
    );
  });

  it("loads Prompt, Validator and Evaluation through one exact SkillVersion", () => {
    const orchestration = source(
      "apps/api/src/composition/postgres-model-invocation-service.ts"
    );
    const manifest = source(
      "apps/api/src/agent/skills/lesson-preparation/manifest.ts"
    );

    expect(orchestration).toContain("loadLessonPreparationSkill");
    expect(orchestration).toContain(
      "requireExecutionLessonPreparationSkill"
    );
    expect(orchestration).toContain("skillContentHash");
    expect(orchestration).toContain("evaluateOutput");
    expect(orchestration).not.toMatch(
      /capability-integration[\/]application[\/](?:lesson-preparation-prompt-bundle|model-output-validation)/u
    );
    expect(manifest).toContain('ref: "lesson-preparation@1"');
    expect(manifest).toContain('ref: "lesson-preparation@2"');
    expect(manifest).toContain('status: "published"');
    expect(manifest).toContain('mode: "disabled"');
    expect(manifest).toContain("humanApprovalRequired: true");
    expect(manifest).toContain("qualityBlocksProposal: false");
  });

  it("retains compatibility exports without duplicating Skill behavior", () => {
    const promptCompatibility = source(
      "apps/api/src/modules/capability-integration/application/lesson-preparation-prompt-bundle.ts"
    );
    const validatorCompatibility = source(
      "apps/api/src/modules/capability-integration/application/model-output-validation.ts"
    );

    expect(promptCompatibility).toMatch(/export\s*\{/u);
    expect(promptCompatibility).not.toContain("systemInstruction =");
    expect(validatorCompatibility).toMatch(/export\s*\{/u);
    expect(validatorCompatibility).not.toContain("prohibitedFactPatterns");
  });

  it("does not change the 43 historical Migrations", () => {
    const migrations = filesUnder(join(root, "apps/api/src/modules"))
      .filter((path) => /[\\/]migrations[\\/].+\.sql$/u.test(path));
    expect(migrations).toHaveLength(43);
  });
});

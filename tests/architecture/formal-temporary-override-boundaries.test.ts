import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("PR-2C2 formal temporary override boundaries", () => {
  it("keeps the Runtime interpreter deterministic and infrastructure-free", () => {
    const interpreter = source(
      "apps/api/src/modules/agent-runtime-context/domain/" +
        "explicit-temporary-preference-override.ts"
    );
    expect(interpreter).toContain(
      "temporary-preference-override-interpreter@1"
    );
    expect(interpreter).toContain("TemporaryPreferenceCatalogPort");
    expect(interpreter).not.toMatch(
      /(?:provider|openai|postgres|repository|drizzle|\.query\(|\bSELECT\b|embedding|vector)/iu
    );
    expect(interpreter).not.toContain("personalization-memory-analytics");
  });

  it("adapts Personalization Catalog only through a typed Composition port", () => {
    const port = source(
      "apps/api/src/modules/agent-runtime-context/application/" +
        "temporary-preference-catalog-port.ts"
    );
    const adapter = source(
      "apps/api/src/composition/temporary-preference-catalog-adapter.ts"
    );
    expect(port).toContain("interface TemporaryPreferenceCatalogPort");
    expect(port).not.toMatch(/:\s*unknown\b/u);
    expect(adapter).toContain("matchTeacherPreferenceCatalog");
    expect(adapter).toContain("implements TemporaryPreferenceCatalogPort");
    const composition = source("apps/api/src/composition/product-container.ts");
    expect(composition).toContain(
      "temporaryOverridesSettings.enabled && scopedPreferencesSettings.enabled"
    );
  });

  it("keeps canonical parsing server-owned and out of Web", () => {
    const web = filesUnder(join(root, "apps/web/src"))
      .filter((path) => /\.(?:ts|tsx)$/u.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(web).not.toContain("detectExplicitTemporaryOverrideIntent");
    expect(web).not.toContain("interpretExplicitTemporaryPreferenceOverride");
    expect(web).not.toContain("temporaryMarkerPattern");
  });

  it("keeps Runtime and Personalization writes separated", () => {
    const runtime = filesUnder(join(
      root,
      "apps/api/src/modules/agent-runtime-context"
    )).filter((path) => path.endsWith(".ts"));
    for (const path of runtime) {
      expect(readFileSync(path, "utf8"), relative(root, path)).not.toMatch(
        /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+personalization\./iu
      );
    }
    const interpreter = source(
      "apps/api/src/modules/agent-runtime-context/domain/" +
        "explicit-temporary-preference-override.ts"
    );
    expect(interpreter).not.toContain("MemoryCandidate");
    expect(interpreter).not.toContain("teacherMemoryEpoch");
    expect(interpreter).toContain("eligibleForConsolidation: false");
  });

  it("preserves WorkingMemory V1 and adds a discriminated V2", () => {
    const contract = source("packages/contracts/src/conversation.ts");
    const builder = source(
      "apps/api/src/modules/agent-runtime-context/domain/working-memory.ts"
    );
    expect(contract).toContain("WorkingMemoryViewV1Schema");
    expect(contract).toContain("WorkingMemoryViewV2Schema");
    expect(contract).toContain("z.discriminatedUnion");
    expect(builder).toContain('"working-memory-builder@1"');
    expect(builder).toContain('"working-memory-builder@2"');
  });

  it("preserves Pack V1/V2 and lesson-preparation@1-@6 while adding V3/@7", () => {
    const packs = source("packages/contracts/src/memory-application.ts");
    const skills = source("apps/api/src/agent/skills/index.ts");
    const runtimeKernel = source(
      "apps/api/src/modules/agent-runtime-context/domain/runtime-kernel.ts"
    );
    expect(packs).toContain("MemoryContextPackManifestV1Schema");
    expect(packs).toContain("MemoryContextPackManifestV2Schema");
    expect(packs).toContain("MemoryContextPackManifestV3Schema");
    for (let version = 1; version <= 7; version += 1) {
      expect(skills).toContain(`lessonPreparationSkillV${version}`);
      expect(runtimeKernel).toContain(`"lesson-preparation@${version}"`);
    }
  });

  it("keeps all 51 migrations byte-for-byte unchanged and adds none", () => {
    const migrations = migrationFiles();
    expect(migrations).toHaveLength(51);
    const aggregate = createHash("sha256");
    for (const path of migrations.sort()) {
      aggregate.update(relative(root, path).replaceAll("\\", "/"));
      aggregate.update("\0");
      aggregate.update(readFileSync(path));
      aggregate.update("\0");
    }
    expect(aggregate.digest("hex")).toBe(
      "1d7b3d27fd9eca9cd88af809f8f473854f08e94b0383b4b72a3153ee8f05cdf8"
    );
  });

  it("does not add vector dependencies, other-Skill overrides, or M3 observations", () => {
    const packages = [
      "package.json",
      "apps/api/package.json",
      "packages/contracts/package.json"
    ].map(source).join("\n");
    expect(packages).not.toMatch(
      /(?:pgvector|pinecone|weaviate|qdrant|milvus|chromadb|embedding)/iu
    );
    const nonLessonSkills = filesUnder(join(root, "apps/api/src/agent/skills"))
      .filter((path) => path.endsWith(".ts"))
      .filter((path) => !path.includes("lesson-preparation"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(nonLessonSkills).not.toContain("TemporaryPreferenceOverride");
    expect(source("packages/contracts/src/temporary-memory-override.ts"))
      .not.toContain("Observation");
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

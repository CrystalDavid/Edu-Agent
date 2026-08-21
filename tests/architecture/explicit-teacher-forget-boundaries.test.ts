import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("PR-2C1 explicit teacher forget boundaries", () => {
  it("keeps the forget interpreter deterministic and infrastructure-free", () => {
    const interpreter = source(
      "apps/api/src/modules/personalization-memory-analytics/domain/" +
        "explicit-teacher-forget-command.ts"
    );
    expect(interpreter).toContain("explicit-forget-command-interpreter@1");
    expect(interpreter).toContain("teacher-preference-catalog.js");
    expect(interpreter).not.toMatch(
      /(?:openai|provider|repository|postgres|drizzle|\.query\(|\bSELECT\b|embedding|vector)/iu
    );
  });

  it("keeps canonical parsing on the server and browser confirmation ref-only", () => {
    const web = filesUnder(join(root, "apps/web/src"))
      .filter((path) => /\.(?:ts|tsx)$/u.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(web).not.toContain("interpretExplicitTeacherForgetCommand");
    expect(web).not.toContain("detectExplicitTeacherForgetIntent");
    expect(web).not.toContain("forgetAliasRule");
    expect(web).toContain("confirmExplicitForgetSelection");

    const contract = source("packages/contracts/src/memory-command.ts");
    const confirmation = contract.slice(
      contract.indexOf("ConfirmExplicitForgetSelectionRequestSchema"),
      contract.indexOf("ConfirmExplicitForgetSelectionResultSchema")
    );
    expect(confirmation).toContain("selectedPreferenceRefs");
    expect(confirmation).toContain("expectedVersions");
    expect(confirmation).not.toContain("canonicalKey");
    expect(confirmation).not.toContain("scopeFingerprint");
  });

  it("coordinates Work and Personalization through a typed Composition port", () => {
    const dispatch = source(
      "apps/api/src/composition/postgres-conversation-dispatch-service.ts"
    );
    const port = source(
      "apps/api/src/modules/personalization-memory-analytics/application/" +
        "explicit-teacher-forget-command-service.ts"
    );
    expect(dispatch).toContain("ExplicitTeacherForgetCommandService");
    expect(dispatch).toContain("routesToForget");
    expect(dispatch).toContain("detectExplicitTeacherForgetIntent");
    expect(dispatch).toContain("allowedPreferenceRefs");
    expect(port).toContain("interface ExplicitTeacherForgetCommandService");
    expect(port).not.toMatch(/:\s*unknown\b/u);
    expect(port).not.toContain("teacherText");
    expect(dispatch).not.toMatch(/(?:INSERT|UPDATE|DELETE)\s+personalization\./iu);

    for (const path of filesUnder(join(
      root,
      "apps/api/src/modules/work-assistant-durable-execution"
    )).filter((path) => path.endsWith(".ts"))) {
      expect(readFileSync(path, "utf8"), relative(root, path)).not.toMatch(
        /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+personalization\./iu
      );
    }
    for (const path of filesUnder(join(
      root,
      "apps/api/src/modules/personalization-memory-analytics"
    )).filter((path) => path.endsWith(".ts"))) {
      expect(readFileSync(path, "utf8"), relative(root, path)).not.toMatch(
        /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:work|runtime)\./iu
      );
    }
  });

  it("uses persisted receipt refs as the only selection authority", () => {
    const conversations = source(
      "apps/api/src/composition/postgres-conversation-service.ts"
    );
    const dispatch = source(
      "apps/api/src/composition/postgres-conversation-dispatch-service.ts"
    );
    expect(conversations).toContain("turn.resultRefs.preferenceRefs");
    expect(dispatch).toContain(
      "context.selectionReceiptTurn.resultRefs.preferenceRefs"
    );
    expect(dispatch).toContain("allowedPreferenceRefs");
    expect(dispatch).not.toMatch(/(?:model|provider|assistant).*confirmExplicitForget/iu);
  });

  it("does not physically delete personalization or immutable history", () => {
    const service = source(
      "apps/api/src/composition/postgres-personalization-service.ts"
    );
    const repository = source(
      "apps/api/src/modules/personalization-memory-analytics/infrastructure/" +
        "postgres-memory-candidate-repository.ts"
    );
    expect(service).toContain("revokePreference");
    expect(service).not.toMatch(/DELETE\s+FROM\s+personalization\./iu);
    expect(repository).not.toMatch(/DELETE\s+FROM\s+personalization\./iu);
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

  it("preserves Pack V1/V2 and lesson-preparation@1-@6 after PR-2C2", () => {
    const packs = source("packages/contracts/src/memory-application.ts");
    const skills = source("apps/api/src/agent/skills/index.ts");
    expect(packs).toContain("MemoryContextPackManifestV1Schema");
    expect(packs).toContain("MemoryContextPackManifestV2Schema");
    expect(packs).toContain("MemoryContextPackManifestV3Schema");
    for (let version = 1; version <= 7; version += 1) {
      expect(skills).toContain(`lessonPreparationSkillV${version}`);
    }
    const packages = [
      "package.json",
      "apps/api/package.json",
      "packages/contracts/package.json"
    ].map(source).join("\n");
    expect(packages).not.toMatch(
      /(?:pgvector|pinecone|weaviate|qdrant|milvus|chromadb|embedding)/iu
    );
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

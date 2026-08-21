import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("PR-2B explicit teacher remember boundaries", () => {
  it("keeps the deterministic interpreter free of providers and persistence", () => {
    const interpreter = source(
      "apps/api/src/modules/personalization-memory-analytics/domain/" +
        "explicit-teacher-memory-command.ts"
    );
    expect(interpreter).toContain("explicit-memory-command-interpreter@1");
    expect(interpreter).toContain("teacher-preference-catalog.js");
    expect(interpreter).not.toMatch(
      /(?:openai|provider|repository|postgres|drizzle|\.query\(|\bSELECT\b|embedding|vector)/iu
    );
  });

  it("keeps command detection server-owned instead of duplicating it in Web", () => {
    const web = filesUnder(join(root, "apps/web/src"))
      .filter((path) => /\.(?:ts|tsx)$/u.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(web).not.toContain("detectTeacherMemoryCommandIntent");
    expect(web).not.toContain("interpretExplicitTeacherMemoryCommand");
    expect(web).not.toContain("durableMarkerPattern");
    expect(web).toContain("dispatchTeacherConversationTurn");
  });

  it("coordinates Work and Personalization only through typed Composition services", () => {
    const dispatch = source(
      "apps/api/src/composition/postgres-conversation-dispatch-service.ts"
    );
    const port = source(
      "apps/api/src/modules/personalization-memory-analytics/application/" +
        "explicit-teacher-memory-command-service.ts"
    );
    expect(dispatch).toContain("ExplicitTeacherMemoryCommandService");
    expect(dispatch).not.toMatch(/(?:INSERT|UPDATE|DELETE)\s+personalization\./iu);
    expect(port).toContain("interface ExplicitTeacherMemoryCommandService");
    expect(port).not.toMatch(/:\s*unknown\b/u);

    const work = filesUnder(join(
      root,
      "apps/api/src/modules/work-assistant-durable-execution"
    )).filter((path) => path.endsWith(".ts"));
    for (const path of work) {
      expect(readFileSync(path, "utf8"), relative(root, path)).not.toMatch(
        /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+personalization\./iu
      );
    }
    const personalization = filesUnder(join(
      root,
      "apps/api/src/modules/personalization-memory-analytics"
    )).filter((path) => path.endsWith(".ts"));
    for (const path of personalization) {
      expect(readFileSync(path, "utf8"), relative(root, path)).not.toMatch(
        /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:work|runtime)\./iu
      );
    }
  });

  it("binds durable writes to a teacher command Turn without copying raw text", () => {
    const dispatch = source(
      "apps/api/src/composition/postgres-conversation-dispatch-service.ts"
    );
    const personalization = source(
      "apps/api/src/composition/postgres-personalization-service.ts"
    );
    const port = source(
      "apps/api/src/modules/personalization-memory-analytics/application/" +
        "explicit-teacher-memory-command-service.ts"
    );
    expect(dispatch).toContain("appendTeacherCommandTurn");
    expect(dispatch).toContain("sourceTurnRef: commandTurn.turn.turnRef");
    expect(personalization).toContain(
      "work.conversation_turn.teacher_explicit_memory_command"
    );
    expect(personalization).toContain("summary: safeCandidateSummary(");
    expect(port).not.toContain("teacherText");
    expect(port).not.toContain("surfaceSummary");
  });

  it("does not permit assistant or model output to invoke the memory writer", () => {
    const dispatch = source(
      "apps/api/src/composition/postgres-conversation-dispatch-service.ts"
    );
    expect(dispatch).toContain("appendTeacherCommandTurn");
    expect(dispatch).toContain("actorRef: input.actorRef");
    expect(dispatch).not.toMatch(/(?:model|provider|assistant).*applyExplicitRemember/iu);
    expect(dispatch).not.toMatch(/(?:model|provider|assistant).*interpretExplicitTeacherMemoryCommand/iu);
  });

  it("keeps the catalog low-risk and the feature flag fail-closed", () => {
    const catalog = source(
      "apps/api/src/modules/personalization-memory-analytics/domain/" +
        "teacher-preference-catalog.ts"
    );
    const config = source(
      "apps/api/src/modules/personalization-memory-analytics/infrastructure/" +
        "memory-explicit-remember-config.ts"
    );
    const container = source(
      "apps/api/src/composition/product-container.ts"
    );
    for (const key of [
      "lesson_plan_length",
      "lesson_plan_detail",
      "lesson_plan_style",
      "example_preference",
      "response_length"
    ]) {
      expect(catalog).toContain(`canonicalKey: "${key}"`);
    }
    expect(catalog).not.toMatch(
      /canonicalKey:\s*["'](?:student|learner|grade|secret|password|evidence|approval)/iu
    );
    expect(catalog).toContain("source: pattern.source");
    expect(catalog).toContain("flags: pattern.flags");
    expect(config).toContain("MEMORY_EXPLICIT_REMEMBER_ENABLED");
    expect(config).toContain("? !production");
    expect(container).toContain(
      "explicitRememberSettings.enabled && scopedPreferencesSettings.enabled"
    );
  });

  it("does not implement forget mutations or formal temporary overrides", () => {
    const dispatch = source(
      "apps/api/src/composition/postgres-conversation-dispatch-service.ts"
    );
    expect(dispatch).toContain("forget_not_available");
    expect(dispatch).toContain("temporary_override_not_saved");
    expect(dispatch).not.toContain("revokeTeacherPreference");
    expect(dispatch).not.toContain("temporaryOverrides.push");
  });

  it("preserves historical Skill and Pack contracts without vector dependencies", () => {
    const skills = source("apps/api/src/agent/skills/index.ts");
    const packs = source("packages/contracts/src/memory-application.ts");
    for (let version = 1; version <= 6; version += 1) {
      expect(skills).toContain(`lessonPreparationSkillV${version}`);
    }
    expect(packs).toContain("MemoryContextPackManifestV1Schema");
    expect(packs).toContain("MemoryContextPackManifestV2Schema");
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

function source(projectPath: string): string {
  return readFileSync(join(root, projectPath), "utf8");
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

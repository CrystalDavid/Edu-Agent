import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("Phase 8A-1 Lesson Brief boundaries", () => {
  it("keeps lesson-analysis independent from repositories and SDKs", () => {
    const skillFiles = filesUnder(join(
      root,
      "apps/api/src/agent/skills/lesson-analysis"
    )).filter((path) => path.endsWith(".ts"));

    for (const path of skillFiles) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(
        /(?:Repository|Postgres|drizzle|\.query\(|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|@edu-agent\/(?:sample-data|test-fixtures))/u
      );
    }
  });

  it("keeps the application service behind source and run-store Ports", () => {
    const service = source(
      "apps/api/src/modules/agent-runtime-context/application/lesson-brief-service.ts"
    );

    expect(service).toContain("interface LessonBriefSourceReader");
    expect(service).toContain("interface LessonBriefRunStore");
    expect(service).not.toMatch(/Postgres|Repository|drizzle|\.query\(/u);
  });

  it("does not write Lesson Brief output into Education or Artifact state", () => {
    const store = source(
      "apps/api/src/composition/postgres-lesson-brief-store.ts"
    );

    expect(store).toContain("runtime.agent_run");
    expect(store).toContain("insertContextManifest");
    expect(store).toContain("replaceWorkingSetSourceResources");
    expect(store).not.toMatch(
      /(?:education|artifact)\.(?:lesson|learning_objective|evidence|teaching_plan|artifact|artifact_revision)/u
    );
    expect(store).not.toMatch(
      /(?:update|insert|delete)(?:Lesson|LearningObjective|Evidence|TeachingPlan)/u
    );
  });

  it("adds no Lesson Brief table and leaves the Migration count unchanged", () => {
    const migrations = filesUnder(join(root, "apps/api/src/modules"))
      .filter((path) => /[\\/]migrations[\\/].+\.sql$/u.test(path));

    expect(migrations).toHaveLength(50);
    for (const path of migrations) {
      expect(readFileSync(path, "utf8")).not.toMatch(
        /CREATE\s+TABLE[^;]*(?:lesson_brief|lesson_journey|teaching_workspace)/iu
      );
    }
  });

  it("keeps Journey state interpretation on the API", () => {
    const projection = source(
      "apps/api/src/modules/work-assistant-durable-execution/application/lesson-journey-projection.ts"
    );
    const page = source("apps/web/src/pages/TeachingWorkspacePage.tsx");

    expect(projection).toContain('input.lessonBrief?.status === "waiting_for_teacher"');
    expect(projection).toContain('"generate_lesson_brief"');
    expect(page).toContain("loadLessonBrief");
    expect(page).toContain("LessonBriefPanel");
    expect(page).not.toContain('status: "waiting_for_teacher"');
  });
});

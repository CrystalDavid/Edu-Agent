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

describe("Phase 8A Teaching Workspace journey boundaries", () => {
  it("keeps the Projection pure, repository-free, and read-only", () => {
    const projection = source(
      "apps/api/src/modules/work-assistant-durable-execution/application/lesson-journey-projection.ts"
    );

    expect(projection).not.toMatch(
      /(?:Repository|postgres|drizzle|\.query\(|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b)/u
    );
    expect(projection).not.toContain("currentEvidenceRefs");
    expect(projection).toContain("sourceVersionVector");
  });

  it("composes existing services instead of importing cross-module repositories", () => {
    const adapter = source(
      "apps/api/src/composition/lesson-journey-read-adapter.ts"
    );

    expect(adapter).toContain("LessonJourneySourceReader");
    expect(adapter).toContain("preparation.getLesson");
    expect(adapter).toContain("classroom.getLessonSummary");
    expect(adapter).not.toMatch(/Repository|drizzle|\.query\(/u);
  });

  it("does not create a journey table or modify historical migrations", () => {
    const migrations = filesUnder(join(root, "apps/api/src/modules"))
      .filter((path) => /[\\/]migrations[\\/].+\.sql$/u.test(path));

    expect(migrations).toHaveLength(50);
    for (const path of migrations) {
      const sql = readFileSync(path, "utf8");
      expect(sql).not.toMatch(
        /CREATE\s+TABLE[^;]*(?:lesson_journey|teaching_workspace)/iu
      );
    }
  });

  it("keeps Journey interpretation on the API and only renders it on the Web", () => {
    const api = source("apps/web/src/api.ts");
    const page = source("apps/web/src/pages/TeachingWorkspacePage.tsx");

    expect(api).toContain("LessonJourneyProjectionSchema");
    expect(page).toContain("loadLessonJourney");
    expect(page).not.toContain('currentStage: "');
    expect(page).not.toContain('status: "waiting_for_teacher"');
  });
});

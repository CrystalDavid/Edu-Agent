import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const skillRoot = join(
  root,
  "apps/api/src/agent/skills/classroom-reflection"
);

describe("Phase 8A-4 classroom delivery boundaries", () => {
  it("keeps classroom-reflection free of repositories, PostgreSQL and Platform writes", () => {
    for (const path of filesUnder(skillRoot).filter((item) =>
      item.endsWith(".ts")
    )) {
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

  it("orchestrates through source, Runtime run-store and Delivery ports", () => {
    const service = source(
      "apps/api/src/modules/agent-runtime-context/application/classroom-feedback-service.ts"
    );
    expect(service).toContain("interface ClassroomFeedbackSourceReader");
    expect(service).toContain("interface ClassroomFeedbackRunStore");
    expect(service).toContain("interface ClassroomFeedbackDeliveryPort");
    expect(service).not.toMatch(/(?:postgres|repository|\.query\s*\()/iu);
  });

  it("creates only a LessonDelivery Draft and never confirms formal facts", () => {
    const adapter = source(
      "apps/api/src/composition/classroom-feedback-delivery-adapter.ts"
    );
    expect(adapter).toContain("this.classroom.createDelivery");
    expect(adapter).not.toContain("confirmDelivery");
    expect(adapter).not.toContain("confirmObservation");

    const runStore = source(
      "apps/api/src/composition/postgres-gate2-teacher-copilot-service.ts"
    );
    expect(runStore).toContain('runtimeStatus: "waiting_for_human"');
    expect(runStore).toContain("candidateOnly: true");
    expect(runStore).toContain("teacherConfirmationRequired: true");
  });

  it("adds no classroom feedback fact table and preserves 45 Migrations", () => {
    const migrations = filesUnder(join(root, "apps/api/src/modules"))
      .filter((path) => /[\\/]migrations[\\/].+\.sql$/u.test(path));
    expect(migrations).toHaveLength(45);
    const sql = migrations.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(sql).not.toMatch(
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+\w+\.(?:quick_classroom_feedback|delivery_draft|classroom_feedback)/iu
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

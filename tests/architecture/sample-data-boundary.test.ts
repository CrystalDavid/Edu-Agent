import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) return sourceFilesUnder(path);
    return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path) ? [path] : [];
  });
}

describe("Phase 2 sample data boundary", () => {
  it("keeps sample and test fixture packages out of product applications", () => {
    for (const manifestPath of ["apps/api/package.json", "apps/web/package.json"]) {
      const manifest = JSON.parse(source(manifestPath)) as {
        dependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      const productionDependencies = {
        ...manifest.dependencies,
        ...manifest.optionalDependencies
      };
      expect(productionDependencies).not.toHaveProperty(
        "@edu-agent/sample-data"
      );
      expect(productionDependencies).not.toHaveProperty(
        "@edu-agent/test-fixtures"
      );
    }

    for (const directory of ["apps/api/src", "apps/web/src"]) {
      for (const path of sourceFilesUnder(resolve(root, directory))) {
        const content = readFileSync(path, "utf8");
        expect(content, relative(root, path)).not.toContain(
          "@edu-agent/sample-data"
        );
        expect(content, relative(root, path)).not.toContain(
          "@edu-agent/test-fixtures"
        );
        expect(content, relative(root, path)).not.toContain(
          "packages/sample-data"
        );
      }
    }
  });

  it("keeps the explicit sample seed outside the production composition root", () => {
    const productContainer = source(
      "apps/api/src/composition/product-container.ts"
    );
    const rootPackage = source("package.json");
    const seedService = source(
      "scripts/sample/gate2-demo-seed-service.ts"
    );

    expect(productContainer).not.toContain("Gate2DemoSeedService");
    expect(productContainer).not.toMatch(/\bseed\s*:/u);
    expect(rootPackage).toContain("scripts/sample/seed-cli.ts");
    expect(seedService).toContain("@edu-agent/sample-data");
    expect(seedService).toContain("seedSyntheticIdentityFoundation");
  });

  it("does not keep fixed sample resource refs in production services", () => {
    const permittedExplicitTools = new Set([
      "apps/api/src/composition/postgres-gate1b-command-service.ts",
      "apps/api/src/composition/synthetic-live-model-request.ts"
    ]);
    const fixedSampleRefs = [
      "tenant:demo-school",
      "user:teacher-001",
      "course-run:grade8-math-class3-2026-fall",
      "lesson:slope-and-graph-change",
      "goal:improve-slope-graph-explanation"
    ];

    for (const path of sourceFilesUnder(resolve(root, "apps/api/src"))) {
      const projectPath = relative(root, path).replaceAll("\\", "/");
      if (
        projectPath.includes("/migrations/") ||
        permittedExplicitTools.has(projectPath)
      ) {
        continue;
      }
      const content = readFileSync(path, "utf8");
      for (const ref of fixedSampleRefs) {
        expect(content, `${projectPath} must not use ${ref}`).not.toContain(ref);
      }
    }
  });

  it("resolves identity and resources from formal runtime sources", () => {
    const app = source("apps/api/src/app.ts");
    const readService = source(
      "apps/api/src/composition/postgres-gate2-read-service.ts"
    );
    const lessonPreparation = source(
      "apps/api/src/composition/postgres-lesson-preparation-service.ts"
    );
    const workRepository = source(
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/postgres-gate2-work-repository.ts"
    );

    expect(app).toContain("contexts.acting.courseRunRefs ?? []");
    expect(app).toContain("contexts.status.user.displayName");
    expect(readService).toContain("input.courseRunRefs[0]");
    expect(readService).not.toContain("gate2DemoRefs");
    expect(lessonPreparation).toContain("listActiveCasesAndGoals");
    expect(workRepository).toContain("listActiveCasesAndGoals");
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const apiSource = join(root, "apps/api/src");
const modulesRoot = join(apiSource, "modules");
const compositionRoot = join(apiSource, "composition");

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function source(projectPath: string): string {
  return readFileSync(join(root, projectPath), "utf8");
}

describe("Phase 3 application boundaries", () => {
  it("keeps module application code independent from infrastructure", () => {
    const applicationFiles = filesUnder(modulesRoot).filter(
      (path) =>
        /[\\/]application[\\/]/.test(path) && path.endsWith(".ts")
    );
    for (const path of applicationFiles) {
      expect(
        readFileSync(path, "utf8"),
        relative(root, path)
      ).not.toMatch(/from\s+["'][^"']*infrastructure[\\/]/u);
    }
  });

  it("keeps HTTP behind application services and away from repositories", () => {
    const app = source("apps/api/src/app.ts");
    expect(app).not.toMatch(/modules\/.+\/infrastructure\//u);
    expect(app).not.toMatch(/Postgres[A-Za-z0-9]+Repository/u);
    expect(app).not.toContain('from "openai"');
    expect(app).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE\s+TABLE)\s+[a-z_]+\./iu
    );
    expect(app).toContain("product.services.teacherCopilot");
    expect(app).toContain("product.services.modelInvocations");
  });

  it("keeps the product composition root limited to assembly", () => {
    const container = source(
      "apps/api/src/composition/product-container.ts"
    );
    expect(container).toContain("createConfiguredModelProvider");
    expect(container).toContain("createConfiguredObjectStore");
    expect(container).toContain("createConfiguredIdentityProviders");
    expect(container).not.toMatch(
      /(?:VolcengineArkProvider|MockModelProvider|LocalObjectStore|LocalIdentityProvider|OidcIdentityProvider)/u
    );
    expect(container).not.toMatch(/Postgres[A-Za-z0-9]+Repository/u);
    expect(container).not.toMatch(/\.query\s*\(/u);
    expect(container).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE\s+TABLE)\b/iu
    );
  });

  it("keeps the OpenAI SDK inside the capability adapter", () => {
    const importers = filesUnder(apiSource)
      .filter((path) => path.endsWith(".ts"))
      .filter((path) => /from\s+["']openai["']/u.test(readFileSync(path, "utf8")))
      .map((path) => relative(root, path).replaceAll("\\", "/"));

    expect(importers).toEqual([
      "apps/api/src/modules/capability-integration/infrastructure/volcengine-ark-provider.ts"
    ]);
  });

  it("exposes stable facades for Agent, model, and identity context", () => {
    const copilot = source(
      "apps/api/src/modules/agent-runtime-context/application/teacher-copilot-facade.ts"
    );
    const model = source(
      "apps/api/src/modules/capability-integration/application/model-invocation-facade.ts"
    );
    const identity = source(
      "apps/api/src/modules/identity-governance-audit/application/identity-context-facade.ts"
    );
    const copilotImplementation = source(
      "apps/api/src/composition/postgres-gate2-teacher-copilot-service.ts"
    );
    const modelImplementation = source(
      "apps/api/src/composition/postgres-model-invocation-service.ts"
    );
    const identityImplementation = source(
      "apps/api/src/composition/postgres-identity-organization-service.ts"
    );

    expect(copilot).toContain("TeacherCopilotApplicationFacade");
    expect(model).toContain("ModelInvocationApplicationFacade");
    expect(identity).toContain("IdentityContextFacade");
    expect(copilotImplementation).toContain(
      "implements TeacherCopilotApplicationFacade"
    );
    expect(modelImplementation).toContain(
      "implements ModelInvocationApplicationFacade"
    );
    expect(identityImplementation).toContain(
      "implements IdentityContextFacade"
    );
  });

  it("does not grow the registered legacy repository-orchestrator set", () => {
    const registeredDebt = [
      "postgres-artifact-revision-service.ts",
      "postgres-assignment-learning-service.ts",
      "postgres-classroom-reflection-service.ts",
      "postgres-file-artifact-service.ts",
      "postgres-gate1b-command-service.ts",
      "postgres-gate1b-education-service.ts",
      "postgres-gate2-read-service.ts",
      "postgres-gate2-teacher-copilot-service.ts",
      "postgres-interaction-contract-service.ts",
      "postgres-lesson-preparation-service.ts",
      "postgres-model-invocation-service.ts",
      "postgres-teacher-workbench-service.ts"
    ];
    const actual = readdirSync(compositionRoot)
      .filter((entry) => entry.endsWith(".ts"))
      .filter((entry) =>
        /modules\/.+\/infrastructure\/postgres-.+-repository/u.test(
          readFileSync(join(compositionRoot, entry), "utf8")
        )
      )
      .sort();

    expect(actual).toEqual(registeredDebt.sort());
  });
});

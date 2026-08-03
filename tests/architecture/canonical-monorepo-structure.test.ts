import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFilesUnder(path);
    return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path) ? [path] : [];
  });
}

describe("canonical pnpm monorepo structure", () => {
  it("keeps apps and packages as the only workspace roots", () => {
    const workspace = source("pnpm-workspace.yaml").replace(/\r\n/g, "\n");

    expect(workspace).toContain(
      "packages:\n  - apps/*\n  - packages/*\nallowBuilds:"
    );
    expect(workspace).not.toContain("environments/*");
    expect(workspace).not.toMatch(/^\s*-\s+(?:docs|infra|scripts|tests)(?:\/\*)?\s*$/m);
  });

  it("does not keep premature environments or deploy roots", () => {
    expect(existsSync(resolve(root, "environments"))).toBe(false);
    expect(existsSync(resolve(root, "deploy"))).toBe(false);
  });

  it("keeps sample data as a package and local postgres as infrastructure", () => {
    for (const path of [
      "packages/sample-data/package.json",
      "packages/sample-data/tsconfig.json",
      "packages/sample-data/src/index.ts",
      "infra/local/postgres/.env.example",
      "infra/local/postgres/README.md",
      "infra/local/postgres/compose.postgres.yml"
    ]) {
      expect(existsSync(resolve(root, path)), path).toBe(true);
    }

    expect(source("packages/sample-data/package.json")).toContain(
      '"name": "@edu-agent/sample-data"'
    );
  });

  it("keeps sample and test fixtures out of the web application", () => {
    const webPackage = JSON.parse(source("apps/web/package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const manifestDependencies = {
      ...webPackage.dependencies,
      ...webPackage.devDependencies
    };

    expect(manifestDependencies).not.toHaveProperty("@edu-agent/sample-data");
    expect(manifestDependencies).not.toHaveProperty("@edu-agent/test-fixtures");

    const webSource = sourceFilesUnder(resolve(root, "apps/web/src"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(webSource).not.toContain("@edu-agent/sample-data");
    expect(webSource).not.toContain("@edu-agent/test-fixtures");
    expect(webSource).not.toContain("packages/sample-data");
  });

  it("keeps test fixtures out of production application dependencies", () => {
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
        "@edu-agent/test-fixtures"
      );
    }
  });

  it("retains the separated script responsibilities", () => {
    for (const directory of [
      "scripts/local",
      "scripts/testing",
      "scripts/quality",
      "scripts/postgres",
      "scripts/security"
    ]) {
      expect(existsSync(resolve(root, directory)), directory).toBe(true);
    }
    expect(existsSync(resolve(root, "scripts/demo"))).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const source = (path: string) =>
  readFileSync(resolve(root, path), "utf8");

function runNode(args: string[], environment: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      ...environment
    },
    encoding: "utf8",
    windowsHide: true
  });
}

describe("PostgreSQL lifecycle isolation", () => {
  it("fails closed before Docker when development reset is not explicit", () => {
    const environment = { ...process.env };
    delete environment.ALLOW_DESTRUCTIVE_DB_RESET;
    const result = spawnSync(
      process.execPath,
      ["scripts/postgres/reset-development-database.mjs"],
      {
        cwd: root,
        env: environment,
        encoding: "utf8",
        windowsHide: true
      }
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "ALLOW_DESTRUCTIVE_DB_RESET=1"
    );
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "Refusing to delete"
    );
  });

  it("assigns disjoint stable development and per-run E2E identities", () => {
    const probe = runNode([
      "--input-type=module",
      "--eval",
      [
        "import { developmentComposeProject, developmentVolumeName,",
        "e2eComposeProject, e2eVolumeName } from",
        "'./scripts/postgres/database-lifecycle.mjs';",
        "console.log(JSON.stringify({",
        "developmentComposeProject, developmentVolumeName,",
        "firstProject: e2eComposeProject('first-run'),",
        "firstVolume: e2eVolumeName('first-run'),",
        "secondVolume: e2eVolumeName('second-run')",
        "}));"
      ].join(" ")
    ]);

    expect(probe.status).toBe(0);
    const identities = JSON.parse(probe.stdout.trim());
    expect(identities.developmentComposeProject).toBe(
      "edu-agent-dev"
    );
    expect(identities.developmentVolumeName).toBe(
      "edu-agent-dev-postgres-data"
    );
    expect(identities.firstProject).toBe(
      "edu-agent-e2e-first-run"
    );
    expect(identities.firstVolume).toBe(
      "edu-agent-e2e-first-run-postgres-data"
    );
    expect(identities.secondVolume).not.toBe(
      identities.firstVolume
    );
  });

  it("routes Playwright through the isolated runner", () => {
    const packageJson = JSON.parse(source("package.json"));
    expect(packageJson.scripts["test:playwright"]).toBe(
      "node scripts/testing/run-playwright-isolated.mjs"
    );
    expect(packageJson.scripts["test:app-server"]).toBe(
      "node scripts/testing/run-e2e-app.mjs"
    );

    const isolatedRunner = source(
      "scripts/testing/run-playwright-isolated.mjs"
    );
    expect(isolatedRunner).toContain(
      "snapshotProtectedLocalState"
    );
    expect(isolatedRunner).toContain("e2eVolumeName");
    expect(isolatedRunner).toContain("e2eObjectStoreRoot");
    expect(isolatedRunner).toContain("removeE2eObjectStore");
    expect(isolatedRunner).toContain("E2E_CONTROL_PORT");
    expect(isolatedRunner).toContain('"--volumes"');
    expect(isolatedRunner).not.toContain("db:clean");

    const e2eServer = source("scripts/testing/run-e2e-app.mjs");
    expect(e2eServer).toContain("E2E_RUN_ID");
    expect(e2eServer).toContain("LOCAL_OBJECT_STORE_ROOT");
    expect(e2eServer).toContain('"127.0.0.1"');
    expect(e2eServer).toContain('"x-e2e-run-id"');
    expect(e2eServer).toContain('"/__e2e/restart-api"');
    expect(source("apps/api/src/app.ts")).not.toContain(
      "/__e2e/restart-api"
    );
    expect(e2eServer).not.toContain("db:clean");
    expect(e2eServer).not.toContain(
      "developmentVolumeName"
    );
  });

  it("assigns each E2E run a disposable object-store root outside development uploads", () => {
    const runId = `lifecycle-${process.pid}-${Date.now()}`;
    const probe = runNode([
      "--input-type=module",
      "--eval",
      [
        "import { existsSync } from 'node:fs';",
        "import { mkdir, writeFile } from 'node:fs/promises';",
        "import { resolve } from 'node:path';",
        "import { e2eObjectStoreRoot, removeE2eObjectStore } from",
        "'./scripts/testing/object-store-lifecycle.mjs';",
        `const runId = '${runId}';`,
        "const disposable = e2eObjectStoreRoot(runId);",
        "await mkdir(disposable, { recursive: true });",
        "await writeFile(resolve(disposable, 'proof.txt'), 'synthetic');",
        "await removeE2eObjectStore(disposable);",
        "console.log(JSON.stringify({",
        "first: e2eObjectStoreRoot('first-run'),",
        "second: e2eObjectStoreRoot('second-run'),",
        "runDirectoryRemoved: !existsSync(resolve(disposable, '..'))",
        "}));"
      ].join(" ")
    ]);
    expect(probe.status).toBe(0);
    const roots = JSON.parse(probe.stdout.trim());
    expect(roots.first).toContain(".local-data");
    expect(roots.first).toContain("first-run");
    expect(roots.first).toContain("uploads");
    expect(roots.first).not.toBe(roots.second);
    expect(roots.first).not.toContain(".local-data\\object-store");
    expect(roots.runDirectoryRemoved).toBe(true);
  });

  it("routes PostgreSQL integration tests away from development data", () => {
    const packageJson = JSON.parse(source("package.json"));
    expect(packageJson.scripts["test:postgres"]).toBe(
      "node scripts/postgres/run-integration-tests.mjs"
    );
    const runner = source(
      "scripts/postgres/run-integration-tests.mjs"
    );
    expect(runner).toContain("createE2eDatabaseEnvironment");
    expect(runner).toContain("snapshotProtectedLocalState");
    expect(runner).toContain('"--volumes"');
    expect(runner).not.toContain("db:up");
    expect(runner).not.toContain("db:clean");
    expect(runner).not.toContain("db:env");

    const databaseSupport = source(
      "tests/postgres/support/database.ts"
    );
    expect(databaseSupport).toContain("edu-agent-e2e-");
    expect(databaseSupport).not.toContain(
      "--env-file"
    );
    expect(databaseSupport).not.toContain(
      "environments/local/postgres/.env.local"
    );
  });

  it("keeps development Compose identity explicit and protected", () => {
    const compose = source("environments/local/postgres/compose.postgres.yml");
    expect(compose).toContain(
      "${COMPOSE_PROJECT_NAME:-edu-agent-dev}"
    );
    expect(compose).toContain(
      "${POSTGRES_VOLUME_NAME:-edu-agent-dev-postgres-data}"
    );

    const reset = source(
      "scripts/postgres/reset-development-database.mjs"
    );
    expect(reset.indexOf("assertDestructiveDevelopmentResetAllowed"))
      .toBeLessThan(reset.indexOf("developmentComposeEnvironment"));
    expect(reset).toContain("developmentVolumeName");
  });
});

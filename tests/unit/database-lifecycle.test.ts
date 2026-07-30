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
      "node scripts/demo/run-playwright-isolated.mjs"
    );
    expect(packageJson.scripts["demo:test-server"]).toBe(
      "node scripts/demo/run-e2e-demo.mjs"
    );

    const isolatedRunner = source(
      "scripts/demo/run-playwright-isolated.mjs"
    );
    expect(isolatedRunner).toContain(
      "snapshotProtectedLocalState"
    );
    expect(isolatedRunner).toContain("e2eVolumeName");
    expect(isolatedRunner).toContain('"--volumes"');
    expect(isolatedRunner).not.toContain("db:clean");

    const e2eServer = source("scripts/demo/run-e2e-demo.mjs");
    expect(e2eServer).toContain("E2E_RUN_ID");
    expect(e2eServer).not.toContain("db:clean");
    expect(e2eServer).not.toContain(
      "developmentVolumeName"
    );
  });

  it("keeps development Compose identity explicit and protected", () => {
    const compose = source("infra/docker/compose.postgres.yml");
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

import { createServer } from "node:net";

import {
  runPnpm,
  spawnPnpm,
  stopProcessTree
} from "./process-utils.mjs";
import {
  composeArguments,
  e2eComposeProject,
  e2eVolumeName,
  normalizeE2eRunId,
  runCompose
} from "../postgres/database-lifecycle.mjs";

const apiOrigin = "http://localhost:3001";
const webOrigin = "http://localhost:5173";
const processes = [];
let shuttingDown = false;

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}; start this server through pnpm test:playwright.`
    );
  }
  return value;
}

const runId = normalizeE2eRunId(requiredEnvironment("E2E_RUN_ID"));
const expectedProject = e2eComposeProject(runId);
const expectedVolume = e2eVolumeName(runId);
if (
  process.env.COMPOSE_PROJECT_NAME !== expectedProject ||
  process.env.POSTGRES_VOLUME_NAME !== expectedVolume
) {
  throw new Error("E2E Compose identity does not match its run id.");
}

const databaseEnvironment = Object.fromEntries(
  [
    "POSTGRES_HOST",
    "POSTGRES_HOST_PORT",
    "POSTGRES_DB",
    "POSTGRES_ADMIN_USER",
    "POSTGRES_ADMIN_PASSWORD",
    "POSTGRES_MIGRATOR_USER",
    "POSTGRES_MIGRATOR_PASSWORD",
    "POSTGRES_APP_USER",
    "POSTGRES_APP_PASSWORD",
    "POSTGRES_RUNTIME_USER",
    "POSTGRES_RUNTIME_PASSWORD",
    "POSTGRES_WORKER_USER",
    "POSTGRES_WORKER_PASSWORD",
    "COMPOSE_PROJECT_NAME",
    "POSTGRES_VOLUME_NAME",
    "E2E_RUN_ID"
  ].map((name) => [name, requiredEnvironment(name)])
);

async function assertPortAvailable(port, label) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", () => {
      reject(new Error(`${label} port ${port} is already in use.`));
    });
    server.listen({ port }, () => server.close(resolve));
  });
}

async function waitForJson(url, validate, timeoutMs = 45_000) {
  const startedAt = Date.now();
  let lastStatus = "no response";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        headers: {
          "x-demo-tenant": "tenant:demo-school",
          "x-demo-actor": "user:teacher-001"
        }
      });
      lastStatus = `HTTP ${response.status}`;
      if (response.ok) {
        const payload = await response.json();
        if (validate(payload)) return payload;
      }
    } catch {
      lastStatus = "service not accepting connections";
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not become ready: ${lastStatus}`);
}

async function waitForHtml(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (
        response.ok &&
        (response.headers.get("content-type") ?? "").includes(
          "text/html"
        )
      ) {
        return;
      }
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not serve HTML before timeout.`);
}

function startPackage(packageName, environment, script = "dev") {
  const child = spawnPnpm(
    ["--filter", packageName, script],
    environment
  );
  processes.push(child);
  child.on("error", (error) => {
    void shutdown(1, `${packageName} failed: ${error.message}`);
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      void shutdown(
        code ?? 1,
        `${packageName} exited unexpectedly (${signal ?? code ?? "unknown"}).`
      );
    }
  });
}

async function shutdown(exitCode, reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (reason) process.stderr.write(`${reason}\n`);
  for (const child of [...processes].reverse()) {
    stopProcessTree(child);
  }
  try {
    runCompose(
      databaseEnvironment,
      "down",
      "--volumes",
      "--remove-orphans"
    );
  } catch (error) {
    process.stderr.write(
      `E2E cleanup failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`
    );
    exitCode = 1;
  }
  process.exit(exitCode);
}

try {
  await Promise.all([
    assertPortAvailable(3001, "API"),
    assertPortAvailable(5173, "Web")
  ]);
  process.stdout.write(
    `Starting isolated ${expectedProject} with volume ${expectedVolume}.\n`
  );
  runCompose(databaseEnvironment, "up", "-d", "--wait");
  runPnpm(
    [
      "exec",
      "tsx",
      "apps/api/src/platform/postgres/bootstrap-cli.ts"
    ],
    databaseEnvironment
  );
  runPnpm(
    [
      "exec",
      "tsx",
      "apps/api/src/composition/gate2-demo-seed-cli.ts"
    ],
    databaseEnvironment
  );
  runPnpm(
    ["--filter", "@edu-agent/contracts", "build"],
    databaseEnvironment
  );
  const { apiRoutes } = await import(
    "../../packages/contracts/dist/api-routes.js"
  );
  const applicationEnvironment = {
    ...databaseEnvironment,
    APP_ENV: "demo",
    DEMO_AUTH_BYPASS: "true",
    GATE2_DEMO_ENABLED: "true",
    LOCAL_DEMO_DIAGNOSTICS: "true",
    PORT: "3001"
  };

  startPackage("@edu-agent/api", applicationEnvironment, "demo");
  await waitForJson(
    `${apiOrigin}${apiRoutes.health}`,
    (payload) => payload?.status === "ok"
  );
  await waitForJson(
    `${apiOrigin}${apiRoutes.demo.bootstrap}`,
    (payload) => payload?.identity?.dataMode === "synthetic"
  );
  startPackage("@edu-agent/web", applicationEnvironment);
  await waitForHtml(`${webOrigin}/`);
  await waitForJson(
    `${webOrigin}${apiRoutes.demo.bootstrap}`,
    (payload) => payload?.identity?.dataMode === "synthetic"
  );
  process.stdout.write(
    `Playwright server ready with isolated database ${expectedVolume}.\n`
  );
} catch (error) {
  await shutdown(
    1,
    error instanceof Error ? error.message : String(error)
  );
}

process.on("SIGINT", () => {
  void shutdown(0, "Stopping isolated Playwright server.");
});
process.on("SIGTERM", () => {
  void shutdown(0, "Stopping isolated Playwright server.");
});

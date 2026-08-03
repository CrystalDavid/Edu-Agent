import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";

import {
  runPnpm,
  spawnPnpm,
  stopProcessTree
} from "../local/process-utils.mjs";
import {
  composeArguments,
  e2eComposeProject,
  e2eVolumeName,
  normalizeE2eRunId,
  runCompose
} from "../postgres/database-lifecycle.mjs";

const processes = [];
const intentionalStops = new WeakSet();
let shuttingDown = false;
let controlServer;

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
const apiPort = Number(requiredEnvironment("E2E_API_PORT"));
const webPort = Number(requiredEnvironment("E2E_WEB_PORT"));
const controlPort = Number(requiredEnvironment("E2E_CONTROL_PORT"));
const modelMode = process.env.E2E_MODEL_MODE ?? "mock";
const fakeArkPort =
  modelMode === "ark-fake"
    ? Number(requiredEnvironment("E2E_FAKE_ARK_PORT"))
    : undefined;
if (
  !Number.isInteger(apiPort) ||
  !Number.isInteger(webPort) ||
  !Number.isInteger(controlPort) ||
  apiPort < 1 ||
  webPort < 1 ||
  controlPort < 1
) {
  throw new Error("E2E API, Web, and control ports must be positive integers.");
}
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;
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
    "E2E_RUN_ID",
    "E2E_API_PORT",
    "E2E_WEB_PORT",
    "LOCAL_OBJECT_STORE_ROOT"
  ].map((name) => [name, requiredEnvironment(name)])
);

async function assertPortAvailable(port, label) {
  await new Promise((resolve, reject) => {
    const server = createNetServer();
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

function startTool(arguments_, environment) {
  const child = spawnPnpm(arguments_, environment);
  processes.push(child);
  child.on("error", (error) => {
    void shutdown(
      1,
      `local test tool failed: ${error.message}`
    );
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      void shutdown(
        code ?? 1,
        `local test tool exited unexpectedly (${signal ?? code ?? "unknown"}).`
      );
    }
  });
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
    if (intentionalStops.delete(child)) return;
    if (!shuttingDown) {
      void shutdown(
        code ?? 1,
        `${packageName} exited unexpectedly (${signal ?? code ?? "unknown"}).`
      );
    }
  });
  return child;
}

async function waitForProcessExit(child, timeoutMs = 15_000) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The E2E API process did not stop before timeout.")),
      timeoutMs
    );
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function listenControlServer(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(controlPort, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function shutdown(exitCode, reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (reason) process.stderr.write(`${reason}\n`);
  for (const child of [...processes].reverse()) {
    stopProcessTree(child);
  }
  if (controlServer) {
    await new Promise((resolve) => controlServer.close(resolve)).catch(
      () => undefined
    );
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
    assertPortAvailable(apiPort, "API"),
    assertPortAvailable(webPort, "Web")
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
      "scripts/sample/seed-cli.ts"
    ],
    databaseEnvironment
  );
  runPnpm(
    ["--filter", "@edu-agent/contracts", "build"],
    databaseEnvironment
  );
  runPnpm(
    ["--filter", "@edu-agent/web", "build"],
    databaseEnvironment
  );
  const { apiRoutes } = await import(
    "../../packages/contracts/dist/api-routes.js"
  );
  const applicationEnvironment = {
    ...databaseEnvironment,
    APP_ENV: "test",
    DEMO_AUTH_BYPASS: "false",
    IDENTITY_PROVIDER_MODE: "local",
    LOCAL_IDENTITY_PROVIDER_ENABLED: "true",
    ALLOW_TEST_IDENTITY_HEADERS: "true",
    WEB_ALLOWED_ORIGINS: webOrigin,
    COPILOT_OUTBOX_WORKER_ENABLED: "true",
    GATE2_DEMO_ENABLED: "true",
    LOCAL_DEMO_DIAGNOSTICS: "true",
    MODEL_PROVIDER_MODE:
      modelMode === "ark-fake" ? "ark" : "mock",
    ENABLE_LIVE_MODEL_TESTS: "false",
    MODEL_DEBUG_CONTENT: "false",
    PORT: String(apiPort),
    E2E_API_ORIGIN: apiOrigin,
    E2E_WEB_PORT: String(webPort)
  };
  if (modelMode === "ark-fake") {
    if (!Number.isInteger(fakeArkPort) || fakeArkPort < 1) {
      throw new Error(
        "Fake Ark mode requires a valid local port."
      );
    }
    Object.assign(applicationEnvironment, {
      ARK_BASE_URL: `http://127.0.0.1:${fakeArkPort}/api/v3`,
      ARK_API_KEY: "placeholder-for-local-fake",
      ARK_MODEL_ID: "synthetic-ark-model",
      ARK_MODEL_DISPLAY_NAME: "Synthetic Ark Model",
      ARK_API_MODE: "chat_completions",
      MODEL_REQUEST_TIMEOUT_MS: "1500",
      MODEL_MAX_OUTPUT_TOKENS: "512",
      MODEL_MAX_RETRIES: "2",
      E2E_FAKE_ARK_PORT: String(fakeArkPort)
    });
    startTool(
      [
        "exec",
        "tsx",
        "tests/support/fake-ark-server-cli.ts"
      ],
      applicationEnvironment
    );
    await waitForJson(
      `http://127.0.0.1:${fakeArkPort}/__fake_ark/status`,
      (payload) =>
        payload?.provider === "fake-volcengine-ark"
    );
  }

  let apiProcess = startPackage(
    "@edu-agent/api",
    applicationEnvironment,
    "start:local"
  );
  await waitForJson(
    `${apiOrigin}${apiRoutes.health}`,
    (payload) => payload?.status === "ok"
  );
  await waitForJson(
    `${apiOrigin}${apiRoutes.demo.bootstrap}`,
    (payload) => payload?.identity?.dataMode === "synthetic"
  );
  let restartInProgress = false;
  controlServer = createHttpServer(async (request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    if (
      request.method !== "POST" ||
      request.url !== "/__e2e/restart-api"
    ) {
      response.statusCode = 404;
      response.end(JSON.stringify({ code: "E2E_CONTROL_NOT_FOUND" }));
      return;
    }
    if (request.headers["x-e2e-run-id"] !== runId) {
      response.statusCode = 403;
      response.end(JSON.stringify({ code: "E2E_CONTROL_FORBIDDEN" }));
      return;
    }
    if (restartInProgress) {
      response.statusCode = 409;
      response.end(JSON.stringify({ code: "E2E_RESTART_IN_PROGRESS" }));
      return;
    }
    restartInProgress = true;
    try {
      intentionalStops.add(apiProcess);
      stopProcessTree(apiProcess);
      await waitForProcessExit(apiProcess);
      apiProcess = startPackage(
        "@edu-agent/api",
        applicationEnvironment,
        "start:local"
      );
      await waitForJson(
        `${apiOrigin}${apiRoutes.health}`,
        (payload) => payload?.status === "ok"
      );
      await waitForJson(
        `${apiOrigin}${apiRoutes.demo.bootstrap}`,
        (payload) => payload?.identity?.dataMode === "synthetic"
      );
      response.statusCode = 200;
      response.end(JSON.stringify({ restarted: true, runId }));
    } catch (error) {
      response.statusCode = 500;
      response.end(
        JSON.stringify({
          code: "E2E_API_RESTART_FAILED",
          message: error instanceof Error ? error.message : String(error)
        })
      );
    } finally {
      restartInProgress = false;
    }
  });
  await listenControlServer(controlServer);
  startPackage(
    "@edu-agent/web",
    applicationEnvironment,
    "preview"
  );
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

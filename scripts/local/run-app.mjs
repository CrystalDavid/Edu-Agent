import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

import { prepareLocalEnvironment } from "./prepare.mjs";
import {
  readLocalPostgresEnvironment,
  runPnpm,
  spawnPnpm,
  stopProcessTree
} from "./process-utils.mjs";

const apiOrigin = "http://localhost:3001";
const webOrigin = "http://localhost:5173";
const seedSampleData = process.argv.includes("--sample-data");
const rootModelEnvironmentPath = resolve(".env.local");
if (existsSync(rootModelEnvironmentPath)) {
  loadEnvFile(rootModelEnvironmentPath);
}
const modelProviderMode =
  process.env.MODEL_PROVIDER_MODE === "ark"
    ? "ark"
    : "mock";
const expectedActiveProvider =
  modelProviderMode === "ark"
    ? "volcengine-ark"
    : "mock";
const processes = [];
let shuttingDown = false;

async function assertPortAvailable(port, label) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", () => {
      reject(
        new Error(
          `${label} 端口 ${port} 已被占用；请先停止旧的应用进程。`
        )
      );
    });
    server.listen({ port }, () => {
      server.close(resolve);
    });
  });
}

async function waitForJson(
  url,
  validate,
  timeoutMs = 45_000,
  headers = {}
) {
  const startedAt = Date.now();
  let lastStatus = "尚未收到响应";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { headers });
      lastStatus = `HTTP ${response.status}`;
      if (response.ok) {
        const payload = await response.json();
        if (validate(payload)) return payload;
        lastStatus = "响应不符合启动契约";
      }
    } catch {
      lastStatus = "服务尚未接受连接";
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} 启动检查超时：${lastStatus}`);
}

async function createReadinessSession(localLoginUrl) {
  const response = await fetch(localLoginUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile: "teacher", returnTo: "/overview" })
  });
  if (!response.ok) {
    throw new Error(`本地身份启动检查失败：HTTP ${response.status}`);
  }
  const status = await response.json();
  if (
    status?.authenticated !== true ||
    status?.authenticationMethod !== "local-identity"
  ) {
    throw new Error("本地身份启动检查未建立服务端会话。");
  }
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  return {
    cookie,
    "x-csrf-token": status.csrfToken
  };
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
  throw new Error(`${url} 首页启动检查超时。`);
}

function startPackage(packageName, environment, script = "dev") {
  const child = spawnPnpm(
    ["--filter", packageName, script],
    environment
  );
  processes.push(child);
  child.on("error", (error) => {
    void shutdown(1, `${packageName} 启动失败：${error.message}`);
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      void shutdown(
        code ?? 1,
        `${packageName} 意外退出（${signal ?? code ?? "unknown"}）。`
      );
    }
  });
  return child;
}

async function shutdown(exitCode, reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (reason) process.stderr.write(`${reason}\n`);
  for (const child of [...processes].reverse()) {
    stopProcessTree(child);
  }
  process.exitCode = exitCode;
}

try {
  runPnpm(["app:doctor"]);
  await Promise.all([
    assertPortAvailable(3001, "API"),
    assertPortAvailable(5173, "Web")
  ]);
  prepareLocalEnvironment({ seedSampleData });
  runPnpm(["--filter", "@edu-agent/contracts", "build"]);
  const { apiRoutes } = await import(
    "../../packages/contracts/dist/api-routes.js"
  );
  const environment = {
    ...readLocalPostgresEnvironment(),
    APP_ENV: "local",
    DEMO_AUTH_BYPASS: process.env.DEMO_AUTH_BYPASS ?? "false",
    IDENTITY_PROVIDER_MODE:
      process.env.IDENTITY_PROVIDER_MODE ?? "local",
    LOCAL_IDENTITY_PROVIDER_ENABLED:
      process.env.LOCAL_IDENTITY_PROVIDER_ENABLED ?? "true",
    COPILOT_OUTBOX_WORKER_ENABLED: "true",
    GATE2_DEMO_ENABLED: "true",
    LOCAL_DEMO_DIAGNOSTICS: "true",
    LOCAL_OBJECT_STORE_ROOT:
      resolve(
        process.env.LOCAL_OBJECT_STORE_ROOT ??
        ".local-data/object-store"
      ),
    PORT: "3001"
  };

  startPackage("@edu-agent/api", environment, "start:local");
  await waitForJson(
    `${apiOrigin}${apiRoutes.health}`,
    (payload) =>
      payload?.status === "ok" &&
      payload?.service === "edu-agent-api" &&
      payload?.mode === modelProviderMode
  );
  await waitForJson(
    `${apiOrigin}${apiRoutes.authentication.provider}`,
    (payload) => payload?.available === true
  );
  if (seedSampleData) {
    const readinessHeaders = await createReadinessSession(
      `${apiOrigin}${apiRoutes.authentication.localLogin}`
    );
    await waitForJson(
      `${apiOrigin}${apiRoutes.demo.bootstrap}`,
      (payload) => payload?.identity?.dataMode === "synthetic",
      45_000,
      readinessHeaders
    );
    await waitForJson(
      `${apiOrigin}${apiRoutes.teacher.modelProviderAvailability}`,
      (payload) =>
        payload?.activeProvider === expectedActiveProvider &&
        payload?.fallbackToMock === false,
      45_000,
      readinessHeaders
    );
  }

  startPackage("@edu-agent/web", environment);
  await waitForHtml(`${webOrigin}/`);
  await waitForJson(
    `${webOrigin}${apiRoutes.authentication.provider}`,
    (payload) => payload?.available === true
  );

  process.stdout.write(
    "\n教师工作台：http://localhost:5173/\n" +
      `生成服务：${expectedActiveProvider}；` +
      (seedSampleData ? "示例数据已载入。\n" : "使用当前数据库。\n")
  );
} catch (error) {
  await shutdown(
    1,
    error instanceof Error ? error.message : String(error)
  );
}

process.on("SIGINT", () => {
  void shutdown(0, "正在停止应用进程。");
});
process.on("SIGTERM", () => {
  void shutdown(0, "正在停止应用进程。");
});

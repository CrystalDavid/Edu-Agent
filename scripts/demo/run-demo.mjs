import { createServer } from "node:net";

import { prepareDemo } from "./prepare-demo.mjs";
import {
  readLocalPostgresEnvironment,
  runPnpm,
  spawnPnpm,
  stopProcessTree
} from "./process-utils.mjs";

const apiOrigin = "http://localhost:3001";
const webOrigin = "http://localhost:5173";
const processes = [];
let shuttingDown = false;

async function assertPortAvailable(port, label) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", () => {
      reject(
        new Error(
          `${label} 端口 ${port} 已被占用；请先停止旧的本地演示进程。`
        )
      );
    });
    server.listen({ port }, () => {
      server.close(resolve);
    });
  });
}

async function waitForJson(url, validate, timeoutMs = 45_000) {
  const startedAt = Date.now();
  let lastStatus = "尚未收到响应";
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
        lastStatus = "响应不符合启动契约";
      }
    } catch {
      lastStatus = "服务尚未接受连接";
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} 启动检查超时：${lastStatus}`);
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
  runPnpm(["demo:doctor"]);
  await Promise.all([
    assertPortAvailable(3001, "API"),
    assertPortAvailable(5173, "Web")
  ]);
  prepareDemo();
  runPnpm(["--filter", "@edu-agent/contracts", "build"]);
  const { apiRoutes } = await import(
    "../../packages/contracts/dist/api-routes.js"
  );
  const environment = {
    ...readLocalPostgresEnvironment(),
    APP_ENV: "local",
    DEMO_AUTH_BYPASS: "true",
    GATE2_DEMO_ENABLED: "true",
    LOCAL_DEMO_DIAGNOSTICS: "true",
    PORT: "3001"
  };

  startPackage("@edu-agent/api", environment, "demo");
  await waitForJson(
    `${apiOrigin}${apiRoutes.health}`,
    (payload) =>
      payload?.status === "ok" &&
      payload?.service === "edu-agent-api" &&
      payload?.mode === "mock"
  );
  await waitForJson(
    `${apiOrigin}${apiRoutes.demo.bootstrap}`,
    (payload) =>
      payload?.identity?.dataMode === "synthetic" &&
      payload?.identity?.modelMode === "mock"
  );

  startPackage("@edu-agent/web", environment);
  await waitForHtml(`${webOrigin}/`);
  await waitForJson(
    `${webOrigin}${apiRoutes.demo.bootstrap}`,
    (payload) =>
      payload?.identity?.dataMode === "synthetic" &&
      payload?.identity?.modelMode === "mock"
  );

  process.stdout.write(
    "\n教师验收入口：http://localhost:5173/\n" +
      "模式：Mock；数据：全部合成；外部模型：关闭。\n"
  );
} catch (error) {
  await shutdown(
    1,
    error instanceof Error ? error.message : String(error)
  );
}

process.on("SIGINT", () => {
  void shutdown(0, "正在停止本地演示进程。");
});
process.on("SIGTERM", () => {
  void shutdown(0, "正在停止本地演示进程。");
});

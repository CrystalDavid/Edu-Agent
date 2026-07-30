import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

import { childEnvironment } from "../tool-environment.mjs";

const expectedPackageManager = "pnpm@11.9.0";
const results = [];

function record(name, status, detail) {
  results.push({ name, status, detail });
}

function run(executable, args) {
  return spawnSync(executable, args, {
    cwd: process.cwd(),
    env: childEnvironment(),
    encoding: "utf8",
    windowsHide: true
  });
}

async function portStatus(port) {
  return new Promise((resolveStatus) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolveStatus("occupied"));
    server.listen({ port }, () => {
      server.close(() => resolveStatus("available"));
    });
  });
}

const packageJsonPath = resolve("package.json");
if (!existsSync(packageJsonPath)) {
  record("项目目录", "fail", "当前目录没有 package.json");
} else {
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, "utf8")
  );
  record(
    "项目目录",
    packageJson.name === "edu-agent" ? "pass" : "fail",
    resolve(".")
  );
  record(
    "包管理器声明",
    packageJson.packageManager === expectedPackageManager
      ? "pass"
      : "fail",
    packageJson.packageManager ?? "未声明"
  );
}

if (!process.env.npm_execpath) {
  record(
    "Corepack / pnpm",
    "fail",
    "请通过 corepack pnpm demo:doctor 启动"
  );
} else {
  const pnpm = run(process.execPath, [
    process.env.npm_execpath,
    "--version"
  ]);
  const version = pnpm.stdout.trim();
  record(
    "pnpm 版本",
    pnpm.status === 0 && version === "11.9.0"
      ? "pass"
      : "fail",
    version || "无法读取"
  );
}

const docker = run("docker", [
  "version",
  "--format",
  "{{.Server.Version}}"
]);
record(
  "Docker Engine",
  docker.status === 0 ? "pass" : "fail",
  docker.status === 0
    ? `可用（${docker.stdout.trim()}）`
    : "不可用；请启动 Docker Desktop"
);

const compose = run("docker", ["compose", "version", "--short"]);
record(
  "Docker Compose",
  compose.status === 0 ? "pass" : "fail",
  compose.status === 0
    ? `可用（${compose.stdout.trim()}）`
    : "不可用"
);

record(
  "本地数据库环境",
  existsSync(resolve("infra/docker/.env.local"))
    ? "pass"
    : "info",
  existsSync(resolve("infra/docker/.env.local"))
    ? "已存在且被 Git 忽略"
    : "首次 demo:dev 会生成随机本地凭据"
);

for (const [label, port] of [
  ["PostgreSQL 主机端口", 55432],
  ["API 端口", 3001],
  ["Web 端口", 5173]
]) {
  record(label, "info", `${port}：${await portStatus(port)}`);
}

for (const result of results) {
  const marker =
    result.status === "pass"
      ? "PASS"
      : result.status === "fail"
        ? "FAIL"
        : "INFO";
  process.stdout.write(
    `[${marker}] ${result.name} — ${result.detail}\n`
  );
}

if (results.some((result) => result.status === "fail")) {
  process.exitCode = 1;
} else {
  process.stdout.write(
    "[PASS] Demo Doctor — 本机具备运行 Mock 合成演示的基础条件。\n"
  );
}

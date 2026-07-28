import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { childEnvironment } from "../tool-environment.mjs";

function pnpmInvocation(args) {
  if (!process.env.npm_execpath) {
    throw new Error(
      "Demo scripts must be started through pnpm (for example: pnpm demo:dev)."
    );
  }
  return {
    executable: process.execPath,
    args: [process.env.npm_execpath, ...args]
  };
}

export function runPnpm(args) {
  const invocation = pnpmInvocation(args);
  const result = spawnSync(invocation.executable, invocation.args, {
    cwd: process.cwd(),
    env: childEnvironment(),
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `pnpm ${args.join(" ")} failed with exit code ${result.status}.`
    );
  }
}

export function readLocalPostgresEnvironment() {
  const path = resolve("infra/docker/.env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 1) {
          throw new Error(
            "Invalid local PostgreSQL environment file."
          );
        }
        return [
          line.slice(0, separator),
          line.slice(separator + 1)
        ];
      })
  );
}

export function spawnPnpm(args, environment) {
  const invocation = pnpmInvocation(args);
  return spawn(invocation.executable, invocation.args, {
    cwd: process.cwd(),
    env: childEnvironment(environment),
    stdio: "inherit",
    windowsHide: true
  });
}

export function stopProcessTree(child) {
  if (!child || child.exitCode !== null || child.signalCode) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync(
      "taskkill",
      ["/pid", String(child.pid), "/T", "/F"],
      {
        env: childEnvironment(),
        stdio: "ignore",
        windowsHide: true
      }
    );
    return;
  }
  child.kill("SIGTERM");
}

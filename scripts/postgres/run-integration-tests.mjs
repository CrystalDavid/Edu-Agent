import { spawnSync } from "node:child_process";

function run(command, args) {
  const usePnpmEntrypoint =
    command === "pnpm" && Boolean(process.env.npm_execpath);
  const executable = usePnpmEntrypoint
    ? process.execPath
    : command === "node"
      ? process.execPath
      : command;
  const executableArgs = usePnpmEntrypoint
    ? [process.env.npm_execpath, ...args]
    : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("pnpm", ["db:env"]);
run("pnpm", ["db:up"]);
run("pnpm", ["db:migrate"]);
run("node", [
  "scripts/postgres/run-with-local-env.mjs",
  "pnpm",
  "exec",
  "vitest",
  "run",
  "--config",
  "vitest.postgres.config.ts"
]);

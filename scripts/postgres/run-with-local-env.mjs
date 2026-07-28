import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  throw new Error("A command is required.");
}

const envPath = resolve("infra/docker/.env.local");
const localEnvironment = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator < 1) {
        throw new Error("Invalid local PostgreSQL environment file.");
      }
      return [line.slice(0, separator), line.slice(separator + 1)];
    })
);

const usePnpmEntrypoint =
  command === "pnpm" && Boolean(process.env.npm_execpath);
const executable = usePnpmEntrypoint ? process.execPath : command;
const executableArgs = usePnpmEntrypoint
  ? [process.env.npm_execpath, ...args]
  : args;
const result = spawnSync(executable, executableArgs, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ...localEnvironment
  },
  stdio: "inherit",
  windowsHide: true
});

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);

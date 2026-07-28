import { prepareDemo } from "./prepare-demo.mjs";
import {
  readLocalPostgresEnvironment,
  spawnPnpm
} from "./process-utils.mjs";

prepareDemo();

const child = spawnPnpm(
  [
    "--parallel",
    "--filter",
    "@edu-agent/api",
    "--filter",
    "@edu-agent/web",
    "dev"
  ],
  {
    ...readLocalPostgresEnvironment(),
    GATE2_DEMO_ENABLED: "true",
    PORT: "3001"
  }
);

function stop(signal) {
  if (!child.killed) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

child.on("error", (error) => {
  throw error;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exitCode = 0;
    return;
  }
  process.exitCode = code ?? 1;
});

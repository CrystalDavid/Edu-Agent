import { runPnpm } from "./process-utils.mjs";

runPnpm(["db:clean"]);
await import("./run-demo.mjs");

import { pathToFileURL } from "node:url";

import { runPnpm } from "./process-utils.mjs";

export function prepareLocalEnvironment({ seedSampleData = false } = {}) {
  runPnpm(["db:env"]);
  runPnpm(["db:up"]);
  runPnpm(["db:migrate"]);
  if (seedSampleData) {
    runPnpm(["sample:seed"]);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  prepareLocalEnvironment({
    seedSampleData: process.argv.includes("--sample-data")
  });
}

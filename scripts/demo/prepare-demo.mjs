import { pathToFileURL } from "node:url";

import { runPnpm } from "./process-utils.mjs";

export function prepareDemo() {
  runPnpm(["db:env"]);
  runPnpm(["db:up"]);
  runPnpm(["db:migrate"]);
  runPnpm(["demo:seed"]);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  prepareDemo();
}

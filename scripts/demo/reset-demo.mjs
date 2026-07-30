import { prepareDemo } from "./prepare-demo.mjs";
import { runPnpm } from "./process-utils.mjs";

runPnpm(["db:clean"]);
prepareDemo();

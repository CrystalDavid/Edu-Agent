import { prepareLocalEnvironment } from "./prepare.mjs";
import { runPnpm } from "./process-utils.mjs";

runPnpm(["db:clean"]);
prepareLocalEnvironment();

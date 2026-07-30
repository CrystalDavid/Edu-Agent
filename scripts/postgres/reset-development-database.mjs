import {
  assertDestructiveDevelopmentResetAllowed,
  developmentComposeEnvironment,
  developmentVolumeName,
  runCompose
} from "./database-lifecycle.mjs";

assertDestructiveDevelopmentResetAllowed();
const environment = developmentComposeEnvironment();

process.stdout.write(
  `Deleting explicitly authorized development volume ${developmentVolumeName}.\n`
);
runCompose(
  environment,
  "down",
  "--volumes",
  "--remove-orphans"
);

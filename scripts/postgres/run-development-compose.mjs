import {
  developmentComposeEnvironment,
  runCompose
} from "./database-lifecycle.mjs";

const action = process.argv[2];
if (action !== "up" && action !== "down") {
  throw new Error(
    "Expected `up` or `down` for the development database."
  );
}

const environment = developmentComposeEnvironment();
if (action === "up") {
  runCompose(environment, "up", "-d", "--wait");
} else {
  runCompose(environment, "down", "--remove-orphans");
}

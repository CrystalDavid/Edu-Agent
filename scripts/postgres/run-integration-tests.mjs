import { createServer } from "node:net";
import { isDeepStrictEqual } from "node:util";

import { runPnpm } from "../demo/process-utils.mjs";
import {
  createE2eDatabaseEnvironment,
  createE2eRunId,
  e2eVolumeName,
  inspectVolumeIdentity,
  runCompose,
  snapshotProtectedLocalState
} from "./database-lifecycle.mjs";

async function allocatePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(
      { host: "127.0.0.1", port: 0 },
      () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(
            new Error(
              "Unable to allocate a PostgreSQL integration-test port."
            )
          );
          return;
        }
        server.close(() => resolve(address.port));
      }
    );
  });
}

const runId = createE2eRunId();
const environment = createE2eDatabaseEnvironment(
  runId,
  await allocatePort()
);
const volumeName = e2eVolumeName(runId);
const protectedStateBefore = snapshotProtectedLocalState();
let failure;

try {
  runCompose(environment, "up", "-d", "--wait");
  runPnpm(
    [
      "exec",
      "tsx",
      "apps/api/src/platform/postgres/bootstrap-cli.ts"
    ],
    environment
  );
  runPnpm(
    [
      "exec",
      "vitest",
      "run",
      "--config",
      "vitest.postgres.config.ts",
      ...process.argv.slice(2)
    ],
    environment
  );
} catch (error) {
  failure = error;
} finally {
  try {
    runCompose(
      environment,
      "down",
      "--volumes",
      "--remove-orphans"
    );
  } catch (cleanupError) {
    failure ??= cleanupError;
  }
}

const protectedStateAfter = snapshotProtectedLocalState();
if (!isDeepStrictEqual(protectedStateAfter, protectedStateBefore)) {
  throw new Error(
    "PostgreSQL integration tests changed the development volume, " +
      ".env.local, or local upload directory."
  );
}
if (inspectVolumeIdentity(volumeName)) {
  throw new Error(
    `Integration-test volume ${volumeName} was not cleaned up.`
  );
}
if (failure) throw failure;

process.stdout.write(
  `PostgreSQL tests used and removed isolated volume ${volumeName}; development state is unchanged.\n`
);

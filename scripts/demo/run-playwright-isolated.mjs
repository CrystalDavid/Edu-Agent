import { createServer } from "node:net";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";

import { childEnvironment } from "../tool-environment.mjs";
import {
  createE2eDatabaseEnvironment,
  createE2eRunId,
  e2eVolumeName,
  inspectVolumeIdentity,
  runCompose,
  snapshotProtectedLocalState
} from "../postgres/database-lifecycle.mjs";

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
          reject(new Error("Unable to allocate an E2E PostgreSQL port."));
          return;
        }
        server.close(() => resolve(address.port));
      }
    );
  });
}

function runPlaywright(environment) {
  if (!process.env.npm_execpath) {
    throw new Error("Run Playwright through `pnpm test:playwright`.");
  }
  return spawnSync(
    process.execPath,
    [
      process.env.npm_execpath,
      "exec",
      "playwright",
      "test",
      ...process.argv.slice(2)
    ],
    {
      cwd: process.cwd(),
      env: childEnvironment(environment),
      stdio: "inherit",
      windowsHide: true
    }
  );
}

const runId = createE2eRunId();
const databasePort = await allocatePort();
const apiPort = await allocatePort();
const webPort = await allocatePort();
const databaseEnvironment = createE2eDatabaseEnvironment(
  runId,
  databasePort
);
databaseEnvironment.E2E_API_PORT = String(apiPort);
databaseEnvironment.E2E_WEB_PORT = String(webPort);
const volumeName = e2eVolumeName(runId);
const protectedStateBefore = snapshotProtectedLocalState();

if (inspectVolumeIdentity(volumeName)) {
  throw new Error(
    `Refusing to reuse pre-existing E2E volume ${volumeName}.`
  );
}

let result;
try {
  result = runPlaywright(databaseEnvironment);
  if (result.error) throw result.error;
} finally {
  runCompose(
    databaseEnvironment,
    "down",
    "--volumes",
    "--remove-orphans"
  );
}

const protectedStateAfter = snapshotProtectedLocalState();
if (!isDeepStrictEqual(protectedStateAfter, protectedStateBefore)) {
  throw new Error(
    "Playwright changed protected local state: the development volume, " +
      ".env.local, or local upload directory differs from the pre-test snapshot."
  );
}
if (inspectVolumeIdentity(volumeName)) {
  throw new Error(`E2E volume ${volumeName} was not cleaned up.`);
}

process.stdout.write(
  `E2E database ${volumeName} was isolated and removed; development state is unchanged.\n`
);
process.exit(result?.status ?? 1);

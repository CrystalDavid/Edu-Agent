import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { createApp } from "./app.js";
import {
  createProductContainer
} from "./composition/product-container.js";
import {
  createDemoIdentityPolicy
} from "./platform/demo-identity.js";
import {
  readPostgresEnvironment
} from "./platform/postgres/config.js";

const port = Number(process.env.PORT ?? 3001);
const localOrDemo =
  process.env.APP_ENV === "local" ||
  process.env.APP_ENV === "demo";
if (
  localOrDemo &&
  !process.env.POSTGRES_HOST &&
  !process.env.POSTGRES_APP_PASSWORD
) {
  const localEnvironmentPath = fileURLToPath(
    new URL(
      "../../../infra/docker/.env.local",
      import.meta.url
    )
  );
  if (existsSync(localEnvironmentPath)) {
    loadEnvFile(localEnvironmentPath);
  }
}

const product = createProductContainer(
  readPostgresEnvironment()
);
const app = createApp({
  product,
  demoIdentity: createDemoIdentityPolicy()
});
if (process.env.COPILOT_OUTBOX_WORKER_ENABLED === "true") {
  product.workers.copilotOutbox.start();
  process.stdout.write(
    "Teacher Copilot local outbox worker enabled.\n"
  );
}

const server = app.listen(port, () => {
  process.stdout.write(
    "Edu Agent PostgreSQL product API " +
      `listening on http://localhost:${port}\n`
  );
});

async function shutdown(): Promise<void> {
  server.close();
  await product.close();
}

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

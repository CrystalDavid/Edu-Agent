import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import {
  readModelProviderSettings
} from "../modules/capability-integration/infrastructure/model-provider-config.js";
import {
  readPostgresEnvironment
} from "../platform/postgres/config.js";
import { createProductContainer } from "./product-container.js";

const rootEnvironmentPath = fileURLToPath(
  new URL("../../../../.env.local", import.meta.url)
);
if (existsSync(rootEnvironmentPath)) {
  loadEnvFile(rootEnvironmentPath);
}
if (
  !process.env.POSTGRES_HOST &&
  !process.env.POSTGRES_APP_PASSWORD
) {
  const localPostgresEnvironmentPath = fileURLToPath(
    new URL(
      "../../../../infra/docker/.env.local",
      import.meta.url
    )
  );
  if (existsSync(localPostgresEnvironmentPath)) {
    loadEnvFile(localPostgresEnvironmentPath);
  }
}

if (
  process.env.ENABLE_LIVE_MODEL_TESTS !== "true" ||
  process.env.MODEL_PROVIDER_MODE !== "ark"
) {
  throw new Error(
    "Live capability probe is disabled. Set ENABLE_LIVE_MODEL_TESTS=true and MODEL_PROVIDER_MODE=ark explicitly."
  );
}

const settings = readModelProviderSettings();
if (!settings.ark) {
  throw new Error(
    "Volcengine Ark is not fully configured. No network request was made."
  );
}

const product = createProductContainer(
  readPostgresEnvironment(),
  { modelSettings: settings }
);
try {
  const summary =
    await product.services.modelInvocations.runCapabilityProbe();
  process.stdout.write(
    `${JSON.stringify(summary, null, 2)}\n`
  );
} finally {
  await product.close();
}

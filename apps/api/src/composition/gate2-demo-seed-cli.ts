import { createProductContainer } from "./product-container.js";
import {
  readPostgresEnvironment
} from "../platform/postgres/config.js";

const container = createProductContainer(
  readPostgresEnvironment()
);

try {
  const result = await container.services.seed.seed({
    includeGate25: true
  });
  process.stdout.write(
    `Gate 2 synthetic demo ready: ${result.courseRunRef}` +
      `${result.replayed ? " (replayed)" : ""}\n`
  );
} finally {
  await container.close();
}

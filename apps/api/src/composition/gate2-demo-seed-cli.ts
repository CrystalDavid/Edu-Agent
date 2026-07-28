import { createGate2Container } from "./gate2-container.js";
import {
  readPostgresEnvironment
} from "../platform/postgres/config.js";

const container = createGate2Container(
  readPostgresEnvironment()
);

try {
  const result = await container.services.seed.seed();
  process.stdout.write(
    `Gate 2 synthetic demo ready: ${result.courseRunRef}` +
      `${result.replayed ? " (replayed)" : ""}\n`
  );
} finally {
  await container.close();
}

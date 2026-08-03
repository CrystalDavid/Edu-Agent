import {
  readPostgresEnvironment
} from "../../apps/api/src/platform/postgres/config.js";
import {
  createRolePool
} from "../../apps/api/src/platform/postgres/pool.js";
import { Gate2DemoSeedService } from "./gate2-demo-seed-service.js";

const pool = createRolePool(readPostgresEnvironment(), "app", {
  max: 2,
  connectionTimeoutMillis: 3_000
});

try {
  const result = await new Gate2DemoSeedService(pool).seed({
    includeGate25: true,
    includeGate27: true
  });
  process.stdout.write(
    `Gate 2 synthetic demo ready: ${result.courseRunRef}` +
      `${result.replayed ? " (replayed)" : ""}\n`
  );
} finally {
  await pool.end();
}

import type { PostgresEnvironment } from "../../apps/api/src/platform/postgres/config.js";
import { createRolePool } from "../../apps/api/src/platform/postgres/pool.js";

import { Gate2DemoSeedService } from "./gate2-demo-seed-service.js";

export async function seedSampleData(
  environment: PostgresEnvironment,
  options: { includeGate25?: boolean; includeGate27?: boolean } = {}
) {
  const pool = createRolePool(environment, "app", {
    max: 2,
    connectionTimeoutMillis: 3_000
  });
  try {
    return await new Gate2DemoSeedService(pool).seed(options);
  } finally {
    await pool.end();
  }
}

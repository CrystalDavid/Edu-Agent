import { Pool, type PoolConfig } from "pg";

import {
  postgresUrls,
  type PostgresEnvironment
} from "./config.js";

export type PostgresRole =
  | "admin"
  | "migrator"
  | "app"
  | "runtime"
  | "worker";

export function createRolePool(
  environment: PostgresEnvironment,
  role: PostgresRole,
  overrides: Partial<PoolConfig> = {}
): Pool {
  const urls = postgresUrls(environment);
  return new Pool({
    connectionString: urls[role],
    max: 4,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 2_000,
    allowExitOnIdle: true,
    ...overrides
  });
}

export { Pool };

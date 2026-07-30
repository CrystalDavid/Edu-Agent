import type { PostgresEnvironment } from "../platform/postgres/config.js";
import { createRolePool } from "../platform/postgres/pool.js";
import { Gate2DemoSeedService } from "./gate2-demo-seed-service.js";
import {
  PostgresDemoIdentityAuditService
} from "./postgres-demo-identity-audit-service.js";
import { PostgresGate2ReadService } from "./postgres-gate2-read-service.js";
import {
  PostgresGate2TeacherCopilotService
} from "./postgres-gate2-teacher-copilot-service.js";

export function createProductContainer(
  environment: PostgresEnvironment
) {
  const appPool = createRolePool(environment, "app", {
    max: 6,
    connectionTimeoutMillis: 3_000
  });
  return {
    services: {
      seed: new Gate2DemoSeedService(appPool),
      read: new PostgresGate2ReadService(appPool),
      demoIdentityAudit:
        new PostgresDemoIdentityAuditService(appPool),
      teacherCopilot:
        new PostgresGate2TeacherCopilotService(appPool)
    },
    async close(): Promise<void> {
      await appPool.end();
    }
  };
}

export type ProductContainer = ReturnType<
  typeof createProductContainer
>;

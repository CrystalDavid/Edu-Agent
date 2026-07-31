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
import {
  PostgresLessonPreparationService
} from "./postgres-lesson-preparation-service.js";
import {
  LocalCopilotOutboxWorker
} from "./local-copilot-outbox-worker.js";
import {
  MockModelProvider
} from "../modules/capability-integration/infrastructure/mock-model-provider.js";
import {
  readModelProviderSettings
} from "../modules/capability-integration/infrastructure/model-provider-config.js";
import {
  VolcengineArkProvider
} from "../modules/capability-integration/infrastructure/volcengine-ark-provider.js";
import type {
  ModelProvider
} from "../modules/capability-integration/domain/capability.js";
import type {
  ModelProviderSettings
} from "../modules/capability-integration/infrastructure/model-provider-config.js";
import {
  PostgresModelInvocationService
} from "./postgres-model-invocation-service.js";

export function createProductContainer(
  environment: PostgresEnvironment,
  options: {
    modelSettings?: ModelProviderSettings;
    modelProvider?: ModelProvider;
  } = {}
) {
  const appPool = createRolePool(environment, "app", {
    max: 6,
    connectionTimeoutMillis: 3_000
  });
  const workerPool = createRolePool(environment, "worker", {
    max: 2,
    connectionTimeoutMillis: 3_000
  });
  const modelSettings =
    options.modelSettings ?? readModelProviderSettings();
  const modelProvider =
    options.modelProvider ??
    (modelSettings.activeProvider === "volcengine-ark" &&
    modelSettings.ark
      ? new VolcengineArkProvider(modelSettings.ark)
      : new MockModelProvider());
  const modelInvocations =
    new PostgresModelInvocationService(
      appPool,
      modelProvider,
      modelSettings
    );
  const copilotOutbox = new LocalCopilotOutboxWorker(
    workerPool,
    undefined,
    100,
    (modelExecutionRef) =>
      modelInvocations.processExecution(modelExecutionRef)
  );
  return {
    services: {
      seed: new Gate2DemoSeedService(appPool),
      read: new PostgresGate2ReadService(appPool),
      demoIdentityAudit:
        new PostgresDemoIdentityAuditService(appPool),
      teacherCopilot:
        new PostgresGate2TeacherCopilotService(appPool),
      modelInvocations,
      lessonPreparation:
        new PostgresLessonPreparationService(appPool)
    },
    workers: {
      copilotOutbox
    },
    async close(): Promise<void> {
      await copilotOutbox.stop();
      await Promise.all([appPool.end(), workerPool.end()]);
    }
  };
}

export type ProductContainer = ReturnType<
  typeof createProductContainer
>;

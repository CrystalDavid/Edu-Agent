import type { PostgresEnvironment } from "../platform/postgres/config.js";
import { createRolePool } from "../platform/postgres/pool.js";
import type {
  TeacherCopilotApplicationFacade
} from "../modules/agent-runtime-context/application/teacher-copilot-facade.js";
import type {
  ModelInvocationApplicationFacade
} from "../modules/capability-integration/application/model-invocation-facade.js";
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
import {
  PostgresFileArtifactService
} from "./postgres-file-artifact-service.js";
import type {
  ObjectStore
} from "../modules/capability-integration/domain/object-store.js";
import {
  LocalObjectStore
} from "../modules/capability-integration/infrastructure/local-object-store.js";
import {
  readObjectStoreSettings,
  type ObjectStoreSettings
} from "../modules/capability-integration/infrastructure/object-store-config.js";
import {
  PostgresAssignmentLearningService
} from "./postgres-assignment-learning-service.js";
import {
  PostgresTeacherWorkbenchService
} from "./postgres-teacher-workbench-service.js";
import {
  PostgresClassroomReflectionService
} from "./postgres-classroom-reflection-service.js";
import {
  readIdentitySettings,
  type IdentitySettings
} from "../platform/auth/config.js";
import type {
  IdentityProvider
} from "../modules/identity-governance-audit/domain/identity-provider.js";
import {
  LocalIdentityProvider
} from "../modules/identity-governance-audit/infrastructure/local-identity-provider.js";
import {
  OidcIdentityProvider
} from "../modules/identity-governance-audit/infrastructure/oidc-identity-provider.js";
import {
  PostgresIdentityOrganizationService
} from "./postgres-identity-organization-service.js";

export function createProductContainer(
  environment: PostgresEnvironment,
  options: {
    modelSettings?: ModelProviderSettings;
    modelProvider?: ModelProvider;
    objectStoreSettings?: ObjectStoreSettings;
    objectStore?: ObjectStore;
    identitySettings?: IdentitySettings;
    identityProvider?: IdentityProvider;
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
  const modelInvocations: ModelInvocationApplicationFacade =
    new PostgresModelInvocationService(
      appPool,
      modelProvider,
      modelSettings
    );
  const objectStoreSettings =
    options.objectStoreSettings ?? readObjectStoreSettings();
  const objectStore =
    options.objectStore ??
    new LocalObjectStore(objectStoreSettings.rootDirectory);
  const identitySettings =
    options.identitySettings ?? readIdentitySettings();
  const localIdentityProvider =
    identitySettings.providerMode === "local"
      ? new LocalIdentityProvider(
          identitySettings.localProviderEnabled,
          identitySettings.localDemoTeacherCredential
        )
      : undefined;
  const identityProvider =
    options.identityProvider ??
    (identitySettings.providerMode === "oidc" && identitySettings.oidc
      ? new OidcIdentityProvider(identitySettings.oidc)
      : localIdentityProvider!);
  const identity = new PostgresIdentityOrganizationService(
    appPool,
    identitySettings,
    identityProvider,
    localIdentityProvider
  );
  const lessonPreparation = new PostgresLessonPreparationService(appPool);
  const teacherWorkbench = new PostgresTeacherWorkbenchService(
    appPool,
    lessonPreparation
  );
  const assignments = new PostgresAssignmentLearningService(appPool);
  const classroomReflection = new PostgresClassroomReflectionService(
    appPool,
    lessonPreparation,
    assignments,
    teacherWorkbench
  );
  const teacherCopilot: TeacherCopilotApplicationFacade =
    new PostgresGate2TeacherCopilotService(appPool);
  const copilotOutbox = new LocalCopilotOutboxWorker(
    workerPool,
    undefined,
    100,
    (modelExecutionRef) =>
      modelInvocations.processExecution(modelExecutionRef),
    async () => {
      let projectionCount = 0;
      for (const scope of await identity.listActiveTeacherScopes()) {
        projectionCount += await teacherWorkbench.refreshProjections(scope);
      }
      return projectionCount;
    }
  );
  return {
    services: {
      identity,
      read: new PostgresGate2ReadService(appPool),
      demoIdentityAudit:
        new PostgresDemoIdentityAuditService(appPool),
      teacherCopilot,
      modelInvocations,
      lessonPreparation,
      assignments,
      teacherWorkbench,
      classroomReflection,
      files: new PostgresFileArtifactService(
        appPool,
        objectStore,
        objectStoreSettings
      )
    },
    infrastructure: {
      objectStore,
      objectStoreSettings
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

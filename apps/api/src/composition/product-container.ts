import { createBuiltInSkillRegistry } from "../agent/skills/index.js";
import type { PostgresEnvironment } from "../platform/postgres/config.js";
import { createRolePool } from "../platform/postgres/pool.js";
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
  readModelProviderSettings
} from "../modules/capability-integration/infrastructure/model-provider-config.js";
import {
  createConfiguredModelProvider
} from "../modules/capability-integration/infrastructure/model-provider-factory.js";
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
  createConfiguredObjectStore
} from "../modules/capability-integration/infrastructure/object-store-factory.js";
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
  createConfiguredIdentityProviders
} from "../modules/identity-governance-audit/infrastructure/identity-provider-factory.js";
import {
  PostgresIdentityOrganizationService
} from "./postgres-identity-organization-service.js";
import { PostgresPersonalizationService } from "./postgres-personalization-service.js";
import { LessonJourneyReadAdapter } from "./lesson-journey-read-adapter.js";
import { LessonJourneyReadService } from "../modules/work-assistant-durable-execution/application/lesson-journey-read-service.js";
import { LessonBriefService } from "../modules/agent-runtime-context/application/lesson-brief-service.js";
import { LessonBriefSourceAdapter } from "./lesson-brief-source-adapter.js";
import { PostgresLessonBriefStore } from "./postgres-lesson-brief-store.js";
import { MaterialGenerationService } from "../modules/agent-runtime-context/application/material-generation-service.js";
import { MaterialGenerationSourceAdapter } from "./material-generation-source-adapter.js";
import { ClassroomFeedbackService } from "../modules/agent-runtime-context/application/classroom-feedback-service.js";
import { ClassroomFeedbackSourceAdapter } from "./classroom-feedback-source-adapter.js";
import { ClassroomFeedbackDeliveryAdapter } from "./classroom-feedback-delivery-adapter.js";
import { NextLessonOptimizationService } from "../modules/agent-runtime-context/application/next-lesson-optimization-service.js";
import { NextLessonOptimizationSourceAdapter } from "./next-lesson-optimization-source-adapter.js";
import { NextLessonActionTargetAdapter } from "./next-lesson-action-target-adapter.js";
import { PostgresNextLessonActionRuntimePort } from "../modules/agent-runtime-context/infrastructure/postgres-next-lesson-action-runtime-port.js";
import { PostgresNextLessonActionGovernancePort } from "../modules/identity-governance-audit/infrastructure/postgres-next-lesson-action-governance-port.js";
import { PostgresNextLessonActionWorkPort } from "../modules/work-assistant-durable-execution/infrastructure/postgres-next-lesson-action-work-port.js";
import { PostgresNextLessonActionStore } from "./postgres-next-lesson-action-store.js";
import { PostgresConversationService } from "./postgres-conversation-service.js";
import {
  readConversationRetentionSettings,
  type ConversationRetentionSettings
} from "../modules/work-assistant-durable-execution/infrastructure/conversation-retention-config.js";
import {
  readMemoryApplicationObservabilitySettings,
  type MemoryApplicationObservabilitySettings
} from "../modules/personalization-memory-analytics/infrastructure/memory-application-observability-config.js";
import { PostgresMemoryApplicationService } from "../modules/personalization-memory-analytics/infrastructure/postgres-memory-application-service.js";

export function createProductContainer(
  environment: PostgresEnvironment,
  options: {
    modelSettings?: ModelProviderSettings;
    modelProvider?: ModelProvider;
    objectStoreSettings?: ObjectStoreSettings;
    objectStore?: ObjectStore;
    identitySettings?: IdentitySettings;
    identityProvider?: IdentityProvider;
    conversationRetentionSettings?: ConversationRetentionSettings;
    memoryApplicationObservabilitySettings?: MemoryApplicationObservabilitySettings;
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
    createConfiguredModelProvider(modelSettings);
  const skillRegistry = createBuiltInSkillRegistry();
  const personalization = new PostgresPersonalizationService(appPool);
  const lessonBriefStore = new PostgresLessonBriefStore(appPool);
  const conversationRetentionSettings =
    options.conversationRetentionSettings ??
    readConversationRetentionSettings();
  const conversations = new PostgresConversationService(appPool, {
    retention: conversationRetentionSettings
  });
  const memoryApplications = new PostgresMemoryApplicationService(
    appPool,
    options.memoryApplicationObservabilitySettings ??
      readMemoryApplicationObservabilitySettings()
  );
  const modelInvocationService = new PostgresModelInvocationService(
    appPool,
    modelProvider,
    modelSettings,
    {
      skills: skillRegistry,
      personalization,
      memoryApplications,
      memoryApplicationObservabilityEnabled: memoryApplications.enabled,
      lessonBriefs: lessonBriefStore,
      conversations
    }
  );
  const modelInvocations: ModelInvocationApplicationFacade =
    modelInvocationService;
  const objectStoreSettings =
    options.objectStoreSettings ?? readObjectStoreSettings();
  const objectStore =
    options.objectStore ??
    createConfiguredObjectStore(objectStoreSettings);
  const identitySettings =
    options.identitySettings ?? readIdentitySettings();
  const configuredIdentityProviders =
    createConfiguredIdentityProviders(identitySettings);
  const identityProvider =
    options.identityProvider ??
    configuredIdentityProviders.identityProvider;
  const identity = new PostgresIdentityOrganizationService(
    appPool,
    identitySettings,
    identityProvider,
    configuredIdentityProviders.localIdentityProvider
  );
  const lessonPreparation = new PostgresLessonPreparationService(appPool);
  const read = new PostgresGate2ReadService(appPool, {
    memoryApplications,
    conversations
  });
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
  const files = new PostgresFileArtifactService(
    appPool,
    objectStore,
    objectStoreSettings
  );
  const teacherCopilot = new PostgresGate2TeacherCopilotService(appPool);
  const lessonBrief = new LessonBriefService(
    new LessonBriefSourceAdapter(
      lessonPreparation,
      read,
      personalization
    ),
    lessonBriefStore,
    skillRegistry
  );
  const materialGeneration = new MaterialGenerationService(
    new MaterialGenerationSourceAdapter(
      lessonPreparation,
      read,
      personalization,
      lessonBriefStore
    ),
    modelInvocationService,
    files,
    skillRegistry
  );
  const classroomFeedback = new ClassroomFeedbackService(
    new ClassroomFeedbackSourceAdapter(
      lessonPreparation,
      read,
      personalization,
      classroomReflection
    ),
    teacherCopilot,
    new ClassroomFeedbackDeliveryAdapter(classroomReflection),
    skillRegistry
  );
  const nextLessonOptimization = new NextLessonOptimizationService(
    new NextLessonOptimizationSourceAdapter(
      classroomReflection,
      lessonPreparation,
      read,
      personalization
    ),
    new PostgresNextLessonActionStore(
      appPool,
      new PostgresNextLessonActionGovernancePort(),
      new PostgresNextLessonActionWorkPort(),
      new PostgresNextLessonActionRuntimePort()
    ),
    new NextLessonActionTargetAdapter(
      classroomReflection,
      lessonPreparation
    ),
    skillRegistry
  );
  const lessonJourney = new LessonJourneyReadService(
    new LessonJourneyReadAdapter(
      lessonPreparation,
      read,
      files,
      classroomReflection,
      lessonBrief,
      nextLessonOptimization
    )
  );
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
    },
    memoryApplications
  );
  return {
    services: {
      identity,
      read,
      demoIdentityAudit:
        new PostgresDemoIdentityAuditService(appPool),
      teacherCopilot,
      modelInvocations,
      lessonPreparation,
      assignments,
      teacherWorkbench,
      classroomReflection,
      lessonJourney,
      lessonBrief,
      materialGeneration,
      classroomFeedback,
      nextLessonOptimization,
      personalization,
      memoryApplications,
      conversations,
      files
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

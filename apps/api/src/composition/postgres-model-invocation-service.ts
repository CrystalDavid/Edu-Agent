import { createHash, randomUUID } from "node:crypto";

import {
  AuthorizedContextPlanSchema,
  CreateModelInvocationResultSchema,
  ReflectionGenerationResultSchema,
  GenerateReflectionRequestSchema,
  ReflectionContentSchema,
  StructuredReflectionOutputSchema,
  ModelExecutionViewSchema,
  ModelUsageSummarySchema,
  ProviderCapabilitiesSchema,
  type AuthorizationDecision,
  type CancelModelInvocationRequest,
  type CreateModelInvocationRequest,
  type CreateModelInvocationResult,
  type FormalWriteReceipt,
  type ModelExecutionView,
  type ModelFailureCategory,
  type ModelProviderName,
  type ModelRequestV2,
  type ProviderCapabilities,
  type RetryModelInvocationRequest,
  type TeachingPlan,
  type TeacherTaskRequest
} from "@edu-agent/contracts";
import type { Pool } from "pg";

import {
  PostgresGate2RuntimeRepository
} from "../modules/agent-runtime-context/infrastructure/postgres-gate2-runtime-repository.js";
import {
  PostgresRuntimeRepository
} from "../modules/agent-runtime-context/infrastructure/postgres-runtime-repository.js";
import {
  PostgresGate2ArtifactRepository
} from "../modules/artifact-collaboration/infrastructure/postgres-gate2-artifact-repository.js";
import { PostgresGate29ArtifactRepository } from "../modules/artifact-collaboration/infrastructure/postgres-gate2-9-artifact-repository.js";
import {
  assembleLessonPreparationModelRequest,
  assembleRepairModelRequest,
  lessonPreparationPromptBundle
} from "../modules/capability-integration/application/lesson-preparation-prompt-bundle.js";
import {
  ModelBudgetPolicy,
  estimateCost
} from "../modules/capability-integration/application/model-budget-policy.js";
import {
  createModelDataManifest,
  detectProhibitedModelInput
} from "../modules/capability-integration/application/model-data-manifest.js";
import {
  validateModelOutput
} from "../modules/capability-integration/application/model-output-validation.js";
import {
  assembleLessonReflectionModelRequest,
  assembleReflectionRepairRequest,
  lessonReflectionPromptBundle
} from "../modules/capability-integration/application/lesson-reflection-prompt-bundle.js";
import { validateReflectionOutput } from "../modules/capability-integration/application/reflection-output-validation.js";
import {
  ProviderCapabilityProbe,
  type ProviderCapabilityProbeResult
} from "../modules/capability-integration/application/provider-capability-probe.js";
import {
  LocalSyntheticModelDebugSink,
  maskProviderRequestId
} from "../modules/capability-integration/application/safe-model-logging.js";
import type {
  ModelProvider
} from "../modules/capability-integration/domain/capability.js";
import type {
  ModelProviderSettings
} from "../modules/capability-integration/infrastructure/model-provider-config.js";
import {
  PostgresModelExecutionRepository,
  type StoredModelExecution
} from "../modules/capability-integration/infrastructure/postgres-model-execution-repository.js";
import {
  VolcengineArkProvider
} from "../modules/capability-integration/infrastructure/volcengine-ark-provider.js";
import {
  PostgresEducationRepository
} from "../modules/education-domain/infrastructure/postgres-education-repository.js";
import {
  PostgresGate25EducationRepository
} from "../modules/education-domain/infrastructure/postgres-gate2-5-education-repository.js";
import { PostgresGate29EducationRepository } from "../modules/education-domain/infrastructure/postgres-gate2-9-education-repository.js";
import {
  PostgresGovernanceRepository
} from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  PostgresGate25WorkRepository,
  type StoredLessonPreparationTask
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-5-work-repository.js";
import {
  PostgresGate2WorkRepository
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-work-repository.js";
import { PostgresGate29WorkRepository } from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-9-work-repository.js";
import {
  PostgresWorkRepository
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-work-repository.js";
import {
  AuthorizationDeniedError,
  DomainConflictError,
  NotFoundError
} from "../platform/errors.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";
import { buildDiff } from "./postgres-gate2-teacher-copilot-service.js";

const GENERATE_PURPOSE =
  "teacher-copilot.adjust-next-lesson";
const MODEL_DATA_PURPOSE =
  "teacher-copilot.lesson-preparation";
const REFLECTION_MODEL_DATA_PURPOSE =
  "teacher-copilot.lesson-reflection";
const CAPABILITY_PROBE_PURPOSE =
  "system.model-provider.capability-probe";

type Clock = () => Date;
type Delay = (milliseconds: number) => Promise<void>;

interface ProviderAttemptMetrics {
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  providerRequestId?: string;
  finishReason?: string;
}

interface ModelInvocationDependencies {
  governance?: PostgresGovernanceRepository;
  work?: PostgresWorkRepository;
  gate2Work?: PostgresGate2WorkRepository;
  gate25Work?: PostgresGate25WorkRepository;
  runtime?: PostgresRuntimeRepository;
  gate2Runtime?: PostgresGate2RuntimeRepository;
  artifacts?: PostgresGate2ArtifactRepository;
  education?: PostgresEducationRepository;
  gate25Education?: PostgresGate25EducationRepository;
  gate29Education?: PostgresGate29EducationRepository;
  gate29Artifacts?: PostgresGate29ArtifactRepository;
  gate29Work?: PostgresGate29WorkRepository;
  executions?: PostgresModelExecutionRepository;
  debugSink?: LocalSyntheticModelDebugSink;
  clock?: Clock;
  delay?: Delay;
  random?: () => number;
}

export class PostgresModelInvocationService {
  private readonly governance: PostgresGovernanceRepository;
  private readonly work: PostgresWorkRepository;
  private readonly gate2Work: PostgresGate2WorkRepository;
  private readonly gate25Work: PostgresGate25WorkRepository;
  private readonly runtime: PostgresRuntimeRepository;
  private readonly gate2Runtime: PostgresGate2RuntimeRepository;
  private readonly artifacts: PostgresGate2ArtifactRepository;
  private readonly education: PostgresEducationRepository;
  private readonly gate25Education: PostgresGate25EducationRepository;
  private readonly gate29Education: PostgresGate29EducationRepository;
  private readonly gate29Artifacts: PostgresGate29ArtifactRepository;
  private readonly gate29Work: PostgresGate29WorkRepository;
  private readonly executions: PostgresModelExecutionRepository;
  private readonly clock: Clock;
  private readonly delay: Delay;
  private readonly random: () => number;
  private readonly budget: ModelBudgetPolicy;
  private readonly debugSink: LocalSyntheticModelDebugSink;
  private readonly activeControllers = new Map<
    string,
    AbortController
  >();

  constructor(
    private readonly pool: Pool,
    private readonly provider: ModelProvider,
    readonly settings: ModelProviderSettings,
    dependencies: ModelInvocationDependencies = {}
  ) {
    this.governance =
      dependencies.governance ??
      new PostgresGovernanceRepository();
    this.work =
      dependencies.work ?? new PostgresWorkRepository();
    this.gate2Work =
      dependencies.gate2Work ??
      new PostgresGate2WorkRepository();
    this.gate25Work =
      dependencies.gate25Work ??
      new PostgresGate25WorkRepository();
    this.runtime =
      dependencies.runtime ?? new PostgresRuntimeRepository();
    this.gate2Runtime =
      dependencies.gate2Runtime ??
      new PostgresGate2RuntimeRepository();
    this.artifacts =
      dependencies.artifacts ??
      new PostgresGate2ArtifactRepository();
    this.education =
      dependencies.education ??
      new PostgresEducationRepository();
    this.gate25Education =
      dependencies.gate25Education ??
      new PostgresGate25EducationRepository();
    this.gate29Education =
      dependencies.gate29Education ?? new PostgresGate29EducationRepository();
    this.gate29Artifacts =
      dependencies.gate29Artifacts ?? new PostgresGate29ArtifactRepository();
    this.gate29Work =
      dependencies.gate29Work ?? new PostgresGate29WorkRepository();
    this.executions =
      dependencies.executions ??
      new PostgresModelExecutionRepository();
    this.clock = dependencies.clock ?? (() => new Date());
    this.delay =
      dependencies.delay ??
      ((milliseconds) =>
        new Promise((resolve) =>
          setTimeout(resolve, milliseconds)
        ));
    this.random = dependencies.random ?? Math.random;
    this.budget = new ModelBudgetPolicy(
      settings.budget,
      this.clock
    );
    this.debugSink =
      dependencies.debugSink ??
      new LocalSyntheticModelDebugSink(
        settings.debugContent,
        settings.appEnvironment
      );
  }

  getAvailability() {
    return this.settings.availability;
  }

  async getCapabilities(): Promise<
    ProviderCapabilities | null
  > {
    if (
      this.settings.activeProvider !== "volcengine-ark" ||
      !this.settings.ark
    ) {
      return null;
    }
    const capabilities =
      await this.executions.latestCapabilitySnapshot(
        this.pool
      );
    return capabilities?.modelIdHash ===
      hashText(this.settings.ark.modelId)
      ? capabilities
      : null;
  }

  async getUsageSummary() {
    const end = this.clock();
    const start = new Date(end);
    start.setUTCHours(0, 0, 0, 0);
    const provider = this.settings.activeProvider;
    const summary = await this.executions.usageSummary(
      this.pool,
      provider,
      start.toISOString(),
      end.toISOString()
    );
    return ModelUsageSummarySchema.parse({
      provider,
      modelDisplayName:
        this.settings.availability.modelDisplayName,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      ...summary
    });
  }

  async runCapabilityProbe(): Promise<ProviderCapabilities> {
    return (
      await this.runCapabilityProbeDetailed({ live: false })
    ).capabilities;
  }

  async runCapabilityProbeDetailed(input: {
    live: boolean;
  }): Promise<ProviderCapabilityProbeResult> {
    if (input.live && !this.settings.liveStrict) {
      throw new DomainConflictError(
        "ARK_LIVE_STRICT_REQUIRED",
        "A live capability snapshot requires strict Ark Live mode; Mock and Fake snapshots cannot be marked live."
      );
    }
    if (!(this.provider instanceof VolcengineArkProvider)) {
      throw new DomainConflictError(
        "ARK_PROVIDER_NOT_CONFIGURED",
        "Volcengine Ark must be configured before running the live capability probe."
      );
    }
    const result =
      await new ProviderCapabilityProbe(
        this.provider,
        this.clock,
        { live: input.live }
      ).runDetailed();
    const capabilities = result.capabilities;
    const now = this.clock().toISOString();
    const writeContext = systemWriteContext(
      CAPABILITY_PROBE_PURPOSE,
      `capability-probe:${now}`,
      now
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const decisionReceipt =
        await this.governance.saveDecision(client, {
          decision: modelActionDecision({
            decisionRef:
              writeContext.authorizationDecisionRef,
            tenantRef: "tenant:demo-school",
            actorRef: writeContext.actorRef,
            purpose: writeContext.purpose,
            action: CAPABILITY_PROBE_PURPOSE,
            resourceRef:
              "capability:model:volcengine-ark",
            reasonCodes: [
              "system-capability-probe",
              "synthetic-data-only",
              "no-business-table-write"
            ],
            decidedAt: now
          }),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "provider-capability-probe-authorization"
          )
        });
      const receipt =
        await this.executions.saveCapabilitySnapshot(client, {
          snapshotRef: `provider-capability-snapshot:${randomUUID()}`,
          capabilities:
            ProviderCapabilitiesSchema.parse(capabilities),
          metadata: createWriteMetadata(
            writeContext,
            "capability",
            "provider-capability-probe"
          )
        });
      await this.governance.saveAudits(client, [
        decisionReceipt,
        receipt
      ]);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createInvocation(input: {
    tenantRef: string;
    actorRef: string;
    request: CreateModelInvocationRequest;
  }): Promise<CreateModelInvocationResult> {
    assertDemoActor(input.tenantRef, input.actorRef);
    if (input.request.purpose !== GENERATE_PURPOSE) {
      throw new AuthorizationDeniedError(
        "该用途未获得 Teacher Copilot 备课建议权限。"
      );
    }
    const prohibitedInput = detectProhibitedModelInput(
      input.request.requestText
    );
    if (prohibitedInput) {
      throw new DomainConflictError(
        "POLICY_BLOCKED",
        "本次请求包含 Gate 2.6A 不允许发送给模型的数据类别，未创建模型执行。",
        { category: prohibitedInput }
      );
    }
    if (
      !input.request.preparationTaskRef ||
      !input.request.curriculumUnitRef ||
      !input.request.lessonRef ||
      input.request.workingSetVersion === undefined ||
      input.request.expectedPreparationTaskVersion === undefined
    ) {
      throw new DomainConflictError(
        "LESSON_PREPARATION_CONTEXT_REQUIRED",
        "Gate 2.6A model invocation requires a typed Lesson Preparation Task and current WorkingSet."
      );
    }

    const now = this.clock().toISOString();
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      "model-invocation.create",
      input.request.idempotencyKey
    ].join("|");
    const decisionRef = stableDecisionRef(rootKey);
    const writeContext: WriteContext = {
      actorRef: input.actorRef,
      purpose: input.request.purpose,
      rootIdempotencyKey: input.request.idempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt: now
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation =
        await this.governance.reserveIdempotency(client, {
          idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
          rootKey,
          requestFingerprint: hash(input.request),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "model-invocation-idempotency"
          )
        });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return CreateModelInvocationResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }

      const preparationTask =
        await this.requirePreparationTask(
          client,
          input.tenantRef,
          input.request.preparationTaskRef
        );
      this.assertInvocationContext(preparationTask, input.request);

      const educationContext =
        await this.education.getTeacherCopilotContext(client, {
          tenantRef: input.tenantRef,
          courseRunRef: input.request.courseRunRef
        });
      const lesson =
        await this.gate25Education.getLesson(
          client,
          input.tenantRef,
          input.request.lessonRef
        );
      const unit =
        await this.gate25Education.getUnit(
          client,
          input.tenantRef,
          input.request.curriculumUnitRef
        );
      const goal = await this.gate2Work.getDemoCaseAndGoal(
        client,
        input.tenantRef,
        input.request.goalRef
      );
      if (!educationContext || !lesson || !unit || !goal) {
        throw new NotFoundError(
          "The authorized synthetic lesson preparation context was not found."
        );
      }
      this.assertEducationSelections(
        input.request,
        educationContext,
        lesson.learningObjectives.map(
          (objective) => objective.objectiveRef
        )
      );
      const baselineRef =
        preparationTask.workingSet.baselineTeachingPlanRef;
      if (!baselineRef) {
        throw new DomainConflictError(
          "LESSON_PREPARATION_BASELINE_REQUIRED",
          "A current approved TeachingPlan baseline is required."
        );
      }
      const baseline =
        await this.artifacts.getTeachingPlanRevision(
          client,
          baselineRef
        );
      if (!baseline || baseline.state !== "approved") {
        throw new DomainConflictError(
          "LESSON_PREPARATION_BASELINE_INVALID",
          "The selected baseline must be an immutable approved TeachingPlan."
        );
      }

      const taskRunRef = `task-run:${randomUUID()}`;
      const agentRunRef = `agent-run:${randomUUID()}`;
      const contractRef =
        `interaction-contract:${randomUUID()}`;
      const contextManifestRef =
        `context-manifest:${randomUUID()}`;
      const authorizedContextPlanRef =
        `authorized-context-plan:${randomUUID()}`;
      const runManifestRef = `run-manifest:${randomUUID()}`;
      const executionRef = `model-execution:${randomUUID()}`;
      const taskRequest = createTaskRequest(
        input.actorRef,
        input.request,
        now
      );
      const evidenceRefs = [
        ...new Set(input.request.selectedEvidenceRefs)
      ];
      const knownGaps = [
        ...new Set(
          educationContext.observations.flatMap(
            (observation) => observation.unknowns
          )
        )
      ];
      const authorizedContextPlan =
        AuthorizedContextPlanSchema.parse({
          authorizedContextPlanRef,
          taskRef: preparationTask.taskRef,
          taskRunRef,
          workingSetVersion:
            preparationTask.workingSet.version,
          authorizedResourceRefs: [
            preparationTask.courseRunRef,
            preparationTask.curriculumUnitRef,
            preparationTask.lessonRef,
            ...preparationTask.workingSet
              .learningObjectiveRefs,
            baseline.revisionRef,
            ...(preparationTask.workingSet.sourceLessonRef
              ? [preparationTask.workingSet.sourceLessonRef]
              : []),
            ...(preparationTask.workingSet.sourceAssignmentRef
              ? [preparationTask.workingSet.sourceAssignmentRef]
              : []),
            ...(preparationTask.workingSet.sourceAssignmentItemRefs ?? []),
            ...(preparationTask.workingSet.sourceTodoRef
              ? [preparationTask.workingSet.sourceTodoRef]
              : []),
            ...(preparationTask.workingSet.sourceResourceRefs ?? [])
          ],
          authorizedEvidenceRefs: evidenceRefs,
          deniedResourceRefs: [],
          requestedFieldMask:
            preparationTask.workingSet.requestedFieldMask,
          authorizationDecisionRef: decisionRef,
          contentHash: hash({
            taskRunRef,
            workingSetVersion:
              preparationTask.workingSet.version,
            resourceRefs: [
              preparationTask.courseRunRef,
              preparationTask.curriculumUnitRef,
              preparationTask.lessonRef,
              ...preparationTask.workingSet
                .learningObjectiveRefs,
              baseline.revisionRef,
              ...(preparationTask.workingSet.sourceLessonRef
                ? [preparationTask.workingSet.sourceLessonRef]
                : []),
              ...(preparationTask.workingSet.sourceAssignmentRef
                ? [preparationTask.workingSet.sourceAssignmentRef]
                : []),
              ...(preparationTask.workingSet.sourceAssignmentItemRefs ?? []),
              ...(preparationTask.workingSet.sourceTodoRef
                ? [preparationTask.workingSet.sourceTodoRef]
                : []),
              ...(preparationTask.workingSet.sourceResourceRefs ?? [])
            ],
            evidenceRefs,
            requestedFieldMask:
              preparationTask.workingSet.requestedFieldMask,
            authorizationDecisionRef: decisionRef
          }),
          resolvedAt: now
        });
      const provider = this.settings.activeProvider;
      const modelId =
        provider === "volcengine-ark"
          ? this.settings.ark?.modelId
          : "mock";
      if (!modelId) {
        throw new DomainConflictError(
          "ARK_PROVIDER_NOT_CONFIGURED",
          "Volcengine Ark configuration is unavailable."
        );
      }
      const modelDisplayName =
        this.settings.availability.modelDisplayName;
      const modelDataManifest = createModelDataManifest({
        purpose: MODEL_DATA_PURPOSE,
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        taskRunRef,
        contextManifestRef,
        provider,
        modelId,
        resourceRefs: [
          ...authorizedContextPlan.authorizedResourceRefs,
          ...evidenceRefs
        ],
        authorizationDecisionRef: decisionRef,
        syntheticData: true,
        createdAt: now
      });
      const requestHash = hash({
        taskRunRef,
        requestTextHash: hash(taskRequest.requestText),
        promptBundleVersion:
          lessonPreparationPromptBundle.version,
        contextManifestHash:
          authorizedContextPlan.contentHash,
        provider,
        modelId,
        outputSchemaVersion:
          lessonPreparationPromptBundle.outputSchemaVersion,
        generationSettings: {
          maxOutputTokens:
            provider === "volcengine-ark"
              ? this.settings.ark?.maxOutputTokens
              : this.settings.budget.maxOutputTokens,
          timeoutMs:
            provider === "volcengine-ark"
              ? this.settings.ark?.timeoutMs
              : 120_000
        }
      });
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: input.request.purpose,
        action: GENERATE_PURPOSE,
        resourceRef: preparationTask.taskRef,
        requestedFieldMask: [
          ...preparationTask.workingSet.requestedFieldMask
        ],
        effect: "allow",
        reasonCodes: [
          "synthetic-teacher-role",
          "synthetic-data-only",
          "proposal-only",
          "transaction-outside-network"
        ],
        policyVersion: "policy:model-data-synthetic@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "model-invocation-authorization"
          )
        })
      ];

      const attempt =
        await this.gate25Work.nextTaskRunAttempt(
          client,
          preparationTask.taskRef
        );
      receipts.push(
        ...(await this.gate25Work.insertTaskRun(client, {
          taskRunRef,
          taskRef: preparationTask.taskRef,
          attempt,
          status: "queued",
          request: taskRequest,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "model-invocation-task-run"
          ),
          outboxRef: `outbox:${randomUUID()}`,
          outboxMetadata: createWriteMetadata(
            writeContext,
            "work",
            "model-invocation-task-run-outbox"
          ),
          outboxEventName: "TeacherCopilotTaskRunQueued"
        }))
      );
      const contractPayload = {
        taskRef: preparationTask.taskRef,
        taskRequest,
        profileRef: educationContext.profile.profileRef,
        profileVersion:
          educationContext.profile.profileVersion,
        profileContentHash:
          educationContext.profile.contentHash,
        policyVersionRef:
          educationContext.profile.policyVersionRef,
        promptVersionRef:
          lessonPreparationPromptBundle.promptBundleRef,
        evidenceRuleVersionRef:
          educationContext.profile.evidenceRuleVersionRef,
        participationMode:
          educationContext.profile.participationMode,
        supportLimit: educationContext.profile.supportLimit,
        answerReleaseBoundary:
          educationContext.profile.answerReleaseBoundary
      };
      const contractContentHash = hash(contractPayload);
      receipts.push(
        await this.work.insertResolvedContract(client, {
          contractRef,
          boundRunKind: "TaskRun",
          boundRunRef: taskRunRef,
          profileRef: educationContext.profile.profileRef,
          profileVersion:
            educationContext.profile.profileVersion,
          policyVersionRef:
            educationContext.profile.policyVersionRef,
          promptVersionRef:
            lessonPreparationPromptBundle.promptBundleRef,
          evidenceRuleVersionRef:
            educationContext.profile.evidenceRuleVersionRef,
          participationMode:
            educationContext.profile.participationMode,
          supportLimit:
            educationContext.profile.supportLimit,
          answerReleaseBoundary:
            educationContext.profile.answerReleaseBoundary,
          contractPayload,
          contentHash: contractContentHash,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "model-invocation-resolved-contract"
          )
        })
      );
      receipts.push(
        await this.gate2Runtime.insertAuthorizedContextPlan(
          client,
          {
            ...authorizedContextPlan,
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "model-invocation-authorized-context"
            )
          }
        )
      );
      receipts.push(
        ...(await this.runtime.insertAgentRunBundle(client, {
          agentRun: {
            agentRunRef,
            runKind: "TaskRun",
            boundRunRef: taskRunRef,
            status: "queued",
            modelProvider: provider,
            modelProfile: modelDisplayName,
            toolName: "none",
            output: {
              proposalOnly: true,
              rawProviderContentStored: false
            },
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "model-invocation-agent-run"
            )
          },
          manifest: {
            manifestRef: runManifestRef,
            agentRunRef,
            contractRef,
            contextManifestRef,
            promptVersionRef:
              lessonPreparationPromptBundle.promptBundleRef,
            policyVersionRef: decision.policyVersion,
            capabilityRefs: [this.provider.descriptor.capabilityRef],
            contextRefs: [
              ...authorizedContextPlan.authorizedResourceRefs,
              ...evidenceRefs
            ],
            contentHash: hash({
              contractContentHash,
              promptBundle:
                lessonPreparationPromptBundle.contentHash,
              authorizedContextPlan:
                authorizedContextPlan.contentHash
            }),
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "model-invocation-run-manifest"
            )
          },
          outbox: {
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "AgentRunQueued",
            aggregateRef: agentRunRef,
            payload: {
              taskRunRef,
              modelExecutionRef: executionRef
            },
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "model-invocation-runtime-outbox"
            )
          }
        }))
      );
      receipts.push(
        await this.gate2Runtime.insertContextManifest(client, {
          contextManifestRef,
          agentRunRef,
          resourceRefs:
            authorizedContextPlan.authorizedResourceRefs,
          evidenceRefs,
          unknowns: knownGaps,
          requestedFieldMask:
            authorizedContextPlan.requestedFieldMask,
          taskRef: preparationTask.taskRef,
          authorizedContextPlanRef,
          requestSummary: taskRequest,
          metadata: createWriteMetadata(
            writeContext,
            "runtime",
            "model-invocation-context-manifest"
          )
        })
      );
      receipts.push(
        await this.governance.insertModelDataManifest(client, {
          manifest: modelDataManifest,
          metadata: createWriteMetadata(
            {
              ...writeContext,
              purpose: MODEL_DATA_PURPOSE
            },
            "governance",
            "model-data-manifest"
          )
        })
      );
      receipts.push(
        ...(await this.executions.insertQueued(client, {
          execution: {
            executionRef,
            provider,
            modelId,
            modelDisplayName,
            taskRef: preparationTask.taskRef,
            taskRunRef,
            agentRunRef,
            promptBundleRef:
              lessonPreparationPromptBundle.promptBundleRef,
            promptBundleVersion:
              lessonPreparationPromptBundle.version,
            contextManifestRef,
            authorizedContextPlanRef,
            modelDataManifestRef:
              modelDataManifest.modelDataManifestRef,
            requestHash,
            inputSummary: {
              contractRef,
              runManifestRef,
              courseRunRef: preparationTask.courseRunRef,
              curriculumUnitRef:
                preparationTask.curriculumUnitRef,
              lessonRef: preparationTask.lessonRef,
              baselineTeachingPlanRef: baseline.revisionRef,
              requestVersion: taskRequest.requestVersion,
              requestTextHash: hash(taskRequest.requestText),
              contextManifestHash:
                authorizedContextPlan.contentHash,
              syntheticData: true
            },
            maxAttempts:
              provider === "volcengine-ark"
                ? (this.settings.ark?.maxAttempts ?? 2)
                : 2,
            timeoutMs:
              provider === "volcengine-ark"
                ? (this.settings.ark?.timeoutMs ?? 120_000)
                : 120_000,
            maxOutputTokens:
              provider === "volcengine-ark"
                ? (this.settings.ark?.maxOutputTokens ??
                  this.settings.budget.maxOutputTokens)
                : this.settings.budget.maxOutputTokens,
            outputSchemaVersion:
              lessonPreparationPromptBundle.outputSchemaVersion,
            resultKind: "teaching_proposal",
            metadata: createWriteMetadata(
              writeContext,
              "capability",
              "model-execution"
            )
          },
          eventRef: `model-execution-event:${randomUUID()}`,
          eventMetadata: createWriteMetadata(
            writeContext,
            "capability",
            "model-execution-queued-event"
          ),
          outboxRef: `outbox:${randomUUID()}`,
          outboxMetadata: createWriteMetadata(
            writeContext,
            "capability",
            "model-invocation-queued-outbox"
          )
        }))
      );

      if (preparationTask.status === "planned") {
        const started = await this.gate25Work.transition(
          client,
          {
            taskRef: preparationTask.taskRef,
            fromStatus: "planned",
            toStatus: "in_progress",
            expectedVersion: preparationTask.version,
            reason:
              "模型调用已排队，备课任务进入进行中",
            historyRef: `preparation-history:${randomUUID()}`,
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "LessonPreparationStarted",
            metadata: transitionMetadata(
              writeContext,
              "model-invocation-start"
            )
          }
        );
        receipts.push(...started.receipts);
      }

      const execution = ModelExecutionViewSchema.parse({
        modelExecutionRef: executionRef,
        status: "queued",
        provider,
        modelDisplayName,
        taskRef: preparationTask.taskRef,
        taskRunRef,
        agentRunRef,
        promptBundleRef:
          lessonPreparationPromptBundle.promptBundleRef,
        promptBundleVersion:
          lessonPreparationPromptBundle.version,
        contextManifestRef,
        authorizedContextPlanRef,
        attemptCount: 0,
        maxAttempts:
          provider === "volcengine-ark"
            ? (this.settings.ark?.maxAttempts ?? 2)
            : 2,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        estimatedCost: null,
        latencyMs: null,
        providerRequestIdMasked: null,
        finishReason: null,
        safeErrorCategory: null,
        safeMessage: null,
        outputSchemaVersion:
          lessonPreparationPromptBundle.outputSchemaVersion,
        proposalRevisionRef: null,
        retryOfModelExecutionRef: null,
        queuedAt: now,
        startedAt: null,
        completedAt: null,
        cancelledAt: null
      });
      const result = CreateModelInvocationResultSchema.parse({
        replayed: false,
        reusedSuccessfulResult: false,
        execution
      });
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: now
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw translateRepositoryConflict(error);
    } finally {
      client.release();
    }
  }

  async createReflectionInvocation(input: {
    tenantRef: string;
    actorRef: string;
    request: unknown;
  }) {
    assertDemoActor(input.tenantRef, input.actorRef);
    const request = GenerateReflectionRequestSchema.parse(input.request);
    const now = this.clock().toISOString();
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      "lesson-reflection.generate",
      request.idempotencyKey
    ].join("|");
    const decisionRef = stableDecisionRef(rootKey);
    const writeContext: WriteContext = {
      actorRef: input.actorRef,
      purpose: request.purpose,
      rootIdempotencyKey: request.idempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt: now
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(client, {
        idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: hash(request),
        metadata: createWriteMetadata(
          writeContext,
          "governance",
          "reflection-model-idempotency"
        )
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return ReflectionGenerationResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }
      const reflection = await this.gate29Artifacts.getReflection(
        client,
        input.tenantRef,
        request.reflectionRef
      );
      const draft = reflection?.revisions.find(
        (revision) => revision.status === "draft"
      );
      if (!draft || draft.revisionNumber !== request.expectedDraftRevisionNumber) {
        throw new DomainConflictError(
          "LESSON_REFLECTION_VERSION_CONFLICT",
          "课后反思草稿已变化，请刷新后重新生成。"
        );
      }
      const reflectionTask = await this.gate29Work.getReflectionTask(
        client,
        input.tenantRef,
        request.reflectionRef
      );
      if (!reflectionTask || reflectionTask.actorRef !== input.actorRef) {
        throw new NotFoundError("Reflection-owned Task was not found.");
      }
      if (!["draft", "draft_ready"].includes(reflectionTask.status)) {
        throw new DomainConflictError(
          "LESSON_REFLECTION_GENERATION_NOT_ALLOWED",
          "当前反思状态不能启动新的模型生成。"
        );
      }
      const delivery = await this.gate29Education.getDeliveryByRevision(
        client,
        input.tenantRef,
        input.actorRef,
        draft.deliveryRevisionRef
      );
      const observations = await this.gate29Education.validateConfirmedObservations(
        client,
        input.tenantRef,
        input.actorRef,
        draft.lessonRef,
        draft.observationRevisionRefs
      );
      const evidence = await this.gate29Education.validateAssignmentEvidence(
        client,
        input.tenantRef,
        draft.lessonRef,
        draft.assignmentEvidenceRefs
      );
      if (
        !delivery ||
        delivery.status !== "confirmed" ||
        observations.length !== new Set(draft.observationRevisionRefs).size ||
        evidence.length !== new Set(draft.assignmentEvidenceRefs).size
      ) {
        throw new DomainConflictError(
          "REFLECTION_CONTEXT_NOT_AUTHORIZED",
          "反思生成只能使用当前明确选择的已确认课堂事实与 Evidence。"
        );
      }
      const provider = this.settings.activeProvider;
      const modelId = provider === "volcengine-ark"
        ? this.settings.ark?.modelId
        : "mock";
      if (!modelId) {
        throw new DomainConflictError(
          "ARK_PROVIDER_NOT_CONFIGURED",
          "Volcengine Ark configuration is unavailable."
        );
      }
      const taskRunRef = `task-run:${randomUUID()}`;
      const agentRunRef = `agent-run:${randomUUID()}`;
      const contextManifestRef = `context-manifest:${randomUUID()}`;
      const authorizedContextPlanRef = `authorized-context-plan:${randomUUID()}`;
      const executionRef = `model-execution:${randomUUID()}`;
      const resourceRefs = [
        draft.courseRunRef,
        draft.lessonRef,
        draft.teachingPlanRevisionRef,
        draft.deliveryRevisionRef,
        draft.reflectionRevisionRef,
        ...draft.observationRevisionRefs
      ];
      const authorizedContextPlan = AuthorizedContextPlanSchema.parse({
        authorizedContextPlanRef,
        taskRef: reflectionTask.taskRef,
        taskRunRef,
        workingSetVersion: reflectionTask.workingSet.version,
        authorizedResourceRefs: resourceRefs,
        authorizedEvidenceRefs: draft.assignmentEvidenceRefs,
        deniedResourceRefs: [],
        requestedFieldMask: reflectionTask.workingSet.requestedFieldMask,
        authorizationDecisionRef: decisionRef,
        contentHash: hash({
          taskRunRef,
          workingSetVersion: reflectionTask.workingSet.version,
          resourceRefs,
          evidenceRefs: draft.assignmentEvidenceRefs,
          fieldMask: reflectionTask.workingSet.requestedFieldMask,
          authorizationDecisionRef: decisionRef
        }),
        resolvedAt: now
      });
      const taskRequest: TeacherTaskRequest = {
        requestText:
          request.teacherNotes.trim() ||
          "请基于本次已确认课堂事实生成课后反思草稿。",
        actorRef: input.actorRef,
        purpose: request.purpose,
        courseRunRef: draft.courseRunRef,
        learningObjectiveRefs: reflectionTask.workingSet.learningObjectiveRefs,
        selectedEvidenceRefs: draft.assignmentEvidenceRefs,
        curriculumUnitRef: reflectionTask.workingSet.curriculumUnitRef,
        lessonRef: draft.lessonRef,
        baselineTeachingPlanRef: draft.teachingPlanRevisionRef,
        workingSetVersion: reflectionTask.workingSet.version,
        createdAt: now,
        requestVersion: 1
      };
      const modelDataManifest = createModelDataManifest({
        purpose: REFLECTION_MODEL_DATA_PURPOSE,
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        taskRunRef,
        contextManifestRef,
        provider,
        modelId,
        resourceRefs: [...resourceRefs, ...draft.assignmentEvidenceRefs],
        authorizationDecisionRef: decisionRef,
        syntheticData: true,
        createdAt: now
      });
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: request.purpose,
        action: "lesson-reflection.generate",
        resourceRef: request.reflectionRef,
        requestedFieldMask: reflectionTask.workingSet.requestedFieldMask,
        effect: "allow",
        reasonCodes: [
          "synthetic-teacher-role",
          "confirmed-delivery-only",
          "selected-evidence-only",
          "reflection-draft-only",
          "transaction-outside-network"
        ],
        policyVersion: "policy:model-data-synthetic-reflection@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "reflection-model-authorization"
          )
        })
      ];
      const attempt = await this.gate25Work.nextTaskRunAttempt(
        client,
        reflectionTask.taskRef
      );
      receipts.push(...await this.gate25Work.insertTaskRun(client, {
        taskRunRef,
        taskRef: reflectionTask.taskRef,
        attempt,
        status: "queued",
        request: taskRequest,
        metadata: createWriteMetadata(writeContext, "work", "reflection-task-run"),
        outboxRef: `outbox:${randomUUID()}`,
        outboxMetadata: createWriteMetadata(writeContext, "work", "reflection-task-run-outbox"),
        outboxEventName: "LessonReflectionTaskRunQueued"
      }));
      receipts.push(await this.gate2Runtime.insertAuthorizedContextPlan(client, {
        ...authorizedContextPlan,
        metadata: createWriteMetadata(writeContext, "runtime", "reflection-authorized-context")
      }));
      receipts.push(...await this.runtime.insertAgentRunBundle(client, {
        agentRun: {
          agentRunRef,
          runKind: "TaskRun",
          boundRunRef: taskRunRef,
          status: "queued",
          modelProvider: provider,
          modelProfile: this.settings.availability.modelDisplayName,
          toolName: "none",
          output: {
            resultKind: "lesson_reflection_draft",
            reflectionRef: request.reflectionRef,
            teacherConfirmationRequired: true,
            rawProviderContentStored: false
          },
          metadata: createWriteMetadata(writeContext, "runtime", "reflection-agent-run")
        },
        manifest: {
          manifestRef: `run-manifest:${randomUUID()}`,
          agentRunRef,
          contextManifestRef,
          promptVersionRef: lessonReflectionPromptBundle.promptBundleRef,
          policyVersionRef: decision.policyVersion,
          capabilityRefs: [this.provider.descriptor.capabilityRef],
          contextRefs: [...resourceRefs, ...draft.assignmentEvidenceRefs],
          contentHash: hash({
            prompt: lessonReflectionPromptBundle.contentHash,
            context: authorizedContextPlan.contentHash
          }),
          metadata: createWriteMetadata(writeContext, "runtime", "reflection-run-manifest")
        },
        outbox: {
          outboxRef: `outbox:${randomUUID()}`,
          eventName: "AgentRunQueued",
          aggregateRef: agentRunRef,
          payload: { taskRunRef, modelExecutionRef: executionRef },
          metadata: createWriteMetadata(writeContext, "runtime", "reflection-runtime-outbox")
        }
      }));
      receipts.push(await this.gate2Runtime.insertContextManifest(client, {
        contextManifestRef,
        agentRunRef,
        resourceRefs,
        evidenceRefs: draft.assignmentEvidenceRefs,
        unknowns: draft.content.uncertainties,
        requestedFieldMask: reflectionTask.workingSet.requestedFieldMask,
        taskRef: reflectionTask.taskRef,
        authorizedContextPlanRef,
        requestSummary: taskRequest,
        metadata: createWriteMetadata(writeContext, "runtime", "reflection-context-manifest")
      }));
      receipts.push(await this.governance.insertModelDataManifest(client, {
        manifest: modelDataManifest,
        metadata: createWriteMetadata(
          { ...writeContext, purpose: REFLECTION_MODEL_DATA_PURPOSE },
          "governance",
          "reflection-model-data-manifest"
        )
      }));
      const timeoutMs = provider === "volcengine-ark"
        ? (this.settings.ark?.timeoutMs ?? 120_000)
        : 120_000;
      const maxOutputTokens = provider === "volcengine-ark"
        ? (this.settings.ark?.maxOutputTokens ?? this.settings.budget.maxOutputTokens)
        : this.settings.budget.maxOutputTokens;
      receipts.push(...await this.executions.insertQueued(client, {
        execution: {
          executionRef,
          provider,
          modelId,
          modelDisplayName: this.settings.availability.modelDisplayName,
          taskRef: reflectionTask.taskRef,
          taskRunRef,
          agentRunRef,
          promptBundleRef: lessonReflectionPromptBundle.promptBundleRef,
          promptBundleVersion: lessonReflectionPromptBundle.version,
          contextManifestRef,
          authorizedContextPlanRef,
          modelDataManifestRef: modelDataManifest.modelDataManifestRef,
          requestHash: hash({
            reflectionRef: request.reflectionRef,
            draftRevision: draft.reflectionRevisionRef,
            teacherNotesHash: hash(request.teacherNotes),
            promptVersion: lessonReflectionPromptBundle.version,
            contextHash: authorizedContextPlan.contentHash,
            provider,
            modelId,
            maxOutputTokens,
            timeoutMs
          }),
          inputSummary: {
            reflectionRef: request.reflectionRef,
            reflectionRevisionRef: draft.reflectionRevisionRef,
            courseRunRef: draft.courseRunRef,
            curriculumUnitRef: reflectionTask.workingSet.curriculumUnitRef,
            lessonRef: draft.lessonRef,
            teachingPlanRevisionRef: draft.teachingPlanRevisionRef,
            deliveryRevisionRef: draft.deliveryRevisionRef,
            observationRevisionRefs: draft.observationRevisionRefs,
            assignmentEvidenceRefs: draft.assignmentEvidenceRefs,
            teacherNotesHash: hash(request.teacherNotes),
            syntheticData: true
          },
          maxAttempts: provider === "volcengine-ark"
            ? (this.settings.ark?.maxAttempts ?? 2)
            : 2,
          timeoutMs,
          maxOutputTokens,
          outputSchemaVersion: lessonReflectionPromptBundle.outputSchemaVersion,
          resultKind: "lesson_reflection_draft",
          metadata: createWriteMetadata(writeContext, "capability", "reflection-model-execution")
        },
        eventRef: `model-execution-event:${randomUUID()}`,
        eventMetadata: createWriteMetadata(writeContext, "capability", "reflection-model-queued-event"),
        outboxRef: `outbox:${randomUUID()}`,
        outboxMetadata: createWriteMetadata(writeContext, "capability", "reflection-model-outbox")
      }));
      const transitioned = await this.gate29Work.setReflectionTaskStatus(client, {
        taskRef: reflectionTask.taskRef,
        fromStatuses: ["draft", "draft_ready"],
        toStatus: "generating",
        modelExecutionRef: executionRef,
        updatedAt: now
      });
      if (!transitioned) {
        throw new DomainConflictError(
          "LESSON_REFLECTION_GENERATION_CONFLICT",
          "反思生成状态已变化。"
        );
      }
      const result = ReflectionGenerationResultSchema.parse({
        replayed: false,
        modelExecutionRef: executionRef,
        status: "queued",
        reflectionRef: request.reflectionRef,
        contextManifestRef,
        authorizedContextPlanRef
      });
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: now
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw translateRepositoryConflict(error);
    } finally {
      client.release();
    }
  }

  async getInvocation(input: {
    tenantRef: string;
    actorRef: string;
    modelExecutionRef: string;
  }): Promise<ModelExecutionView> {
    assertDemoActor(input.tenantRef, input.actorRef);
    const execution = await this.executions.get(
      this.pool,
      input.modelExecutionRef
    );
    if (
      !execution ||
      execution.actorRef !== input.actorRef
    ) {
      throw new NotFoundError(
        "The ModelExecution was not found."
      );
    }
    return toExecutionView(execution);
  }

  async cancelInvocation(input: {
    tenantRef: string;
    actorRef: string;
    modelExecutionRef: string;
    request: CancelModelInvocationRequest;
  }): Promise<ModelExecutionView> {
    assertDemoActor(input.tenantRef, input.actorRef);
    const now = this.clock().toISOString();
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      "model-invocation.cancel",
      input.request.idempotencyKey
    ].join("|");
    const writeContext: WriteContext = {
      actorRef: input.actorRef,
      purpose: input.request.purpose,
      rootIdempotencyKey: input.request.idempotencyKey,
      authorizationDecisionRef: stableDecisionRef(rootKey),
      createdAt: now
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation =
        await this.governance.reserveIdempotency(client, {
          idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
          rootKey,
          requestFingerprint: hash({
            modelExecutionRef: input.modelExecutionRef,
            request: input.request
          }),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "model-cancel-idempotency"
          )
        });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return ModelExecutionViewSchema.parse(
          reservation.result
        );
      }
      const execution = await this.executions.lock(
        client,
        input.modelExecutionRef
      );
      if (
        !execution ||
        execution.actorRef !== input.actorRef
      ) {
        throw new NotFoundError(
          "The ModelExecution was not found."
        );
      }
      if (
        execution.status !== input.request.expectedStatus
      ) {
        throw new DomainConflictError(
          "MODEL_EXECUTION_STATUS_CONFLICT",
          "The ModelExecution status changed before cancellation.",
          {
            expectedStatus: input.request.expectedStatus,
            actualStatus: execution.status
          }
        );
      }
      const decisionReceipt =
        await this.governance.saveDecision(client, {
          decision: modelActionDecision({
            decisionRef:
              writeContext.authorizationDecisionRef,
            tenantRef: input.tenantRef,
            actorRef: input.actorRef,
            purpose: input.request.purpose,
            action: "model-invocation.cancel",
            resourceRef: execution.executionRef,
            reasonCodes: [
              "same-actor",
              "demo-tenant",
              "cancellable-execution-state"
            ],
            decidedAt: now
          }),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "model-cancel-authorization"
          )
        });
      const cancellation =
        await this.executions.requestCancellation(client, {
          executionRef: execution.executionRef,
          eventRef: `model-execution-event:${randomUUID()}`,
          metadata: createWriteMetadata(
            writeContext,
            "capability",
            "model-cancel"
          )
        });
      if (cancellation.status === "cancelled") {
        await this.gate25Work.updateTaskRunStatus(client, {
          taskRunRef: execution.taskRunRef,
          status: "cancelled",
          updatedAt: now
        });
        await this.runtime.updateAgentRunStatus(client, {
          agentRunRef: execution.agentRunRef,
          status: "cancelled",
          output: {
            proposalCreated: false,
            cancellation: "requested-before-provider-call"
          },
          updatedAt: now
        });
      }
      const refreshed = await this.executions.get(
        client,
        execution.executionRef
      );
      if (!refreshed) {
        throw new Error("ModelExecution disappeared.");
      }
      const result = toExecutionView(refreshed);
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: now
      });
      await this.governance.saveAudits(client, [
        reservation.receipt!,
        decisionReceipt,
        cancellation.receipt
      ]);
      await client.query("COMMIT");
      this.activeControllers
        .get(execution.executionRef)
        ?.abort();
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async retryInvocation(input: {
    tenantRef: string;
    actorRef: string;
    modelExecutionRef: string;
    request: RetryModelInvocationRequest;
  }): Promise<CreateModelInvocationResult> {
    assertDemoActor(input.tenantRef, input.actorRef);
    const now = this.clock().toISOString();
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      "model-invocation.retry",
      input.request.idempotencyKey
    ].join("|");
    const decisionRef = stableDecisionRef(rootKey);
    const writeContext: WriteContext = {
      actorRef: input.actorRef,
      purpose: input.request.purpose,
      rootIdempotencyKey: input.request.idempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt: now
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation =
        await this.governance.reserveIdempotency(client, {
          idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
          rootKey,
          requestFingerprint: hash({
            modelExecutionRef: input.modelExecutionRef,
            request: input.request
          }),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "model-retry-idempotency"
          )
        });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return CreateModelInvocationResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }
      const source = await this.executions.lock(
        client,
        input.modelExecutionRef
      );
      if (!source || source.actorRef !== input.actorRef) {
        throw new NotFoundError(
          "The ModelExecution was not found."
        );
      }
      if (source.status !== input.request.expectedStatus) {
        throw new DomainConflictError(
          "MODEL_EXECUTION_STATUS_CONFLICT",
          "The ModelExecution status changed before retry.",
          {
            expectedStatus: input.request.expectedStatus,
            actualStatus: source.status
          }
        );
      }
      if (
        source.provider !== this.settings.activeProvider ||
        source.modelId !== activeModelId(this.settings)
      ) {
        throw new DomainConflictError(
          "MODEL_CONFIGURATION_CHANGED",
          "Retry requires the same configured provider and model."
        );
      }
      const decisionReceipt =
        await this.governance.saveDecision(client, {
          decision: modelActionDecision({
            decisionRef,
            tenantRef: input.tenantRef,
            actorRef: input.actorRef,
            purpose: input.request.purpose,
            action: "model-invocation.retry",
            resourceRef: source.executionRef,
            reasonCodes: [
              "same-actor",
              "demo-tenant",
              "terminal-execution-retry",
              "same-provider-and-model"
            ],
            decidedAt: now
          }),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "model-retry-authorization"
          )
        });
      const retryDataPurpose = source.resultKind === "lesson_reflection_draft"
        ? REFLECTION_MODEL_DATA_PURPOSE
        : MODEL_DATA_PURPOSE;
      const manifest = createModelDataManifest({
        purpose: retryDataPurpose,
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        taskRunRef: source.taskRunRef,
        contextManifestRef: source.contextManifestRef,
        provider: source.provider,
        modelId: source.modelId,
        resourceRefs: [
          String(source.inputSummary["courseRunRef"] ?? ""),
          String(source.inputSummary["curriculumUnitRef"] ?? ""),
          String(source.inputSummary["lessonRef"] ?? ""),
          String(source.inputSummary["reflectionRef"] ?? ""),
          String(source.inputSummary["deliveryRevisionRef"] ?? ""),
          ...(Array.isArray(source.inputSummary["observationRevisionRefs"])
            ? source.inputSummary["observationRevisionRefs"] as string[]
            : []),
          ...(Array.isArray(source.inputSummary["assignmentEvidenceRefs"])
            ? source.inputSummary["assignmentEvidenceRefs"] as string[]
            : [])
        ].filter(Boolean),
        authorizationDecisionRef: decisionRef,
        syntheticData: true,
        createdAt: now
      });
      const executionRef = `model-execution:${randomUUID()}`;
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        decisionReceipt,
        await this.governance.insertModelDataManifest(client, {
          manifest,
          metadata: createWriteMetadata(
            {
              ...writeContext,
              purpose: retryDataPurpose
            },
            "governance",
            "model-retry-data-manifest"
          )
        }),
        ...(await this.executions.insertQueued(client, {
          execution: {
            executionRef,
            provider: source.provider,
            modelId: source.modelId,
            modelDisplayName: source.modelDisplayName,
            taskRef: source.taskRef,
            taskRunRef: source.taskRunRef,
            agentRunRef: source.agentRunRef,
            promptBundleRef: source.promptBundleRef,
            promptBundleVersion: source.promptBundleVersion,
            contextManifestRef: source.contextManifestRef,
            authorizedContextPlanRef:
              source.authorizedContextPlanRef,
            modelDataManifestRef:
              manifest.modelDataManifestRef,
            requestHash: source.requestHash,
            inputSummary: source.inputSummary,
            maxAttempts: source.maxAttempts,
            timeoutMs: source.timeoutMs,
            maxOutputTokens: source.maxOutputTokens,
            outputSchemaVersion: source.outputSchemaVersion,
            resultKind: source.resultKind,
            retryOfExecutionRef: source.executionRef,
            metadata: createWriteMetadata(
              writeContext,
              "capability",
              "model-retry-execution"
            )
          },
          eventRef: `model-execution-event:${randomUUID()}`,
          eventMetadata: createWriteMetadata(
            writeContext,
            "capability",
            "model-retry-queued-event"
          ),
          outboxRef: `outbox:${randomUUID()}`,
          outboxMetadata: createWriteMetadata(
            writeContext,
            "capability",
            "model-retry-outbox"
          )
        }))
      ];
      if (source.resultKind === "lesson_reflection_draft") {
        const transitioned = await this.gate29Work.setReflectionTaskStatus(client, {
          taskRef: source.taskRef,
          fromStatuses: ["draft_ready"],
          toStatus: "generating",
          modelExecutionRef: executionRef,
          updatedAt: now
        });
        if (!transitioned) {
          throw new DomainConflictError(
            "LESSON_REFLECTION_GENERATION_CONFLICT",
            "反思任务状态已变化，无法重试。"
          );
        }
      }
      const queued = await this.executions.get(
        client,
        executionRef
      );
      if (!queued) {
        throw new Error("Retry ModelExecution was not saved.");
      }
      const result = CreateModelInvocationResultSchema.parse({
        replayed: false,
        reusedSuccessfulResult: false,
        execution: toExecutionView(queued)
      });
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: now
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw translateRepositoryConflict(error);
    } finally {
      client.release();
    }
  }

  /**
   * Called only by the local outbox worker after the queue transaction has
   * committed. No network request is made by createInvocation().
   */
  async processExecution(
    executionRef: string
  ): Promise<void> {
    let execution = await this.executions.get(
      this.pool,
      executionRef
    );
    if (!execution) {
      throw new Error("ModelExecution was not found.");
    }
    if (execution.status === "succeeded") return;
    if (execution.status === "validating") {
      await this.finalizeValidatedExecution(executionRef);
      return;
    }
    if (
      [
        "timed_out",
        "permanently_failed",
        "validation_failed",
        "budget_exceeded",
        "cancelled"
      ].includes(execution.status)
    ) {
      return;
    }
    if (execution.status === "cancel_requested") {
      await this.finishCancelled(execution);
      return;
    }

    const context = execution.resultKind === "lesson_reflection_draft"
      ? await this.loadReflectionPromptContext(execution)
      : await this.loadPromptContext(execution);
    let request = context.request;
    const usage = await this.executions.usageSnapshot(
      this.pool,
      execution.actorRef,
      this.clock().toISOString()
    );
    const budgetDecision = this.budget.evaluate({
      modelId: execution.modelId,
      promptText: request.messages
        .map((message) => message.content)
        .join("\n"),
      requestedOutputTokens: execution.maxOutputTokens,
      queuedAt: execution.queuedAt,
      usage
    });
    await this.recordBudgetDecision(
      execution,
      budgetDecision
    );
    if (!budgetDecision.allowed) {
      await this.finishFailure(execution, {
        status: "budget_exceeded",
        category: "BUDGET_EXCEEDED",
        safeMessage: budgetMessage(
          budgetDecision.reasonCode
        )
      });
      return;
    }

    const controller = new AbortController();
    this.activeControllers.set(executionRef, controller);
    let latestOutput:
      | {
          text: string;
          inputTokens?: number;
          outputTokens?: number;
          latencyMs: number;
          providerRequestId?: string;
          finishReason?: string;
        }
      | undefined;
    try {
      while (execution.attemptCount < execution.maxAttempts) {
        const cancelled = await this.executions.get(
          this.pool,
          executionRef
        );
        if (cancelled?.status === "cancelled") {
          return;
        }
        if (
          cancelled?.status === "cancel_requested" ||
          controller.signal.aborted
        ) {
          await this.finishCancelled(cancelled ?? execution);
          return;
        }
        const attempt = execution.attemptCount + 1;
        execution = await this.beginAttempt(
          executionRef,
          attempt
        );
        if (execution.status === "cancel_requested") {
          await this.finishCancelled(execution);
          return;
        }
        if (execution.status === "cancelled") {
          return;
        }
        if (execution.status === "validating") {
          await this.finalizeValidatedExecution(executionRef);
          return;
        }
        if (execution.status !== "running") {
          return;
        }
        const result = await this.provider.invoke(request, {
          signal: controller.signal
        });
        if (result.status === "failed") {
          if (result.category === "REQUEST_CANCELLED") {
            await this.finishCancelled(execution);
            return;
          }
          if (
            result.retryable &&
            attempt < execution.maxAttempts
          ) {
            await this.recordRetryableFailure(
              execution,
              result.category,
              result.safeMessage,
              result.providerRequestId
            );
            const wait = computeBackoffMilliseconds({
              attempt,
              ...(result.retryAfterMs !== undefined
                ? { retryAfterMs: result.retryAfterMs }
                : {}),
              random: this.random
            });
            await this.delay(wait);
            execution =
              (await this.executions.get(
                this.pool,
                executionRef
              )) ?? execution;
            continue;
          }
          await this.finishFailure(execution, {
            status:
              result.category === "REQUEST_TIMED_OUT"
                ? "timed_out"
                : "permanently_failed",
            category: result.category,
            safeMessage: result.safeMessage
          });
          return;
        }

        latestOutput = {
          text: result.outputText,
          ...(result.inputTokens !== undefined
            ? { inputTokens: result.inputTokens }
            : {}),
          ...(result.outputTokens !== undefined
            ? { outputTokens: result.outputTokens }
            : {}),
          latencyMs: result.latencyMs,
          ...(result.providerRequestId
            ? {
                providerRequestId:
                  result.providerRequestId
              }
            : {}),
          ...(result.finishReason
            ? { finishReason: result.finishReason }
            : {})
        };
        await this.debugSink
          .write({
            executionRef: execution.executionRef,
            syntheticData: true,
            promptMessages: request.messages,
            outputText: result.outputText
          })
          .catch(() => undefined);
        const validation = execution.resultKind === "lesson_reflection_draft"
          ? validateReflectionOutput({
              outputText: result.outputText,
              request,
              teachingPlanRevisionRef: String(
                execution.inputSummary["teachingPlanRevisionRef"] ?? ""
              ),
              deliveryRevisionRef: String(
                execution.inputSummary["deliveryRevisionRef"] ?? ""
              ),
              observationRevisionRefs: Array.isArray(
                execution.inputSummary["observationRevisionRefs"]
              )
                ? execution.inputSummary["observationRevisionRefs"] as string[]
                : []
            })
          : validateModelOutput({
              outputText: result.outputText,
              request
            });
        if (validation.valid) {
          await this.persistValidatedOutput(
            execution,
            validation.output,
            latestOutput
          );
          await this.finalizeValidatedExecution(
            execution.executionRef
          );
          return;
        }
        if (attempt < execution.maxAttempts) {
          await this.recordRetryableFailure(
            execution,
            "OUTPUT_VALIDATION_FAILED",
            "模型输出未通过本地校验，正在进行一次受控修复。",
            undefined,
            latestOutput
          );
          request = execution.resultKind === "lesson_reflection_draft"
            ? assembleReflectionRepairRequest({
                original: context.request,
                invalidOutput: result.outputText,
                validationIssues: validation.issues
              })
            : assembleRepairModelRequest({
            original: context.request,
            invalidOutput: result.outputText,
            validationIssues: validation.issues
              });
          execution =
            (await this.executions.get(
              this.pool,
              executionRef
            )) ?? execution;
          continue;
        }
        await this.finishFailure(execution, {
          status: "validation_failed",
          category: "OUTPUT_VALIDATION_FAILED",
          safeMessage:
            execution.resultKind === "lesson_reflection_draft"
              ? "模型输出经过一次受控修复后仍未通过验证，未创建课后反思草稿。"
              : "模型输出经过一次受控修复后仍未通过验证，未创建教学建议。",
          attemptMetrics: latestOutput
        });
        return;
      }
      await this.finishFailure(execution, {
        status: "permanently_failed",
        category: "UNKNOWN_PROVIDER_ERROR",
        safeMessage: "模型执行未能完成，可以人工重试。"
      });
    } finally {
      this.activeControllers.delete(executionRef);
      void latestOutput;
    }
  }

  private async loadPromptContext(
    execution: StoredModelExecution
  ): Promise<{
    request: ModelRequestV2;
    baseline: {
      revisionRef: string;
      artifactRef: string;
      content: TeachingPlan;
    };
  }> {
    const taskRun = await this.gate25Work.getTaskRun(
      this.pool,
      execution.taskRunRef
    );
    const preparationTask =
      await this.gate25Work.getPreparationTask(
        this.pool,
        "tenant:demo-school",
        execution.taskRef
      );
    const contextManifest =
      await this.gate2Runtime.getContextManifestByRef(
        this.pool,
        execution.contextManifestRef
      );
    const authorizedContextPlan =
      await this.gate2Runtime.getAuthorizedContextPlanByRef(
        this.pool,
        execution.authorizedContextPlanRef
      );
    if (
      !taskRun ||
      !preparationTask ||
      !contextManifest ||
      !authorizedContextPlan
    ) {
      throw new Error(
        "A sealed ModelExecution context record is missing."
      );
    }
    const educationContext =
      await this.education.getTeacherCopilotContext(
        this.pool,
        {
          tenantRef: preparationTask.tenantRef,
          courseRunRef: preparationTask.courseRunRef
        }
      );
    const courseRun =
      await this.gate25Education.getCourseRun(
        this.pool,
        preparationTask.tenantRef,
        preparationTask.courseRunRef
      );
    const unit = await this.gate25Education.getUnit(
      this.pool,
      preparationTask.tenantRef,
      preparationTask.curriculumUnitRef
    );
    const lesson = await this.gate25Education.getLesson(
      this.pool,
      preparationTask.tenantRef,
      preparationTask.lessonRef
    );
    const baselineRef = String(
      execution.inputSummary[
        "baselineTeachingPlanRef"
      ] ?? ""
    );
    const baseline =
      await this.artifacts.getTeachingPlanRevision(
        this.pool,
        baselineRef
      );
    const contractRef = String(
      execution.inputSummary["contractRef"] ?? ""
    );
    const contract = await this.work.getResolvedContract(
      this.pool,
      contractRef
    );
    if (
      !educationContext ||
      !courseRun ||
      !unit ||
      !lesson ||
      !baseline ||
      !contract
    ) {
      throw new Error(
        "The synthetic lesson prompt context cannot be reconstructed."
      );
    }
    if (
      taskRun.request.requestText !==
      contextManifest.requestSummary.requestText
    ) {
      throw new Error(
        "The sealed request summary does not match the TaskRun."
      );
    }
    const observationByRef = new Map(
      educationContext.observations.map((item) => [
        item.observationRef,
        {
          evidenceRef: item.observationRef,
          kind: "observation" as const,
          summary: item.summary,
          unknowns: item.unknowns
        }
      ])
    );
    const claimByRef = new Map(
      educationContext.claims.map((item) => [
        item.claimRef,
        {
          evidenceRef: item.claimRef,
          kind: "claim" as const,
          summary: item.summary,
          status: item.status
        }
      ])
    );
    const authorizedEvidence =
      contextManifest.evidenceRefs.map((reference) => {
        const item =
          observationByRef.get(reference) ??
          claimByRef.get(reference);
        if (!item) {
          throw new Error(
            `Authorized EvidenceRef is unavailable: ${reference}`
          );
        }
        return item;
      });
    const capabilities = await this.getCapabilities();
    const responseFormat =
      execution.provider === "mock"
        ? "json_schema"
        : capabilities?.supportsJsonSchema
          ? "json_schema"
          : capabilities?.supportsJsonObject === false
            ? "prompt_json"
            : "json_object";
    return {
      request: assembleLessonPreparationModelRequest({
        invocationRef: execution.executionRef,
        taskRunRef: execution.taskRunRef,
        agentRunRef: execution.agentRunRef,
        contextManifestRef:
          execution.contextManifestRef,
        timeoutMs: execution.timeoutMs,
        maxOutputTokens: execution.maxOutputTokens,
        responseFormat,
        request: taskRun.request,
        courseRun: {
          courseRunRef: courseRun.courseRunRef,
          subject: courseRun.subject,
          gradeLevel: courseRun.gradeLevel,
          className: courseRun.className,
          academicTerm: courseRun.academicTerm
        },
        curriculumUnit: {
          unitRef: unit.unitRef,
          title: unit.title,
          description: unit.description
        },
        lesson: {
          lessonRef: lesson.lessonRef,
          title: lesson.title,
          sequence: lesson.sequence,
          durationMinutes: lesson.durationMinutes
        },
        learningObjectives: lesson.learningObjectives,
        currentApprovedTeachingPlan: baseline.content,
        authorizedEvidence,
        evidenceGaps: contextManifest.unknowns,
        interactionContract: {
          contractRef: contract.contractRef,
          profileRef: contract.profileRef,
          policyVersionRef: contract.policyVersionRef,
          evidenceRuleVersionRef:
            contract.evidenceRuleVersionRef,
          supportLimit: contract.supportLimit,
          answerReleaseBoundary:
            contract.answerReleaseBoundary
        },
        taskWorkingSet: {
          version: authorizedContextPlan.workingSetVersion,
          purpose: preparationTask.workingSet.purpose,
          requestedFieldMask:
            authorizedContextPlan.requestedFieldMask,
          sourceLessonRef:
            preparationTask.workingSet.sourceLessonRef ?? null,
          sourceAssignmentRef:
            preparationTask.workingSet.sourceAssignmentRef ?? null,
          sourceAssignmentItemRefs:
            preparationTask.workingSet.sourceAssignmentItemRefs ?? []
        }
      }),
      baseline: {
        revisionRef: baseline.revisionRef,
        artifactRef: baseline.artifactRef,
        content: baseline.content
      }
    };
  }

  private async loadReflectionPromptContext(
    execution: StoredModelExecution
  ): Promise<{ request: ModelRequestV2 }> {
    const reflectionRef = String(
      execution.inputSummary["reflectionRef"] ?? ""
    );
    const revisionRef = String(
      execution.inputSummary["reflectionRevisionRef"] ?? ""
    );
    const [taskRun, reflectionTask, storedReflection, contextManifest, authorizedContextPlan] =
      await Promise.all([
        this.gate25Work.getTaskRun(this.pool, execution.taskRunRef),
        this.gate29Work.getReflectionTaskByTaskRef(
          this.pool,
          "tenant:demo-school",
          execution.taskRef
        ),
        this.gate29Artifacts.getReflection(
          this.pool,
          "tenant:demo-school",
          reflectionRef
        ),
        this.gate2Runtime.getContextManifestByRef(
          this.pool,
          execution.contextManifestRef
        ),
        this.gate2Runtime.getAuthorizedContextPlanByRef(
          this.pool,
          execution.authorizedContextPlanRef
        )
      ]);
    const reflection = storedReflection?.revisions.find(
      (item) => item.reflectionRevisionRef === revisionRef
    );
    if (
      !taskRun ||
      !reflectionTask ||
      !reflection ||
      reflection.status !== "draft" ||
      !contextManifest ||
      !authorizedContextPlan
    ) {
      throw new Error("The sealed Reflection model context cannot be reconstructed.");
    }
    const [courseRun, lesson, delivery, observations, teachingPlan] =
      await Promise.all([
        this.gate25Education.getCourseRun(
          this.pool,
          reflection.tenantRef,
          reflection.courseRunRef
        ),
        this.gate25Education.getLesson(
          this.pool,
          reflection.tenantRef,
          reflection.lessonRef
        ),
        this.gate29Education.getDeliveryByRevision(
          this.pool,
          reflection.tenantRef,
          execution.actorRef,
          reflection.deliveryRevisionRef
        ),
        this.gate29Education.validateConfirmedObservations(
          this.pool,
          reflection.tenantRef,
          execution.actorRef,
          reflection.lessonRef,
          reflection.observationRevisionRefs
        ),
        this.artifacts.getTeachingPlanRevision(
          this.pool,
          reflection.teachingPlanRevisionRef
        )
      ]);
    if (!courseRun || !lesson || !delivery || !teachingPlan) {
      throw new Error("A confirmed Reflection input disappeared.");
    }
    if (
      contextManifest.requestSummary.requestText !== taskRun.request.requestText ||
      !sameStringRefs(
        contextManifest.evidenceRefs,
        reflection.assignmentEvidenceRefs
      ) ||
      !sameStringRefs(
        observations.map((item) => item.observationRevisionRef),
        reflection.observationRevisionRefs
      )
    ) {
      throw new Error("The sealed Reflection context does not match its source facts.");
    }
    const evidenceResult = reflection.assignmentEvidenceRefs.length === 0
      ? { rows: [] as Array<{ observation_ref: string; objective_ref: string; outcome: string }> }
      : await this.pool.query<{
          observation_ref: string;
          objective_ref: string;
          outcome: string;
        }>(
          `SELECT source.observation_ref, item.objective_ref, grade.outcome
             FROM education.assignment_evidence_source AS source
             JOIN education.assignment AS assignment
               ON assignment.assignment_ref = source.assignment_ref
             JOIN education.assignment_item AS item
               ON item.item_ref = source.item_ref
             JOIN education.teacher_item_grade AS grade
               ON grade.grade_decision_ref = source.grade_decision_ref
              AND grade.response_ref = source.response_ref
            WHERE assignment.tenant_ref = $1
              AND source.lesson_ref = $2
              AND source.observation_ref = ANY($3::text[])
              AND NOT EXISTS (
                SELECT 1 FROM education.assignment_evidence_source AS newer
                 WHERE newer.supersedes_observation_ref = source.observation_ref
              )`,
          [
            reflection.tenantRef,
            reflection.lessonRef,
            reflection.assignmentEvidenceRefs
          ]
        );
    const capabilities = await this.getCapabilities();
    const responseFormat = execution.provider === "mock"
      ? "json_schema"
      : capabilities?.supportsJsonSchema
        ? "json_schema"
        : capabilities?.supportsJsonObject === false
          ? "prompt_json"
          : "json_object";
    return {
      request: assembleLessonReflectionModelRequest({
        invocationRef: execution.executionRef,
        taskRunRef: execution.taskRunRef,
        agentRunRef: execution.agentRunRef,
        contextManifestRef: execution.contextManifestRef,
        timeoutMs: execution.timeoutMs,
        maxOutputTokens: execution.maxOutputTokens,
        responseFormat,
        teacherNotes: taskRun.request.requestText,
        courseRun: {
          courseRunRef: courseRun.courseRunRef,
          subject: courseRun.subject,
          gradeLevel: courseRun.gradeLevel,
          className: courseRun.className
        },
        lesson: {
          lessonRef: lesson.lessonRef,
          title: lesson.title,
          durationMinutes: lesson.durationMinutes
        },
        learningObjectives: lesson.learningObjectives,
        approvedTeachingPlan: {
          revisionRef: teachingPlan.revisionRef,
          content: teachingPlan.content
        },
        confirmedDelivery: {
          deliveryRevisionRef: delivery.deliveryRevisionRef,
          actualStartAt: delivery.actualStartAt,
          actualEndAt: delivery.actualEndAt,
          steps: delivery.steps,
          paceNotes: delivery.paceNotes,
          unresolvedQuestions: delivery.unresolvedQuestions,
          followUpNotes: delivery.followUpNotes
        },
        confirmedObservations: observations.map((item) => ({
          observationRevisionRef: item.observationRevisionRef,
          scope: item.scope,
          scopeRef: item.scopeRef,
          observationType: item.observationType,
          content: item.content,
          observedAt: item.observedAt
        })),
        authorizedEvidence: evidenceResult.rows.map((item) => ({
          evidenceRef: item.observation_ref,
          objectiveRef: item.objective_ref,
          summary: `教师已确认的合成作业 Evidence，结果：${item.outcome}`
        })),
        currentReflectionDraft: reflection.content
      })
    };
  }

  private async beginAttempt(
    executionRef: string,
    attempt: number
  ): Promise<StoredModelExecution> {
    const now = this.clock().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await this.executions.get(
        client,
        executionRef
      );
      if (!current) throw new Error("ModelExecution missing.");
      const writeContext = executionWriteContext(current, now);
      const running = await this.executions.markRunning(
        client,
        {
          executionRef,
          eventRef: `model-execution-event:${randomUUID()}`,
          attempt,
          metadata: createWriteMetadata(
            writeContext,
            "capability",
            `model-attempt-${attempt}-running`
          )
        }
      );
      if (running.status === "cancel_requested") {
        await client.query("COMMIT");
        return running;
      }
      await this.gate25Work.updateTaskRunStatus(client, {
        taskRunRef: running.taskRunRef,
        status: "running",
        updatedAt: now
      });
      await this.runtime.updateAgentRunStatus(client, {
        agentRunRef: running.agentRunRef,
        status: "running",
        output: {
          proposalOnly: true,
          modelExecutionRef: running.executionRef,
          attempt
        },
        updatedAt: now
      });
      await client.query("COMMIT");
      return running;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordBudgetDecision(
    execution: StoredModelExecution,
    decision: ReturnType<ModelBudgetPolicy["evaluate"]>
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = this.clock().toISOString();
      const receipt =
        await this.executions.insertBudgetDecision(client, {
          executionRef: execution.executionRef,
          decision,
          metadata: createWriteMetadata(
            executionWriteContext(execution, now),
            "capability",
            "model-budget-decision"
          )
        });
      await this.governance.saveAudits(client, [receipt]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordRetryableFailure(
    execution: StoredModelExecution,
    category: ModelFailureCategory,
    safeMessage: string,
    providerRequestId?: string,
    attemptMetrics?: ProviderAttemptMetrics
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = this.clock().toISOString();
      const resolvedProviderRequestId =
        providerRequestId ??
        attemptMetrics?.providerRequestId;
      const receipt =
        await this.executions.markRetryableFailed(client, {
          executionRef: execution.executionRef,
          category,
          safeMessage,
          ...(resolvedProviderRequestId
            ? {
                providerRequestId:
                  resolvedProviderRequestId
              }
            : {}),
          ...(attemptMetrics?.inputTokens !== undefined
            ? {
                inputTokens: attemptMetrics.inputTokens
              }
            : {}),
          ...(attemptMetrics?.outputTokens !== undefined
            ? {
                outputTokens: attemptMetrics.outputTokens
              }
            : {}),
          ...(attemptMetrics
            ? {
                estimatedCost: estimateCost({
                  inputTokens:
                    attemptMetrics.inputTokens ?? 0,
                  outputTokens:
                    attemptMetrics.outputTokens ?? 0,
                  inputPricePerMillion:
                    this.settings.budget
                      .inputPricePerMillion,
                  outputPricePerMillion:
                    this.settings.budget
                      .outputPricePerMillion
                }),
                latencyMs: attemptMetrics.latencyMs,
                ...(attemptMetrics.finishReason
                  ? {
                      finishReason:
                        attemptMetrics.finishReason
                    }
                  : {})
              }
            : {}),
          eventRef: `model-execution-event:${randomUUID()}`,
          metadata: createWriteMetadata(
            executionWriteContext(execution, now),
            "capability",
            `model-attempt-${execution.attemptCount}-retryable`
          )
        });
      await this.governance.saveAudits(client, [receipt]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async persistValidatedOutput(
    execution: StoredModelExecution,
    output: import("@edu-agent/contracts").StructuredModelOutput,
    providerResult: {
      inputTokens?: number;
      outputTokens?: number;
      latencyMs: number;
      providerRequestId?: string;
      finishReason?: string;
    }
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = this.clock().toISOString();
      const cost = estimateCost({
        inputTokens: providerResult.inputTokens ?? 0,
        outputTokens: providerResult.outputTokens ?? 0,
        inputPricePerMillion:
          this.settings.budget.inputPricePerMillion,
        outputPricePerMillion:
          this.settings.budget.outputPricePerMillion
      });
      const receipt =
        await this.executions.markValidating(client, {
          executionRef: execution.executionRef,
          validatedOutput: output,
          outputHash: hash(output),
          ...(providerResult.inputTokens !== undefined
            ? { inputTokens: providerResult.inputTokens }
            : {}),
          ...(providerResult.outputTokens !== undefined
            ? { outputTokens: providerResult.outputTokens }
            : {}),
          estimatedCost: cost,
          latencyMs: providerResult.latencyMs,
          ...(providerResult.providerRequestId
            ? {
                providerRequestId:
                  providerResult.providerRequestId
              }
            : {}),
          ...(providerResult.finishReason
            ? { finishReason: providerResult.finishReason }
            : {}),
          eventRef: `model-execution-event:${randomUUID()}`,
          metadata: createWriteMetadata(
            executionWriteContext(execution, now),
            "capability",
            "model-output-validating"
          )
        });
      await this.runtime.updateAgentRunStatus(client, {
        agentRunRef: execution.agentRunRef,
        status: "validating",
        output: {
          modelExecutionRef: execution.executionRef,
          outputHash: hash(output),
          rawProviderContentStored: false
        },
        updatedAt: now
      });
      await this.governance.saveAudits(client, [receipt]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async finalizeValidatedExecution(
    executionRef: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const execution = await this.executions.lock(
        client,
        executionRef
      );
      if (!execution) {
        throw new Error("ModelExecution was not found.");
      }
      if (execution.status === "succeeded") {
        await client.query("COMMIT");
        return;
      }
      if (
        execution.status !== "validating" ||
        !execution.validatedOutput
      ) {
        throw new Error(
          "Only a validated ModelExecution can create a Proposal."
        );
      }
      if (execution.resultKind === "lesson_reflection_draft") {
        await this.finalizeReflectionExecution(client, execution);
        await client.query("COMMIT");
        return;
      }
      const existing =
        await this.gate2Work.getTaskResultByTaskRun(
          client,
          execution.taskRunRef
        );
      const now = this.clock().toISOString();
      const writeContext = executionWriteContext(execution, now);
      if (existing) {
        const receipt =
          await this.executions.markTerminal(client, {
            executionRef,
            status: "succeeded",
            proposalRevisionRef:
              existing.proposalRevisionRef,
            eventRef: `model-execution-event:${randomUUID()}`,
            metadata: createWriteMetadata(
              writeContext,
              "capability",
              "model-result-reused"
            )
          });
        await this.governance.saveAudits(client, [receipt]);
        await client.query("COMMIT");
        return;
      }

      const promptContext = await this.loadPromptContext(
        execution
      );
      const validation = validateModelOutput({
        outputText: JSON.stringify(execution.validatedOutput),
        request: promptContext.request
      });
      if (!validation.valid) {
        throw new Error(
          "Persisted validated output no longer passes validation."
        );
      }
      const proposalArtifactRef = `artifact:${randomUUID()}`;
      const proposalRevisionRef =
        `artifact-revision:${randomUUID()}`;
      const draftRevisionRef =
        `artifact-revision:${randomUUID()}`;
      const taskResultRef = `task-result:${randomUUID()}`;
      const diffsByStrategy = Object.fromEntries(
        validation.strategies.map((strategy) => [
          strategy.strategyId,
          buildDiff(
            promptContext.baseline.content,
            validation.strategyPlans[strategy.strategyId]!,
            {
              parentRevisionRef:
                promptContext.baseline.revisionRef,
              proposalRevisionRef,
              strategyId: strategy.strategyId
            }
          )
        ])
      );
      const firstStrategy = validation.strategies[0];
      if (!firstStrategy) {
        throw new Error(
          "Validated output contains no strategy."
        );
      }
      const draftPlan =
        validation.strategyPlans[firstStrategy.strategyId];
      if (!draftPlan) {
        throw new Error(
          "Validated strategy contains no TeachingPlan."
        );
      }
      const receipts: FormalWriteReceipt[] = [];
      const artifactResult =
        await this.artifacts.insertCopilotArtifacts(client, {
          proposalArtifactRef,
          proposalRevisionRef,
          proposalTitle: "备课建议（待教师处置）",
          sourceAgentRunRef: execution.agentRunRef,
          strategies: validation.strategies,
          diffsByStrategy,
          strategyPlans: validation.strategyPlans,
          teachingPlanArtifactRef:
            promptContext.baseline.artifactRef,
          parentTeachingPlanRevisionRef:
            promptContext.baseline.revisionRef,
          draftRevisionRef,
          draftPlan,
          lessonRef: String(
            execution.inputSummary["lessonRef"]
          ),
          preparationTaskRef: execution.taskRef,
          writeContext
        });
      receipts.push(...artifactResult.receipts);
      const goalRef = await this.resolveGoalRef(
        client,
        execution.taskRunRef
      );
      receipts.push(
        await this.gate2Work.insertTaskResult(client, {
          taskResultRef,
          taskRef: execution.taskRef,
          taskRunRef: execution.taskRunRef,
          ...(goalRef ? { goalRef } : {}),
          proposalArtifactRef,
          proposalRevisionRef,
          teachingPlanArtifactRef:
            promptContext.baseline.artifactRef,
          draftRevisionRef,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "model-invocation-task-result"
          )
        })
      );

      const preparation =
        await this.requirePreparationTask(
          client,
          "tenant:demo-school",
          execution.taskRef
        );
      if (preparation.status === "in_progress") {
        const awaiting = await this.gate25Work.transition(
          client,
          {
            taskRef: preparation.taskRef,
            fromStatus: "in_progress",
            toStatus: "awaiting_plan_review",
            expectedVersion: preparation.version,
            reason:
              "已生成并验证可恢复的待审 TeachingPlan Proposal",
            historyRef: `preparation-history:${randomUUID()}`,
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "TeachingPlanReviewCreated",
            metadata: transitionMetadata(
              writeContext,
              "model-proposal-created"
            )
          }
        );
        receipts.push(...awaiting.receipts);
        receipts.push(
          await this.gate25Education.updatePreparationProjection(
            client,
            {
              lessonRef: preparation.lessonRef,
              state: "awaiting_plan_review",
              activePreparationTaskRef: preparation.taskRef,
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "model-proposal-preparation-projection"
              )
            }
          )
        );
      }
      await this.gate25Work.updateTaskRunStatus(client, {
        taskRunRef: execution.taskRunRef,
        status: "completed",
        updatedAt: now
      });
      await this.runtime.updateAgentRunStatus(client, {
        agentRunRef: execution.agentRunRef,
        status: "completed",
        output: {
          modelExecutionRef: execution.executionRef,
          proposalRevisionRef,
          outputHash: execution.outputHash,
          proposalOnly: true,
          rawProviderContentStored: false
        },
        updatedAt: now
      });
      receipts.push(
        await this.executions.markTerminal(client, {
          executionRef,
          status: "succeeded",
          proposalRevisionRef,
          eventRef: `model-execution-event:${randomUUID()}`,
          metadata: createWriteMetadata(
            writeContext,
            "capability",
            "model-execution-succeeded"
          )
        })
      );
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw translateRepositoryConflict(error);
    } finally {
      client.release();
    }
  }

  private async finalizeReflectionExecution(
    client: import("../platform/postgres/types.js").PostgresClient,
    execution: StoredModelExecution
  ): Promise<void> {
    const output = StructuredReflectionOutputSchema.parse(
      execution.validatedOutput
    );
    const reflectionRef = String(
      execution.inputSummary["reflectionRef"] ?? ""
    );
    const expectedDraftRef = String(
      execution.inputSummary["reflectionRevisionRef"] ?? ""
    );
    const stored = await this.gate29Artifacts.getReflection(
      client,
      "tenant:demo-school",
      reflectionRef
    );
    const currentDraft = stored?.revisions.find(
      (item) => item.status === "draft"
    );
    if (
      !currentDraft ||
      currentDraft.reflectionRevisionRef !== expectedDraftRef
    ) {
      throw new DomainConflictError(
        "LESSON_REFLECTION_DRAFT_CHANGED",
        "模型生成期间反思草稿已变化，未覆盖教师内容。"
      );
    }
    const context = await this.loadReflectionPromptContext(execution);
    const validation = validateReflectionOutput({
      outputText: JSON.stringify(output),
      request: context.request,
      teachingPlanRevisionRef: currentDraft.teachingPlanRevisionRef,
      deliveryRevisionRef: currentDraft.deliveryRevisionRef,
      observationRevisionRefs: currentDraft.observationRevisionRefs
    });
    if (!validation.valid) {
      throw new Error("Persisted Reflection output no longer passes validation.");
    }
    const now = this.clock().toISOString();
    const writeContext = executionWriteContext(execution, now);
    const revisionRef = `artifact-revision:${randomUUID()}`;
    const content = ReflectionContentSchema.parse(output);
    const inserted = await this.gate29Artifacts.insertDraftRevision(client, {
      reflectionRef,
      revisionRef,
      parentRevisionRef: currentDraft.reflectionRevisionRef,
      title: `课后反思（Agent 草稿 v${currentDraft.revisionNumber + 1}）`,
      content,
      scope: {
        tenantRef: currentDraft.tenantRef,
        courseRunRef: currentDraft.courseRunRef,
        lessonRef: currentDraft.lessonRef,
        teachingPlanRevisionRef: currentDraft.teachingPlanRevisionRef,
        deliveryRevisionRef: currentDraft.deliveryRevisionRef,
        observationRevisionRefs: currentDraft.observationRevisionRefs,
        assignmentEvidenceRefs: currentDraft.assignmentEvidenceRefs
      },
      sourceAgentRunRef: execution.agentRunRef,
      revisionMetadata: createWriteMetadata(
        writeContext,
        "artifact",
        "reflection-model-draft-revision"
      ),
      scopeMetadata: createWriteMetadata(
        writeContext,
        "artifact",
        "reflection-model-draft-scope"
      ),
      eventRef: `reflection-event:${randomUUID()}`,
      eventMetadata: createWriteMetadata(
        writeContext,
        "artifact",
        "reflection-model-draft-event"
      ),
      outboxRef: `outbox:${randomUUID()}`,
      outboxMetadata: createWriteMetadata(
        writeContext,
        "artifact",
        "reflection-model-draft-outbox"
      ),
      eventName: "LessonReflectionDraftGenerated"
    });
    const receipts: FormalWriteReceipt[] = [...inserted.receipts];
    const reflectionTask = await this.gate29Work.getReflectionTask(
      client,
      currentDraft.tenantRef,
      reflectionRef
    );
    if (!reflectionTask) {
      throw new Error("Reflection Task disappeared during finalization.");
    }
    const transitioned = await this.gate29Work.setReflectionTaskStatus(client, {
      taskRef: reflectionTask.taskRef,
      fromStatuses: ["generating"],
      toStatus: "draft_ready",
      modelExecutionRef: execution.executionRef,
      updatedAt: now
    });
    if (!transitioned) {
      throw new DomainConflictError(
        "LESSON_REFLECTION_GENERATION_CONFLICT",
        "反思任务状态已变化，未重复创建草稿。"
      );
    }
    await this.gate25Work.updateTaskRunStatus(client, {
      taskRunRef: execution.taskRunRef,
      status: "completed",
      updatedAt: now
    });
    await this.runtime.updateAgentRunStatus(client, {
      agentRunRef: execution.agentRunRef,
      status: "completed",
      output: {
        modelExecutionRef: execution.executionRef,
        resultKind: "lesson_reflection_draft",
        reflectionRef,
        reflectionRevisionRef: revisionRef,
        teacherConfirmationRequired: true,
        outputHash: execution.outputHash,
        rawProviderContentStored: false
      },
      updatedAt: now
    });
    receipts.push(await this.executions.markTerminal(client, {
      executionRef: execution.executionRef,
      status: "succeeded",
      resultRef: revisionRef,
      eventRef: `model-execution-event:${randomUUID()}`,
      metadata: createWriteMetadata(
        writeContext,
        "capability",
        "reflection-model-succeeded"
      )
    }));
    await this.governance.saveAudits(client, receipts);
  }

  private async finishFailure(
    execution: StoredModelExecution,
    input: {
      status:
        | "timed_out"
        | "permanently_failed"
        | "validation_failed"
        | "budget_exceeded";
      category: ModelFailureCategory;
      safeMessage: string;
      attemptMetrics?: ProviderAttemptMetrics;
    }
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = this.clock().toISOString();
      const receipt =
        await this.executions.markTerminal(client, {
          executionRef: execution.executionRef,
          status: input.status,
          safeErrorCategory: input.category,
          safeMessage: input.safeMessage,
          ...(input.attemptMetrics?.providerRequestId
            ? {
                providerRequestId:
                  input.attemptMetrics.providerRequestId
              }
            : {}),
          ...(input.attemptMetrics?.inputTokens !== undefined
            ? {
                inputTokens:
                  input.attemptMetrics.inputTokens
              }
            : {}),
          ...(input.attemptMetrics?.outputTokens !== undefined
            ? {
                outputTokens:
                  input.attemptMetrics.outputTokens
              }
            : {}),
          ...(input.attemptMetrics
            ? {
                estimatedCost: estimateCost({
                  inputTokens:
                    input.attemptMetrics.inputTokens ?? 0,
                  outputTokens:
                    input.attemptMetrics.outputTokens ?? 0,
                  inputPricePerMillion:
                    this.settings.budget
                      .inputPricePerMillion,
                  outputPricePerMillion:
                    this.settings.budget
                      .outputPricePerMillion
                }),
                latencyMs:
                  input.attemptMetrics.latencyMs,
                ...(input.attemptMetrics.finishReason
                  ? {
                      finishReason:
                        input.attemptMetrics.finishReason
                    }
                  : {})
              }
            : {}),
          eventRef: `model-execution-event:${randomUUID()}`,
          metadata: createWriteMetadata(
            executionWriteContext(execution, now),
            "capability",
            `model-${input.status}`
          )
        });
      await this.gate25Work.updateTaskRunStatus(client, {
        taskRunRef: execution.taskRunRef,
        status: "failed",
        updatedAt: now
      });
      await this.runtime.updateAgentRunStatus(client, {
        agentRunRef: execution.agentRunRef,
        status: "failed",
        output: {
          modelExecutionRef: execution.executionRef,
          proposalCreated: false,
          safeErrorCategory: input.category
        },
        updatedAt: now
      });
      if (execution.resultKind === "lesson_reflection_draft") {
        await this.gate29Work.setReflectionTaskStatus(client, {
          taskRef: execution.taskRef,
          fromStatuses: ["generating"],
          toStatus: "draft_ready",
          modelExecutionRef: execution.executionRef,
          updatedAt: now
        });
      }
      await this.governance.saveAudits(client, [receipt]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async finishCancelled(
    execution: StoredModelExecution
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await this.executions.lock(
        client,
        execution.executionRef
      );
      if (!current) throw new Error("ModelExecution missing.");
      if (current.status === "cancelled") {
        await client.query("COMMIT");
        return;
      }
      const now = this.clock().toISOString();
      const receipt =
        await this.executions.markTerminal(client, {
          executionRef: current.executionRef,
          status: "cancelled",
          safeErrorCategory: "REQUEST_CANCELLED",
          safeMessage:
            current.resultKind === "lesson_reflection_draft"
              ? "模型调用已取消，未创建新的课后反思草稿。"
              : "模型调用已取消，未创建教学建议。",
          eventRef: `model-execution-event:${randomUUID()}`,
          metadata: createWriteMetadata(
            executionWriteContext(current, now),
            "capability",
            "model-cancelled"
          )
        });
      await this.gate25Work.updateTaskRunStatus(client, {
        taskRunRef: current.taskRunRef,
        status: "cancelled",
        updatedAt: now
      });
      await this.runtime.updateAgentRunStatus(client, {
        agentRunRef: current.agentRunRef,
        status: "cancelled",
        output: {
          modelExecutionRef: current.executionRef,
          proposalCreated: false
        },
        updatedAt: now
      });
      if (current.resultKind === "lesson_reflection_draft") {
        await this.gate29Work.setReflectionTaskStatus(client, {
          taskRef: current.taskRef,
          fromStatuses: ["generating"],
          toStatus: "draft_ready",
          modelExecutionRef: current.executionRef,
          updatedAt: now
        });
      }
      await this.governance.saveAudits(client, [receipt]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async requirePreparationTask(
    executor: Parameters<
      PostgresGate25WorkRepository["getPreparationTask"]
    >[0],
    tenantRef: string,
    taskRef: string
  ): Promise<StoredLessonPreparationTask> {
    const task =
      await this.gate25Work.getPreparationTask(
        executor,
        tenantRef,
        taskRef
      );
    if (!task || task.tenantRef !== tenantRef) {
      throw new NotFoundError(
        "The Lesson Preparation Task was not found."
      );
    }
    return task;
  }

  private assertInvocationContext(
    task: StoredLessonPreparationTask,
    request: CreateModelInvocationRequest
  ): void {
    if (
      task.courseRunRef !== request.courseRunRef ||
      task.curriculumUnitRef !== request.curriculumUnitRef ||
      task.lessonRef !== request.lessonRef
    ) {
      throw new DomainConflictError(
        "LESSON_PREPARATION_CONTEXT_MISMATCH",
        "The model invocation does not match the Task-owned lesson context."
      );
    }
    if (
      task.version !==
      request.expectedPreparationTaskVersion
    ) {
      throw new DomainConflictError(
        "LESSON_PREPARATION_VERSION_CONFLICT",
        "The Lesson Preparation Task changed before invocation.",
        {
          expectedVersion:
            request.expectedPreparationTaskVersion,
          actualVersion: task.version
        }
      );
    }
    if (
      task.workingSet.version !==
      request.workingSetVersion
    ) {
      throw new DomainConflictError(
        "TASK_WORKING_SET_VERSION_CONFLICT",
        "The TaskWorkingSet changed before authorization.",
        {
          expectedVersion: request.workingSetVersion,
          actualVersion: task.workingSet.version
        }
      );
    }
    if (
      !sameReferences(
        request.learningObjectiveRefs,
        task.workingSet.learningObjectiveRefs
      ) ||
      !sameReferences(
        request.selectedEvidenceRefs,
        task.workingSet.evidenceRefs
      )
    ) {
      throw new DomainConflictError(
        "TASK_WORKING_SET_SELECTION_MISMATCH",
        "The invocation must use the current TaskWorkingSet selections."
      );
    }
    if (
      task.status === "ready_for_use" ||
      task.status === "cancelled"
    ) {
      throw new DomainConflictError(
        "LESSON_PREPARATION_REOPEN_REQUIRED",
        "Reopen the Task explicitly before requesting another plan.",
        { status: task.status }
      );
    }
  }

  private assertEducationSelections(
    request: CreateModelInvocationRequest,
    context: NonNullable<
      Awaited<
        ReturnType<
          PostgresEducationRepository["getTeacherCopilotContext"]
        >
      >
    >,
    lessonObjectiveRefs: readonly string[]
  ): void {
    const availableEvidence = new Set([
      ...context.observations.map(
        (item) => item.observationRef
      ),
      ...context.claims.map((item) => item.claimRef)
    ]);
    if (
      request.selectedEvidenceRefs.some(
        (reference) => !availableEvidence.has(reference)
      )
    ) {
      throw new NotFoundError(
        "A selected EvidenceRef is not available."
      );
    }
    if (
      !sameReferences(
        request.learningObjectiveRefs,
        lessonObjectiveRefs
      )
    ) {
      throw new DomainConflictError(
        "LESSON_OBJECTIVE_SCOPE_MISMATCH",
        "The selected LearningObjectives do not match the Lesson."
      );
    }
  }

  private async resolveGoalRef(
    executor: Parameters<
      PostgresGate25WorkRepository["getTaskRun"]
    >[0],
    taskRunRef: string
  ): Promise<string | undefined> {
    const result = await executor.query<{
      goal_ref: string | null;
    }>(
      `SELECT task.goal_ref
         FROM work.task_run AS run
         JOIN work.task AS task
           ON task.task_ref = run.task_ref
        WHERE run.task_run_ref = $1`,
      [taskRunRef]
    );
    return result.rows[0]?.goal_ref ?? undefined;
  }
}

export function computeBackoffMilliseconds(input: {
  attempt: number;
  retryAfterMs?: number;
  random?: () => number;
}): number {
  if (input.retryAfterMs !== undefined) {
    return Math.min(30_000, Math.max(0, input.retryAfterMs));
  }
  const random = input.random ?? Math.random;
  const base = Math.min(
    8_000,
    500 * 2 ** Math.max(0, input.attempt - 1)
  );
  return Math.round(base * (0.75 + random() * 0.5));
}

function createTaskRequest(
  actorRef: string,
  request: CreateModelInvocationRequest,
  createdAt: string
): TeacherTaskRequest {
  return {
    requestText: request.requestText,
    actorRef,
    purpose: request.purpose,
    courseRunRef: request.courseRunRef,
    learningObjectiveRefs: [
      ...new Set(request.learningObjectiveRefs)
    ],
    selectedEvidenceRefs: [
      ...new Set(request.selectedEvidenceRefs)
    ],
    ...(request.curriculumUnitRef
      ? { curriculumUnitRef: request.curriculumUnitRef }
      : {}),
    ...(request.lessonRef
      ? { lessonRef: request.lessonRef }
      : {}),
    ...(request.preparationTaskRef
      ? {
          preparationTaskRef:
            request.preparationTaskRef
        }
      : {}),
    ...(request.expectedPreparationTaskVersion !== undefined
      ? {
          expectedPreparationTaskVersion:
            request.expectedPreparationTaskVersion
        }
      : {}),
    ...(request.workingSetVersion !== undefined
      ? { workingSetVersion: request.workingSetVersion }
      : {}),
    createdAt,
    requestVersion: request.requestVersion
  };
}

function toExecutionView(
  execution: StoredModelExecution
): ModelExecutionView {
  return ModelExecutionViewSchema.parse({
    modelExecutionRef: execution.executionRef,
    status: execution.status,
    provider: execution.provider,
    modelDisplayName: execution.modelDisplayName,
    taskRef: execution.taskRef,
    taskRunRef: execution.taskRunRef,
    agentRunRef: execution.agentRunRef,
    promptBundleRef: execution.promptBundleRef,
    promptBundleVersion: execution.promptBundleVersion,
    contextManifestRef: execution.contextManifestRef,
    authorizedContextPlanRef:
      execution.authorizedContextPlanRef,
    attemptCount: execution.attemptCount,
    maxAttempts: execution.maxAttempts,
    inputTokens: execution.inputTokens,
    outputTokens: execution.outputTokens,
    totalTokens: execution.totalTokens,
    estimatedCost: execution.estimatedCost,
    latencyMs: execution.latencyMs,
    providerRequestIdMasked: maskProviderRequestId(
      execution.providerRequestId
    ),
    finishReason: execution.finishReason,
    safeErrorCategory: execution.safeErrorCategory,
    safeMessage: execution.safeMessage,
    outputSchemaVersion: execution.outputSchemaVersion,
    resultKind: execution.resultKind,
    resultRef: execution.resultRef,
    proposalRevisionRef: execution.proposalRevisionRef,
    retryOfModelExecutionRef:
      execution.retryOfExecutionRef,
    queuedAt: execution.queuedAt,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    cancelledAt: execution.cancelledAt
  });
}

function activeModelId(
  settings: ModelProviderSettings
): string {
  return settings.activeProvider === "volcengine-ark"
    ? (settings.ark?.modelId ?? "")
    : "mock";
}

function sameStringRefs(
  left: readonly string[],
  right: readonly string[]
): boolean {
  const normalized = (values: readonly string[]) =>
    [...new Set(values)].sort();
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

function executionWriteContext(
  execution: StoredModelExecution,
  createdAt: string
): WriteContext {
  return {
    actorRef: execution.actorRef,
    purpose: execution.purpose,
    rootIdempotencyKey: `${execution.idempotencyKey}:${execution.attemptCount}:${createdAt}`,
    authorizationDecisionRef:
      execution.authorizationDecisionRef,
    createdAt
  };
}

function systemWriteContext(
  purpose: string,
  idempotencyKey: string,
  createdAt: string
): WriteContext {
  return {
    actorRef: "system:model-capability-probe",
    purpose,
    rootIdempotencyKey: idempotencyKey,
    authorizationDecisionRef:
      `authorization-decision:${hash(idempotencyKey).slice(0, 32)}`,
    createdAt
  };
}

function modelActionDecision(input: {
  decisionRef: string;
  tenantRef: string;
  actorRef: string;
  purpose: string;
  action: string;
  resourceRef: string;
  reasonCodes: string[];
  decidedAt: string;
}): AuthorizationDecision {
  return {
    decisionRef: input.decisionRef,
    actorRef: input.actorRef,
    tenantRef: input.tenantRef,
    purpose: input.purpose,
    action: input.action,
    resourceRef: input.resourceRef,
    requestedFieldMask: [],
    effect: "allow",
    reasonCodes: input.reasonCodes,
    policyVersion: "policy:model-invocation-actions@1",
    decidedAt: input.decidedAt
  };
}

function transitionMetadata(
  context: WriteContext,
  suffix: string
) {
  return {
    transition: createWriteMetadata(
      context,
      "work",
      `${suffix}-transition`
    ),
    history: createWriteMetadata(
      context,
      "work",
      `${suffix}-history`
    ),
    outbox: createWriteMetadata(
      context,
      "work",
      `${suffix}-outbox`
    )
  } as const;
}

function stableDecisionRef(rootKey: string): string {
  return `authorization-decision:${hash(rootKey).slice(0, 32)}`;
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameReferences(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    JSON.stringify([...new Set(left)].sort()) ===
    JSON.stringify([...new Set(right)].sort())
  );
}

function assertDemoActor(
  tenantRef: string,
  actorRef: string
): void {
  if (
    tenantRef !== "tenant:demo-school" ||
    actorRef !== "user:teacher-001"
  ) {
    throw new AuthorizationDeniedError(
      "Gate 2.6A only permits the synthetic demo tenant and teacher."
    );
  }
}

function budgetMessage(reasonCode: string): string {
  const messages: Record<string, string> = {
    MODEL_NOT_ALLOWED: "当前模型不在服务端白名单中。",
    INPUT_LIMIT_EXCEEDED: "本次输入超过模型预算上限。",
    OUTPUT_LIMIT_EXCEEDED: "本次输出上限超过模型预算。",
    SINGLE_COST_LIMIT_EXCEEDED:
      "本次调用的最大估算费用超过限制。",
    DAILY_BUDGET_EXCEEDED: "今日模型总预算已用完。",
    TEACHER_DAILY_BUDGET_EXCEEDED:
      "当前教师今日模型预算已用完。",
    CONCURRENCY_LIMIT_EXCEEDED:
      "模型并发已满，请稍后人工重试。",
    QUEUE_WAIT_EXCEEDED:
      "模型排队时间超过允许上限，请人工重试。"
  };
  return (
    messages[reasonCode] ??
    "模型预算检查未通过，未调用外部服务。"
  );
}

function translateRepositoryConflict(error: unknown): unknown {
  if (
    error instanceof Error &&
    error.message ===
      "LESSON_PREPARATION_TRANSITION_CONFLICT"
  ) {
    return new DomainConflictError(
      "LESSON_PREPARATION_TRANSITION_CONFLICT",
      "The Lesson Preparation Task changed concurrently."
    );
  }
  if (
    error instanceof Error &&
    /model_execution_active_retry_unique|model_execution_task_run_active_unique/u.test(
      error.message
    )
  ) {
    return new DomainConflictError(
      "MODEL_EXECUTION_CONFLICT",
      "A ModelExecution already exists for this TaskRun or retry."
    );
  }
  return error;
}

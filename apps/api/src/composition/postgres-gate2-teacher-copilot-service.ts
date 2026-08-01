import { createHash, randomUUID } from "node:crypto";

import {
  ApproveTeachingPlanResultSchema,
  AuthorizedContextPlanSchema,
  CreateTeacherCopilotTaskResultSchema,
  SuggestionDispositionResultSchema,
  TeachingPlanSchema,
  type ApproveTeachingPlanRequest,
  type ApproveTeachingPlanResult,
  type AuthorizationDecision,
  type CreateTeacherCopilotTaskRequest,
  type CreateTeacherCopilotTaskResult,
  type FormalWriteReceipt,
  type PedagogicalStrategy,
  type SuggestionDispositionRequest,
  type SuggestionDispositionResult,
  type TeachingPlan,
  type TeacherTaskRequest,
  type TeachingPlanDiff,
  type TeachingPlanDiffChange
} from "@edu-agent/contracts";
import {
  gate2DemoRefs,
  strategyTeachingPlans
} from "@edu-agent/test-fixtures";
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
import {
  PostgresGate2CapabilityRepository
} from "../modules/capability-integration/infrastructure/postgres-gate2-capability-repository.js";
import {
  MockModelProvider
} from "../modules/capability-integration/infrastructure/mock-model-provider.js";
import {
  PostgresGate25EducationRepository
} from "../modules/education-domain/infrastructure/postgres-gate2-5-education-repository.js";
import {
  PostgresEducationRepository
} from "../modules/education-domain/infrastructure/postgres-education-repository.js";
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

const GENERATE_PURPOSE = "teacher-copilot.adjust-next-lesson";
const REVIEW_PURPOSE = "teacher-copilot.review-suggestion";
const APPROVE_PURPOSE = "teacher-copilot.approve-plan";

const planFields = [
  "objective",
  "lessonFocus",
  "openingActivity",
  "teacherQuestions",
  "studentActivity",
  "supportStrategy",
  "independentCheck",
  "followUp",
  "evidenceRefs"
] as const;

const changeReasons: Record<(typeof planFields)[number], string> = {
  objective: "把目标从识别结论提升为可解释的概念联系",
  lessonFocus: "聚焦现有证据揭示的截距干扰与解释缺口",
  openingActivity: "用对比情境隔离无关变量并激活已有认识",
  teacherQuestions: "加入要求学生说明证据和反例的问题",
  studentActivity: "增加从协作比较到独立解释的学习活动",
  supportStrategy: "明确支持上限，避免直接释放答案",
  independentCheck: "收集可用于下一轮判断的独立解释证据",
  followUp: "把课堂结果转化为后续备课可审查的证据",
  evidenceRefs: "补充本次调整实际依赖的 Evidence 引用"
};

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function buildDiff(
  baseline: TeachingPlan,
  proposed: TeachingPlan,
  input: {
    parentRevisionRef: string;
    proposalRevisionRef: string;
    strategyId: string;
  }
): TeachingPlanDiff {
  const changes: TeachingPlanDiffChange[] = [];
  for (const field of planFields) {
    const before = baseline[field];
    const after = proposed[field];
    if (JSON.stringify(before) === JSON.stringify(after)) {
      continue;
    }
    changes.push({
      field,
      kind:
        before === undefined
          ? "added"
          : after === undefined
            ? "removed"
            : "modified",
      before: before ?? null,
      after: after ?? null,
      reason: changeReasons[field],
      evidenceRefs: [...proposed.evidenceRefs],
      teacherSelection: "pending"
    });
  }
  return {
    parentRevisionRef: input.parentRevisionRef,
    proposalRevisionRef: input.proposalRevisionRef,
    strategyId: input.strategyId,
    changes
  };
}

function stableDecisionRef(rootKey: string): string {
  return `authorization-decision:${hash(rootKey).slice(0, 32)}`;
}

export class PostgresGate2TeacherCopilotService {
  constructor(
    private readonly pool: Pool,
    private readonly governance =
      new PostgresGovernanceRepository(),
    private readonly work = new PostgresWorkRepository(),
    private readonly gate2Work =
      new PostgresGate2WorkRepository(),
    private readonly gate25Work =
      new PostgresGate25WorkRepository(),
    private readonly runtime = new PostgresRuntimeRepository(),
    private readonly gate2Runtime =
      new PostgresGate2RuntimeRepository(),
    private readonly capability =
      new PostgresGate2CapabilityRepository(),
    private readonly artifacts =
      new PostgresGate2ArtifactRepository(),
    private readonly education = new PostgresEducationRepository(),
    private readonly gate25Education =
      new PostgresGate25EducationRepository(),
    private readonly model = new MockModelProvider()
  ) {}

  async createTask(input: {
    tenantRef: string;
    actorRef: string;
    request: CreateTeacherCopilotTaskRequest;
  }): Promise<CreateTeacherCopilotTaskResult> {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    if (input.request.purpose !== GENERATE_PURPOSE) {
      throw new AuthorizationDeniedError(
        "该用途未获得 Teacher Copilot 课堂调整权限。"
      );
    }
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      input.request.purpose,
      input.request.idempotencyKey
    ].join("|");
    const decisionRef = stableDecisionRef(rootKey);
    const now = new Date().toISOString();
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
      const reservation = await this.governance.reserveIdempotency(
        client,
        {
          idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
          rootKey,
          requestFingerprint: hash(input.request),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "teacher-copilot-idempotency"
          )
        }
      );
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return CreateTeacherCopilotTaskResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }

      let preparationTask:
        | StoredLessonPreparationTask
        | undefined;
      if (input.request.preparationTaskRef) {
        preparationTask =
          await this.gate25Work.lockPreparationTask(
            client,
            input.tenantRef,
            input.request.preparationTaskRef
          );
        if (!preparationTask) {
          throw new NotFoundError(
            "The lesson-preparation Task was not found."
          );
        }
        if (
          input.request.expectedPreparationTaskVersion ===
          undefined
        ) {
          throw new DomainConflictError(
            "LESSON_PREPARATION_VERSION_REQUIRED",
            "A Lesson-scoped Copilot command requires the expected Work Task version.",
            {
              taskRef: preparationTask.taskRef,
              actualVersion: preparationTask.version
            }
          );
        }
        if (
          input.request.expectedPreparationTaskVersion !==
          preparationTask.version
        ) {
          throw new DomainConflictError(
            "LESSON_PREPARATION_VERSION_CONFLICT",
            "The Work Task changed before the Copilot run started.",
            {
              expectedVersion:
                input.request.expectedPreparationTaskVersion,
              actualVersion: preparationTask.version,
              status: preparationTask.status
            }
          );
        }
        if (
          preparationTask.courseRunRef !==
            input.request.courseRunRef ||
          preparationTask.curriculumUnitRef !==
            input.request.curriculumUnitRef ||
          preparationTask.lessonRef !== input.request.lessonRef
        ) {
          throw new DomainConflictError(
            "LESSON_PREPARATION_CONTEXT_MISMATCH",
            "The Copilot request does not match the Task-owned lesson context.",
            {
              preparationTaskRef: preparationTask.taskRef,
              courseRunRef: preparationTask.courseRunRef,
              curriculumUnitRef:
                preparationTask.curriculumUnitRef,
              lessonRef: preparationTask.lessonRef
            }
          );
        }
        if (
          input.request.workingSetVersion !==
          preparationTask.workingSet.version
        ) {
          throw new DomainConflictError(
            "TASK_WORKING_SET_VERSION_CONFLICT",
            "The selected context changed before the Copilot run was sealed.",
            {
              expectedWorkingSetVersion:
                input.request.workingSetVersion,
              actualWorkingSetVersion:
                preparationTask.workingSet.version
            }
          );
        }
        const sameReferences = (
          left: readonly string[],
          right: readonly string[]
        ) =>
          JSON.stringify([...new Set(left)].sort()) ===
          JSON.stringify([...new Set(right)].sort());
        if (
          !sameReferences(
            input.request.learningObjectiveRefs,
            preparationTask.workingSet.learningObjectiveRefs
          ) ||
          !sameReferences(
            input.request.selectedEvidenceRefs,
            preparationTask.workingSet.evidenceRefs
          )
        ) {
          throw new DomainConflictError(
            "TASK_WORKING_SET_SELECTION_MISMATCH",
            "The request must use the current TaskWorkingSet selections.",
            {
              workingSetVersion:
                preparationTask.workingSet.version,
              expectedPreparationTaskVersion:
                input.request.expectedPreparationTaskVersion
            }
          );
        }
        if (
          preparationTask.status === "ready_for_use" ||
          preparationTask.status === "cancelled"
        ) {
          throw new DomainConflictError(
            "LESSON_PREPARATION_REOPEN_REQUIRED",
            "Reopen the Task explicitly before requesting another plan.",
            {
              status: preparationTask.status,
              taskRef: preparationTask.taskRef
            }
          );
        }
      }

      const educationContext =
        await this.education.getTeacherCopilotContext(client, {
          tenantRef: input.tenantRef,
          courseRunRef: input.request.courseRunRef
        });
      if (!educationContext) {
        throw new NotFoundError(
          "当前租户下没有可用的合成 CourseRun。"
        );
      }
      const goal = await this.gate2Work.getDemoCaseAndGoal(
        client,
        input.tenantRef,
        input.request.goalRef
      );
      if (!goal) {
        throw new NotFoundError(
          "当前租户下没有可用的教学改进 Goal。"
        );
      }
      const baseline =
        preparationTask?.workingSet.baselineTeachingPlanRef
          ? await this.artifacts.getTeachingPlanRevision(
              client,
              preparationTask.workingSet
                .baselineTeachingPlanRef
            )
          : await this.artifacts.getCurrentApprovedTeachingPlan(
              client,
              educationContext.teachingPlanArtifactRef
            );
      if (!baseline) {
        throw new NotFoundError("TeachingPlan 基线不存在。");
      }
      if (
        preparationTask &&
        (baseline.artifactRef !==
          educationContext.teachingPlanArtifactRef ||
          baseline.state !== "approved")
      ) {
        throw new DomainConflictError(
          "LESSON_PREPARATION_BASELINE_INVALID",
          "The TaskWorkingSet baseline is not an immutable approved TeachingPlan.",
          {
            baselineTeachingPlanRef:
              preparationTask.workingSet
                .baselineTeachingPlanRef
          }
        );
      }

      const availableEvidenceRefs = [
        ...educationContext.observations.map(
          (item) => item.observationRef
        ),
        ...educationContext.claims.map((item) => item.claimRef)
      ];
      const availableEvidence = new Set(availableEvidenceRefs);
      const authorizedObjectiveRefs = new Set(
        preparationTask
          ? preparationTask.workingSet.learningObjectiveRefs
          : [educationContext.objective.objectiveRef]
      );
      if (
        input.request.learningObjectiveRefs.some(
          (reference) => !authorizedObjectiveRefs.has(reference)
        )
      ) {
        throw new NotFoundError(
          "A selected learning objective is not available in this CourseRun."
        );
      }
      if (
        input.request.selectedEvidenceRefs.some(
          (reference) => !availableEvidence.has(reference)
        )
      ) {
        throw new NotFoundError(
          "A selected Evidence reference is not available in this CourseRun."
        );
      }
      const evidenceRefs = [
        ...new Set(input.request.selectedEvidenceRefs)
      ];
      const taskRequest: TeacherTaskRequest = {
        requestText: input.request.requestText,
        actorRef: input.actorRef,
        purpose: input.request.purpose,
        courseRunRef: input.request.courseRunRef,
        learningObjectiveRefs: [
          ...new Set(input.request.learningObjectiveRefs)
        ],
        selectedEvidenceRefs: evidenceRefs,
        ...(preparationTask
          ? {
              preparationTaskRef: preparationTask.taskRef,
              curriculumUnitRef:
                preparationTask.curriculumUnitRef,
              lessonRef: preparationTask.lessonRef,
              ...(preparationTask.workingSet
                .baselineTeachingPlanRef
                ? {
                    baselineTeachingPlanRef:
                      preparationTask.workingSet
                        .baselineTeachingPlanRef
                  }
                : {}),
              workingSetVersion:
                preparationTask.workingSet.version
            }
          : {}),
        createdAt: now,
        requestVersion: input.request.requestVersion
      };
      const knownGaps = Array.from(
        new Set(
          educationContext.observations.flatMap(
            (item) => item.unknowns
          )
        )
      );
      const taskRef =
        preparationTask?.taskRef ?? `task:${randomUUID()}`;
      const taskRunRef = `task-run:${randomUUID()}`;
      const agentRunRef = `agent-run:${randomUUID()}`;
      const contractRef = `interaction-contract:${randomUUID()}`;
      const contextManifestRef =
        `context-manifest:${randomUUID()}`;
      const authorizedContextPlanRef =
        `authorized-context-plan:${randomUUID()}`;
      const runManifestRef = `run-manifest:${randomUUID()}`;
      const modelExecutionRef =
        `model-execution:${randomUUID()}`;
      const proposalArtifactRef = `artifact:${randomUUID()}`;
      const proposalRevisionRef =
        `artifact-revision:${randomUUID()}`;
      const draftRevisionRef =
        `artifact-revision:${randomUUID()}`;
      const taskResultRef = `task-result:${randomUUID()}`;

      const modelResult =
        await this.model.generateTeacherStrategies({
          requestText: taskRequest.requestText,
          evidenceRefs,
          knownGaps
        });
      const diffsByStrategy: Record<string, TeachingPlanDiff> = {};
      for (const strategy of modelResult.strategies) {
        const plan = strategyTeachingPlans[strategy.strategyId];
        if (!plan) {
          throw new Error(
            `Mock strategy has no TeachingPlan: ${strategy.strategyId}`
          );
        }
        diffsByStrategy[strategy.strategyId] = buildDiff(
          baseline.content,
          plan,
          {
            parentRevisionRef: baseline.revisionRef,
            proposalRevisionRef,
            strategyId: strategy.strategyId
          }
        );
      }
      const defaultStrategy = modelResult.strategies[0];
      if (!defaultStrategy) {
        throw new Error("MockModelProvider returned no strategy.");
      }
      const draftPlan =
        strategyTeachingPlans[defaultStrategy.strategyId];
      if (!draftPlan) {
        throw new Error("Default strategy TeachingPlan is missing.");
      }

      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: input.request.purpose,
        action: "teacher-copilot.adjust-next-lesson",
        resourceRef: input.request.courseRunRef,
        requestedFieldMask: [
          "courseRun",
          "learningObjective",
          "evidence.observations",
          "evidence.claims",
          "teachingPlan"
        ],
        effect: "allow",
        reasonCodes: [
          "synthetic-teacher-role",
          "proposal-only",
          "no-external-commitment"
        ],
        policyVersion: "policy:teacher-copilot-synthetic@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "teacher-copilot-authorization"
          )
        })
      ];

      if (preparationTask) {
        const attempt =
          await this.gate25Work.nextTaskRunAttempt(
            client,
            taskRef
          );
        receipts.push(
          ...(await this.gate25Work.insertTaskRun(client, {
            taskRunRef,
            taskRef,
            attempt,
            request: taskRequest,
            metadata: createWriteMetadata(
              writeContext,
              "work",
              "lesson-preparation-copilot-task-run"
            ),
            outboxRef: `outbox:${randomUUID()}`,
            outboxMetadata: createWriteMetadata(
              writeContext,
              "work",
              "lesson-preparation-copilot-task-run-outbox"
            )
          }))
        );
      } else {
        receipts.push(
          ...(await this.work.insertTaskBundle(client, {
            task: {
              taskRef,
              title: taskRequest.requestText.slice(0, 120),
              status: "completed",
              taskKind: "TeacherCopilotLessonAdjustment",
              caseRef: goal.caseRef,
              goalRef: goal.goalRef,
              request: taskRequest,
              metadata: createWriteMetadata(
                writeContext,
                "work",
                "teacher-copilot-task"
              )
            },
            taskRun: {
              taskRunRef,
              taskRef,
              attempt: 1,
              status: "completed",
              metadata: createWriteMetadata(
                writeContext,
                "work",
                "teacher-copilot-task-run"
              )
            },
            outbox: {
              outboxRef: `outbox:${randomUUID()}`,
              eventName: "TeacherCopilotTaskCompleted",
              aggregateRef: taskRunRef,
              payload: {
                taskRef,
                goalRef: goal.goalRef,
                requestVersion: taskRequest.requestVersion
              },
              metadata: createWriteMetadata(
                writeContext,
                "work",
                "teacher-copilot-task-outbox"
              )
            }
          }))
        );
      }

      const contractPayload = {
        taskRef,
        taskRequest,
        profileRef: educationContext.profile.profileRef,
        profileVersion: educationContext.profile.profileVersion,
        profileContentHash: educationContext.profile.contentHash,
        policyVersionRef:
          educationContext.profile.policyVersionRef,
        promptVersionRef:
          educationContext.profile.promptVersionRef,
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
            educationContext.profile.promptVersionRef,
          evidenceRuleVersionRef:
            educationContext.profile.evidenceRuleVersionRef,
          participationMode:
            educationContext.profile.participationMode,
          supportLimit: educationContext.profile.supportLimit,
          answerReleaseBoundary:
            educationContext.profile.answerReleaseBoundary,
          contractPayload,
          contentHash: contractContentHash,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "teacher-copilot-contract"
          )
        })
      );

      const authorizedContextPlan = preparationTask
        ? AuthorizedContextPlanSchema.parse({
            authorizedContextPlanRef,
            taskRef,
            taskRunRef,
            workingSetVersion:
              preparationTask.workingSet.version,
            authorizedResourceRefs: [
              preparationTask.courseRunRef,
              preparationTask.curriculumUnitRef,
              preparationTask.lessonRef,
              ...preparationTask.workingSet
                .learningObjectiveRefs,
              ...(preparationTask.workingSet
                .baselineTeachingPlanRef
                ? [
                    preparationTask.workingSet
                      .baselineTeachingPlanRef
                  ]
                : []),
              ...(preparationTask.workingSet.sourceLessonRef
                ? [preparationTask.workingSet.sourceLessonRef]
                : []),
              ...(preparationTask.workingSet.sourceAssignmentRef
                ? [preparationTask.workingSet.sourceAssignmentRef]
                : []),
              ...(preparationTask.workingSet.sourceAssignmentItemRefs ?? [])
            ],
            authorizedEvidenceRefs: evidenceRefs,
            deniedResourceRefs: [],
            requestedFieldMask:
              preparationTask.workingSet.requestedFieldMask,
            authorizationDecisionRef: decisionRef,
            contentHash: hash({
              taskRef,
              taskRunRef,
              workingSetVersion:
                preparationTask.workingSet.version,
              resourceRefs: [
                preparationTask.courseRunRef,
                preparationTask.curriculumUnitRef,
                preparationTask.lessonRef,
                ...preparationTask.workingSet
                  .learningObjectiveRefs,
                preparationTask.workingSet
                  .baselineTeachingPlanRef,
                preparationTask.workingSet.sourceLessonRef,
                preparationTask.workingSet.sourceAssignmentRef,
                ...(preparationTask.workingSet.sourceAssignmentItemRefs ?? [])
              ],
              evidenceRefs,
              requestedFieldMask:
                preparationTask.workingSet
                  .requestedFieldMask,
              authorizationDecisionRef: decisionRef
            }),
            resolvedAt: now
          })
        : undefined;
      if (authorizedContextPlan) {
        receipts.push(
          await this.gate2Runtime.insertAuthorizedContextPlan(
            client,
            {
              ...authorizedContextPlan,
              metadata: createWriteMetadata(
                writeContext,
                "runtime",
                "lesson-preparation-authorized-context-plan"
              )
            }
          )
        );
      }

      receipts.push(
        ...(await this.capability.insertModelExecutionBundle(
          client,
          {
            execution: {
              executionRef: modelExecutionRef,
              provider: "mock",
              modelProfile: modelResult.modelProfile,
              promptBundleRef: modelResult.promptBundleRef,
              inputSummary: {
                agentRunRef,
                requestText: taskRequest.requestText,
                requestVersion: taskRequest.requestVersion,
                courseRunRef: input.request.courseRunRef,
                evidenceRefs,
                knownGaps
              },
              strategies: modelResult.strategies,
              usageSummary: modelResult.usage,
              metadata: createWriteMetadata(
                writeContext,
                "capability",
                "teacher-copilot-model-execution"
              )
            },
            outbox: {
              outboxRef: `outbox:${randomUUID()}`,
              eventName: "MockModelExecutionCompleted",
              aggregateRef: modelExecutionRef,
              payload: {
                agentRunRef,
                externalNetworkUsed: false
              },
              metadata: createWriteMetadata(
                writeContext,
                "capability",
                "teacher-copilot-model-outbox"
              )
            }
          }
        ))
      );

      receipts.push(
        ...(await this.runtime.insertAgentRunBundle(client, {
          agentRun: {
            agentRunRef,
            runKind: "TaskRun",
            boundRunRef: taskRunRef,
            status: "completed",
            modelProvider: "mock",
            modelProfile: modelResult.modelProfile,
            toolName: "none",
            output: {
              strategies: modelResult.strategies,
              proposalOnly: true
            },
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "teacher-copilot-agent-run"
            )
          },
          manifest: {
            manifestRef: runManifestRef,
            agentRunRef,
            contractRef,
            contextManifestRef,
            promptVersionRef: modelResult.promptBundleRef,
            policyVersionRef: decision.policyVersion,
            capabilityRefs: ["capability:model:mock"],
            contextRefs: [
              input.request.courseRunRef,
              goal.goalRef,
              ...evidenceRefs
            ],
            contentHash: hash({
              contractContentHash,
              promptBundleRef: modelResult.promptBundleRef,
              evidenceRefs,
              taskRequest
            }),
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "teacher-copilot-run-manifest"
            )
          },
          outbox: {
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "AgentRunCompleted",
            aggregateRef: agentRunRef,
            payload: {
              taskRunRef,
              runManifestRef,
              externalNetworkUsed: false
            },
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "teacher-copilot-runtime-outbox"
            )
          }
        }))
      );
      receipts.push(
        await this.gate2Runtime.insertContextManifest(client, {
          contextManifestRef,
          agentRunRef,
          resourceRefs: authorizedContextPlan
            ? authorizedContextPlan.authorizedResourceRefs
            : [
                input.request.courseRunRef,
                goal.caseRef,
                goal.goalRef,
                educationContext.objective.objectiveRef,
                baseline.revisionRef
              ],
          evidenceRefs,
          unknowns: knownGaps,
          requestedFieldMask:
            authorizedContextPlan?.requestedFieldMask ??
            decision.requestedFieldMask,
          taskRef,
          ...(authorizedContextPlan
            ? {
                authorizedContextPlanRef:
                  authorizedContextPlan.authorizedContextPlanRef
              }
            : {}),
          requestSummary: taskRequest,
          metadata: createWriteMetadata(
            writeContext,
            "runtime",
            "teacher-copilot-context-manifest"
          )
        })
      );

      const artifactResult =
        await this.artifacts.insertCopilotArtifacts(client, {
          proposalArtifactRef,
          proposalRevisionRef,
          proposalTitle: "明天课堂调整建议（待教师处置）",
          sourceAgentRunRef: agentRunRef,
          strategies: modelResult.strategies,
          diffsByStrategy,
          teachingPlanArtifactRef:
            educationContext.teachingPlanArtifactRef,
          parentTeachingPlanRevisionRef: baseline.revisionRef,
          draftRevisionRef,
          draftPlan,
          ...(preparationTask
            ? {
                lessonRef: preparationTask.lessonRef,
                preparationTaskRef: preparationTask.taskRef
              }
            : {}),
          writeContext
        });
      receipts.push(...artifactResult.receipts);
      receipts.push(
        await this.gate2Work.insertTaskResult(client, {
          taskResultRef,
          taskRef,
          taskRunRef,
          goalRef: goal.goalRef,
          proposalArtifactRef,
          proposalRevisionRef,
          teachingPlanArtifactRef:
            educationContext.teachingPlanArtifactRef,
          draftRevisionRef,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "teacher-copilot-task-result"
          )
        })
      );

      if (
        preparationTask &&
        preparationTask.status !== "completed" &&
        preparationTask.status !== "awaiting_plan_review"
      ) {
        let currentStatus = preparationTask.status;
        let currentVersion = preparationTask.version;
        if (currentStatus === "planned") {
          const started = await this.gate25Work.transition(
            client,
            {
              taskRef,
              fromStatus: "planned",
              toStatus: "in_progress",
              expectedVersion: currentVersion,
              reason: "首次 Copilot Run 启动备课",
              historyRef: `preparation-history:${randomUUID()}`,
              outboxRef: `outbox:${randomUUID()}`,
              eventName: "LessonPreparationStarted",
              metadata: {
                transition: createWriteMetadata(
                  writeContext,
                  "work",
                  "copilot-start-preparation"
                ),
                history: createWriteMetadata(
                  writeContext,
                  "work",
                  "copilot-start-preparation-history"
                ),
                outbox: createWriteMetadata(
                  writeContext,
                  "work",
                  "copilot-start-preparation-outbox"
                )
              }
            }
          );
          receipts.push(...started.receipts);
          currentStatus = "in_progress";
          currentVersion = started.version;
        }
        if (currentStatus === "in_progress") {
          const awaiting = await this.gate25Work.transition(
            client,
            {
              taskRef,
              fromStatus: "in_progress",
              toStatus: "awaiting_plan_review",
              expectedVersion: currentVersion,
              reason: "已生成可恢复的待审 TeachingPlan Proposal",
              historyRef: `preparation-history:${randomUUID()}`,
              outboxRef: `outbox:${randomUUID()}`,
              eventName: "TeachingPlanReviewCreated",
              metadata: {
                transition: createWriteMetadata(
                  writeContext,
                  "work",
                  "copilot-awaiting-plan-review"
                ),
                history: createWriteMetadata(
                  writeContext,
                  "work",
                  "copilot-awaiting-plan-review-history"
                ),
                outbox: createWriteMetadata(
                  writeContext,
                  "work",
                  "copilot-awaiting-plan-review-outbox"
                )
              }
            }
          );
          receipts.push(...awaiting.receipts);
          receipts.push(
            await this.gate25Education.updatePreparationProjection(
              client,
              {
                lessonRef: preparationTask.lessonRef,
                state: "awaiting_plan_review",
                activePreparationTaskRef: taskRef,
                metadata: createWriteMetadata(
                  writeContext,
                  "education",
                  "copilot-awaiting-plan-review-projection"
                )
              }
            )
          );
        }
      }

      const result = CreateTeacherCopilotTaskResultSchema.parse({
        replayed: false,
        taskRef,
        taskRunRef,
        agentRunRef,
        contractRef,
        request: taskRequest,
        proposalArtifactRef,
        proposalRevisionRef,
        teachingPlanArtifactRef:
          educationContext.teachingPlanArtifactRef,
        draftRevision: artifactResult.draftRevision,
        strategies: modelResult.strategies,
        diffsByStrategy,
        authorizationDecisionRef: decisionRef,
        ...(preparationTask
          ? {
              preparationTaskRef: preparationTask.taskRef,
              lessonRef: preparationTask.lessonRef,
              authorizedContextPlanRef
            }
          : {})
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
      throw error;
    } finally {
      client.release();
    }
  }

  async disposition(input: {
    tenantRef: string;
    actorRef: string;
    proposalRevisionRef: string;
    request: SuggestionDispositionRequest;
  }): Promise<SuggestionDispositionResult> {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    if (input.request.purpose !== REVIEW_PURPOSE) {
      throw new AuthorizationDeniedError(
        "该用途未获得建议处置权限。"
      );
    }
    const dispositionFingerprint = hash({
      proposalRevisionRef: input.proposalRevisionRef,
      purpose: input.request.purpose,
      disposition: input.request.disposition,
      selectedStrategyId: input.request.selectedStrategyId,
      teacherEdits: input.request.teacherEdits,
      note: input.request.note ?? null,
      expectedProposalRevisionNumber:
        input.request.expectedProposalRevisionNumber
    });
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      input.request.purpose,
      input.request.idempotencyKey
    ].join("|");
    const decisionRef = stableDecisionRef(rootKey);
    const now = new Date().toISOString();
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
      const reservation = await this.governance.reserveIdempotency(
        client,
        {
          idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
          rootKey,
          requestFingerprint: hash({
            proposalRevisionRef: input.proposalRevisionRef,
            ...input.request
          }),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "suggestion-disposition-idempotency"
          )
        }
      );
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return SuggestionDispositionResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }
      const taskResult =
        await this.gate2Work.getTaskResultByProposal(
          client,
          input.proposalRevisionRef
        );
      if (!taskResult) {
        throw new NotFoundError("待处置建议不存在。");
      }
      const preparationTask =
        await this.gate25Work.lockPreparationTask(
          client,
          input.tenantRef,
          taskResult.taskRef
        );
      const goal = await this.gate2Work.getDemoCaseAndGoal(
        client,
        input.tenantRef,
        taskResult.goalRef
      );
      if (!goal) {
        throw new NotFoundError("当前租户无权访问该建议。");
      }
      const proposal = await this.artifacts.getProposal(
        client,
        input.proposalRevisionRef,
        { forUpdate: true }
      );
      if (!proposal) {
        throw new NotFoundError("建议内容不存在。");
      }
      if (
        proposal.revisionNumber !==
        input.request.expectedProposalRevisionNumber
      ) {
        throw new DomainConflictError(
          "PROPOSAL_VERSION_CONFLICT",
          "The Proposal version no longer matches the review request.",
          {
            expectedRevisionNumber:
              input.request.expectedProposalRevisionNumber,
            actualRevisionNumber: proposal.revisionNumber
          }
        );
      }
      const existingDisposition =
        await this.gate2Work.getSuggestionDisposition(
          client,
          input.proposalRevisionRef
        );
      if (existingDisposition) {
        if (
          existingDisposition.requestFingerprint !==
          dispositionFingerprint
        ) {
          throw new DomainConflictError(
            "PROPOSAL_ALREADY_DISPOSED",
            "This Proposal version already has a different final disposition.",
            {
              proposalRevisionRef: input.proposalRevisionRef,
              existingDisposition:
                existingDisposition.kind,
              existingDispositionRef:
                existingDisposition.dispositionRef
            }
          );
        }
        const existingRevision =
          existingDisposition.resultingRevisionRef
            ? await this.artifacts.getTeachingPlanRevision(
                client,
                existingDisposition.resultingRevisionRef
              )
            : null;
        const replayResult =
          SuggestionDispositionResultSchema.parse({
            replayed: true,
            dispositionRef:
              existingDisposition.dispositionRef,
            disposition: existingDisposition.kind,
            implementationObserved: false,
            instructionalDecisionCreated: false,
            resultingRevision: existingRevision
          });
        await this.governance.completeIdempotency(client, {
          rootKey,
          result: replayResult,
          completedAt: now
        });
        await this.governance.saveAudits(client, [
          reservation.receipt!
        ]);
        await client.query("COMMIT");
        return replayResult;
      }
      const selectedStrategy = proposal.strategies.find(
        (strategy) =>
          strategy.strategyId === input.request.selectedStrategyId
      );
      if (!selectedStrategy) {
        throw new NotFoundError("所选策略不存在。");
      }
      if (
        preparationTask?.status === "completed" &&
        (input.request.disposition === "accepted" ||
          input.request.disposition ===
            "accepted_with_changes")
      ) {
        throw new DomainConflictError(
          "LESSON_PREPARATION_REOPEN_REQUIRED",
          "已完成的备课 Task 必须先由教师显式 reopen，才能形成新的 in-review TeachingPlan。",
          {
            taskRef: preparationTask.taskRef,
            status: preparationTask.status
          }
        );
      }

      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: input.request.purpose,
        action: "teacher-copilot.review-suggestion",
        resourceRef: input.proposalRevisionRef,
        requestedFieldMask: [
          "suggestion.disposition",
          "teachingPlan.teacherEdits"
        ],
        effect: "allow",
        reasonCodes: [
          "synthetic-teacher-role",
          "teacher-review-required",
          "does-not-imply-implementation"
        ],
        policyVersion: "policy:teacher-copilot-review@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "suggestion-disposition-authorization"
          )
        })
      ];

      let resultingRevision:
        | Awaited<
            ReturnType<
              PostgresGate2ArtifactRepository["insertInReviewRevision"]
            >
          >["revision"]
        | null = null;
      if (
        input.request.disposition === "accepted" ||
        input.request.disposition === "accepted_with_changes"
      ) {
        const strategyPlan =
          proposal.strategyPlans[
            selectedStrategy.strategyId
          ] ??
          strategyTeachingPlans[selectedStrategy.strategyId];
        if (!strategyPlan) {
          throw new Error("Selected strategy TeachingPlan is missing.");
        }
        const content = TeachingPlanSchema.parse({
          ...strategyPlan,
          ...input.request.teacherEdits
        });
        const revisionResult =
          await this.artifacts.insertInReviewRevision(client, {
            artifactRef: taskResult.teachingPlanArtifactRef,
            parentRevisionRef: taskResult.draftRevisionRef,
            content,
            selectedStrategyId: selectedStrategy.strategyId,
            disposition: input.request.disposition,
            teacherEdits: input.request.teacherEdits,
            ...(preparationTask
              ? {
                  lessonRef: preparationTask.lessonRef,
                  preparationTaskRef: preparationTask.taskRef
                }
              : {}),
            writeContext
          });
        resultingRevision = revisionResult.revision;
        receipts.push(...revisionResult.receipts);
      }

      const dispositionRef = `suggestion-disposition:${randomUUID()}`;
      receipts.push(
        await this.gate2Work.insertSuggestionDisposition(
          client,
          {
            dispositionRef,
            tenantRef: input.tenantRef,
            taskRef: taskResult.taskRef,
            proposalRevisionRef: input.proposalRevisionRef,
            dispositionKind: input.request.disposition,
            selectedStrategyId: selectedStrategy.strategyId,
            teacherEdits: input.request.teacherEdits,
            ...(input.request.note !== undefined
              ? { note: input.request.note }
              : {}),
            ...(resultingRevision
              ? {
                  resultingRevisionRef:
                    resultingRevision.revisionRef
                }
              : {}),
            requestFingerprint: dispositionFingerprint,
            metadata: createWriteMetadata(
              writeContext,
              "work",
              "suggestion-disposition"
            )
          }
        )
      );
      receipts.push(
        await this.gate2Work.insertOutbox(client, {
          outboxRef: `outbox:${randomUUID()}`,
          eventName: "SuggestionDisposed",
          aggregateRef: dispositionRef,
          payload: {
            proposalRevisionRef: input.proposalRevisionRef,
            disposition: input.request.disposition,
            implementationObserved: false,
            instructionalDecisionCreated: false,
            resultingRevisionRef:
              resultingRevision?.revisionRef ?? null
          },
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "suggestion-disposition-outbox"
          )
        })
      );
      if (
        preparationTask?.status === "awaiting_plan_review" &&
        (input.request.disposition === "rejected" ||
          input.request.disposition === "deferred")
      ) {
        const returnedToProgress =
          await this.gate25Work.transition(client, {
            taskRef: preparationTask.taskRef,
            fromStatus: "awaiting_plan_review",
            toStatus: "in_progress",
            expectedVersion: preparationTask.version,
            reason:
              input.request.disposition === "rejected"
                ? "教师拒绝本次建议，备课继续进行"
                : "教师稍后处理本次建议，备课继续进行",
            historyRef: `preparation-history:${randomUUID()}`,
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "LessonPreparationReviewContinued",
            metadata: {
              transition: createWriteMetadata(
                writeContext,
                "work",
                "disposition-return-to-progress"
              ),
              history: createWriteMetadata(
                writeContext,
                "work",
                "disposition-return-to-progress-history"
              ),
              outbox: createWriteMetadata(
                writeContext,
                "work",
                "disposition-return-to-progress-outbox"
              )
            }
          });
        receipts.push(...returnedToProgress.receipts);
        receipts.push(
          await this.gate25Education.updatePreparationProjection(
            client,
            {
              lessonRef: preparationTask.lessonRef,
              state: "in_progress",
              activePreparationTaskRef: preparationTask.taskRef,
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "disposition-return-to-progress-projection"
              )
            }
          )
        );
      }

      const result = SuggestionDispositionResultSchema.parse({
        replayed: false,
        dispositionRef,
        disposition: input.request.disposition,
        implementationObserved: false,
        instructionalDecisionCreated: false,
        resultingRevision
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
      throw error;
    } finally {
      client.release();
    }
  }

  async approveTeachingPlan(input: {
    tenantRef: string;
    actorRef: string;
    inReviewRevisionRef: string;
    request: ApproveTeachingPlanRequest;
  }): Promise<ApproveTeachingPlanResult> {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    if (input.request.purpose !== APPROVE_PURPOSE) {
      throw new AuthorizationDeniedError(
        "This purpose is not authorized to approve a TeachingPlan."
      );
    }
    if (
      input.request.expectedInReviewRevisionRef !==
      input.inReviewRevisionRef
    ) {
      throw new DomainConflictError(
        "TEACHING_PLAN_REVIEW_VERSION_CONFLICT",
        "The route and expected in-review revision do not match."
      );
    }
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      input.request.purpose,
      input.request.idempotencyKey
    ].join("|");
    const decisionRef = stableDecisionRef(rootKey);
    const now = new Date().toISOString();
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
      const reservation = await this.governance.reserveIdempotency(
        client,
        {
          idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
          rootKey,
          requestFingerprint: hash({
            inReviewRevisionRef: input.inReviewRevisionRef,
            ...input.request
          }),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "teaching-plan-approval-idempotency"
          )
        }
      );
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return ApproveTeachingPlanResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }

      const educationContext =
        await this.education.getTeacherCopilotContext(client, {
          tenantRef: input.tenantRef,
          courseRunRef: gate2DemoRefs.courseRunRef
        });
      if (!educationContext) {
        throw new NotFoundError(
          "The tenant TeachingPlan context is not available."
        );
      }
      const inReview =
        await this.artifacts.getTeachingPlanRevision(
          client,
          input.inReviewRevisionRef
        );
      if (
        !inReview ||
        inReview.artifactRef !==
          educationContext.teachingPlanArtifactRef
      ) {
        throw new NotFoundError(
          "The in-review TeachingPlan revision was not found."
        );
      }
      if (inReview.state !== "in_review") {
        throw new DomainConflictError(
          "TEACHING_PLAN_NOT_IN_REVIEW",
          "Only an in-review TeachingPlan can be approved.",
          {
            revisionRef: inReview.revisionRef,
            state: inReview.state
          }
        );
      }
      const revisionScope =
        await this.artifacts.getTeachingPlanRevisionScope(
          client,
          inReview.revisionRef
        );
      let preparationTask:
        | StoredLessonPreparationTask
        | undefined;
      if (revisionScope?.preparationTaskRef) {
        if (
          input.request.preparationTaskRef !==
            revisionScope.preparationTaskRef ||
          input.request.expectedTaskVersion === undefined
        ) {
          throw new DomainConflictError(
            "LESSON_PREPARATION_APPROVAL_CONTEXT_REQUIRED",
            "Scoped TeachingPlan approval requires the Task reference and expected Task version.",
            {
              preparationTaskRef:
                revisionScope.preparationTaskRef,
              lessonRef: revisionScope.lessonRef
            }
          );
        }
        preparationTask =
          await this.gate25Work.lockPreparationTask(
            client,
            input.tenantRef,
            revisionScope.preparationTaskRef
          );
        if (!preparationTask) {
          throw new NotFoundError(
            "The TeachingPlan preparation Task was not found."
          );
        }
        if (
          preparationTask.lessonRef !==
          revisionScope.lessonRef
        ) {
          throw new DomainConflictError(
            "TEACHING_PLAN_TASK_SCOPE_MISMATCH",
            "The TeachingPlan and Task do not belong to the same Lesson."
          );
        }
        if (
          preparationTask.version !==
          input.request.expectedTaskVersion
        ) {
          throw new DomainConflictError(
            "LESSON_PREPARATION_VERSION_CONFLICT",
            "The preparation Task changed before approval.",
            {
              expectedVersion:
                input.request.expectedTaskVersion,
              actualVersion: preparationTask.version,
              status: preparationTask.status
            }
          );
        }
        if (
          preparationTask.status !== "awaiting_plan_review"
        ) {
          throw new DomainConflictError(
            "LESSON_PREPARATION_NOT_AWAITING_REVIEW",
            "Only a Task awaiting plan review can advance to ready-for-use.",
            {
              status: preparationTask.status
            }
          );
        }
      } else if (
        input.request.preparationTaskRef !== undefined ||
        input.request.expectedTaskVersion !== undefined
      ) {
        throw new DomainConflictError(
          "TEACHING_PLAN_TASK_SCOPE_MISMATCH",
          "This legacy TeachingPlan revision is not scoped to a preparation Task."
        );
      }
      const lifecycle =
        await this.artifacts.lockTeachingPlanLifecycle(
          client,
          inReview.artifactRef
        );
      if (!lifecycle) {
        throw new NotFoundError(
          "The TeachingPlan lifecycle was not found."
        );
      }
      if (
        lifecycle.currentInReviewRevisionRef !==
        inReview.revisionRef
      ) {
        throw new DomainConflictError(
          "TEACHING_PLAN_REVIEW_VERSION_CONFLICT",
          "A newer in-review TeachingPlan replaced this revision.",
          {
            expectedInReviewRevisionRef: inReview.revisionRef,
            currentInReviewRevisionRef:
              lifecycle.currentInReviewRevisionRef
          }
        );
      }

      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: input.request.purpose,
        action: "teacher-copilot.approve-plan",
        resourceRef: inReview.revisionRef,
        requestedFieldMask: [
          "teachingPlan.currentApprovedRevisionRef"
        ],
        effect: "allow",
        reasonCodes: [
          "synthetic-teacher-role",
          "separate-approval-required"
        ],
        policyVersion: "policy:teacher-copilot-approval@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "teaching-plan-approval-authorization"
          )
        })
      ];
      const approval =
        await this.artifacts.insertApprovedRevision(client, {
          inReviewRevision: inReview,
          previousApprovedRevisionRef:
            lifecycle.currentApprovedRevisionRef,
          ...(preparationTask && revisionScope
            ? {
                lessonRef: revisionScope.lessonRef,
                preparationTaskRef: preparationTask.taskRef
              }
            : {}),
          writeContext
        });
      receipts.push(...approval.receipts);
      let preparationTaskVersion: number | undefined;
      if (preparationTask && revisionScope) {
        const updatedWorkingSet =
          await this.gate25Work.replaceBaselineTeachingPlan(
            client,
            {
              taskRef: preparationTask.taskRef,
              expectedVersion:
                preparationTask.workingSet.version,
              baselineTeachingPlanRef:
                approval.revision.revisionRef,
              revisionRef: `working-set-revision:${randomUUID()}`,
              metadata: createWriteMetadata(
                writeContext,
                "work",
                "approved-plan-working-set-baseline"
              )
            }
          );
        receipts.push(updatedWorkingSet.receipt);
        const ready = await this.gate25Work.transition(client, {
          taskRef: preparationTask.taskRef,
          fromStatus: "awaiting_plan_review",
          toStatus: "ready_for_use",
          expectedVersion: preparationTask.version,
          approvedPlanRef: approval.revision.revisionRef,
          reason: "教师批准新的 current TeachingPlan",
          historyRef: `preparation-history:${randomUUID()}`,
          outboxRef: `outbox:${randomUUID()}`,
          eventName: "LessonPreparationReadyForUse",
          metadata: {
            transition: createWriteMetadata(
              writeContext,
              "work",
              "teaching-plan-approval-ready"
            ),
            history: createWriteMetadata(
              writeContext,
              "work",
              "teaching-plan-approval-ready-history"
            ),
            outbox: createWriteMetadata(
              writeContext,
              "work",
              "teaching-plan-approval-ready-outbox"
            )
          }
        });
        preparationTaskVersion = ready.version;
        receipts.push(...ready.receipts);
        receipts.push(
          ...(await this.gate25Education.bindCurrentApprovedPlan(
            client,
            {
              bindingRef: `lesson-plan-binding:${randomUUID()}`,
              lessonRef: revisionScope.lessonRef,
              preparationTaskRef: preparationTask.taskRef,
              teachingPlanArtifactRef:
                approval.revision.artifactRef,
              teachingPlanRevisionRef:
                approval.revision.revisionRef,
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "teaching-plan-approval-binding"
              )
            }
          ))
        );
      }
      receipts.push(
        await this.gate2Work.insertOutbox(client, {
          outboxRef: `outbox:${randomUUID()}`,
          eventName: "TeachingPlanApproved",
          aggregateRef: approval.revision.revisionRef,
          payload: {
            approvedRevisionRef:
              approval.revision.revisionRef,
            inReviewRevisionRef: inReview.revisionRef,
            previousApprovedRevisionRef:
              lifecycle.currentApprovedRevisionRef
          },
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "teaching-plan-approval-outbox"
          )
        })
      );

      const result = ApproveTeachingPlanResultSchema.parse({
        replayed: false,
        approvedRevision: approval.revision,
        previousApprovedRevisionRef:
          lifecycle.currentApprovedRevisionRef,
        ...(preparationTask && revisionScope
          ? {
              preparationTaskRef: preparationTask.taskRef,
              lessonRef: revisionScope.lessonRef,
              preparationStatus: "ready_for_use" as const,
              preparationTaskVersion
            }
          : {})
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
      throw error;
    } finally {
      client.release();
    }
  }

  private assertDemoActor(
    tenantRef: string,
    actorRef: string
  ): void {
    if (
      tenantRef !== "tenant:demo-school" ||
      actorRef !== "user:teacher-001"
    ) {
      throw new AuthorizationDeniedError(
        "本地演示身份没有访问该租户或学习者数据的权限。"
      );
    }
  }
}

export const gate2TeacherCopilotPurposes = {
  generate: GENERATE_PURPOSE,
  review: REVIEW_PURPOSE,
  approve: APPROVE_PURPOSE
} as const;

export function planForStrategy(
  strategy: PedagogicalStrategy
): TeachingPlan {
  const plan = strategyTeachingPlans[strategy.strategyId];
  if (!plan) {
    throw new Error(`Unknown strategy: ${strategy.strategyId}`);
  }
  return plan;
}

import { createHash, randomUUID } from "node:crypto";

import {
  CreateTeacherCopilotTaskResultSchema,
  SuggestionDispositionResultSchema,
  TeachingPlanSchema,
  type AuthorizationDecision,
  type CreateTeacherCopilotTaskRequest,
  type CreateTeacherCopilotTaskResult,
  type FormalWriteReceipt,
  type PedagogicalStrategy,
  type SuggestionDispositionRequest,
  type SuggestionDispositionResult,
  type TeachingPlan,
  type TeachingPlanDiff,
  type TeachingPlanDiffChange
} from "@edu-agent/contracts";
import {
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
  PostgresEducationRepository
} from "../modules/education-domain/infrastructure/postgres-education-repository.js";
import {
  PostgresGovernanceRepository
} from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  PostgresGate2WorkRepository
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-work-repository.js";
import {
  PostgresWorkRepository
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-work-repository.js";
import {
  AuthorizationDeniedError,
  NotFoundError
} from "../platform/errors.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";

const GENERATE_PURPOSE = "teacher-copilot.adjust-next-lesson";
const REVIEW_PURPOSE = "teacher-copilot.review-suggestion";

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

function buildDiff(
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
    private readonly runtime = new PostgresRuntimeRepository(),
    private readonly gate2Runtime =
      new PostgresGate2RuntimeRepository(),
    private readonly capability =
      new PostgresGate2CapabilityRepository(),
    private readonly artifacts =
      new PostgresGate2ArtifactRepository(),
    private readonly education = new PostgresEducationRepository(),
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
      const baseline = await this.artifacts.getLatestTeachingPlan(
        client,
        educationContext.teachingPlanArtifactRef
      );
      if (!baseline) {
        throw new NotFoundError("TeachingPlan 基线不存在。");
      }

      const evidenceRefs = [
        ...educationContext.observations.map(
          (item) => item.observationRef
        ),
        ...educationContext.claims.map((item) => item.claimRef)
      ];
      const knownGaps = Array.from(
        new Set(
          educationContext.observations.flatMap(
            (item) => item.unknowns
          )
        )
      );
      const taskRef = `task:${randomUUID()}`;
      const taskRunRef = `task-run:${randomUUID()}`;
      const agentRunRef = `agent-run:${randomUUID()}`;
      const contractRef = `interaction-contract:${randomUUID()}`;
      const contextManifestRef =
        `context-manifest:${randomUUID()}`;
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

      receipts.push(
        ...(await this.work.insertTaskBundle(client, {
          task: {
            taskRef,
            title: "根据学习证据调整明天课堂",
            status: "completed",
            taskKind: "TeacherCopilotLessonAdjustment",
            caseRef: goal.caseRef,
            goalRef: goal.goalRef,
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
              goalRef: goal.goalRef
            },
            metadata: createWriteMetadata(
              writeContext,
              "work",
              "teacher-copilot-task-outbox"
            )
          }
        }))
      );

      const contractPayload = {
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
              evidenceRefs
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
          resourceRefs: [
            input.request.courseRunRef,
            goal.caseRef,
            goal.goalRef,
            educationContext.objective.objectiveRef,
            baseline.revisionRef
          ],
          evidenceRefs,
          unknowns: knownGaps,
          requestedFieldMask: decision.requestedFieldMask,
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
          writeContext
        });
      receipts.push(...artifactResult.receipts);
      receipts.push(
        await this.gate2Work.insertTaskResult(client, {
          taskResultRef,
          taskRef,
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

      const result = CreateTeacherCopilotTaskResultSchema.parse({
        replayed: false,
        taskRef,
        taskRunRef,
        agentRunRef,
        contractRef,
        proposalArtifactRef,
        proposalRevisionRef,
        teachingPlanArtifactRef:
          educationContext.teachingPlanArtifactRef,
        draftRevision: artifactResult.draftRevision,
        strategies: modelResult.strategies,
        diffsByStrategy,
        authorizationDecisionRef: decisionRef
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
        input.proposalRevisionRef
      );
      if (!proposal) {
        throw new NotFoundError("建议内容不存在。");
      }
      const selectedStrategy = proposal.strategies.find(
        (strategy) =>
          strategy.strategyId === input.request.selectedStrategyId
      );
      if (!selectedStrategy) {
        throw new NotFoundError("所选策略不存在。");
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
  review: REVIEW_PURPOSE
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

import {
  PendingProposalListSchema,
  ProposalReviewDetailSchema,
  RunExplanationSchema,
  TeachingPlanStateViewSchema,
  TeacherWorkspaceSchema,
  type PendingProposalList,
  type ProposalReviewDetail,
  type RunExplanation,
  type LessonPreparationStatus,
  type TaskWorkingSet,
  type TeachingPlanStateView,
  type TeacherWorkspace
} from "@edu-agent/contracts";
import {
  gate2DemoRefs,
  gate2SyntheticFixture
} from "@edu-agent/sample-data";
import type { Pool } from "pg";

import {
  PostgresGate2RuntimeRepository
} from "../modules/agent-runtime-context/infrastructure/postgres-gate2-runtime-repository.js";
import {
  PostgresGate2ArtifactRepository
} from "../modules/artifact-collaboration/infrastructure/postgres-gate2-artifact-repository.js";
import {
  PostgresGate2CapabilityRepository
} from "../modules/capability-integration/infrastructure/postgres-gate2-capability-repository.js";
import {
  maskProviderRequestId
} from "../modules/capability-integration/application/safe-model-logging.js";
import {
  PostgresGate25EducationRepository
} from "../modules/education-domain/infrastructure/postgres-gate2-5-education-repository.js";
import {
  PostgresEducationRepository
} from "../modules/education-domain/infrastructure/postgres-education-repository.js";
import {
  PostgresGate2GovernanceRepository
} from "../modules/identity-governance-audit/infrastructure/postgres-gate2-governance-repository.js";
import {
  PostgresGate25WorkRepository
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-5-work-repository.js";
import {
  PostgresGate2WorkRepository
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-work-repository.js";
import {
  AuthorizationDeniedError,
  NotFoundError
} from "../platform/errors.js";

export class PostgresGate2ReadService {
  constructor(
    private readonly pool: Pool,
    private readonly work = new PostgresGate2WorkRepository(),
    private readonly gate25Work =
      new PostgresGate25WorkRepository(),
    private readonly runtime =
      new PostgresGate2RuntimeRepository(),
    private readonly capability =
      new PostgresGate2CapabilityRepository(),
    private readonly artifacts =
      new PostgresGate2ArtifactRepository(),
    private readonly education = new PostgresEducationRepository(),
    private readonly gate25Education =
      new PostgresGate25EducationRepository(),
    private readonly governance =
      new PostgresGate2GovernanceRepository()
  ) {}

  async getWorkspace(input: {
    tenantRef: string;
    actorRef: string;
    organizationName?: string;
    actorDisplayName?: string;
    roleRefs?: readonly string[];
    membershipRef?: string;
    demoIdentity?: boolean;
    modelMode?: "mock" | "ark";
    courseRunRefs?: readonly string[];
  }): Promise<TeacherWorkspace> {
    await this.assertDemoActor(input.tenantRef, input.actorRef);
    const courseRunRef = input.courseRunRefs
      ? input.courseRunRefs[0]
      : gate2DemoRefs.courseRunRef;
    if (!courseRunRef) {
      throw new NotFoundError(
        "The current teacher has no authorized CourseRun in this workspace."
      );
    }
    const educationContext =
      await this.education.getTeacherCopilotContext(this.pool, {
        tenantRef: input.tenantRef,
        courseRunRef
      });
    if (!educationContext) {
      throw new NotFoundError(
        "Gate 2 合成数据尚未初始化。"
      );
    }
    const goal = await this.pool.query<{ goal_ref: string }>(
      `SELECT goal_ref
         FROM work.goal_record
        WHERE tenant_ref = $1 AND status = 'active'
        ORDER BY created_at, goal_ref
        LIMIT 1`,
      [input.tenantRef]
    );
    const workContext = goal.rows[0]
      ? await this.work.getDemoCaseAndGoal(
          this.pool,
          input.tenantRef,
          goal.rows[0].goal_ref
        )
      : undefined;
    if (!workContext) {
      throw new NotFoundError(
        "Gate 2 教学改进 Goal 尚未初始化。"
      );
    }
    const currentTeachingPlan =
      await this.artifacts.getCurrentApprovedTeachingPlan(
        this.pool,
        educationContext.teachingPlanArtifactRef
      );
    if (!currentTeachingPlan) {
      throw new NotFoundError(
        "Gate 2 TeachingPlan 尚未初始化。"
      );
    }
    const currentInReviewPlan =
      (await this.artifacts.getCurrentInReviewTeachingPlan(
        this.pool,
        educationContext.teachingPlanArtifactRef
      )) ?? null;
    const summaries = await this.work.listSuggestionSummaries(
      this.pool,
      input.tenantRef,
      input.actorRef
    );
    const titles = await this.artifacts.getProposalTitles(
      this.pool,
      summaries.map((item) => item.proposalRevisionRef)
    );

    return TeacherWorkspaceSchema.parse({
      identity: {
        tenantRef: input.tenantRef,
        schoolName:
          input.organizationName ?? gate2SyntheticFixture.identity.schoolName,
        teacherRef: input.actorRef,
        teacherName:
          input.actorDisplayName ?? gate2SyntheticFixture.identity.teacherName,
        dataMode: "synthetic",
        modelMode: input.modelMode ?? "mock",
        ...(input.roleRefs ? { roleRefs: [...input.roleRefs] } : {}),
        ...(input.membershipRef ? { membershipRef: input.membershipRef } : {}),
        ...(input.demoIdentity !== undefined
          ? { demoIdentity: input.demoIdentity }
          : {})
      },
      courseRun: educationContext.courseRun,
      learningObjective: educationContext.objective,
      teachingImprovementCase: {
        caseRef: workContext.caseRef,
        title: workContext.caseTitle,
        status: workContext.caseStatus
      },
      goal: {
        goalRef: workContext.goalRef,
        caseRef: workContext.caseRef,
        title: workContext.goalTitle,
        successCriteria: workContext.successCriteria,
        status: workContext.goalStatus
      },
      evidence: {
        observations: educationContext.observations,
        claims: educationContext.claims,
        estimateStatus: "not-computed",
        estimateExplanation:
          "本轮未实现 LearnerStateEstimate。候选 EvidenceClaim 不代表学生能力定论。"
      },
      currentTeachingPlan,
      currentInReviewPlan,
      pendingSuggestions: summaries.map((item) => ({
        proposalArtifactRef: item.proposalArtifactRef,
        proposalRevisionRef: item.proposalRevisionRef,
        taskRef: item.taskRef,
        ...(item.preparationTaskRef
          ? { preparationTaskRef: item.preparationTaskRef }
          : {}),
        ...(item.lessonRef ? { lessonRef: item.lessonRef } : {}),
        status: item.disposed ? "disposed" : "pending",
        requestText: item.requestText,
        strategyTitles:
          titles.get(item.proposalRevisionRef) ?? ["建议内容缺失"],
        createdAt: item.createdAt
      })),
      generatedAt: new Date().toISOString()
    });
  }

  async listPendingProposals(input: {
    tenantRef: string;
    actorRef: string;
  }): Promise<PendingProposalList> {
    await this.assertDemoActor(input.tenantRef, input.actorRef);
    const summaries = (
      await this.work.listSuggestionSummaries(
        this.pool,
        input.tenantRef,
        input.actorRef
      )
    ).filter((item) => !item.disposed);
    const titles = await this.artifacts.getProposalTitles(
      this.pool,
      summaries.map((item) => item.proposalRevisionRef)
    );
    return PendingProposalListSchema.parse({
      items: summaries.map((item) => ({
        proposalArtifactRef: item.proposalArtifactRef,
        proposalRevisionRef: item.proposalRevisionRef,
        taskRef: item.taskRef,
        ...(item.preparationTaskRef
          ? { preparationTaskRef: item.preparationTaskRef }
          : {}),
        ...(item.lessonRef ? { lessonRef: item.lessonRef } : {}),
        status: "pending",
        requestText: item.requestText,
        strategyTitles:
          titles.get(item.proposalRevisionRef) ?? [
            "Suggestion content unavailable"
          ],
        createdAt: item.createdAt
      })),
      generatedAt: new Date().toISOString()
    });
  }

  async getProposalDetail(input: {
    tenantRef: string;
    actorRef: string;
    proposalRevisionRef: string;
  }): Promise<ProposalReviewDetail> {
    await this.assertDemoActor(input.tenantRef, input.actorRef);
    const work = await this.work.getProposalReviewWork(
      this.pool,
      {
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        proposalRevisionRef: input.proposalRevisionRef
      }
    );
    if (!work) {
      throw new NotFoundError(
        "The Proposal is not available for this tenant."
      );
    }
    const [proposal, runtime, draft, disposition, education] =
      await Promise.all([
        this.artifacts.getProposal(
          this.pool,
          input.proposalRevisionRef
        ),
        this.runtime.getRunExplanation(
          this.pool,
          work.taskRunRef
        ),
        this.artifacts.getTeachingPlanRevision(
          this.pool,
          work.draftRevisionRef
        ),
        this.work.getSuggestionDisposition(
          this.pool,
          input.proposalRevisionRef
        ),
        this.education.getTeacherCopilotContext(this.pool, {
          tenantRef: input.tenantRef,
          courseRunRef: work.request.courseRunRef
        })
      ]);
    if (!proposal || !runtime || !draft || !education) {
      throw new NotFoundError(
        "The persisted Proposal review context is incomplete."
      );
    }
    const baseline = draft.parentRevisionRef
      ? await this.artifacts.getTeachingPlanRevision(
          this.pool,
          draft.parentRevisionRef
        )
      : undefined;
    if (!baseline) {
      throw new NotFoundError(
        "The persisted Proposal baseline revision is missing."
      );
    }
    const selectedEvidence = new Set(
      work.request.selectedEvidenceRefs
    );
    const inReviewRevision =
      disposition?.resultingRevisionRef
        ? (await this.artifacts.getTeachingPlanRevision(
            this.pool,
            disposition.resultingRevisionRef
          )) ?? null
        : null;

    return ProposalReviewDetailSchema.parse({
      proposalArtifactRef: work.proposalArtifactRef,
      proposalRevisionRef: work.proposalRevisionRef,
      proposalRevisionNumber: proposal.revisionNumber,
      status: disposition ? "disposed" : "pending",
      taskRef: work.taskRef,
      taskRunRef: work.taskRunRef,
      agentRunRef: runtime.agentRunRef,
      contractRef: work.contractRef,
      teachingPlanArtifactRef: work.teachingPlanArtifactRef,
      authorizationDecisionRef:
        work.authorizationDecisionRef,
      request: work.request,
      strategies: proposal.strategies,
      diffsByStrategy: proposal.diffsByStrategy,
      evidence: {
        observations: education.observations.filter((item) =>
          selectedEvidence.has(item.observationRef)
        ),
        claims: education.claims.filter((item) =>
          selectedEvidence.has(item.claimRef)
        )
      },
      baselineRevision: baseline,
      draftRevision: draft,
      disposition: disposition
        ? {
            dispositionRef: disposition.dispositionRef,
            disposition: disposition.kind,
            selectedStrategyId:
              disposition.selectedStrategyId,
            teacherEdits: disposition.teacherEdits,
            note: disposition.note,
            resultingRevisionRef:
              disposition.resultingRevisionRef,
            implementationObserved: false,
            createdAt: disposition.createdAt
          }
        : null,
      inReviewRevision
    });
  }

  async getTeachingPlanState(input: {
    tenantRef: string;
    actorRef: string;
    allowedCourseRunRefs?: readonly string[];
  }): Promise<TeachingPlanStateView> {
    await this.assertDemoActor(input.tenantRef, input.actorRef);
    const artifactRef =
      await this.getTeachingPlanArtifactRef(
        input.tenantRef,
        input.allowedCourseRunRefs
      );
    const [currentApproved, currentInReview, drafts, history] =
      await Promise.all([
        this.artifacts.getCurrentApprovedTeachingPlan(
          this.pool,
          artifactRef
        ),
        this.artifacts.getCurrentInReviewTeachingPlan(
          this.pool,
          artifactRef
        ),
        this.artifacts.listTeachingPlanRevisions(
          this.pool,
          artifactRef,
          "draft"
        ),
        this.artifacts.listTeachingPlanRevisions(
          this.pool,
          artifactRef
        )
      ]);
    if (!currentApproved) {
      throw new NotFoundError(
        "The current approved TeachingPlan is missing."
      );
    }
    return TeachingPlanStateViewSchema.parse({
      currentApproved,
      currentInReview: currentInReview ?? null,
      drafts,
      history
    });
  }

  async getRunExplanation(input: {
    tenantRef: string;
    actorRef: string;
    taskRef: string;
  }): Promise<RunExplanation> {
    await this.assertDemoActor(input.tenantRef, input.actorRef);
    const work = await this.work.getRunExplanationWork(
      this.pool,
      input.taskRef,
      input.actorRef
    );
    if (!work) {
      throw new NotFoundError("Teacher Copilot 运行不存在。");
    }
    const goal = await this.work.getDemoCaseAndGoal(
      this.pool,
      input.tenantRef,
      work.goalRef
    );
    if (!goal) {
      throw new NotFoundError("当前租户无权查看该运行。");
    }
    const runtime = await this.runtime.getRunExplanation(
      this.pool,
      work.taskRunRef
    );
    if (!runtime) {
      throw new NotFoundError("AgentRun 或 ContextManifest 不存在。");
    }
    const modelExecution =
      await this.capability.getModelExecution(
        this.pool,
        runtime.agentRunRef
      );
    if (!modelExecution) {
      throw new NotFoundError("Mock model execution 不存在。");
    }
    const authorization =
      await this.governance.getAuthorizationDecision(
        this.pool,
        work.authorizationDecisionRef
      );
    if (!authorization || authorization.effect !== "allow") {
      throw new NotFoundError("授权决策不存在。");
    }
    const artifactRevisions =
      await this.artifacts.listRunArtifactRevisions(
        this.pool,
        runtime.agentRunRef
      );
    if (work.disposition?.resultingRevisionRef) {
      const resultingRevision =
        await this.artifacts.getTeachingPlanRevision(
          this.pool,
          work.disposition.resultingRevisionRef
        );
      if (resultingRevision) {
        artifactRevisions.push({
          revisionRef: resultingRevision.revisionRef,
          artifactType: "TeachingPlan",
          state: resultingRevision.state,
          revisionNumber: resultingRevision.revisionNumber
        });
      }
    }
    const decisionRefs = [
      work.authorizationDecisionRef,
      ...(work.disposition?.authorizationDecisionRef
        ? [work.disposition.authorizationDecisionRef]
        : []),
      ...(work.disposition?.approvalAuthorizationDecisionRef
        ? [work.disposition.approvalAuthorizationDecisionRef]
        : [])
    ];
    const outbox = await this.listOutbox(decisionRefs);
    const auditTimeline = (
      await Promise.all(
        decisionRefs.map((decisionRef) =>
          this.governance.listAuditTimeline(
            this.pool,
            decisionRef
          )
        )
      )
    )
      .flat()
      .sort((left, right) =>
        left.occurredAt.localeCompare(right.occurredAt)
      );
    let lessonPreparation:
      | {
          preparationTaskRef: string;
          lessonRef: string;
          lessonTitle: string;
          workStatus: LessonPreparationStatus;
          workVersion: number;
          workingSet: TaskWorkingSet;
          authorizedContextPlan: {
            authorizedContextPlanRef: string;
            workingSetVersion: number;
            authorizedResourceRefs: string[];
            authorizedEvidenceRefs: string[];
            deniedResourceRefs: string[];
            requestedFieldMask: string[];
            contentHash: string;
          } | null;
          planStatus:
            | "draft"
            | "active_in_review"
            | "superseded"
            | "current_approved"
            | "historical_approved"
            | null;
        }
      | undefined;
    if (work.request.preparationTaskRef) {
      const preparationTask =
        await this.gate25Work.getPreparationTask(
          this.pool,
          input.tenantRef,
          work.request.preparationTaskRef,
          input.actorRef
        );
      const lesson = work.request.lessonRef
        ? await this.gate25Education.getLesson(
            this.pool,
            input.tenantRef,
            work.request.lessonRef
          )
        : undefined;
      if (!preparationTask || !lesson) {
        throw new NotFoundError(
          "The lesson-preparation run context is incomplete."
        );
      }
      const [authorizedPlan, scopedRevisions] =
        await Promise.all([
          this.runtime.getLatestAuthorizedContextPlan(
            this.pool,
            preparationTask.taskRef
          ),
          this.artifacts.listLessonTeachingPlanRevisions(
            this.pool,
            lesson.lessonRef
          )
        ]);
      const resultingRevisionRef =
        work.disposition?.resultingRevisionRef ?? null;
      const scopedRevision =
        (resultingRevisionRef
          ? scopedRevisions.find(
              (item) =>
                item.revision.revisionRef ===
                resultingRevisionRef
            )
          : undefined) ??
        scopedRevisions.find(
          (item) =>
            item.preparationTaskRef ===
              preparationTask.taskRef &&
            item.lifecycleStatus === "draft"
        );
      lessonPreparation = {
        preparationTaskRef: preparationTask.taskRef,
        lessonRef: lesson.lessonRef,
        lessonTitle: lesson.title,
        workStatus: preparationTask.status,
        workVersion: preparationTask.version,
        workingSet: preparationTask.workingSet,
        authorizedContextPlan: authorizedPlan
          ? {
              authorizedContextPlanRef:
                authorizedPlan.authorizedContextPlanRef,
              workingSetVersion:
                authorizedPlan.workingSetVersion,
              authorizedResourceRefs:
                authorizedPlan.authorizedResourceRefs,
              authorizedEvidenceRefs:
                authorizedPlan.authorizedEvidenceRefs,
              deniedResourceRefs:
                authorizedPlan.deniedResourceRefs,
              requestedFieldMask:
                authorizedPlan.requestedFieldMask,
              contentHash: authorizedPlan.contentHash
            }
          : null,
        planStatus: scopedRevision?.lifecycleStatus ?? null
      };
    }

    return RunExplanationSchema.parse({
      task: {
        taskRef: work.taskRef,
        title: work.title,
        status: work.taskStatus,
        goalRef: work.goalRef,
        request: work.request
      },
      taskRun: {
        taskRunRef: work.taskRunRef,
        status: work.taskRunStatus,
        createdAt: work.taskRunCreatedAt
      },
      agentRun: {
        agentRunRef: runtime.agentRunRef,
        status: runtime.status,
        provider: runtime.provider,
        modelProfile: runtime.modelProfile
      },
      contract: {
        contractRef: work.contractRef,
        profileRef: work.profileRef,
        profileVersion: work.profileVersion,
        policyVersionRef: work.policyVersionRef,
        promptVersionRef: work.promptVersionRef,
        evidenceRuleVersionRef: work.evidenceRuleVersionRef,
        contentHash: work.contentHash
      },
      contextManifest: {
        contextManifestRef: runtime.contextManifestRef,
        ...(runtime.authorizedContextPlanRef
          ? {
              authorizedContextPlanRef:
                runtime.authorizedContextPlanRef
            }
          : {}),
        evidenceRefs: runtime.evidenceRefs,
        resourceRefs: runtime.resourceRefs,
        unknowns: runtime.unknowns,
        fieldMask: runtime.requestedFieldMask,
        requestSummary: runtime.requestSummary
      },
      authorization: {
        decisionRef: authorization.decisionRef,
        purpose: authorization.purpose,
        action: authorization.action,
        effect: "allow",
        policyVersion: authorization.policyVersion,
        reasonCodes: authorization.reasonCodes
      },
      modelExecution: {
        executionRef: modelExecution.executionRef,
        provider: modelExecution.provider,
        modelDisplayName: modelExecution.modelDisplayName,
        status: modelExecution.status,
        promptBundleRef: modelExecution.promptBundleRef,
        promptBundleVersion:
          modelExecution.promptBundleVersion,
        contextManifestRef:
          modelExecution.contextManifestRef,
        externalNetworkUsed:
          modelExecution.externalNetworkUsed,
        attemptCount: modelExecution.attemptCount,
        maxAttempts: modelExecution.maxAttempts,
        inputTokens: modelExecution.inputTokens,
        outputTokens: modelExecution.outputTokens,
        totalTokens: modelExecution.totalTokens,
        latencyMs: modelExecution.latencyMs,
        estimatedCost: modelExecution.estimatedCost,
        finishReason: modelExecution.finishReason,
        safeErrorCategory:
          modelExecution.safeErrorCategory,
        providerRequestIdMasked: maskProviderRequestId(
          modelExecution.providerRequestId
        ),
        usageLabel:
          modelExecution.inputTokens !== null ||
          modelExecution.outputTokens !== null
            ? `${modelExecution.inputTokens ?? "未报告"} 输入 Token / ` +
              `${modelExecution.outputTokens ?? "未报告"} 输出 Token`
            : `${modelExecution.usage.inputUnits} 输入单元 / ` +
              `${modelExecution.usage.outputUnits} 输出单元（确定性 Mock）`,
        costLabel:
          modelExecution.estimatedCost === null
            ? modelExecution.provider === "mock"
              ? "¥0.00（Mock）"
              : "价格未配置"
            : `¥${modelExecution.estimatedCost.toFixed(6)}（配置估算）`
      },
      artifactRevisions,
      disposition: work.disposition
        ? {
            dispositionRef: work.disposition.dispositionRef,
            kind: work.disposition.kind,
            implementationObserved: false,
            createdAt: work.disposition.createdAt
          }
        : null,
      outbox,
      auditTimeline,
      ...(lessonPreparation ? { lessonPreparation } : {})
    });
  }

  async getTeachingPlanRevision(input: {
    tenantRef: string;
    actorRef: string;
    revisionRef: string;
    allowedCourseRunRefs?: readonly string[];
  }) {
    await this.assertDemoActor(input.tenantRef, input.actorRef);
    const educationContext =
      await this.education.getTeacherCopilotContext(this.pool, {
        tenantRef: input.tenantRef,
        courseRunRef: await this.getPrimaryCourseRunRef(
          input.tenantRef,
          input.allowedCourseRunRefs
        )
      });
    if (!educationContext) {
      throw new NotFoundError("Gate 2 合成数据尚未初始化。");
    }
    const revision =
      await this.artifacts.getTeachingPlanRevision(
        this.pool,
        input.revisionRef
      );
    if (
      !revision ||
      revision.artifactRef !==
        educationContext.teachingPlanArtifactRef
    ) {
      throw new NotFoundError(
        "当前租户无权查看该 TeachingPlan Revision。"
      );
    }
    return revision;
  }

  async getCurrentApprovedTeachingPlan(input: {
    tenantRef: string;
    actorRef: string;
    allowedCourseRunRefs?: readonly string[];
  }) {
    return (await this.getTeachingPlanState(input)).currentApproved;
  }

  async getCurrentInReviewTeachingPlan(input: {
    tenantRef: string;
    actorRef: string;
    allowedCourseRunRefs?: readonly string[];
  }) {
    return (await this.getTeachingPlanState(input)).currentInReview;
  }

  async listTeachingPlanDrafts(input: {
    tenantRef: string;
    actorRef: string;
    allowedCourseRunRefs?: readonly string[];
  }) {
    return (await this.getTeachingPlanState(input)).drafts;
  }

  async listTeachingPlanHistory(input: {
    tenantRef: string;
    actorRef: string;
    allowedCourseRunRefs?: readonly string[];
  }) {
    return (await this.getTeachingPlanState(input)).history;
  }

  private async getTeachingPlanArtifactRef(
    tenantRef: string,
    allowedCourseRunRefs?: readonly string[]
  ): Promise<string> {
    const educationContext =
      await this.education.getTeacherCopilotContext(this.pool, {
        tenantRef,
        courseRunRef: await this.getPrimaryCourseRunRef(
          tenantRef,
          allowedCourseRunRefs
        )
      });
    if (!educationContext) {
      throw new NotFoundError(
        "The tenant TeachingPlan context is not available."
      );
    }
    return educationContext.teachingPlanArtifactRef;
  }

  private async getPrimaryCourseRunRef(
    tenantRef: string,
    allowedCourseRunRefs?: readonly string[]
  ): Promise<string> {
    if (allowedCourseRunRefs?.length === 0) {
      throw new NotFoundError(
        "The current teacher has no authorized CourseRun in this workspace."
      );
    }
    const result = await this.pool.query<{ course_run_ref: string }>(
      `SELECT course_run_ref
         FROM education.course_run
        WHERE tenant_ref = $1
          AND ($2::text[] IS NULL OR course_run_ref = ANY($2::text[]))
        ORDER BY created_at, course_run_ref
        LIMIT 1`,
      [tenantRef, allowedCourseRunRefs ? [...allowedCourseRunRefs] : null]
    );
    const courseRunRef = result.rows[0]?.course_run_ref;
    if (!courseRunRef) {
      throw new NotFoundError("The school has no authorized CourseRun context.");
    }
    return courseRunRef;
  }

  private async listOutbox(
    decisionRefs: readonly string[]
  ): Promise<RunExplanation["outbox"]> {
    const result = await this.pool.query<{
      owner: string;
      event_name: string;
      status: string;
      attempt_count: number;
      last_error: string | null;
    }>(
      `SELECT owner_module AS owner, event_name, status,
              attempt_count, last_error
         FROM work.outbox_record
        WHERE authorization_decision_ref = ANY($1::text[])
       UNION ALL
       SELECT owner_module AS owner, event_name, status,
              attempt_count, last_error
         FROM runtime.outbox_record
        WHERE authorization_decision_ref = ANY($1::text[])
       UNION ALL
       SELECT owner_module AS owner, event_name, status,
              attempt_count, last_error
         FROM capability.outbox_record
        WHERE authorization_decision_ref = ANY($1::text[])
       UNION ALL
       SELECT owner_module AS owner, event_name, status,
              attempt_count, last_error
         FROM artifact.outbox_record
        WHERE authorization_decision_ref = ANY($1::text[])
       ORDER BY owner, event_name`,
      [[...decisionRefs]]
    );
    return result.rows.map((row) => ({
      owner: row.owner,
      eventName: row.event_name,
      status: row.status,
      attemptCount: row.attempt_count,
      lastError: row.last_error
    }));
  }

  private async assertDemoActor(
    tenantRef: string,
    actorRef: string
  ): Promise<void> {
    if (!tenantRef.trim() || !actorRef.trim()) {
      throw new AuthorizationDeniedError(
        "当前身份没有访问该学校或学生数据的权限。"
      );
    }
    const membership = await this.pool.query(
      `SELECT 1
         FROM governance.organization_membership AS membership
         JOIN governance.membership_role_assignment AS role
           ON role.membership_ref = membership.membership_ref
          AND role.role_key = 'ordinary_teacher'
         JOIN governance.organization AS organization
           ON organization.organization_ref = membership.organization_ref
         JOIN governance.user_account AS account
           ON account.user_ref = membership.user_ref
        WHERE membership.organization_ref = $1
          AND membership.user_ref = $2
          AND membership.status = 'active'
          AND organization.status = 'active'
          AND account.status = 'active'
        LIMIT 1`,
      [tenantRef, actorRef]
    );
    if (membership.rowCount !== 1) {
      throw new AuthorizationDeniedError(
        "The authenticated user has no active teacher membership in this school."
      );
    }
  }
}

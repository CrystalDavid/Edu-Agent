import { randomUUID } from "node:crypto";

import {
  gate2DemoRefs
} from "@edu-agent/test-fixtures";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  Gate2DemoSeedService
} from "../../apps/api/src/composition/gate2-demo-seed-service.js";
import {
  PostgresGate2ReadService
} from "../../apps/api/src/composition/postgres-gate2-read-service.js";
import {
  PostgresGate2TeacherCopilotService
} from "../../apps/api/src/composition/postgres-gate2-teacher-copilot-service.js";
import {
  PostgresIdentityOrganizationService
} from "../../apps/api/src/composition/postgres-identity-organization-service.js";
import {
  LocalIdentityProvider
} from "../../apps/api/src/modules/identity-governance-audit/infrastructure/local-identity-provider.js";
import {
  readIdentitySettings
} from "../../apps/api/src/platform/auth/config.js";
import {
  LocalCopilotOutboxWorker,
  localCopilotOutboxEventNames
} from "../../apps/api/src/composition/local-copilot-outbox-worker.js";
import {
  AuthorizationDeniedError,
  DomainConflictError,
  IdempotencyConflictError
} from "../../apps/api/src/platform/errors.js";
import {
  PostgresOutboxWorker
} from "../../apps/api/src/platform/postgres/outbox-worker.js";
import {
  poolFor,
  resetGate1BData,
  tableCount,
  wait
} from "./support/database.js";

const adminPool = poolFor("admin");
const appPool = poolFor("app", { max: 8 });
const workerPool = poolFor("worker");
const identitySettings = readIdentitySettings({
  APP_ENV: "test",
  IDENTITY_PROVIDER_MODE: "local",
  LOCAL_IDENTITY_PROVIDER_ENABLED: "true"
});
const localIdentityProvider = new LocalIdentityProvider(true);
const identity = new PostgresIdentityOrganizationService(
  appPool,
  identitySettings,
  localIdentityProvider,
  localIdentityProvider
);
const seedService = new Gate2DemoSeedService(appPool, identity);
const copilot = new PostgresGate2TeacherCopilotService(appPool);
const read = new PostgresGate2ReadService(appPool);

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await seedService.seed();
});

afterAll(async () => {
  await Promise.all([
    workerPool.end(),
    appPool.end(),
    adminPool.end()
  ]);
});

function createRequest(idempotencyKey = `gate2:${randomUUID()}`) {
  return {
    tenantRef: gate2DemoRefs.tenantRef,
    actorRef: gate2DemoRefs.teacherRef,
    request: {
      requestText: "根据当前学习证据调整明天的一次函数课堂",
      courseRunRef: gate2DemoRefs.courseRunRef,
      goalRef: gate2DemoRefs.goalRef,
      learningObjectiveRefs: [gate2DemoRefs.objectiveRef],
      selectedEvidenceRefs: [
        ...gate2DemoRefs.observationRefs,
        ...gate2DemoRefs.claimRefs
      ],
      requestVersion: 1 as const,
      purpose: "teacher-copilot.adjust-next-lesson",
      idempotencyKey
    }
  };
}

describe("Gate 2 PostgreSQL Teacher Copilot slice", () => {
  it("loads tenant-scoped synthetic evidence with provenance and no estimate", async () => {
    const workspace = await read.getWorkspace({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef
    });

    expect(workspace.identity).toMatchObject({
      dataMode: "synthetic",
      modelMode: "mock"
    });
    expect(workspace.evidence.observations).toHaveLength(2);
    expect(workspace.evidence.claims).toHaveLength(2);
    expect(workspace.evidence.estimateStatus).toBe("not-computed");
    expect(
      workspace.evidence.observations.every(
        (item) =>
          item.sourceRef.startsWith("attempt:") &&
          item.unknowns.length > 0
      )
    ).toBe(true);
    expect(
      workspace.evidence.claims.every(
        (item) =>
          item.confidenceExplanation.length > 0 &&
          item.status === "candidate"
      )
    ).toBe(true);
  });

  it("persists Task, Contract, Mock execution, Proposal, draft, Outbox and Audit atomically", async () => {
    const result = await copilot.createTask(createRequest());

    expect(result.replayed).toBe(false);
    expect(result.strategies).toHaveLength(2);
    expect(Object.keys(result.diffsByStrategy)).toHaveLength(2);
    expect(result.draftRevision.state).toBe("draft");
    await expect(tableCount(appPool, "work.task")).resolves.toBe(1);
    await expect(tableCount(appPool, "work.task_run")).resolves.toBe(1);
    await expect(
      tableCount(
        appPool,
        "work.resolved_learning_interaction_contract"
      )
    ).resolves.toBe(1);
    await expect(
      tableCount(appPool, "runtime.context_manifest")
    ).resolves.toBe(1);
    await expect(
      tableCount(appPool, "capability.model_execution")
    ).resolves.toBe(1);

    const proposal = await appPool.query<{
      artifact_type: string;
      revision_state: string;
    }>(
      `SELECT artifact.artifact_type, revision.revision_state
         FROM artifact.artifact AS artifact
         JOIN artifact.artifact_revision AS revision
           ON revision.artifact_ref = artifact.artifact_ref
        WHERE revision.revision_ref = $1`,
      [result.proposalRevisionRef]
    );
    expect(proposal.rows[0]).toEqual({
      artifact_type: "OperationalProposal",
      revision_state: "proposal"
    });
    const explanation = await read.getRunExplanation({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      taskRef: result.taskRef
    });
    expect(explanation.agentRun.provider).toBe("mock");
    expect(explanation.modelExecution.externalNetworkUsed).toBe(false);
    expect(explanation.contextManifest.evidenceRefs).toHaveLength(4);
    expect(result.request.requestText).toBe(
      createRequest().request.requestText
    );
    expect(explanation.task.request).toEqual(result.request);
    expect(explanation.contextManifest.requestSummary).toEqual(
      result.request
    );
    expect(explanation.auditTimeline.length).toBeGreaterThan(8);
    expect(explanation.outbox.length).toBeGreaterThanOrEqual(4);

    const persisted = await appPool.query<{
      request_payload: typeof result.request;
      contract_payload: {
        taskRequest: typeof result.request;
      };
      input_summary: {
        requestText: string;
      };
    }>(
      `SELECT task.request_payload,
              contract.contract_payload,
              execution.input_summary
         FROM work.task AS task
         JOIN work.task_run AS task_run
           ON task_run.task_ref = task.task_ref
         JOIN work.resolved_learning_interaction_contract AS contract
           ON contract.bound_run_ref = task_run.task_run_ref
         JOIN runtime.agent_run AS agent_run
           ON agent_run.bound_run_ref = task_run.task_run_ref
         JOIN capability.model_execution AS execution
           ON execution.input_summary ->> 'agentRunRef' =
              agent_run.agent_run_ref
        WHERE task.task_ref = $1`,
      [result.taskRef]
    );
    expect(persisted.rows[0]?.request_payload).toEqual(
      result.request
    );
    expect(
      persisted.rows[0]?.contract_payload.taskRequest
    ).toEqual(result.request);
    expect(
      persisted.rows[0]?.input_summary.requestText
    ).toBe(result.request.requestText);
  });

  it("recovers pending Proposal details without rerunning the model", async () => {
    const task = await copilot.createTask(createRequest());
    const modelExecutionsBefore = await tableCount(
      appPool,
      "capability.model_execution"
    );

    const freshReadService = new PostgresGate2ReadService(appPool);
    const pending = await freshReadService.listPendingProposals({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef
    });
    const detail = await freshReadService.getProposalDetail({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      proposalRevisionRef: task.proposalRevisionRef
    });

    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]).toMatchObject({
      proposalRevisionRef: task.proposalRevisionRef,
      taskRef: task.taskRef,
      requestText: task.request.requestText
    });
    expect(detail).toMatchObject({
      status: "pending",
      taskRef: task.taskRef,
      taskRunRef: task.taskRunRef,
      agentRunRef: task.agentRunRef,
      contractRef: task.contractRef,
      authorizationDecisionRef:
        task.authorizationDecisionRef,
      request: task.request,
      disposition: null
    });
    expect(detail.evidence.observations).toHaveLength(2);
    expect(detail.evidence.claims).toHaveLength(2);
    expect(detail.baselineRevision.state).toBe("approved");
    expect(detail.draftRevision.state).toBe("draft");
    await expect(
      tableCount(appPool, "capability.model_execution")
    ).resolves.toBe(modelExecutionsBefore);
  });

  it("serializes duplicate clicks and rejects an idempotency payload collision", async () => {
    const idempotencyKey = `gate2:${randomUUID()}`;
    const command = createRequest(idempotencyKey);
    const [first, second] = await Promise.all([
      copilot.createTask(command),
      copilot.createTask(command)
    ]);

    expect(first.taskRef).toBe(second.taskRef);
    expect([first.replayed, second.replayed].sort()).toEqual([
      false,
      true
    ]);
    await expect(tableCount(appPool, "work.task")).resolves.toBe(1);
    await expect(
      copilot.createTask({
        ...command,
        request: {
          ...command.request,
          goalRef: "goal:different"
        }
      })
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    await expect(tableCount(appPool, "work.task")).resolves.toBe(1);
  });

  it("fails closed for an unauthorized purpose and another tenant", async () => {
    await expect(
      copilot.createTask({
        ...createRequest(),
        request: {
          ...createRequest().request,
          purpose: "teacher-copilot.publish-plan"
        }
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      read.getWorkspace({
        tenantRef: "tenant:other-school",
        actorRef: gate2DemoRefs.teacherRef
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(tableCount(appPool, "work.task")).resolves.toBe(0);
  });

  it.each([
    "accepted",
    "accepted_with_changes",
    "rejected",
    "deferred"
  ] as const)(
    "records %s as a disposition without claiming implementation",
    async (disposition) => {
      const task = await copilot.createTask(createRequest());
      const teacherEdits =
        disposition === "accepted_with_changes"
          ? {
              followUp:
                "教师修改：下节课先核对独立解释，再决定是否继续提供句式支架。"
            }
          : {};
      const result = await copilot.disposition({
        tenantRef: gate2DemoRefs.tenantRef,
        actorRef: gate2DemoRefs.teacherRef,
        proposalRevisionRef: task.proposalRevisionRef,
        request: {
          purpose: "teacher-copilot.review-suggestion",
          idempotencyKey: `gate2:disposition:${randomUUID()}`,
          disposition,
          selectedStrategyId: task.strategies[0]!.strategyId,
          expectedProposalRevisionNumber: 1,
          teacherEdits
        }
      });

      expect(result.implementationObserved).toBe(false);
      expect(result.instructionalDecisionCreated).toBe(false);
      if (
        disposition === "accepted" ||
        disposition === "accepted_with_changes"
      ) {
        expect(result.resultingRevision?.state).toBe("in_review");
        const workspace = await read.getWorkspace({
          tenantRef: gate2DemoRefs.tenantRef,
          actorRef: gate2DemoRefs.teacherRef
        });
        expect(
          workspace.currentInReviewPlan?.selectedStrategyId
        ).toBe(task.strategies[0]!.strategyId);
        expect(
          workspace.currentInReviewPlan?.teacherSelection
        ).toBe(
          disposition === "accepted" ? "accepted" : "modified"
        );
      } else {
        expect(result.resultingRevision).toBeNull();
      }
      const forbidden = await adminPool.query<{
        instructional_decision_count: string;
        observed_pedagogical_move_count: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM education.instructional_decision)
             AS instructional_decision_count,
           (SELECT count(*)::text FROM education.observed_pedagogical_move)
             AS observed_pedagogical_move_count`
      );
      expect(forbidden.rows[0]).toEqual({
        instructional_decision_count: "0",
        observed_pedagogical_move_count: "0"
      });
      const published = await appPool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM artifact.artifact_revision
          WHERE artifact_ref = $1
            AND revision_state = 'published'`,
        [task.teachingPlanArtifactRef]
      );
      expect(Number(published.rows[0]?.count)).toBe(0);
    }
  );

  it("makes disposition replay safe without creating a second revision", async () => {
    const task = await copilot.createTask(createRequest());
    const request = {
      purpose: "teacher-copilot.review-suggestion",
      idempotencyKey: `gate2:disposition:${randomUUID()}`,
      disposition: "accepted" as const,
      selectedStrategyId: task.strategies[0]!.strategyId,
      expectedProposalRevisionNumber: 1,
      teacherEdits: {}
    };
    const first = await copilot.disposition({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      proposalRevisionRef: task.proposalRevisionRef,
      request
    });
    const second = await copilot.disposition({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      proposalRevisionRef: task.proposalRevisionRef,
      request
    });

    expect(first.dispositionRef).toBe(second.dispositionRef);
    expect(second.replayed).toBe(true);
    await expect(
      copilot.disposition({
        tenantRef: gate2DemoRefs.tenantRef,
        actorRef: gate2DemoRefs.teacherRef,
        proposalRevisionRef: task.proposalRevisionRef,
        request: {
          ...request,
          disposition: "rejected"
        }
      })
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    await expect(
      tableCount(appPool, "work.suggestion_disposition")
    ).resolves.toBe(1);
    const revisions = await appPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM artifact.artifact_revision
        WHERE artifact_ref = $1`,
      [task.teachingPlanArtifactRef]
    );
    expect(Number(revisions.rows[0]?.count)).toBe(3);
  });

  it("replays the same final disposition across idempotency keys and rejects a different one", async () => {
    const task = await copilot.createTask(createRequest());
    const baseRequest = {
      purpose: "teacher-copilot.review-suggestion",
      disposition: "deferred" as const,
      selectedStrategyId: task.strategies[0]!.strategyId,
      expectedProposalRevisionNumber: 1,
      teacherEdits: {},
      note: "稍后继续"
    };
    const first = await copilot.disposition({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      proposalRevisionRef: task.proposalRevisionRef,
      request: {
        ...baseRequest,
        idempotencyKey: `gate2:defer:${randomUUID()}`
      }
    });
    const replay = await copilot.disposition({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      proposalRevisionRef: task.proposalRevisionRef,
      request: {
        ...baseRequest,
        idempotencyKey: `gate2:defer:${randomUUID()}`
      }
    });

    expect(replay).toMatchObject({
      replayed: true,
      dispositionRef: first.dispositionRef,
      disposition: "deferred",
      resultingRevision: null
    });
    await expect(
      copilot.disposition({
        tenantRef: gate2DemoRefs.tenantRef,
        actorRef: gate2DemoRefs.teacherRef,
        proposalRevisionRef: task.proposalRevisionRef,
        request: {
          ...baseRequest,
          idempotencyKey: `gate2:reject:${randomUUID()}`,
          disposition: "rejected"
        }
      })
    ).rejects.toMatchObject({
      code: "PROPOSAL_ALREADY_DISPOSED"
    });
  });

  it("allows only one of two concurrent different dispositions", async () => {
    const task = await copilot.createTask(createRequest());
    const common = {
      purpose: "teacher-copilot.review-suggestion",
      selectedStrategyId: task.strategies[0]!.strategyId,
      expectedProposalRevisionNumber: 1,
      teacherEdits: {}
    };
    const outcomes = await Promise.allSettled([
      copilot.disposition({
        tenantRef: gate2DemoRefs.tenantRef,
        actorRef: gate2DemoRefs.teacherRef,
        proposalRevisionRef: task.proposalRevisionRef,
        request: {
          ...common,
          idempotencyKey: `gate2:concurrent:${randomUUID()}`,
          disposition: "accepted"
        }
      }),
      copilot.disposition({
        tenantRef: gate2DemoRefs.tenantRef,
        actorRef: gate2DemoRefs.teacherRef,
        proposalRevisionRef: task.proposalRevisionRef,
        request: {
          ...common,
          idempotencyKey: `gate2:concurrent:${randomUUID()}`,
          disposition: "rejected"
        }
      })
    ]);

    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled")
    ).toHaveLength(1);
    const rejected = outcomes.find(
      (outcome) => outcome.status === "rejected"
    );
    expect(rejected).toBeDefined();
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(DomainConflictError);
    }
    await expect(
      tableCount(appPool, "work.suggestion_disposition")
    ).resolves.toBe(1);
  });

  it("keeps current approved separate from review, then creates a new immutable approved Revision", async () => {
    const initial = await read.getTeachingPlanState({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef
    });
    const task = await copilot.createTask(createRequest());
    const disposed = await copilot.disposition({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      proposalRevisionRef: task.proposalRevisionRef,
      request: {
        purpose: "teacher-copilot.review-suggestion",
        idempotencyKey: `gate2:accept:${randomUUID()}`,
        disposition: "accepted_with_changes",
        selectedStrategyId: task.strategies[0]!.strategyId,
        expectedProposalRevisionNumber: 1,
        teacherEdits: {
          followUp: "教师审核后的后续证据采集安排"
        }
      }
    });
    const inReview = disposed.resultingRevision!;
    const beforeApproval = await read.getTeachingPlanState({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef
    });
    expect(beforeApproval.currentApproved.revisionRef).toBe(
      initial.currentApproved.revisionRef
    );
    expect(beforeApproval.currentInReview?.revisionRef).toBe(
      inReview.revisionRef
    );
    expect(inReview.parentRevisionRef).toBe(
      task.draftRevision.revisionRef
    );

    const approvalRequest = {
      purpose: "teacher-copilot.approve-plan" as const,
      idempotencyKey: `gate2:approve:${randomUUID()}`,
      expectedInReviewRevisionRef: inReview.revisionRef
    };
    const approved = await copilot.approveTeachingPlan({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      inReviewRevisionRef: inReview.revisionRef,
      request: approvalRequest
    });
    const approvalReplay = await copilot.approveTeachingPlan({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      inReviewRevisionRef: inReview.revisionRef,
      request: approvalRequest
    });
    const afterApproval = await read.getTeachingPlanState({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef
    });
    expect(approved.approvedRevision).toMatchObject({
      state: "approved",
      parentRevisionRef: inReview.revisionRef,
      content: inReview.content
    });
    expect(afterApproval.currentApproved.revisionRef).toBe(
      approved.approvedRevision.revisionRef
    );
    expect(afterApproval.currentInReview).toBeNull();
    expect(approvalReplay).toMatchObject({
      replayed: true,
      approvedRevision: {
        revisionRef: approved.approvedRevision.revisionRef
      }
    });
    expect(afterApproval.drafts).toContainEqual(
      expect.objectContaining({
        revisionRef: task.draftRevision.revisionRef,
        state: "draft"
      })
    );
    expect(afterApproval.history.map((item) => item.state)).toEqual(
      expect.arrayContaining([
        "draft",
        "in_review",
        "approved"
      ])
    );

    await expect(
      adminPool.query(
        `UPDATE artifact.artifact_revision
            SET title = 'mutated'
          WHERE revision_ref = $1`,
        [approved.approvedRevision.revisionRef]
      )
    ).rejects.toThrow("ArtifactRevision is immutable");
  });

  it.each(["rejected", "deferred"] as const)(
    "%s leaves the current approved plan and in-review pointer unchanged",
    async (disposition) => {
      const before = await read.getTeachingPlanState({
        tenantRef: gate2DemoRefs.tenantRef,
        actorRef: gate2DemoRefs.teacherRef
      });
      const task = await copilot.createTask(createRequest());
      await copilot.disposition({
        tenantRef: gate2DemoRefs.tenantRef,
        actorRef: gate2DemoRefs.teacherRef,
        proposalRevisionRef: task.proposalRevisionRef,
        request: {
          purpose: "teacher-copilot.review-suggestion",
          idempotencyKey: `gate2:${disposition}:${randomUUID()}`,
          disposition,
          selectedStrategyId: task.strategies[0]!.strategyId,
          expectedProposalRevisionNumber: 1,
          teacherEdits: {}
        }
      });
      const after = await read.getTeachingPlanState({
        tenantRef: gate2DemoRefs.tenantRef,
        actorRef: gate2DemoRefs.teacherRef
      });
      expect(after.currentApproved.revisionRef).toBe(
        before.currentApproved.revisionRef
      );
      expect(after.currentInReview).toBeNull();
    }
  );

  it("lets the local application Worker resume a leased Gate 2.4 event after restart", async () => {
    const task = await copilot.createTask(createRequest());
    const crashed = new PostgresOutboxWorker(
      workerPool,
      "worker:gate24-crashed",
      "teacher-copilot-local-worker-v1",
      60,
      localCopilotOutboxEventNames.work
    );
    const abandoned = await crashed.claimOne();
    expect(abandoned).toMatchObject({
      eventName: "TeacherCopilotTaskCompleted",
      aggregateRef: task.taskRunRef,
      attemptCount: 1
    });
    await wait(100);

    const restarted = new LocalCopilotOutboxWorker(
      workerPool,
      "worker:gate24-restarted"
    );
    await expect(restarted.processAvailable(1)).resolves.toBe(1);
    await restarted.stop();

    const state = await workerPool.query<{
      status: string;
      attempt_count: number;
      effects: string;
    }>(
      `SELECT outbox.status, outbox.attempt_count,
              (
                SELECT count(*)::text
                  FROM work.outbox_consumer_effect AS effect
                 WHERE effect.outbox_ref = outbox.outbox_ref
                   AND effect.consumer_name =
                     'teacher-copilot-local-worker-v1'
              ) AS effects
         FROM work.outbox_record AS outbox
        WHERE outbox.outbox_ref = $1`,
      [abandoned!.outboxRef]
    );
    expect(state.rows[0]).toEqual({
      status: "processed",
      attempt_count: 2,
      effects: "1"
    });
  });
});

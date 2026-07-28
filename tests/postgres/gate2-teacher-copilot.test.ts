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
  AuthorizationDeniedError,
  IdempotencyConflictError
} from "../../apps/api/src/platform/errors.js";
import {
  poolFor,
  resetGate1BData,
  tableCount
} from "./support/database.js";

const adminPool = poolFor("admin");
const appPool = poolFor("app", { max: 8 });
const seedService = new Gate2DemoSeedService(appPool);
const copilot = new PostgresGate2TeacherCopilotService(appPool);
const read = new PostgresGate2ReadService(appPool);

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await seedService.seed();
});

afterAll(async () => {
  await Promise.all([appPool.end(), adminPool.end()]);
});

function createRequest(idempotencyKey = `gate2:${randomUUID()}`) {
  return {
    tenantRef: gate2DemoRefs.tenantRef,
    actorRef: gate2DemoRefs.teacherRef,
    request: {
      courseRunRef: gate2DemoRefs.courseRunRef,
      goalRef: gate2DemoRefs.goalRef,
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
    expect(explanation.auditTimeline.length).toBeGreaterThan(8);
    expect(explanation.outbox.length).toBeGreaterThanOrEqual(4);
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
          workspace.latestTeachingPlan.selectedStrategyId
        ).toBe(task.strategies[0]!.strategyId);
        expect(
          workspace.latestTeachingPlan.teacherSelection
        ).toBe(
          disposition === "accepted" ? "accepted" : "modified"
        );
      } else {
        expect(result.resultingRevision).toBeNull();
      }
      const forbidden = await adminPool.query<{
        instructional_decision: string | null;
        observed_pedagogical_move: string | null;
      }>(
        `SELECT
           to_regclass('education.instructional_decision')::text
             AS instructional_decision,
           to_regclass('education.observed_pedagogical_move')::text
             AS observed_pedagogical_move`
      );
      expect(forbidden.rows[0]).toEqual({
        instructional_decision: null,
        observed_pedagogical_move: null
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
});

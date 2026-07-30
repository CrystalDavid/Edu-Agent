import { randomUUID } from "node:crypto";

import {
  gate2DemoRefs
} from "@edu-agent/test-fixtures";
import { apiRoutes } from "@edu-agent/contracts";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import {
  createProductContainer
} from "../../apps/api/src/composition/product-container.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const product = createProductContainer(postgresEnvironment);
const app = createApp({ product });
const bypassApp = createApp({
  product,
  demoIdentity: {
    applicationEnvironment: "demo",
    allowBypass: true
  }
});
const demoHeaders = {
  "x-demo-tenant": gate2DemoRefs.tenantRef,
  "x-demo-actor": gate2DemoRefs.teacherRef
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await product.services.seed.seed();
});

afterAll(async () => {
  await Promise.all([product.close(), adminPool.end()]);
});

describe("Gate 2 HTTP contract", () => {
  it("requires explicit identity unless audited local bypass is enabled", async () => {
    await request(app)
      .get(apiRoutes.demo.bootstrap)
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe("AUTHENTICATION_REQUIRED");
      });

    await request(app)
      .get(apiRoutes.demo.bootstrap)
      .set("x-demo-tenant", gate2DemoRefs.tenantRef)
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe("AUTHENTICATION_REQUIRED");
      });

    await request(bypassApp)
      .get(apiRoutes.demo.bootstrap)
      .expect(200);

    const audit = await adminPool.query<{
      action: string;
      purpose: string;
      actor_ref: string;
    }>(
      `SELECT action, purpose, actor_ref
         FROM governance.audit_record
        WHERE record_type = 'DemoIdentityInjection'`
    );
    expect(audit.rows).toEqual([
      {
        action: "demo.identity.inject",
        purpose: "local.demo.identity-injection",
        actor_ref: gate2DemoRefs.teacherRef
      }
    ]);
  });

  it("serves the teacher workspace and never returns another tenant", async () => {
    const response = await request(app)
      .get(apiRoutes.demo.bootstrap)
      .set(demoHeaders)
      .expect(200);

    expect(response.body.identity.tenantRef).toBe(
      gate2DemoRefs.tenantRef
    );
    expect(JSON.stringify(response.body)).not.toContain(
      "tenant:other-school"
    );
    await request(app)
      .get(apiRoutes.demo.bootstrap)
      .set({
        ...demoHeaders,
        "x-demo-tenant": "tenant:other-school"
      })
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("AUTHORIZATION_DENIED");
      });
    await request(app)
      .get(apiRoutes.demo.bootstrap)
      .set({
        ...demoHeaders,
        "x-demo-actor": "user:teacher-other"
      })
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("AUTHORIZATION_DENIED");
      });
  });

  it("runs the complete API flow and exposes a safe explanation", async () => {
    const idempotencyKey = `http:gate2:${randomUUID()}`;
    const command = {
      requestText: "根据学习证据调整明天的一次函数课堂",
      courseRunRef: gate2DemoRefs.courseRunRef,
      goalRef: gate2DemoRefs.goalRef,
      learningObjectiveRefs: [gate2DemoRefs.objectiveRef],
      selectedEvidenceRefs: [
        ...gate2DemoRefs.observationRefs,
        ...gate2DemoRefs.claimRefs
      ],
      requestVersion: 1,
      purpose: "teacher-copilot.adjust-next-lesson",
      idempotencyKey
    };
    const created = await request(app)
      .post(apiRoutes.demo.createTeacherCopilotTask)
      .set(demoHeaders)
      .send(command)
      .expect(201);
    expect(created.body.strategies).toHaveLength(2);

    const replay = await request(app)
      .post(apiRoutes.demo.createTeacherCopilotTask)
      .set(demoHeaders)
      .send(command)
      .expect(200);
    expect(replay.body.taskRef).toBe(created.body.taskRef);
    expect(replay.body.replayed).toBe(true);

    const pending = await request(app)
      .get(apiRoutes.demo.pendingProposals)
      .set(demoHeaders)
      .expect(200);
    expect(pending.body.items).toEqual([
      expect.objectContaining({
        proposalRevisionRef:
          created.body.proposalRevisionRef,
        taskRef: created.body.taskRef,
        requestText: command.requestText,
        status: "pending"
      })
    ]);

    const proposal = await request(app)
      .get(
        apiRoutes.demo.proposalDetail(
          created.body.proposalRevisionRef
        )
      )
      .set(demoHeaders)
      .expect(200);
    expect(proposal.body).toMatchObject({
      taskRef: created.body.taskRef,
      taskRunRef: created.body.taskRunRef,
      contractRef: created.body.contractRef,
      status: "pending",
      request: {
        requestText: command.requestText,
        requestVersion: 1
      },
      baselineRevision: {
        state: "approved"
      },
      draftRevision: {
        state: "draft"
      }
    });

    const currentBefore = await request(app)
      .get(apiRoutes.demo.currentApprovedTeachingPlan)
      .set(demoHeaders)
      .expect(200);

    const disposed = await request(app)
      .post(
        apiRoutes.demo.suggestionDisposition(
          created.body.proposalRevisionRef
        )
      )
      .set(demoHeaders)
      .send({
        purpose: "teacher-copilot.review-suggestion",
        idempotencyKey: `http:disposition:${randomUUID()}`,
        disposition: "accepted_with_changes",
        selectedStrategyId:
          created.body.strategies[0].strategyId,
        expectedProposalRevisionNumber: 1,
        teacherEdits: {
          followUp: "教师通过 HTTP 验收修改的后续行动。"
        }
      })
      .expect(201);
    expect(disposed.body).toMatchObject({
      implementationObserved: false,
      instructionalDecisionCreated: false,
      resultingRevision: {
        state: "in_review"
      }
    });

    await request(app)
      .get(apiRoutes.demo.pendingProposals)
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toEqual([]);
      });
    await request(app)
      .get(
        apiRoutes.demo.proposalDetail(
          created.body.proposalRevisionRef
        )
      )
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: "disposed",
          disposition: {
            disposition: "accepted_with_changes"
          },
          inReviewRevision: {
            revisionRef:
              disposed.body.resultingRevision.revisionRef,
            state: "in_review"
          }
        });
      });

    await request(app)
      .get(apiRoutes.demo.currentApprovedTeachingPlan)
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.revisionRef).toBe(
          currentBefore.body.revisionRef
        );
      });
    await request(app)
      .get(apiRoutes.demo.currentInReviewTeachingPlan)
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.revisionRef).toBe(
          disposed.body.resultingRevision.revisionRef
        );
      });

    const approval = await request(app)
      .post(
        apiRoutes.demo.approveTeachingPlan(
          disposed.body.resultingRevision.revisionRef
        )
      )
      .set(demoHeaders)
      .send({
        purpose: "teacher-copilot.approve-plan",
        idempotencyKey: `http:approve:${randomUUID()}`,
        expectedInReviewRevisionRef:
          disposed.body.resultingRevision.revisionRef
      })
      .expect(201);
    expect(approval.body.approvedRevision).toMatchObject({
      state: "approved",
      parentRevisionRef:
        disposed.body.resultingRevision.revisionRef
    });
    await request(app)
      .get(apiRoutes.demo.currentApprovedTeachingPlan)
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.revisionRef).toBe(
          approval.body.approvedRevision.revisionRef
        );
      });
    await request(app)
      .get(apiRoutes.demo.currentInReviewTeachingPlan)
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toBeNull();
      });
    await request(app)
      .get(apiRoutes.demo.teachingPlanDrafts)
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ state: "draft" })
          ])
        );
      });
    await request(app)
      .get(apiRoutes.demo.teachingPlanHistory)
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.map((item: { state: string }) => item.state))
          .toEqual(
            expect.arrayContaining([
              "draft",
              "in_review",
              "approved"
            ])
          );
      });

    const explanation = await request(app)
      .get(apiRoutes.demo.runExplanation(created.body.taskRef))
      .set(demoHeaders)
      .expect(200);
    expect(explanation.body.modelExecution).toMatchObject({
      provider: "mock",
      externalNetworkUsed: false,
      costLabel: "¥0.00（Mock）"
    });
    expect(explanation.body.task.request.requestText).toBe(
      command.requestText
    );
    expect(
      explanation.body.contextManifest.requestSummary.requestText
    ).toBe(command.requestText);
    expect(JSON.stringify(explanation.body)).not.toContain(
      "POSTGRES_APP_PASSWORD"
    );
    expect(JSON.stringify(explanation.body)).not.toContain(
      "chain-of-thought"
    );
  });

  it("returns explicit validation and authorization errors", async () => {
    await request(app)
      .post(apiRoutes.demo.createTeacherCopilotTask)
      .set(demoHeaders)
      .send({})
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe("INVALID_ENVELOPE");
      });

    await request(app)
      .post(apiRoutes.demo.createTeacherCopilotTask)
      .set(demoHeaders)
      .send({
        requestText: "未授权任务",
        courseRunRef: gate2DemoRefs.courseRunRef,
        goalRef: gate2DemoRefs.goalRef,
        learningObjectiveRefs: [gate2DemoRefs.objectiveRef],
        selectedEvidenceRefs: [
          ...gate2DemoRefs.observationRefs
        ],
        requestVersion: 1,
        purpose: "teacher-copilot.publish-plan",
        idempotencyKey: `http:denied:${randomUUID()}`
      })
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("AUTHORIZATION_DENIED");
      });
  });

  it("returns structured Proposal version and final-disposition conflicts", async () => {
    const created = await request(app)
      .post(apiRoutes.demo.createTeacherCopilotTask)
      .set(demoHeaders)
      .send({
        requestText: "验证 Proposal 冲突",
        courseRunRef: gate2DemoRefs.courseRunRef,
        goalRef: gate2DemoRefs.goalRef,
        learningObjectiveRefs: [gate2DemoRefs.objectiveRef],
        selectedEvidenceRefs: [
          ...gate2DemoRefs.observationRefs
        ],
        requestVersion: 1,
        purpose: "teacher-copilot.adjust-next-lesson",
        idempotencyKey: `http:conflict:${randomUUID()}`
      })
      .expect(201);

    const reviewRequest = {
      purpose: "teacher-copilot.review-suggestion",
      idempotencyKey: `http:conflict-review:${randomUUID()}`,
      disposition: "rejected",
      selectedStrategyId: created.body.strategies[0].strategyId,
      expectedProposalRevisionNumber: 99,
      teacherEdits: {}
    };
    await request(app)
      .post(
        apiRoutes.demo.suggestionDisposition(
          created.body.proposalRevisionRef
        )
      )
      .set(demoHeaders)
      .send(reviewRequest)
      .expect(409)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: "PROPOSAL_VERSION_CONFLICT",
          details: {
            expectedRevisionNumber: 99,
            actualRevisionNumber: 1
          }
        });
      });

    await request(app)
      .post(
        apiRoutes.demo.suggestionDisposition(
          created.body.proposalRevisionRef
        )
      )
      .set(demoHeaders)
      .send({
        ...reviewRequest,
        idempotencyKey: `http:reject:${randomUUID()}`,
        expectedProposalRevisionNumber: 1
      })
      .expect(201);
    await request(app)
      .post(
        apiRoutes.demo.suggestionDisposition(
          created.body.proposalRevisionRef
        )
      )
      .set(demoHeaders)
      .send({
        ...reviewRequest,
        idempotencyKey: `http:defer:${randomUUID()}`,
        expectedProposalRevisionNumber: 1,
        disposition: "deferred"
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: "PROPOSAL_ALREADY_DISPOSED",
          details: {
            existingDisposition: "rejected"
          }
        });
      });
  });
});

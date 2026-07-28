import { randomUUID } from "node:crypto";

import {
  gate2DemoRefs
} from "@edu-agent/test-fixtures";
import { apiRoutes } from "@edu-agent/contracts";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import {
  createGate1AContainer
} from "../../apps/api/src/composition/gate1a-container.js";
import {
  createGate2Container
} from "../../apps/api/src/composition/gate2-container.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const gate2 = createGate2Container(postgresEnvironment);
const app = createApp(createGate1AContainer(), gate2);
const demoHeaders = {
  "x-demo-tenant": gate2DemoRefs.tenantRef,
  "x-demo-actor": gate2DemoRefs.teacherRef
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await gate2.services.seed.seed();
});

afterAll(async () => {
  await Promise.all([gate2.close(), adminPool.end()]);
});

describe("Gate 2 HTTP contract", () => {
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
  });

  it("runs the complete API flow and exposes a safe explanation", async () => {
    const idempotencyKey = `http:gate2:${randomUUID()}`;
    const command = {
      courseRunRef: gate2DemoRefs.courseRunRef,
      goalRef: gate2DemoRefs.goalRef,
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

    const explanation = await request(app)
      .get(apiRoutes.demo.runExplanation(created.body.taskRef))
      .set(demoHeaders)
      .expect(200);
    expect(explanation.body.modelExecution).toMatchObject({
      provider: "mock",
      externalNetworkUsed: false,
      costLabel: "¥0.00（Mock）"
    });
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
        courseRunRef: gate2DemoRefs.courseRunRef,
        goalRef: gate2DemoRefs.goalRef,
        purpose: "teacher-copilot.publish-plan",
        idempotencyKey: `http:denied:${randomUUID()}`
      })
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("AUTHORIZATION_DENIED");
      });
  });
});

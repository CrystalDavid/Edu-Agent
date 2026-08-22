import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import {
  GenerateClassroomFeedbackResultSchema,
  LatestClassroomFeedbackResultSchema,
  LessonTeachingPlanStateSchema,
  apiRoutes
} from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/sample-data";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import { createProductContainer } from "../../apps/api/src/composition/product-container.js";
import { LocalObjectStore } from "../../apps/api/src/modules/capability-integration/infrastructure/local-object-store.js";
import { gate25DemoRefs } from "../../scripts/sample/gate2-5-demo-fixture.js";
import { seedSampleData } from "../../scripts/sample/seed-sample-data.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const objectRoot = resolve(
  ".local-data",
  "test-output",
  "postgres",
  "phase8a4-classroom-feedback"
);
const product = createProductContainer(postgresEnvironment, {
  objectStoreSettings: {
    rootDirectory: objectRoot,
    maxUploadBytes: 1024 * 1024
  },
  objectStore: new LocalObjectStore(objectRoot)
});
const app = createApp({ product });
const demoHeaders = {
  "x-demo-tenant": gate2DemoRefs.tenantRef,
  "x-demo-actor": gate2DemoRefs.teacherRef
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await rm(objectRoot, { recursive: true, force: true });
  await seedSampleData(postgresEnvironment, {
    includeGate25: true,
    includeGate27: true
  });
});

afterAll(async () => {
  await Promise.all([product.close(), adminPool.end()]);
  await rm(objectRoot, { recursive: true, force: true });
});

describe("Phase 8A-4 classroom quick feedback", () => {
  it("creates a recoverable Draft without confirming Delivery or Observation facts", async () => {
    const lessonRef = gate25DemoRefs.lessonRefs.slopeAndGraph;
    const plan = await approvedPlan(lessonRef);
    const planBefore = await planBody(plan.revisionRef);
    const idempotencyKey = `phase8a4:feedback:${randomUUID()}`;
    const payload = feedbackPayload({
      lessonRef,
      planRevisionRef: plan.revisionRef,
      idempotencyKey
    });

    const first = GenerateClassroomFeedbackResultSchema.parse((
      await request(app)
        .post(apiRoutes.teacher.lessonDeliveryQuickFeedback)
        .set(demoHeaders)
        .send(payload)
        .expect(201)
    ).body);

    expect(first).toMatchObject({
      replayed: false,
      skillRef: "classroom-reflection@1",
      lessonRef,
      teachingPlanRevisionRef: plan.revisionRef,
      delivery: {
        currentConfirmed: null
      }
    });
    expect(first.delivery.currentDraft).not.toBeNull();
    expect(first.delivery.currentDraft?.steps).toHaveLength(5);
    expect(first.observationCandidates.length).toBeGreaterThan(0);
    expect(first.observationCandidates.every((candidate) =>
      candidate.status === "candidate" &&
      candidate.teacherConfirmationRequired
    )).toBe(true);

    const factsBeforeConfirm = await adminPool.query<{
      confirmed_deliveries: string;
      observed_moves: string;
      observations: string;
    }>(
      `SELECT
         (SELECT count(*)::text
            FROM education.lesson_delivery_revision
           WHERE delivery_ref = $1 AND revision_status = 'confirmed') AS confirmed_deliveries,
         (SELECT count(*)::text
            FROM education.observed_pedagogical_move AS move
            JOIN education.lesson_delivery_revision AS revision
              ON revision.delivery_revision_ref = move.delivery_revision_ref
           WHERE revision.delivery_ref = $1) AS observed_moves,
         (SELECT count(*)::text
            FROM education.classroom_observation
           WHERE delivery_ref = $1) AS observations`,
      [first.delivery.deliveryRef]
    );
    expect(factsBeforeConfirm.rows[0]).toEqual({
      confirmed_deliveries: "0",
      observed_moves: "0",
      observations: "0"
    });

    const runtime = await adminPool.query<{ output: Record<string, unknown> }>(
      `SELECT output FROM runtime.agent_run WHERE agent_run_ref = $1`,
      [first.agentRunRef]
    );
    expect(runtime.rows[0]?.output).toMatchObject({
      kind: "classroom_delivery_draft",
      runtimeStatus: "waiting_for_human",
      skill: { ref: "classroom-reflection@1", version: "1" }
    });

    const latest = LatestClassroomFeedbackResultSchema.parse((
      await request(app)
        .get(apiRoutes.teacher.lessonLatestClassroomFeedback(lessonRef))
        .set(demoHeaders)
        .expect(200)
    ).body);
    expect(latest.item?.agentRunRef).toBe(first.agentRunRef);

    const replay = GenerateClassroomFeedbackResultSchema.parse((
      await request(app)
        .post(apiRoutes.teacher.lessonDeliveryQuickFeedback)
        .set(demoHeaders)
        .send(payload)
        .expect(200)
    ).body);
    expect(replay.replayed).toBe(true);
    expect(replay.agentRunRef).toBe(first.agentRunRef);
    expect(replay.delivery.deliveryRef).toBe(first.delivery.deliveryRef);

    await request(app)
      .post(apiRoutes.teacher.lessonDeliveryQuickFeedback)
      .set(demoHeaders)
      .send({ ...payload, pace: "faster" })
      .expect(409);

    const draft = first.delivery.currentDraft;
    expect(draft).not.toBeNull();
    if (!draft) return;
    const confirmed = await request(app)
      .post(apiRoutes.teacher.lessonDeliveryConfirm(first.delivery.deliveryRef))
      .set(demoHeaders)
      .send({
        expectedRevisionVersion: draft.revisionVersion,
        purpose: "lesson-delivery.confirm",
        idempotencyKey: `phase8a4:confirm:${randomUUID()}`
      })
      .expect(200);
    expect(confirmed.body.delivery.currentConfirmed.status).toBe("confirmed");
    expect(confirmed.body.delivery.currentDraft).toBeNull();

    const factsAfterConfirm = await adminPool.query<{ moves: string }>(
      `SELECT count(*)::text AS moves
         FROM education.observed_pedagogical_move
        WHERE delivery_revision_ref = $1`,
      [confirmed.body.delivery.currentConfirmed.deliveryRevisionRef]
    );
    expect(factsAfterConfirm.rows[0]?.moves).toBe("5");
    expect(await planBody(plan.revisionRef)).toEqual(planBefore);
  });

  it("requires a current approved TeachingPlan and never invents a baseline", async () => {
    const lessonRef = gate25DemoRefs.lessonRefs.coefficientMethod;
    await request(app)
      .post(apiRoutes.teacher.lessonDeliveryQuickFeedback)
      .set(demoHeaders)
      .send(feedbackPayload({
        lessonRef,
        planRevisionRef: "teaching-plan-revision:none",
        idempotencyKey: `phase8a4:no-plan:${randomUUID()}`
      }))
      .expect(409);

    const deliveries = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM education.lesson_delivery
        WHERE tenant_ref = $1 AND lesson_ref = $2`,
      [gate2DemoRefs.tenantRef, lessonRef]
    );
    expect(deliveries.rows[0]?.count).toBe("0");
  });

  it("does not disclose classroom feedback across school boundaries", async () => {
    const lessonRef = "lesson:school-b-linear-function-application";
    await request(app)
      .get(apiRoutes.teacher.lessonLatestClassroomFeedback(lessonRef))
      .set(demoHeaders)
      .expect(404);

    await request(app)
      .post(apiRoutes.teacher.lessonDeliveryQuickFeedback)
      .set(demoHeaders)
      .send(feedbackPayload({
        lessonRef,
        planRevisionRef: "teaching-plan-revision:school-b",
        idempotencyKey: `phase8a4:foreign:${randomUUID()}`
      }))
      .expect(404);
  });
});

async function approvedPlan(lessonRef: string) {
  const plans = LessonTeachingPlanStateSchema.parse((
    await request(app)
      .get(apiRoutes.teacher.lessonTeachingPlans(lessonRef))
      .set(demoHeaders)
      .expect(200)
  ).body);
  expect(plans.currentApproved).not.toBeNull();
  if (!plans.currentApproved) throw new Error("Expected an approved plan.");
  return plans.currentApproved;
}

async function planBody(revisionRef: string) {
  const result = await adminPool.query<{ body: unknown }>(
    `SELECT body FROM artifact.artifact_revision WHERE revision_ref = $1`,
    [revisionRef]
  );
  return result.rows[0]?.body;
}

function feedbackPayload(input: {
  lessonRef: string;
  planRevisionRef: string;
  idempotencyKey: string;
}) {
  return {
    courseRunRef: gate2DemoRefs.courseRunRef,
    lessonRef: input.lessonRef,
    expectedApprovedTeachingPlanRevisionRef: input.planRevisionRef,
    overall: "adjusted",
    pace: "slower",
    studentResponse: "partial_difficulty",
    abnormalSections: ["practice"],
    note: "The independent check took longer than planned.",
    purpose: "lesson-delivery.quick-feedback.generate",
    idempotencyKey: input.idempotencyKey
  };
}

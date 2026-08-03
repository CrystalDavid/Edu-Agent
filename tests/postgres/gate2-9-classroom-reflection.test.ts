import { randomUUID } from "node:crypto";

import { apiRoutes } from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/sample-data";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import { gate25DemoRefs } from "../../scripts/sample/gate2-5-demo-fixture.js";
import { seedSampleData } from "../../scripts/sample/seed-sample-data.js";
import { createProductContainer } from "../../apps/api/src/composition/product-container.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const product = createProductContainer(postgresEnvironment);
const app = createApp({ product });
const demoHeaders = {
  "x-demo-tenant": gate2DemoRefs.tenantRef,
  "x-demo-actor": gate2DemoRefs.teacherRef
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await seedSampleData(postgresEnvironment, {
    includeGate25: true,
    includeGate27: true
  });
});

afterAll(async () => {
  await Promise.all([product.close(), adminPool.end()]);
});

const key = (name: string) => `gate29:${name}:${randomUUID()}`;
let deliverySequence = 0;

const reflectionContent = {
  objectiveAttainment: "等待教师结合课堂事实确认目标达成情况。",
  plannedVsImplemented: "等待教师核对计划与实施差异。",
  effectiveMoves: [],
  ineffectiveMoves: [],
  observationSummary: [],
  evidenceAlignment: [],
  uncertainties: ["尚缺少下一次迁移任务证据"],
  nextLessonSuggestions: [],
  assignmentSuggestions: [],
  teacherNotes: ""
};

async function createConfirmedDelivery(startSuffix: string = randomUUID()) {
  const day = String(++deliverySequence).padStart(2, "0");
  const created = await product.services.classroomReflection.createDelivery({
    tenantRef: gate2DemoRefs.tenantRef,
    actorRef: gate2DemoRefs.teacherRef,
    request: {
      courseRunRef: gate2DemoRefs.courseRunRef,
      lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
      teachingPlanRevisionRef: gate2DemoRefs.teachingPlanRevisionRef,
      calendarEventRef: null,
      actualStartAt: `2026-10-${day}T00:40:00.000Z`,
      actualEndAt: `2026-10-${day}T01:20:00.000Z`,
      steps: [{
        stepKey: `opening-${startSuffix}`,
        sequence: 1,
        title: "课堂导入",
        plannedDescription: "按计划比较图像",
        actualDescription: "教师确认按计划完成",
        disposition: "adopted",
        rationale: ""
      }],
      paceNotes: "",
      unresolvedQuestions: [],
      followUpNotes: "",
      purpose: "lesson-delivery.create",
      idempotencyKey: key(`delivery-${startSuffix}`)
    }
  });
  const confirmed = await product.services.classroomReflection.confirmDelivery({
    tenantRef: gate2DemoRefs.tenantRef,
    actorRef: gate2DemoRefs.teacherRef,
    deliveryRef: created.delivery.deliveryRef,
    request: {
      expectedRevisionVersion: created.delivery.currentDraft!.revisionVersion,
      purpose: "lesson-delivery.confirm",
      idempotencyKey: key(`delivery-confirm-${startSuffix}`)
    }
  });
  return confirmed.delivery;
}

async function createConfirmedObservation(
  deliveryRevisionRef: string,
  content: string
) {
  const created = await product.services.classroomReflection.createObservation({
    tenantRef: gate2DemoRefs.tenantRef,
    actorRef: gate2DemoRefs.teacherRef,
    request: {
      courseRunRef: gate2DemoRefs.courseRunRef,
      lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
      deliveryRevisionRef,
      scope: "learning_objective",
      scopeRef: gate2DemoRefs.objectiveRef,
      observationType: "confusion",
      content,
      observedAt: "2026-10-01T01:00:00.000Z",
      purpose: "classroom-observation.create",
      idempotencyKey: key("observation-helper")
    }
  });
  const confirmed = await product.services.classroomReflection.confirmObservation({
    tenantRef: gate2DemoRefs.tenantRef,
    actorRef: gate2DemoRefs.teacherRef,
    observationRef: created.observation.observationRef,
    request: {
      expectedRevisionVersion: created.observation.currentDraft!.revisionVersion,
      purpose: "classroom-observation.confirm",
      idempotencyKey: key("observation-helper-confirm")
    }
  });
  return confirmed.observation;
}

describe("Gate 2.9 classroom implementation and reflection", () => {
  it("keeps approved plan immutable while confirming delivery facts and an Agent-generated Reflection", async () => {
    const beforePlan = await adminPool.query<{ body: string }>(
      `SELECT body FROM artifact.artifact_revision WHERE revision_ref = $1`,
      [gate2DemoRefs.teachingPlanRevisionRef]
    );
    const created = await request(app)
      .post(apiRoutes.teacher.lessonDeliveries)
      .set(demoHeaders)
      .send({
        courseRunRef: gate2DemoRefs.courseRunRef,
        lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
        teachingPlanRevisionRef: gate2DemoRefs.teachingPlanRevisionRef,
        calendarEventRef: null,
        actualStartAt: "2026-09-18T00:32:00.000Z",
        actualEndAt: "2026-09-18T01:15:00.000Z",
        steps: [
          {
            stepKey: "opening",
            sequence: 1,
            title: "比较三条直线",
            plannedDescription: "按计划比较图像",
            actualDescription: "按计划完成图像比较",
            disposition: "adopted",
            rationale: ""
          },
          {
            stepKey: "independent-check",
            sequence: 2,
            title: "独立解释",
            plannedDescription: "独立解释斜率与方向",
            actualDescription: "延长了个人解释时间",
            disposition: "adjusted",
            rationale: "部分解释仍混淆截距与斜率"
          }
        ],
        paceNotes: "概念辨析比计划多用 5 分钟。",
        unresolvedQuestions: ["新情境中的迁移仍未知"],
        followUpNotes: "下一课安排一个新情境检查。",
        purpose: "lesson-delivery.create",
        idempotencyKey: key("delivery")
      })
      .expect(201);
    const deliveryRef = created.body.delivery.deliveryRef as string;
    const draft = created.body.delivery.currentDraft;
    const confirmed = await request(app)
      .post(apiRoutes.teacher.lessonDeliveryConfirm(deliveryRef))
      .set(demoHeaders)
      .send({
        expectedRevisionVersion: draft.revisionVersion,
        purpose: "lesson-delivery.confirm",
        idempotencyKey: key("confirm-delivery")
      })
      .expect(200);
    const confirmedDelivery = confirmed.body.delivery.currentConfirmed;
    expect(confirmedDelivery.status).toBe("confirmed");
    expect(confirmed.body.delivery.currentDraft).toBeNull();

    const facts = await adminPool.query<{ moves: string; decisions: string }>(
      `SELECT
         (SELECT count(*)::text FROM education.observed_pedagogical_move
           WHERE delivery_revision_ref = $1) AS moves,
         (SELECT count(*)::text
            FROM education.instructional_decision AS decision
            JOIN education.observed_pedagogical_move AS move ON move.move_ref = decision.move_ref
           WHERE move.delivery_revision_ref = $1) AS decisions`,
      [confirmedDelivery.deliveryRevisionRef]
    );
    expect(facts.rows[0]).toEqual({ moves: "2", decisions: "1" });

    const observationCreated = await request(app)
      .post(apiRoutes.teacher.classroomObservations)
      .set(demoHeaders)
      .send({
        courseRunRef: gate2DemoRefs.courseRunRef,
        lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
        deliveryRevisionRef: confirmedDelivery.deliveryRevisionRef,
        scope: "learning_objective",
        scopeRef: gate2DemoRefs.objectiveRef,
        observationType: "confusion",
        content: "部分匿名学习者仍把截距变化与斜率变化混淆。",
        observedAt: "2026-09-18T01:05:00.000Z",
        purpose: "classroom-observation.create",
        idempotencyKey: key("observation")
      })
      .expect(201);
    const observationRef = observationCreated.body.observation.observationRef as string;
    const observationConfirmed = await request(app)
      .post(apiRoutes.teacher.classroomObservationConfirm(observationRef))
      .set(demoHeaders)
      .send({
        expectedRevisionVersion:
          observationCreated.body.observation.currentDraft.revisionVersion,
        purpose: "classroom-observation.confirm",
        idempotencyKey: key("confirm-observation")
      })
      .expect(200);
    const observationRevisionRef =
      observationConfirmed.body.observation.currentConfirmed.observationRevisionRef as string;

    const reflectionCreated = await request(app)
      .post(apiRoutes.teacher.reflections)
      .set(demoHeaders)
      .send({
        courseRunRef: gate2DemoRefs.courseRunRef,
        lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
        teachingPlanRevisionRef: gate2DemoRefs.teachingPlanRevisionRef,
        deliveryRevisionRef: confirmedDelivery.deliveryRevisionRef,
        observationRevisionRefs: [observationRevisionRef],
        assignmentEvidenceRefs: [],
        content: reflectionContent,
        purpose: "lesson-reflection.create-draft",
        idempotencyKey: key("reflection")
      })
      .expect(201);
    const reflectionRef = reflectionCreated.body.reflection.reflectionRef as string;

    const generation = await product.services.modelInvocations.createReflectionInvocation({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      request: {
        reflectionRef,
        expectedDraftRevisionNumber:
          reflectionCreated.body.reflection.currentDraft.revisionNumber,
        teacherNotes: "请只基于已确认事实整理反思，并保留未知项。",
        purpose: "lesson-reflection.generate",
        idempotencyKey: key("generate-reflection")
      }
    });
    await product.workers.copilotOutbox.processAvailable(40);

    const execution = await request(app)
      .get(apiRoutes.teacher.modelInvocation(generation.modelExecutionRef))
      .set(demoHeaders)
      .expect(200);
    expect(execution.body).toEqual(expect.objectContaining({
      status: "succeeded",
      provider: "mock",
      resultKind: "lesson_reflection_draft",
      resultRef: expect.any(String),
      proposalRevisionRef: null
    }));

    const generated = await request(app)
      .get(apiRoutes.teacher.reflection(reflectionRef))
      .set(demoHeaders)
      .expect(200);
    expect(generated.body.currentDraft.sourceAgentRunRef).toBeTruthy();
    expect(generated.body.currentDraft.revisionNumber).toBe(2);
    expect(generated.body.currentConfirmed).toBeNull();

    const confirmedReflection = await request(app)
      .post(apiRoutes.teacher.reflectionConfirm(reflectionRef))
      .set(demoHeaders)
      .send({
        expectedRevisionNumber: generated.body.currentDraft.revisionNumber,
        purpose: "lesson-reflection.confirm",
        idempotencyKey: key("confirm-reflection")
      })
      .expect(200);
    expect(confirmedReflection.body.reflection.currentConfirmed.status).toBe("confirmed");

    const followUp = await request(app)
      .post(apiRoutes.teacher.reflectionFollowUps(reflectionRef))
      .set(demoHeaders)
      .send({
        reflectionRevisionRef:
          confirmedReflection.body.reflection.currentConfirmed.reflectionRevisionRef,
        actionType: "teacher_todo",
        title: "整理本节课反思中的后续材料",
        description: "教师显式创建，不由 Agent 自动完成。",
        priority: "normal",
        dueAt: null,
        purpose: "lesson-reflection.create-follow-up",
        idempotencyKey: key("follow-up")
      })
      .expect(201);
    expect(followUp.body.actionType).toBe("teacher_todo");

    const afterPlan = await adminPool.query<{ body: string }>(
      `SELECT body FROM artifact.artifact_revision WHERE revision_ref = $1`,
      [gate2DemoRefs.teachingPlanRevisionRef]
    );
    expect(afterPlan.rows[0]?.body).toBe(beforePlan.rows[0]?.body);

    const summary = await request(app)
      .get(apiRoutes.teacher.lessonImplementationSummary(gate25DemoRefs.lessonRefs.slopeAndGraph))
      .set(demoHeaders)
      .expect(200);
    expect(summary.body.currentDelivery.status).toBe("confirmed");
    expect(summary.body.reflection.currentConfirmed.status).toBe("confirmed");
    expect(summary.body.reflectionPending).toBe(false);
  });

  it("keeps confirmed records immutable and returns structured conflicts", async () => {
    const created = await product.services.classroomReflection.createDelivery({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      request: {
        courseRunRef: gate2DemoRefs.courseRunRef,
        lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
        teachingPlanRevisionRef: gate2DemoRefs.teachingPlanRevisionRef,
        calendarEventRef: null,
        actualStartAt: "2026-09-18T00:32:00.000Z",
        actualEndAt: "2026-09-18T01:15:00.000Z",
        steps: [{
          stepKey: "opening", sequence: 1, title: "导入",
          plannedDescription: "计划导入", actualDescription: "实际导入",
          disposition: "adopted", rationale: ""
        }],
        paceNotes: "", unresolvedQuestions: [], followUpNotes: "",
        purpose: "lesson-delivery.create", idempotencyKey: key("immutable")
      }
    });
    const draft = created.delivery.currentDraft!;
    const confirmed = await product.services.classroomReflection.confirmDelivery({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      deliveryRef: created.delivery.deliveryRef,
      request: {
        expectedRevisionVersion: draft.revisionVersion,
        purpose: "lesson-delivery.confirm",
        idempotencyKey: key("immutable-confirm")
      }
    });
    await expect(adminPool.query(
      `UPDATE education.lesson_delivery_revision
          SET pace_notes = 'forbidden overwrite'
        WHERE delivery_revision_ref = $1`,
      [confirmed.delivery.currentConfirmed!.deliveryRevisionRef]
    )).rejects.toThrow(/immutable/i);
    await expect(product.services.classroomReflection.updateDeliveryDraft({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      deliveryRef: created.delivery.deliveryRef,
      request: {
        teachingPlanRevisionRef: gate2DemoRefs.teachingPlanRevisionRef,
        calendarEventRef: null,
        actualStartAt: "2026-09-18T00:32:00.000Z",
        actualEndAt: "2026-09-18T01:15:00.000Z",
        steps: draft.steps,
        paceNotes: "attempted overwrite",
        unresolvedQuestions: [], followUpNotes: "",
        expectedRevisionVersion: draft.revisionVersion,
        purpose: "lesson-delivery.update-draft",
        idempotencyKey: key("immutable-update")
      }
    })).rejects.toMatchObject({ code: "LESSON_DELIVERY_DRAFT_REQUIRED" });
  });

  it("serializes a classroom session and allows only one concurrent confirmation", async () => {
    const command = {
      courseRunRef: gate2DemoRefs.courseRunRef,
      lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
      teachingPlanRevisionRef: gate2DemoRefs.teachingPlanRevisionRef,
      calendarEventRef: null,
      actualStartAt: "2026-10-02T00:35:00.000Z",
      actualEndAt: "2026-10-02T01:15:00.000Z",
      steps: [{
        stepKey: "session-unique",
        sequence: 1,
        title: "Compare graph changes",
        plannedDescription: "Compare positive and negative slopes.",
        actualDescription: "Teacher recorded the comparison as implemented.",
        disposition: "adopted" as const,
        rationale: ""
      }],
      paceNotes: "",
      unresolvedQuestions: [],
      followUpNotes: "",
      purpose: "lesson-delivery.create" as const,
      idempotencyKey: key("session-first")
    };
    const created = await product.services.classroomReflection.createDelivery({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      request: command
    });

    await request(app)
      .post(apiRoutes.teacher.lessonDeliveries)
      .set(demoHeaders)
      .send({ ...command, idempotencyKey: key("session-duplicate") })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe("LESSON_DELIVERY_SESSION_EXISTS");
        expect(body.details.deliveryRef).toBe(created.delivery.deliveryRef);
      });

    const expectedRevisionVersion = created.delivery.currentDraft!.revisionVersion;
    const confirmations = await Promise.allSettled([
      product.services.classroomReflection.confirmDelivery({
        tenantRef: gate2DemoRefs.tenantRef,
        actorRef: gate2DemoRefs.teacherRef,
        deliveryRef: created.delivery.deliveryRef,
        request: {
          expectedRevisionVersion,
          purpose: "lesson-delivery.confirm",
          idempotencyKey: key("concurrent-confirm-a")
        }
      }),
      product.services.classroomReflection.confirmDelivery({
        tenantRef: gate2DemoRefs.tenantRef,
        actorRef: gate2DemoRefs.teacherRef,
        deliveryRef: created.delivery.deliveryRef,
        request: {
          expectedRevisionVersion,
          purpose: "lesson-delivery.confirm",
          idempotencyKey: key("concurrent-confirm-b")
        }
      })
    ]);
    expect(confirmations.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(confirmations.filter((item) => item.status === "rejected")).toHaveLength(1);
    const rejected = confirmations.find((item) => item.status === "rejected") as PromiseRejectedResult;
    expect(["LESSON_DELIVERY_DRAFT_REQUIRED", "LESSON_DELIVERY_VERSION_CONFLICT"])
      .toContain(rejected.reason.code);

    const persisted = await product.services.classroomReflection.getDelivery({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      deliveryRef: created.delivery.deliveryRef
    });
    expect(persisted.currentConfirmed).not.toBeNull();
    expect(persisted.history.filter((revision) => revision.status === "confirmed")).toHaveLength(1);
  });

  it("preserves delivery and observation history when a teacher confirms amendments", async () => {
    const original = await createConfirmedDelivery("history");
    const originalRevision = original.currentConfirmed!;
    const amendment = await product.services.classroomReflection.amendDelivery({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      deliveryRef: original.deliveryRef,
      request: {
        teachingPlanRevisionRef: originalRevision.teachingPlanRevisionRef,
        calendarEventRef: null,
        actualStartAt: originalRevision.actualStartAt,
        actualEndAt: originalRevision.actualEndAt,
        steps: originalRevision.steps.map((step) => ({
          ...step,
          actualDescription: `${step.actualDescription} (teacher amendment)`,
          disposition: "adjusted" as const,
          rationale: "Teacher confirmed the revised implementation fact."
        })),
        paceNotes: "Amended after teacher review.",
        unresolvedQuestions: ["Retain the original confirmed record."],
        followUpNotes: "",
        parentRevisionRef: originalRevision.deliveryRevisionRef,
        expectedAggregateVersion: original.aggregateVersion,
        purpose: "lesson-delivery.amend",
        idempotencyKey: key("delivery-amend")
      }
    });
    const amended = await product.services.classroomReflection.confirmDelivery({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      deliveryRef: original.deliveryRef,
      request: {
        expectedRevisionVersion: amendment.delivery.currentDraft!.revisionVersion,
        purpose: "lesson-delivery.confirm",
        idempotencyKey: key("delivery-amend-confirm")
      }
    });
    expect(amended.delivery.currentConfirmed!.parentRevisionRef)
      .toBe(originalRevision.deliveryRevisionRef);
    expect(amended.delivery.history.find(
      (item) => item.deliveryRevisionRef === originalRevision.deliveryRevisionRef
    )?.status).toBe("superseded");

    const originalObservation = await createConfirmedObservation(
      amended.delivery.currentConfirmed!.deliveryRevisionRef,
      "Some learners confused intercept and slope."
    );
    const originalObservationRevision = originalObservation.currentConfirmed!;
    const superseded = await product.services.classroomReflection.supersedeObservation({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      observationRef: originalObservation.observationRef,
      request: {
        deliveryRevisionRef: originalObservationRevision.deliveryRevisionRef,
        scope: originalObservationRevision.scope,
        scopeRef: originalObservationRevision.scopeRef,
        observationType: originalObservationRevision.observationType,
        content: "Teacher amended the observation: the confusion appeared in two examples only.",
        observedAt: originalObservationRevision.observedAt,
        parentRevisionRef: originalObservationRevision.observationRevisionRef,
        expectedAggregateVersion: originalObservation.aggregateVersion,
        purpose: "classroom-observation.supersede",
        idempotencyKey: key("observation-supersede")
      }
    });
    const reconfirmed = await product.services.classroomReflection.confirmObservation({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      observationRef: originalObservation.observationRef,
      request: {
        expectedRevisionVersion: superseded.observation.currentDraft!.revisionVersion,
        purpose: "classroom-observation.confirm",
        idempotencyKey: key("observation-reconfirm")
      }
    });
    expect(reconfirmed.observation.currentConfirmed!.parentRevisionRef)
      .toBe(originalObservationRevision.observationRevisionRef);
    expect(reconfirmed.observation.history.find(
      (item) => item.observationRevisionRef === originalObservationRevision.observationRevisionRef
    )?.status).toBe("superseded");
  });

  it("seals only selected classroom facts, replays generation, and creates one explicit follow-up", async () => {
    const delivery = await createConfirmedDelivery("selected-context");
    const selectedObservation = await createConfirmedObservation(
      delivery.currentConfirmed!.deliveryRevisionRef,
      "Selected confirmed observation."
    );
    const unselectedObservation = await createConfirmedObservation(
      delivery.currentConfirmed!.deliveryRevisionRef,
      "Unselected confirmed observation."
    );
    const selectedRevisionRef = selectedObservation.currentConfirmed!.observationRevisionRef;
    const unselectedRevisionRef = unselectedObservation.currentConfirmed!.observationRevisionRef;
    const reflection = await product.services.classroomReflection.createReflectionDraft({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      request: {
        courseRunRef: gate2DemoRefs.courseRunRef,
        lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
        teachingPlanRevisionRef: gate2DemoRefs.teachingPlanRevisionRef,
        deliveryRevisionRef: delivery.currentConfirmed!.deliveryRevisionRef,
        observationRevisionRefs: [selectedRevisionRef],
        assignmentEvidenceRefs: [],
        content: reflectionContent,
        purpose: "lesson-reflection.create-draft",
        idempotencyKey: key("selected-reflection")
      }
    });
    const generationKey = key("selected-generation");
    const generation = await product.services.modelInvocations.createReflectionInvocation({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      request: {
        reflectionRef: reflection.reflection.reflectionRef,
        expectedDraftRevisionNumber: reflection.reflection.currentDraft!.revisionNumber,
        teacherNotes: "Use only explicitly selected confirmed facts.",
        purpose: "lesson-reflection.generate",
        idempotencyKey: generationKey
      }
    });
    const replay = await product.services.modelInvocations.createReflectionInvocation({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      request: {
        reflectionRef: reflection.reflection.reflectionRef,
        expectedDraftRevisionNumber: reflection.reflection.currentDraft!.revisionNumber,
        teacherNotes: "Use only explicitly selected confirmed facts.",
        purpose: "lesson-reflection.generate",
        idempotencyKey: generationKey
      }
    });
    expect(replay).toMatchObject({
      replayed: true,
      modelExecutionRef: generation.modelExecutionRef
    });

    const manifest = await adminPool.query<{
      resource_refs: string[];
      evidence_refs: string[];
      authorized_context_plan_ref: string;
    }>(
      `SELECT resource_refs, evidence_refs, authorized_context_plan_ref
         FROM runtime.context_manifest
        WHERE context_manifest_ref = $1`,
      [generation.contextManifestRef]
    );
    expect(manifest.rows[0]?.resource_refs).toContain(selectedRevisionRef);
    expect(manifest.rows[0]?.resource_refs).not.toContain(unselectedRevisionRef);
    expect(manifest.rows[0]?.evidence_refs).toEqual([]);
    expect(manifest.rows[0]?.authorized_context_plan_ref)
      .toBe(generation.authorizedContextPlanRef);

    await product.workers.copilotOutbox.processAvailable(40);
    await product.workers.copilotOutbox.processAvailable(40);
    const generated = await product.services.classroomReflection.getReflection({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      reflectionRef: reflection.reflection.reflectionRef
    });
    expect(generated.generationStatus).toBe("draft_ready");
    expect(generated.currentModelExecutionRef).toBe(generation.modelExecutionRef);
    expect(generated.history.filter((item) => item.sourceAgentRunRef)).toHaveLength(1);

    const confirmed = await product.services.classroomReflection.confirmReflection({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      reflectionRef: generated.reflectionRef,
      request: {
        expectedRevisionNumber: generated.currentDraft!.revisionNumber,
        purpose: "lesson-reflection.confirm",
        idempotencyKey: key("selected-confirm")
      }
    });
    await expect(adminPool.query(
      `UPDATE artifact.lesson_reflection_scope
          SET confirmed_by = 'actor:forbidden'
        WHERE revision_ref = $1`,
      [confirmed.reflection.currentConfirmed!.reflectionRevisionRef]
    )).rejects.toThrow(/immutable/i);
    const existingPreparation = await product.services.lessonPreparation.createTask({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      request: {
        lessonRef: gate25DemoRefs.lessonRefs.coefficientMethod,
        priority: "normal",
        dueAt: null,
        purpose: "lesson-preparation.create",
        idempotencyKey: key("existing-follow-up-preparation")
      }
    });
    const existingEvidenceRefs = existingPreparation.task.workingSet.evidenceRefs;
    const followUpKey = key("selected-follow-up");
    const followUpRequest = {
      reflectionRevisionRef: confirmed.reflection.currentConfirmed!.reflectionRevisionRef,
      actionType: "lesson_preparation" as const,
      targetLessonRef: gate25DemoRefs.lessonRefs.coefficientMethod,
      priority: "normal" as const,
      dueAt: null,
      purpose: "lesson-reflection.create-follow-up" as const,
      idempotencyKey: followUpKey
    };
    const followUp = await product.services.classroomReflection.createFollowUp({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      reflectionRef: generated.reflectionRef,
      request: followUpRequest
    });
    const followUpReplay = await product.services.classroomReflection.createFollowUp({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      reflectionRef: generated.reflectionRef,
      request: followUpRequest
    });
    expect(followUpReplay).toMatchObject({
      replayed: true,
      followUpRef: followUp.followUpRef,
      targetRef: followUp.targetRef
    });
    expect(followUp.targetRef).toBe(existingPreparation.task.taskRef);

    const task = await product.services.lessonPreparation.getTask({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      taskRef: followUp.targetRef
    });
    expect(task.workingSet).toMatchObject({
      sourceReflectionRef: generated.reflectionRef,
      sourceDeliveryRevisionRef: delivery.currentConfirmed!.deliveryRevisionRef,
      sourceObservationRevisionRefs: [selectedRevisionRef]
    });
    expect(task.workingSet.evidenceRefs).toEqual(
      expect.arrayContaining(existingEvidenceRefs)
    );
    const links = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM work.reflection_follow_up_link
        WHERE reflection_revision_ref = $1`,
      [confirmed.reflection.currentConfirmed!.reflectionRevisionRef]
    );
    expect(links.rows[0]?.count).toBe("1");
  });

  it("denies another tenant before exposing classroom facts", async () => {
    const delivery = await createConfirmedDelivery("tenant-isolation");
    await request(app)
      .get(apiRoutes.teacher.lessonDelivery(delivery.deliveryRef))
      .set({
        "x-demo-tenant": "tenant:other-school",
        "x-demo-actor": gate2DemoRefs.teacherRef
      })
      .expect(403);
  });
});

import { randomUUID } from "node:crypto";

import { apiRoutes } from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/demo-fixtures";
import request from "supertest";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import {
  gate25DemoRefs
} from "../../apps/api/src/composition/gate2-5-demo-fixture.js";
import {
  createProductContainer
} from "../../apps/api/src/composition/product-container.js";
import {
  LocalCopilotOutboxWorker
} from "../../apps/api/src/composition/local-copilot-outbox-worker.js";
import {
  PostgresOutboxWorker
} from "../../apps/api/src/platform/postgres/outbox-worker.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const workerPool = poolFor("worker");
const product = createProductContainer(postgresEnvironment);
const app = createApp({ product });
const demoHeaders = {
  "x-demo-tenant": gate2DemoRefs.tenantRef,
  "x-demo-actor": gate2DemoRefs.teacherRef
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await product.services.seed.seed({ includeGate25: true });
});

afterAll(async () => {
  await Promise.all([
    product.close(),
    adminPool.end(),
    workerPool.end()
  ]);
});

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function createAndStartSlopeTask() {
  const created = await request(app)
    .post(apiRoutes.teacher.preparationTasks)
    .set(demoHeaders)
    .send({
      lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
      dueAt: null,
      priority: "high",
      purpose: "lesson-preparation.create",
      idempotencyKey: `gate25:create:${randomUUID()}`
    })
    .expect(201);
  const started = await request(app)
    .post(
      apiRoutes.teacher.preparationTaskStart(
        created.body.task.taskRef
      )
    )
    .set(demoHeaders)
    .send({
      expectedVersion: created.body.task.version,
      purpose: "lesson-preparation.start",
      idempotencyKey: `gate25:start:${randomUUID()}`
    })
    .expect(201);
  return started.body.task;
}

async function createProposal(task: {
  taskRef: string;
  version: number;
  courseRunRef: string;
  curriculumUnitRef: string;
  lessonRef: string;
  workingSet: {
    version: number;
    learningObjectiveRefs: string[];
    evidenceRefs: string[];
  };
}) {
  return request(app)
    .post(apiRoutes.demo.createTeacherCopilotTask)
    .set(demoHeaders)
    .send({
      requestText:
        "请强化斜率变化与图像陡峭程度的联系，并保留独立检查。",
      courseRunRef: task.courseRunRef,
      goalRef: gate2DemoRefs.goalRef,
      learningObjectiveRefs:
        task.workingSet.learningObjectiveRefs,
      selectedEvidenceRefs: task.workingSet.evidenceRefs,
      requestVersion: 1,
      purpose: "teacher-copilot.adjust-next-lesson",
      idempotencyKey: `gate25:proposal:${randomUUID()}`,
      preparationTaskRef: task.taskRef,
      curriculumUnitRef: task.curriculumUnitRef,
      lessonRef: task.lessonRef,
      workingSetVersion: task.workingSet.version,
      expectedPreparationTaskVersion: task.version
    })
    .expect(201);
}

describe("Gate 2.5 recoverable lesson preparation", () => {
  it("persists the minimal CourseRun → Unit → Lesson seed and a Work-owned Task", async () => {
    const courses = await request(app)
      .get(apiRoutes.teacher.courseRuns)
      .set(demoHeaders)
      .expect(200);
    expect(courses.body.items).toEqual([
      expect.objectContaining({
        courseRunRef: gate2DemoRefs.courseRunRef,
        className: "八年级 3 班",
        subject: "数学",
        academicTerm: "当前学期"
      })
    ]);
    await request(app)
      .get(
        apiRoutes.teacher.courseRun(
          gate2DemoRefs.courseRunRef
        )
      )
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.title).toBe(
          "八年级 3 班数学 · 当前学期"
        );
      });

    const units = await request(app)
      .get(
        apiRoutes.teacher.courseRunUnits(
          gate2DemoRefs.courseRunRef
        )
      )
      .set(demoHeaders)
      .expect(200);
    expect(units.body.items).toHaveLength(1);
    expect(units.body.items[0].title).toBe("一次函数");
    await request(app)
      .get(apiRoutes.teacher.unit(gate25DemoRefs.unitRef))
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.courseRunRef).toBe(
          gate2DemoRefs.courseRunRef
        );
      });

    const lessons = await request(app)
      .get(apiRoutes.teacher.unitLessons(gate25DemoRefs.unitRef))
      .set(demoHeaders)
      .expect(200);
    expect(lessons.body.items.map((item: { title: string }) => item.title))
      .toEqual([
        "变量与函数",
        "一次函数的概念",
        "斜率与图像变化",
        "待定系数法",
        "一次函数的应用"
      ]);
    expect(
      lessons.body.items.find(
        (item: { lessonRef: string }) =>
          item.lessonRef ===
          gate25DemoRefs.lessonRefs.slopeAndGraph
      )
    ).toMatchObject({
      learningObjectives: [
        expect.objectContaining({
          objectiveRef: gate2DemoRefs.objectiveRef
        })
      ],
      currentEvidenceRefs: expect.arrayContaining([
        ...gate2DemoRefs.observationRefs,
        ...gate2DemoRefs.claimRefs
      ]),
      currentApprovedPlanRef:
        gate2DemoRefs.teachingPlanRevisionRef
    });
    await request(app)
      .get(
        apiRoutes.teacher.lesson(
          gate25DemoRefs.lessonRefs.slopeAndGraph
        )
      )
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.title).toBe("斜率与图像变化");
        expect(body.learningObjectives).toHaveLength(1);
      });

    const tasks = await request(app)
      .get(apiRoutes.teacher.preparationTasks)
      .set(demoHeaders)
      .expect(200);
    expect(tasks.body.items).toContainEqual(
      expect.objectContaining({
        taskRef: gate25DemoRefs.seededPreparationTaskRef,
        taskType: "lesson_preparation",
        status: "planned"
      })
    );
  });

  it("creates one idempotent Task per command and requires explicit cancel/reopen transitions", async () => {
    const createCommand = {
      lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
      dueAt: "2026-09-18T00:30:00.000Z",
      priority: "high",
      purpose: "lesson-preparation.create",
      idempotencyKey: `gate25:idempotent-create:${randomUUID()}`
    } as const;
    const created = await request(app)
      .post(apiRoutes.teacher.preparationTasks)
      .set(demoHeaders)
      .send(createCommand)
      .expect(201);
    await request(app)
      .post(apiRoutes.teacher.preparationTasks)
      .set(demoHeaders)
      .send(createCommand)
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
        expect(body.task.taskRef).toBe(
          created.body.task.taskRef
        );
      });
    await request(app)
      .post(apiRoutes.teacher.preparationTasks)
      .set(demoHeaders)
      .send({ ...createCommand, priority: "normal" })
      .expect(409);

    await request(app)
      .post(
        apiRoutes.teacher.preparationTaskComplete(
          created.body.task.taskRef
        )
      )
      .set(demoHeaders)
      .send({
        expectedVersion: created.body.task.version,
        purpose: "lesson-preparation.complete",
        idempotencyKey: `gate25:invalid-complete:${randomUUID()}`
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe(
          "LESSON_PREPARATION_INVALID_TRANSITION"
        );
      });

    const cancelled = await request(app)
      .post(
        apiRoutes.teacher.preparationTaskCancel(
          created.body.task.taskRef
        )
      )
      .set(demoHeaders)
      .send({
        expectedVersion: created.body.task.version,
        purpose: "lesson-preparation.cancel",
        idempotencyKey: `gate25:cancel:${randomUUID()}`
      })
      .expect(201);
    expect(cancelled.body.task.status).toBe("cancelled");
    const reopened = await request(app)
      .post(
        apiRoutes.teacher.preparationTaskReopen(
          created.body.task.taskRef
        )
      )
      .set(demoHeaders)
      .send({
        expectedVersion: cancelled.body.task.version,
        purpose: "lesson-preparation.reopen",
        idempotencyKey: `gate25:reopen:${randomUUID()}`
      })
      .expect(201);
    expect(reopened.body.task.status).toBe("in_progress");
    expect(
      reopened.body.task.history.map(
        (entry: { toStatus: string }) => entry.toStatus
      )
    ).toEqual(["planned", "cancelled", "in_progress"]);
  });

  it("recovers Proposal review, approves separately, completes explicitly, and preserves a rejection", async () => {
    const started = await createAndStartSlopeTask();
    const createdProposal = await createProposal(started);
    expect(createdProposal.body).toMatchObject({
      taskRef: started.taskRef,
      preparationTaskRef: started.taskRef,
      lessonRef: started.lessonRef,
      request: {
        requestText:
          "请强化斜率变化与图像陡峭程度的联系，并保留独立检查。",
        preparationTaskRef: started.taskRef,
        lessonRef: started.lessonRef
      }
    });

    const recovered = await request(app)
      .get(
        apiRoutes.demo.proposalDetail(
          createdProposal.body.proposalRevisionRef
        )
      )
      .set(demoHeaders)
      .expect(200);
    expect(recovered.body.request.preparationTaskRef).toBe(
      started.taskRef
    );
    expect(recovered.body.taskRunRef).toBe(
      createdProposal.body.taskRunRef
    );

    const taskAwaiting = await request(app)
      .get(apiRoutes.teacher.preparationTask(started.taskRef))
      .set(demoHeaders)
      .expect(200);
    expect(taskAwaiting.body.status).toBe(
      "awaiting_plan_review"
    );

    const strategy = recovered.body.strategies[0];
    const disposition = await request(app)
      .post(
        apiRoutes.demo.suggestionDisposition(
          recovered.body.proposalRevisionRef
        )
      )
      .set(demoHeaders)
      .send({
        purpose: "teacher-copilot.review-suggestion",
        idempotencyKey: `gate25:review:${randomUUID()}`,
        disposition: "accepted_with_changes",
        selectedStrategyId: strategy.strategyId,
        teacherEdits: {
          lessonFocus:
            "教师修改：比较同方向直线的斜率绝对值与陡峭程度。"
        },
        expectedProposalRevisionNumber:
          recovered.body.proposalRevisionNumber
      })
      .expect(201);
    expect(disposition.body.resultingRevision.state).toBe(
      "in_review"
    );

    const beforeApproval = await request(app)
      .get(
        apiRoutes.teacher.lessonTeachingPlans(started.lessonRef)
      )
      .set(demoHeaders)
      .expect(200);
    expect(beforeApproval.body.currentApproved.revisionRef).toBe(
      gate2DemoRefs.teachingPlanRevisionRef
    );
    expect(beforeApproval.body.activeInReview.revisionRef).toBe(
      disposition.body.resultingRevision.revisionRef
    );

    const currentTask = await request(app)
      .get(apiRoutes.teacher.preparationTask(started.taskRef))
      .set(demoHeaders)
      .expect(200);
    const approval = await request(app)
      .post(
        apiRoutes.demo.approveTeachingPlan(
          disposition.body.resultingRevision.revisionRef
        )
      )
      .set(demoHeaders)
      .send({
        purpose: "teacher-copilot.approve-plan",
        idempotencyKey: `gate25:approve:${randomUUID()}`,
        expectedInReviewRevisionRef:
          disposition.body.resultingRevision.revisionRef,
        preparationTaskRef: started.taskRef,
        expectedTaskVersion: currentTask.body.version
      })
      .expect(201);
    expect(approval.body.preparationStatus).toBe("ready_for_use");

    const afterApproval = await request(app)
      .get(
        apiRoutes.teacher.lessonTeachingPlans(started.lessonRef)
      )
      .set(demoHeaders)
      .expect(200);
    expect(afterApproval.body.currentApproved.revisionRef).toBe(
      approval.body.approvedRevision.revisionRef
    );
    expect(afterApproval.body.activeInReview).toBeNull();
    expect(
      afterApproval.body.history.map(
        (revision: { revisionRef: string }) =>
          revision.revisionRef
      )
    ).toContain(gate2DemoRefs.teachingPlanRevisionRef);

    const readyTask = await request(app)
      .get(apiRoutes.teacher.preparationTask(started.taskRef))
      .set(demoHeaders)
      .expect(200);
    expect(readyTask.body.status).toBe("ready_for_use");
    const completeCommand = {
      expectedVersion: readyTask.body.version,
      purpose: "lesson-preparation.complete",
      idempotencyKey: `gate25:complete:${randomUUID()}`
    };
    const completed = await request(app)
      .post(
        apiRoutes.teacher.preparationTaskComplete(started.taskRef)
      )
      .set(demoHeaders)
      .send(completeCommand)
      .expect(201);
    expect(completed.body.task.status).toBe("completed");
    const completedReplay = await request(app)
      .post(
        apiRoutes.teacher.preparationTaskComplete(started.taskRef)
      )
      .set(demoHeaders)
      .send(completeCommand)
      .expect(200);
    expect(completedReplay.body.replayed).toBe(true);

    const freshProduct = createProductContainer(postgresEnvironment);
    try {
      const freshApp = createApp({ product: freshProduct });
      await request(freshApp)
        .get(apiRoutes.teacher.preparationTask(started.taskRef))
        .set(demoHeaders)
        .expect(200)
        .expect(({ body }) => {
          expect(body.status).toBe("completed");
          expect(body.approvedPlanRef).toBe(
            approval.body.approvedRevision.revisionRef
          );
        });
    } finally {
      await freshProduct.close();
    }

    const completedDetail = await request(app)
      .get(apiRoutes.teacher.preparationTask(started.taskRef))
      .set(demoHeaders)
      .expect(200);
    const secondProposal = await createProposal(completedDetail.body);
    const secondReview = await request(app)
      .get(
        apiRoutes.demo.proposalDetail(
          secondProposal.body.proposalRevisionRef
        )
      )
      .set(demoHeaders)
      .expect(200);
    await request(app)
      .post(
        apiRoutes.demo.suggestionDisposition(
          secondReview.body.proposalRevisionRef
        )
      )
      .set(demoHeaders)
      .send({
        purpose: "teacher-copilot.review-suggestion",
        idempotencyKey:
          `gate25:completed-accept:${randomUUID()}`,
        disposition: "accepted",
        selectedStrategyId:
          secondReview.body.strategies[0].strategyId,
        teacherEdits: {},
        expectedProposalRevisionNumber:
          secondReview.body.proposalRevisionNumber
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe(
          "LESSON_PREPARATION_REOPEN_REQUIRED"
        );
      });
    await request(app)
      .post(
        apiRoutes.demo.suggestionDisposition(
          secondReview.body.proposalRevisionRef
        )
      )
      .set(demoHeaders)
      .send({
        purpose: "teacher-copilot.review-suggestion",
        idempotencyKey: `gate25:reject:${randomUUID()}`,
        disposition: "rejected",
        selectedStrategyId:
          secondReview.body.strategies[0].strategyId,
        teacherEdits: {},
        expectedProposalRevisionNumber:
          secondReview.body.proposalRevisionNumber
      })
      .expect(201);

    const afterReject = await request(app)
      .get(
        apiRoutes.teacher.lessonTeachingPlans(started.lessonRef)
      )
      .set(demoHeaders)
      .expect(200);
    expect(afterReject.body.currentApproved.revisionRef).toBe(
      approval.body.approvedRevision.revisionRef
    );
    await request(app)
      .get(apiRoutes.teacher.preparationTask(started.taskRef))
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("completed");
      });
  });

  it("versions the TaskWorkingSet and seals a newly authorized context for every run", async () => {
    const started = await createAndStartSlopeTask();
    await request(app)
      .post(apiRoutes.demo.createTeacherCopilotTask)
      .set(demoHeaders)
      .send({
        requestText: "这是一条使用陈旧 Task version 的请求。",
        courseRunRef: started.courseRunRef,
        goalRef: gate2DemoRefs.goalRef,
        learningObjectiveRefs:
          started.workingSet.learningObjectiveRefs,
        selectedEvidenceRefs:
          started.workingSet.evidenceRefs,
        requestVersion: 1,
        purpose: "teacher-copilot.adjust-next-lesson",
        idempotencyKey:
          `gate25:stale-task-version:${randomUUID()}`,
        preparationTaskRef: started.taskRef,
        curriculumUnitRef: started.curriculumUnitRef,
        lessonRef: started.lessonRef,
        workingSetVersion: started.workingSet.version,
        expectedPreparationTaskVersion: started.version - 1
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe(
          "LESSON_PREPARATION_VERSION_CONFLICT"
        );
      });
    const originalWorkingSet = await request(app)
      .get(apiRoutes.teacher.taskWorkingSet(started.taskRef))
      .set(demoHeaders)
      .expect(200);
    expect(originalWorkingSet.body).toMatchObject({
      taskRef: started.taskRef,
      courseRunRef: started.courseRunRef,
      curriculumUnitRef: started.curriculumUnitRef,
      lessonRef: started.lessonRef,
      baselineTeachingPlanRef:
        gate2DemoRefs.teachingPlanRevisionRef
    });
    const removedEvidenceRef =
      originalWorkingSet.body.evidenceRefs[0];
    const removeCommand = {
      resourceKind: "evidence",
      resourceRef: removedEvidenceRef,
      expectedWorkingSetVersion:
        originalWorkingSet.body.version,
      purpose: "lesson-preparation.context.remove",
      idempotencyKey: `gate25:context-remove:${randomUUID()}`
    };
    const removed = await request(app)
      .delete(
        apiRoutes.teacher.taskResourceSelections(started.taskRef)
      )
      .set(demoHeaders)
      .send(removeCommand)
      .expect(201);
    expect(removed.body.workingSet.version).toBe(
      originalWorkingSet.body.version + 1
    );
    expect(removed.body.workingSet.evidenceRefs).not.toContain(
      removedEvidenceRef
    );

    await request(app)
      .delete(
        apiRoutes.teacher.taskResourceSelections(started.taskRef)
      )
      .set(demoHeaders)
      .send(removeCommand)
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
        expect(body.workingSet).toEqual(
          removed.body.workingSet
        );
      });

    const addCommand = {
      resourceKind: "evidence",
      resourceRef: removedEvidenceRef,
      expectedWorkingSetVersion:
        removed.body.workingSet.version,
      purpose: "lesson-preparation.context.add",
      idempotencyKey: `gate25:context-add:${randomUUID()}`
    };
    const restored = await request(app)
      .post(
        apiRoutes.teacher.taskResourceSelections(started.taskRef)
      )
      .set(demoHeaders)
      .send(addCommand)
      .expect(201);
    expect(restored.body.workingSet.version).toBe(
      removed.body.workingSet.version + 1
    );

    const proposal = await createProposal({
      ...started,
      workingSet: restored.body.workingSet
    });
    const authorized = await request(app)
      .get(
        apiRoutes.teacher.taskAuthorizedContextPlan(
          started.taskRef
        )
      )
      .set(demoHeaders)
      .expect(200);
    expect(authorized.body).toMatchObject({
      taskRef: started.taskRef,
      taskRunRef: proposal.body.taskRunRef,
      workingSetVersion: restored.body.workingSet.version,
      authorizedEvidenceRefs:
        restored.body.workingSet.evidenceRefs
    });
    const manifest = await request(app)
      .get(
        apiRoutes.teacher.taskContextManifest(started.taskRef)
      )
      .set(demoHeaders)
      .expect(200);
    expect(manifest.body).toMatchObject({
      taskRef: started.taskRef,
      authorizedContextPlanRef:
        authorized.body.authorizedContextPlanRef,
      evidenceRefs: authorized.body.authorizedEvidenceRefs
    });
    expect(manifest.body.resourceRefs).toEqual(
      expect.arrayContaining([
        started.courseRunRef,
        started.curriculumUnitRef,
        started.lessonRef
      ])
    );

    const taskForSecondRun = await request(app)
      .get(apiRoutes.teacher.preparationTask(started.taskRef))
      .set(demoHeaders)
      .expect(200);
    const secondProposal = await createProposal(
      taskForSecondRun.body
    );
    const secondAuthorized = await request(app)
      .get(
        apiRoutes.teacher.taskAuthorizedContextPlan(
          started.taskRef
        )
      )
      .set(demoHeaders)
      .expect(200);
    expect(secondAuthorized.body.taskRunRef).toBe(
      secondProposal.body.taskRunRef
    );
    expect(
      secondAuthorized.body.authorizedContextPlanRef
    ).not.toBe(authorized.body.authorizedContextPlanRef);
    const secondManifest = await request(app)
      .get(
        apiRoutes.teacher.taskContextManifest(started.taskRef)
      )
      .set(demoHeaders)
      .expect(200);
    expect(secondManifest.body.authorizedContextPlanRef).toBe(
      secondAuthorized.body.authorizedContextPlanRef
    );
    expect(secondManifest.body.contextManifestRef).not.toBe(
      manifest.body.contextManifestRef
    );

    const history = await request(app)
      .get(
        apiRoutes.teacher.preparationTaskHistory(started.taskRef)
      )
      .set(demoHeaders)
      .expect(200);
    expect(
      history.body.map(
        (entry: { toStatus: string }) => entry.toStatus
      )
    ).toEqual([
      "planned",
      "in_progress",
      "awaiting_plan_review"
    ]);
  });

  it("keeps one active review and one current approved revision under concurrency", async () => {
    const started = await createAndStartSlopeTask();
    const firstProposal = await createProposal(started);
    const awaiting = await request(app)
      .get(apiRoutes.teacher.preparationTask(started.taskRef))
      .set(demoHeaders)
      .expect(200);
    const secondProposal = await createProposal(awaiting.body);
    const details = await Promise.all(
      [firstProposal.body, secondProposal.body].map((proposal) =>
        request(app)
          .get(
            apiRoutes.demo.proposalDetail(
              proposal.proposalRevisionRef
            )
          )
          .set(demoHeaders)
          .expect(200)
      )
    );
    const reviewResponses = await Promise.all(
      details.map((detail, index) =>
        request(app)
          .post(
            apiRoutes.demo.suggestionDisposition(
              detail.body.proposalRevisionRef
            )
          )
          .set(demoHeaders)
          .send({
            purpose: "teacher-copilot.review-suggestion",
            idempotencyKey:
              `gate25:concurrent-review:${index}:${randomUUID()}`,
            disposition: "accepted",
            selectedStrategyId:
              detail.body.strategies[0].strategyId,
            teacherEdits: {},
            expectedProposalRevisionNumber:
              detail.body.proposalRevisionNumber
          })
      )
    );
    expect(
      reviewResponses.every((response) => response.status === 201)
    ).toBe(true);

    const scoped = await request(app)
      .get(
        apiRoutes.teacher.lessonTeachingPlans(started.lessonRef)
      )
      .set(demoHeaders)
      .expect(200);
    expect(scoped.body.activeInReview).not.toBeNull();
    expect(scoped.body.superseded).toHaveLength(1);

    const task = await request(app)
      .get(apiRoutes.teacher.preparationTask(started.taskRef))
      .set(demoHeaders)
      .expect(200);
    const approvalPayload = {
      purpose: "teacher-copilot.approve-plan",
      expectedInReviewRevisionRef:
        scoped.body.activeInReview.revisionRef,
      preparationTaskRef: task.body.taskRef,
      expectedTaskVersion: task.body.version
    };
    const approvals = await Promise.all(
      [0, 1].map((index) =>
        request(app)
          .post(
            apiRoutes.demo.approveTeachingPlan(
              scoped.body.activeInReview.revisionRef
            )
          )
          .set(demoHeaders)
          .send({
            ...approvalPayload,
            idempotencyKey:
              `gate25:concurrent-approve:${index}:${randomUUID()}`
          })
      )
    );
    expect(approvals.map((response) => response.status).sort()).toEqual([
      201,
      409
    ]);
    expect(
      approvals.find((response) => response.status === 409)?.body
        .code
    ).toMatch(
      /TEACHING_PLAN_REVIEW_VERSION_CONFLICT|LESSON_PREPARATION_VERSION_CONFLICT/
    );
  });

  it("lets the local Worker recover a leased Gate 2.5 event without owning business state", async () => {
    await product.workers.copilotOutbox.processAvailable(100);
    const created = await request(app)
      .post(apiRoutes.teacher.preparationTasks)
      .set(demoHeaders)
      .send({
        lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
        dueAt: null,
        priority: "normal",
        purpose: "lesson-preparation.create",
        idempotencyKey: `gate25:worker-create:${randomUUID()}`
      })
      .expect(201);

    const crashed = new PostgresOutboxWorker(
      workerPool,
      "worker:gate25-crashed",
      "teacher-copilot-local-worker-v1",
      60,
      ["LessonPreparationTaskCreated"],
      "work"
    );
    const abandoned = await crashed.claimOne();
    expect(abandoned).toMatchObject({
      eventName: "LessonPreparationTaskCreated",
      aggregateRef: created.body.task.taskRef,
      attemptCount: 1
    });
    await wait(100);

    const restarted = new LocalCopilotOutboxWorker(
      workerPool,
      "worker:gate25-restarted"
    );
    await expect(restarted.processAvailable(1)).resolves.toBe(1);
    await restarted.stop();

    const state = await workerPool.query<{
      status: string;
      attempt_count: number;
      effects: string;
      projection_mode: string;
    }>(
      `SELECT outbox.status, outbox.attempt_count,
              (
                SELECT count(*)::text
                  FROM work.outbox_consumer_effect AS effect
                 WHERE effect.outbox_ref = outbox.outbox_ref
                   AND effect.consumer_name =
                     'teacher-copilot-local-worker-v1'
              ) AS effects,
              (
                SELECT effect.effect_payload->>'projectionMode'
                  FROM work.outbox_consumer_effect AS effect
                 WHERE effect.outbox_ref = outbox.outbox_ref
                   AND effect.consumer_name =
                     'teacher-copilot-local-worker-v1'
                 LIMIT 1
              ) AS projection_mode
         FROM work.outbox_record AS outbox
        WHERE outbox.outbox_ref = $1`,
      [abandoned!.outboxRef]
    );
    expect(state.rows[0]).toEqual({
      status: "processed",
      attempt_count: 2,
      effects: "1",
      projection_mode: "none-business-state-synchronous"
    });
  });
});

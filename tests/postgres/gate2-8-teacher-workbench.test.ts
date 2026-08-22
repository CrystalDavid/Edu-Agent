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

async function createTodo(overrides: Record<string, unknown> = {}) {
  return request(app)
    .post(apiRoutes.teacher.todos)
    .set(demoHeaders)
    .send({
      title: "准备周五教研材料",
      description: "整理一次函数教学调整记录",
      priority: "high",
      dueAt: "2026-09-24T09:00:00.000Z",
      purpose: "teacher-todo.create",
      idempotencyKey: `gate28:todo:${randomUUID()}`,
      ...overrides
    })
    .expect(201);
}

describe("Gate 2.8 teacher workbench", () => {
  it("persists Todo lifecycle, optimistic concurrency, and request idempotency", async () => {
    const idempotencyKey = `gate28:todo-replay:${randomUUID()}`;
    const created = await createTodo({ idempotencyKey });
    const todoRef = created.body.todo.todoRef as string;

    await request(app)
      .post(apiRoutes.teacher.todos)
      .set(demoHeaders)
      .send({
        title: "准备周五教研材料",
        description: "整理一次函数教学调整记录",
        priority: "high",
        dueAt: "2026-09-24T09:00:00.000Z",
        purpose: "teacher-todo.create",
        idempotencyKey
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
        expect(body.todo.todoRef).toBe(todoRef);
      });

    await request(app)
      .post(apiRoutes.teacher.todos)
      .set(demoHeaders)
      .send({
        title: "不同的待办",
        description: "",
        priority: "normal",
        dueAt: null,
        purpose: "teacher-todo.create",
        idempotencyKey
      })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe("IDEMPOTENCY_CONFLICT"));

    const pinned = await request(app)
      .post(apiRoutes.teacher.todoPreference(todoRef))
      .set(demoHeaders)
      .send({
        expectedVersion: created.body.todo.version,
        pinned: true,
        purpose: "teacher-todo.preference.update",
        idempotencyKey: `gate28:pin:${randomUUID()}`
      })
      .expect(200);
    expect(pinned.body.todo.pinned).toBe(true);

    await request(app)
      .post(apiRoutes.teacher.todoComplete(todoRef))
      .set(demoHeaders)
      .send({
        expectedVersion: created.body.todo.version,
        purpose: "teacher-todo.complete",
        idempotencyKey: `gate28:stale-complete:${randomUUID()}`
      })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe("TEACHER_TODO_VERSION_OR_STATE_CONFLICT"));

    const completed = await request(app)
      .post(apiRoutes.teacher.todoComplete(todoRef))
      .set(demoHeaders)
      .send({
        expectedVersion: pinned.body.todo.version,
        purpose: "teacher-todo.complete",
        idempotencyKey: `gate28:complete:${randomUUID()}`
      })
      .expect(200);
    expect(completed.body.todo.status).toBe("completed");

    const reopened = await request(app)
      .post(apiRoutes.teacher.todoReopen(todoRef))
      .set(demoHeaders)
      .send({
        expectedVersion: completed.body.todo.version,
        purpose: "teacher-todo.reopen",
        idempotencyKey: `gate28:reopen:${randomUUID()}`
      })
      .expect(200);
    expect(reopened.body.todo.status).toBe("active");

    const updated = await request(app)
      .put(apiRoutes.teacher.todo(todoRef))
      .set(demoHeaders)
      .send({
        expectedVersion: reopened.body.todo.version,
        title: "准备周五教研材料（已确认）",
        description: "调整为周四完成",
        priority: "normal",
        dueAt: "2026-09-24T08:00:00.000Z",
        purpose: "teacher-todo.update",
        idempotencyKey: `gate28:update:${randomUUID()}`
      })
      .expect(200);
    expect(updated.body.todo.title).toContain("已确认");

    const snoozed = await request(app)
      .post(apiRoutes.teacher.todoPreference(todoRef))
      .set(demoHeaders)
      .send({
        expectedVersion: updated.body.todo.version,
        snoozedUntil: "2026-09-23T00:00:00.000Z",
        purpose: "teacher-todo.preference.update",
        idempotencyKey: `gate28:todo-snooze:${randomUUID()}`
      })
      .expect(200);
    expect(snoozed.body.todo.snoozedUntil).toBe("2026-09-23T00:00:00.000Z");

    const cancelled = await request(app)
      .post(apiRoutes.teacher.todoCancel(todoRef))
      .set(demoHeaders)
      .send({
        expectedVersion: snoozed.body.todo.version,
        purpose: "teacher-todo.cancel",
        idempotencyKey: `gate28:cancel:${randomUUID()}`
      })
      .expect(200);
    expect(cancelled.body.todo.status).toBe("cancelled");

    await request(app)
      .post(apiRoutes.teacher.todoReopen(todoRef))
      .set(demoHeaders)
      .send({
        expectedVersion: cancelled.body.todo.version,
        purpose: "teacher-todo.reopen",
        idempotencyKey: `gate28:reopen-cancelled:${randomUUID()}`
      })
      .expect(200)
      .expect(({ body }) => expect(body.todo.status).toBe("active"));
  });

  it("persists manual Calendar CRUD, cross-day timezone ranges, completion, and cancellation", async () => {
    const created = await request(app)
      .post(apiRoutes.teacher.calendarEvents)
      .set(demoHeaders)
      .send({
        title: "跨日教研准备",
        description: "本地时区 23:30 开始",
        startAt: "2026-09-24T15:30:00.000Z",
        endAt: "2026-09-24T17:00:00.000Z",
        timezone: "Asia/Shanghai",
        allDay: false,
        eventType: "meeting",
        relatedTodoRef: null,
        purpose: "calendar-event.create",
        idempotencyKey: `gate28:calendar-create:${randomUUID()}`
      })
      .expect(201);
    const eventRef = created.body.event.eventRef as string;

    const updated = await request(app)
      .put(apiRoutes.teacher.calendarEvent(eventRef))
      .set(demoHeaders)
      .send({
        expectedVersion: created.body.event.version,
        title: "跨日教研准备（调整）",
        description: "教师手工移动时间块",
        startAt: "2026-09-24T16:00:00.000Z",
        endAt: "2026-09-24T18:00:00.000Z",
        timezone: "Asia/Shanghai",
        allDay: false,
        eventType: "meeting",
        purpose: "calendar-event.update",
        idempotencyKey: `gate28:calendar-update:${randomUUID()}`
      })
      .expect(200);
    expect(updated.body.event.title).toContain("调整");

    await request(app)
      .get(apiRoutes.teacher.calendarEvents)
      .query({
        from: "2026-09-24T16:00:00.000Z",
        to: "2026-09-25T16:00:00.000Z",
        mode: "day",
        timezone: "Asia/Shanghai"
      })
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toEqual(expect.arrayContaining([
          expect.objectContaining({
            sourceKind: "manual",
            event: expect.objectContaining({ eventRef, timezone: "Asia/Shanghai" })
          })
        ]));
      });

    await request(app)
      .post(apiRoutes.teacher.calendarEventComplete(eventRef))
      .set(demoHeaders)
      .send({
        expectedVersion: updated.body.event.version,
        purpose: "calendar-event.complete",
        idempotencyKey: `gate28:calendar-complete:${randomUUID()}`
      })
      .expect(200)
      .expect(({ body }) => expect(body.event.status).toBe("completed"));

    const cancellable = await request(app)
      .post(apiRoutes.teacher.calendarEvents)
      .set(demoHeaders)
      .send({
        title: "可取消时间块",
        description: "验证取消状态",
        startAt: "2026-09-25T03:00:00.000Z",
        endAt: "2026-09-25T04:00:00.000Z",
        timezone: "Asia/Shanghai",
        allDay: false,
        eventType: "custom_reminder",
        relatedTodoRef: null,
        purpose: "calendar-event.create",
        idempotencyKey: `gate28:calendar-cancellable:${randomUUID()}`
      })
      .expect(201);
    await request(app)
      .post(apiRoutes.teacher.calendarEventCancel(cancellable.body.event.eventRef))
      .set(demoHeaders)
      .send({
        expectedVersion: cancellable.body.event.version,
        purpose: "calendar-event.cancel",
        idempotencyKey: `gate28:calendar-cancel:${randomUUID()}`
      })
      .expect(200)
      .expect(({ body }) => expect(body.event.status).toBe("cancelled"));
  });

  it("schedules a Todo idempotently while keeping Todo and Calendar lifecycles independent", async () => {
    const created = await createTodo();
    const todoRef = created.body.todo.todoRef as string;
    const scheduleKey = `gate28:schedule:${randomUUID()}`;
    const scheduleBody = {
      expectedTodoVersion: created.body.todo.version,
      startAt: "2026-09-24T07:00:00.000Z",
      endAt: "2026-09-24T08:00:00.000Z",
      timezone: "Asia/Shanghai",
      allDay: false,
      purpose: "teacher-todo.schedule",
      idempotencyKey: scheduleKey
    };
    const scheduled = await request(app)
      .post(apiRoutes.teacher.todoSchedule(todoRef))
      .set(demoHeaders)
      .send(scheduleBody)
      .expect(201);
    expect(scheduled.body.event.eventType).toBe("todo_time_block");
    expect(scheduled.body.todo.scheduledEventRefs).toEqual([
      scheduled.body.event.eventRef
    ]);

    await request(app)
      .post(apiRoutes.teacher.todoSchedule(todoRef))
      .set(demoHeaders)
      .send(scheduleBody)
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
        expect(body.event.eventRef).toBe(scheduled.body.event.eventRef);
      });

    const completed = await request(app)
      .post(apiRoutes.teacher.todoComplete(todoRef))
      .set(demoHeaders)
      .send({
        expectedVersion: created.body.todo.version,
        purpose: "teacher-todo.complete",
        idempotencyKey: `gate28:complete-scheduled:${randomUUID()}`
      })
      .expect(200);
    expect(completed.body.todo.status).toBe("completed");

    await request(app)
      .get(apiRoutes.teacher.calendarEvent(scheduled.body.event.eventRef))
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe("scheduled"));

    const calendar = await request(app)
      .get(apiRoutes.teacher.calendarEvents)
      .query({
        from: "2026-09-23T16:00:00.000Z",
        to: "2026-09-24T16:00:00.000Z",
        mode: "day",
        timezone: "Asia/Shanghai"
      })
      .set(demoHeaders)
      .expect(200);
    expect(calendar.body.items.filter((item: { sourceKind: string }) => item.sourceKind === "manual")).toHaveLength(1);
  });

  it("keeps source projections read-only and binds preferences to source versions", async () => {
    const actionItems = await request(app)
      .get(apiRoutes.teacher.workbenchActionItems)
      .query({ includeDeferred: "false" })
      .set(demoHeaders)
      .expect(200);
    const preparation = actionItems.body.items.find(
      (item: { sourceType: string }) => item.sourceType === "lesson_preparation"
    );
    expect(preparation).toBeTruthy();
    expect(preparation.preferenceVersion).toBe(0);

    const snoozed = await request(app)
      .post(apiRoutes.teacher.workbenchProjectionPreference(preparation.projectionRef))
      .set(demoHeaders)
      .send({
        sourceVersion: preparation.sourceVersion,
        expectedPreferenceVersion: preparation.preferenceVersion,
        snoozedUntil: "2099-01-01T00:00:00.000Z",
        purpose: "teacher-work-projection.preference.update",
        idempotencyKey: `gate28:projection-snooze:${randomUUID()}`
      })
      .expect(200);
    expect(snoozed.body.projection.snoozedUntil).toBe("2099-01-01T00:00:00.000Z");
    expect(snoozed.body.preferenceVersion).toBe(1);

    await request(app)
      .get(apiRoutes.teacher.workbenchActionItems)
      .query({ includeDeferred: "false" })
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items.some((item: { projectionRef: string }) => item.projectionRef === preparation.projectionRef)).toBe(false);
      });

    const sourceBefore = await request(app)
      .get(apiRoutes.teacher.preparationTask(preparation.sourceRef))
      .set(demoHeaders)
      .expect(200);
    expect(sourceBefore.body.status).toBe("planned");

    await request(app)
      .post(apiRoutes.teacher.preparationTaskStart(preparation.sourceRef))
      .set(demoHeaders)
      .send({
        expectedVersion: sourceBefore.body.version,
        purpose: "lesson-preparation.start",
        idempotencyKey: `gate28:start-source:${randomUUID()}`
      })
      .expect(201);

    await request(app)
      .get(apiRoutes.teacher.workbenchActionItems)
      .query({ includeDeferred: "false" })
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        const refreshed = body.items.find((item: { projectionRef: string }) => item.projectionRef === preparation.projectionRef);
        expect(refreshed).toBeTruthy();
        expect(refreshed.sourceVersion).not.toBe(preparation.sourceVersion);
        expect(refreshed.preferenceVersion).toBe(0);
        expect(refreshed.snoozedUntil).toBeNull();
      });
  });

  it("hands an explicitly linked Todo to Agent without completing it or broadening context", async () => {
    const created = await createTodo({ dueAt: null });
    const todoRef = created.body.todo.todoRef as string;
    const linked = await request(app)
      .post(apiRoutes.teacher.todoResources(todoRef))
      .set(demoHeaders)
      .send({
        expectedVersion: created.body.todo.version,
        resourceKind: "lesson",
        resourceRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
        purpose: "teacher-todo.resource.link",
        idempotencyKey: `gate28:link-lesson:${randomUUID()}`
      })
      .expect(201);

    const handoff = await request(app)
      .post(apiRoutes.teacher.todoAgentHandoff(todoRef))
      .set(demoHeaders)
      .send({
        expectedTodoVersion: linked.body.todo.version,
        purpose: "teacher-todo.agent-handoff",
        idempotencyKey: `gate28:agent:${randomUUID()}`
      })
      .expect(201);
    expect(handoff.body.workingSet.sourceTodoRef).toBe(todoRef);
    expect(handoff.body.workingSet.sourceResourceRefs).toEqual([
      gate25DemoRefs.lessonRefs.slopeAndGraph
    ]);
    expect(handoff.body.deepLink).toBe(`/agent/tasks/${encodeURIComponent(handoff.body.taskRef)}`);

    await request(app)
      .get(apiRoutes.teacher.todo(todoRef))
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe("active"));
  });

  it("projects Assignment deadlines, missing submissions, and grading without owning their state", async () => {
    const draft = await request(app)
      .post(apiRoutes.teacher.assignments)
      .set(demoHeaders)
      .send({
        courseRunRef: gate2DemoRefs.courseRunRef,
        curriculumUnitRef: gate25DemoRefs.unitRef,
        lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
        title: "工作台投影验证作业",
        instructions: "仅使用合成数据。",
        dueAt: "2026-09-25T10:00:00.000Z",
        items: [{
          sequence: 1,
          itemType: "multiple_choice",
          prompt: "斜率为正时图像如何变化？",
          maxScore: 5,
          options: [
            { key: "A", text: "上升" },
            { key: "B", text: "下降" }
          ],
          answerKey: { choiceKey: "A" },
          gradingCriteria: "选择 A 得满分。",
          objectiveRef: gate2DemoRefs.objectiveRef
        }],
        purpose: "assignment.create",
        idempotencyKey: `gate28:assignment:${randomUUID()}`
      })
      .expect(201);
    const assignmentRef = draft.body.assignment.assignmentRef as string;

    await request(app)
      .get(apiRoutes.teacher.workbenchActionItems)
      .query({ includeDeferred: "false" })
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toEqual(expect.arrayContaining([
          expect.objectContaining({ sourceType: "assignment_draft", sourceRef: assignmentRef })
        ]));
      });

    const published = await request(app)
      .post(apiRoutes.teacher.assignmentPublish(assignmentRef))
      .set(demoHeaders)
      .send({
        expectedVersion: draft.body.assignment.version,
        purpose: "assignment.publish",
        idempotencyKey: `gate28:assignment-publish:${randomUUID()}`
      })
      .expect(201);

    const beforeImport = await request(app)
      .get(apiRoutes.teacher.workbenchActionItems)
      .query({ includeDeferred: "false" })
      .set(demoHeaders)
      .expect(200);
    expect(beforeImport.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: "assignment_not_submitted", sourceRef: assignmentRef })
    ]));

    await request(app)
      .post(apiRoutes.teacher.assignmentSyntheticSubmissions(assignmentRef))
      .set(demoHeaders)
      .send({
        purpose: "assignment.synthetic-submissions.import",
        idempotencyKey: `gate28:assignment-import:${randomUUID()}`
      })
      .expect(201);

    const afterImport = await request(app)
      .get(apiRoutes.teacher.workbenchActionItems)
      .query({ includeDeferred: "false" })
      .set(demoHeaders)
      .expect(200);
    const grading = afterImport.body.items.find(
      (item: { sourceType: string; sourceRef: string }) =>
        item.sourceType === "assignment_grading" && item.sourceRef === published.body.assignment.gradingTaskRef
    ) ?? afterImport.body.items.find(
      (item: { sourceType: string }) => item.sourceType === "assignment_grading"
    );
    expect(grading).toBeTruthy();

    await request(app)
      .post(apiRoutes.teacher.workbenchProjectionPreference(grading.projectionRef))
      .set(demoHeaders)
      .send({
        sourceVersion: grading.sourceVersion,
        expectedPreferenceVersion: grading.preferenceVersion,
        snoozedUntil: "2099-01-01T00:00:00.000Z",
        purpose: "teacher-work-projection.preference.update",
        idempotencyKey: `gate28:grading-snooze:${randomUUID()}`
      })
      .expect(200);

    await request(app)
      .get(apiRoutes.teacher.assignment(assignmentRef))
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("published");
        expect(body.dueAt).toBe("2026-09-25T10:00:00.000Z");
      });

    const calendar = await request(app)
      .get(apiRoutes.teacher.calendarEvents)
      .query({
        from: "2026-09-25T00:00:00.000Z",
        to: "2026-09-26T00:00:00.000Z",
        mode: "day",
        timezone: "Asia/Shanghai"
      })
      .set(demoHeaders)
      .expect(200);
    expect(calendar.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKind: "source_projection",
        projection: expect.objectContaining({ sourceType: "assignment_deadline", sourceRef: assignmentRef })
      })
    ]));
  });

  it("recovers Todo, Calendar links, preferences, and projections after a service restart", async () => {
    const created = await createTodo();
    const scheduled = await request(app)
      .post(apiRoutes.teacher.todoSchedule(created.body.todo.todoRef))
      .set(demoHeaders)
      .send({
        expectedTodoVersion: created.body.todo.version,
        startAt: "2026-09-25T07:00:00.000Z",
        endAt: "2026-09-25T08:00:00.000Z",
        timezone: "Asia/Shanghai",
        allDay: false,
        purpose: "teacher-todo.schedule",
        idempotencyKey: `gate28:restart-schedule:${randomUUID()}`
      })
      .expect(201);

    const restarted = createProductContainer(postgresEnvironment);
    const restartedApp = createApp({ product: restarted });
    try {
      await request(restartedApp)
        .get(apiRoutes.teacher.todo(created.body.todo.todoRef))
        .set(demoHeaders)
        .expect(200)
        .expect(({ body }) => {
          expect(body.scheduledEventRefs).toEqual([scheduled.body.event.eventRef]);
        });
      await request(restartedApp)
        .get(apiRoutes.teacher.calendarEvent(scheduled.body.event.eventRef))
        .set(demoHeaders)
        .expect(200)
        .expect(({ body }) => expect(body.relatedTodoRef).toBe(created.body.todo.todoRef));
      await request(restartedApp)
        .get(apiRoutes.teacher.workbenchOverview)
        .query({ timezone: "Asia/Shanghai" })
        .set(demoHeaders)
        .expect(200)
        .expect(({ body }) => {
          expect(body.actionItems.some((item: { sourceType: string }) => item.sourceType === "lesson_preparation")).toBe(true);
        });
    } finally {
      await restarted.close();
    }
  });

  it("rebuilds projections idempotently when the outbox worker restarts and replays an event", async () => {
    await createTodo();
    await expect(product.workers.copilotOutbox.processAvailable(200)).resolves.toBeGreaterThan(0);
    const target = await adminPool.query<{ outbox_ref: string }>(
      `SELECT outbox_ref
         FROM work.outbox_record
        WHERE event_name = 'TeacherTodoCreated' AND processed_at IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`
    );
    const outboxRef = target.rows[0]?.outbox_ref;
    expect(outboxRef).toBeTruthy();
    const before = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM work.teacher_work_projection
        WHERE tenant_ref = $1 AND teacher_ref = $2`,
      [gate2DemoRefs.tenantRef, gate2DemoRefs.teacherRef]
    );
    expect(Number(before.rows[0]?.count)).toBeGreaterThan(0);

    await adminPool.query(
      `UPDATE work.outbox_record
          SET status = 'retry', processed_at = NULL, published_at = NULL,
              lease_owner = NULL, lease_expires_at = NULL
        WHERE outbox_ref = $1`,
      [outboxRef]
    );
    await expect(product.workers.copilotOutbox.processAvailable(1)).resolves.toBe(1);

    const after = await adminPool.query<{ projection_count: string; effect_count: string }>(
      `SELECT
         (SELECT count(*)::text FROM work.teacher_work_projection
           WHERE tenant_ref = $1 AND teacher_ref = $2) AS projection_count,
         (SELECT count(*)::text FROM work.outbox_consumer_effect
           WHERE consumer_name = 'teacher-copilot-local-worker-v1'
             AND outbox_ref = $3) AS effect_count`,
      [gate2DemoRefs.tenantRef, gate2DemoRefs.teacherRef, outboxRef]
    );
    expect(after.rows[0]).toEqual({
      projection_count: before.rows[0]?.count,
      effect_count: "1"
    });
  });

  it("fails closed for invalid time ranges and tenant mismatches", async () => {
    await request(app)
      .post(apiRoutes.teacher.calendarEvents)
      .set(demoHeaders)
      .send({
        title: "非法时间块",
        description: "",
        startAt: "2026-09-24T08:00:00.000Z",
        endAt: "2026-09-24T07:00:00.000Z",
        timezone: "Asia/Shanghai",
        allDay: false,
        eventType: "custom_reminder",
        relatedTodoRef: null,
        purpose: "calendar-event.create",
        idempotencyKey: `gate28:invalid-time:${randomUUID()}`
      })
      .expect(409);

    await request(app)
      .get(apiRoutes.teacher.todos)
      .set({ ...demoHeaders, "x-demo-tenant": "tenant:another-school" })
      .expect(403);
  });
});

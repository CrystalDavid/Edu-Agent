import { createHash, randomUUID } from "node:crypto";

import {
  CalendarEventActionRequestSchema,
  CalendarEventMutationResultSchema,
  CreateCalendarEventRequestSchema,
  CreateTeacherTodoRequestSchema,
  LinkTeacherTodoResourceRequestSchema,
  ManualCalendarEventViewSchema,
  ScheduleTodoRequestSchema,
  ScheduleTodoResultSchema,
  TeacherCalendarListQuerySchema,
  TeacherCalendarListSchema,
  TeacherTodoActionRequestSchema,
  TeacherTodoListQuerySchema,
  TeacherTodoListSchema,
  TeacherTodoMutationResultSchema,
  TeacherTodoPreferenceRequestSchema,
  TeacherTodoViewSchema,
  TeacherWorkbenchOverviewSchema,
  TeacherWorkProjectionListSchema,
  TeacherWorkProjectionViewSchema,
  TodoAgentHandoffRequestSchema,
  TodoAgentHandoffResultSchema,
  UpdateCalendarEventRequestSchema,
  UpdateTeacherTodoRequestSchema,
  WorkProjectionPreferenceRequestSchema,
  WorkProjectionPreferenceResultSchema,
  type AuthorizationDecision,
  type CalendarEventStatus,
  type CalendarEventType,
  type FormalWriteReceipt,
  type TeacherResourceKind,
  type TeacherTodoStatus,
  type TeacherWorkProjectionView
} from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/test-fixtures";
import type { Pool } from "pg";

import { PostgresGovernanceRepository } from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  PostgresGate28WorkRepository,
  type WorkProjectionSnapshot
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-8-work-repository.js";
import {
  AuthorizationDeniedError,
  DomainConflictError,
  NotFoundError
} from "../platform/errors.js";
import type { PostgresClient } from "../platform/postgres/types.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";
import type { PostgresLessonPreparationService } from "./postgres-lesson-preparation-service.js";

type CommandContext = {
  client: PostgresClient;
  writeContext: WriteContext;
  receipts: FormalWriteReceipt[];
};

type SourceResource = {
  label: string;
  deepLink: string;
};

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function stableDecisionRef(rootKey: string): string {
  return `authorization-decision:${hash(rootKey).slice(0, 32)}`;
}

function projectionRef(
  kind: string,
  module: string,
  type: string,
  sourceRef: string
): string {
  return `work-projection:${hash([kind, module, type, sourceRef]).slice(0, 32)}`;
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function requireValidTimeZone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: timezone }).format();
  } catch {
    throw new DomainConflictError(
      "INVALID_TIMEZONE",
      "时区必须是有效的 IANA 时区名称。",
      { timezone }
    );
  }
}

function requireTimeRange(startAt: string, endAt: string): void {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (end <= start) {
    throw new DomainConflictError(
      "CALENDAR_TIME_RANGE_INVALID",
      "日历事件结束时间必须晚于开始时间。",
      { startAt, endAt }
    );
  }
  if (end - start > 366 * 24 * 60 * 60 * 1_000) {
    throw new DomainConflictError(
      "CALENDAR_TIME_RANGE_TOO_LARGE",
      "单个日历事件不能跨越超过 366 天。"
    );
  }
}

export class PostgresTeacherWorkbenchService {
  constructor(
    private readonly pool: Pool,
    private readonly lessonPreparation: PostgresLessonPreparationService,
    private readonly governance = new PostgresGovernanceRepository(),
    private readonly work = new PostgresGate28WorkRepository()
  ) {}

  async listTodos(input: {
    tenantRef: string;
    actorRef: string;
    query: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const query = TeacherTodoListQuerySchema.parse(input.query);
    return TeacherTodoListSchema.parse({
      items: await this.work.listTodos(this.pool, {
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        status: query.status,
        ...(query.dueBefore ? { dueBefore: query.dueBefore } : {}),
        includeSnoozed: query.includeSnoozed === "true"
      })
    });
  }

  async getTodo(input: {
    tenantRef: string;
    actorRef: string;
    todoRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const todo = await this.work.getTodo(
      this.pool,
      input.tenantRef,
      input.actorRef,
      input.todoRef
    );
    if (!todo) throw new NotFoundError("教师待办不存在。");
    return TeacherTodoViewSchema.parse(todo);
  }

  async createTodo(input: {
    tenantRef: string;
    actorRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = CreateTeacherTodoRequestSchema.parse(input.request);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash(request),
      action: "teacher-todo.create",
      resourceRef: input.actorRef,
      requestedFieldMask: ["todo.content", "todo.priority", "todo.dueAt"],
      operation: async ({ client, writeContext, receipts }) => {
        const todoRef = `teacher-todo:${randomUUID()}`;
        receipts.push(
          ...(await this.work.insertTodo(client, {
            todoRef,
            tenantRef: input.tenantRef,
            teacherRef: input.actorRef,
            title: request.title,
            description: request.description,
            priority: request.priority,
            dueAt: request.dueAt,
            createdBy: input.actorRef,
            metadata: createWriteMetadata(writeContext, "work", "teacher-todo"),
            historyMetadata: createWriteMetadata(writeContext, "work", "teacher-todo-history"),
            outboxMetadata: createWriteMetadata(writeContext, "work", "teacher-todo-outbox"),
            historyRef: `todo-history:${randomUUID()}`,
            outboxRef: `outbox:${randomUUID()}`
          }))
        );
        return {
          replayed: false,
          todo: await this.requiredTodo(client, input.tenantRef, input.actorRef, todoRef)
        };
      }
    });
    return TeacherTodoMutationResultSchema.parse(result);
  }

  async updateTodo(input: {
    tenantRef: string;
    actorRef: string;
    todoRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = UpdateTeacherTodoRequestSchema.parse(input.request);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ todoRef: input.todoRef, ...request }),
      action: request.purpose,
      resourceRef: input.todoRef,
      requestedFieldMask: ["todo.content", "todo.priority", "todo.dueAt"],
      operation: async ({ client, writeContext, receipts }) => {
        const changed = await this.work.updateTodo(client, {
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          todoRef: input.todoRef,
          expectedVersion: request.expectedVersion,
          title: request.title,
          description: request.description,
          priority: request.priority,
          dueAt: request.dueAt,
          updatedAt: writeContext.createdAt,
          metadata: createWriteMetadata(writeContext, "work", "teacher-todo-update"),
          outboxMetadata: createWriteMetadata(writeContext, "work", "teacher-todo-update-outbox"),
          outboxRef: `outbox:${randomUUID()}`
        });
        if (!changed) this.todoVersionConflict(request.expectedVersion);
        receipts.push(...changed!);
        return {
          replayed: false,
          todo: await this.requiredTodo(client, input.tenantRef, input.actorRef, input.todoRef)
        };
      }
    });
    return TeacherTodoMutationResultSchema.parse(result);
  }

  async transitionTodo(input: {
    tenantRef: string;
    actorRef: string;
    todoRef: string;
    action: "complete" | "reopen" | "cancel";
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = TeacherTodoActionRequestSchema.parse(input.request);
    const configuration = {
      complete: {
        purpose: "teacher-todo.complete",
        from: ["active"] as TeacherTodoStatus[],
        to: "completed" as const,
        reason: "教师显式完成个人待办"
      },
      reopen: {
        purpose: "teacher-todo.reopen",
        from: ["completed", "cancelled"] as TeacherTodoStatus[],
        to: "active" as const,
        reason: "教师重新打开个人待办"
      },
      cancel: {
        purpose: "teacher-todo.cancel",
        from: ["active"] as TeacherTodoStatus[],
        to: "cancelled" as const,
        reason: "教师取消个人待办"
      }
    }[input.action];
    if (request.purpose !== configuration.purpose) {
      throw new AuthorizationDeniedError("待办命令用途与状态转换不匹配。");
    }
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ todoRef: input.todoRef, action: input.action, ...request }),
      action: request.purpose,
      resourceRef: input.todoRef,
      requestedFieldMask: ["todo.status"],
      operation: async ({ client, writeContext, receipts }) => {
        const changed = await this.work.transitionTodo(client, {
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          todoRef: input.todoRef,
          expectedVersion: request.expectedVersion,
          fromStatuses: configuration.from,
          toStatus: configuration.to,
          occurredAt: writeContext.createdAt,
          reason: configuration.reason,
          metadata: createWriteMetadata(writeContext, "work", `teacher-todo-${input.action}`),
          historyMetadata: createWriteMetadata(writeContext, "work", `teacher-todo-${input.action}-history`),
          outboxMetadata: createWriteMetadata(writeContext, "work", `teacher-todo-${input.action}-outbox`),
          historyRef: `todo-history:${randomUUID()}`,
          outboxRef: `outbox:${randomUUID()}`
        });
        if (!changed) this.todoVersionConflict(request.expectedVersion);
        receipts.push(...changed!);
        return {
          replayed: false,
          todo: await this.requiredTodo(client, input.tenantRef, input.actorRef, input.todoRef)
        };
      }
    });
    return TeacherTodoMutationResultSchema.parse(result);
  }

  async updateTodoPreference(input: {
    tenantRef: string;
    actorRef: string;
    todoRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = TeacherTodoPreferenceRequestSchema.parse(input.request);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ todoRef: input.todoRef, ...request }),
      action: request.purpose,
      resourceRef: input.todoRef,
      requestedFieldMask: ["todo.pinned", "todo.snoozedUntil"],
      operation: async ({ client, writeContext, receipts }) => {
        const changed = await this.work.updateTodoPreference(client, {
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          todoRef: input.todoRef,
          expectedVersion: request.expectedVersion,
          ...(request.pinned !== undefined ? { pinned: request.pinned } : {}),
          ...(request.snoozedUntil !== undefined
            ? { snoozedUntil: request.snoozedUntil }
            : {}),
          updatedAt: writeContext.createdAt,
          metadata: createWriteMetadata(writeContext, "work", "teacher-todo-preference"),
          outboxMetadata: createWriteMetadata(writeContext, "work", "teacher-todo-preference-outbox"),
          outboxRef: `outbox:${randomUUID()}`
        });
        if (!changed) this.todoVersionConflict(request.expectedVersion);
        receipts.push(...changed!);
        return {
          replayed: false,
          todo: await this.requiredTodo(client, input.tenantRef, input.actorRef, input.todoRef)
        };
      }
    });
    return TeacherTodoMutationResultSchema.parse(result);
  }

  async linkTodoResource(input: {
    tenantRef: string;
    actorRef: string;
    todoRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = LinkTeacherTodoResourceRequestSchema.parse(input.request);
    const resource = await this.resolveResource(
      input.tenantRef,
      request.resourceKind,
      request.resourceRef
    );
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ todoRef: input.todoRef, ...request }),
      action: request.purpose,
      resourceRef: input.todoRef,
      requestedFieldMask: ["todo.resourceLinks"],
      operation: async ({ client, writeContext, receipts }) => {
        const changed = await this.work.insertTodoResourceLink(client, {
          linkRef: `todo-resource-link:${randomUUID()}`,
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          todoRef: input.todoRef,
          expectedVersion: request.expectedVersion,
          resourceKind: request.resourceKind,
          resourceRef: request.resourceRef,
          label: resource.label,
          deepLink: resource.deepLink,
          updatedAt: writeContext.createdAt,
          metadata: createWriteMetadata(writeContext, "work", "teacher-todo-resource-link"),
          outboxMetadata: createWriteMetadata(writeContext, "work", "teacher-todo-resource-link-outbox"),
          outboxRef: `outbox:${randomUUID()}`
        });
        if (!changed) this.todoVersionConflict(request.expectedVersion);
        receipts.push(...changed!);
        return {
          replayed: false,
          todo: await this.requiredTodo(client, input.tenantRef, input.actorRef, input.todoRef)
        };
      }
    });
    return TeacherTodoMutationResultSchema.parse(result);
  }

  async listCalendar(input: {
    tenantRef: string;
    actorRef: string;
    query: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const query = TeacherCalendarListQuerySchema.parse(input.query);
    requireValidTimeZone(query.timezone);
    requireTimeRange(query.from, query.to);
    await this.refreshProjections({ tenantRef: input.tenantRef, actorRef: input.actorRef });
    const [manual, projected] = await Promise.all([
      this.work.listCalendarEvents(this.pool, {
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        from: query.from,
        to: query.to
      }),
      this.work.listProjections(this.pool, {
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        kind: "calendar",
        from: query.from,
        to: query.to
      })
    ]);
    return TeacherCalendarListSchema.parse({
      from: query.from,
      to: query.to,
      timezone: query.timezone,
      items: [
        ...manual.map((event) => ({
          sourceKind: "manual" as const,
          event,
          readOnly: false as const,
          deepLink: event.relatedTodoRef ? "/schedule" : null
        })),
        ...projected.map((projection) => ({
          sourceKind: "source_projection" as const,
          projection,
          readOnly: true as const,
          deepLink: projection.deepLink
        }))
      ].sort((left, right) => {
        const leftTime = left.sourceKind === "manual" ? left.event.startAt : left.projection.startAt ?? left.projection.dueAt ?? "";
        const rightTime = right.sourceKind === "manual" ? right.event.startAt : right.projection.startAt ?? right.projection.dueAt ?? "";
        return leftTime.localeCompare(rightTime);
      })
    });
  }

  async getCalendarEvent(input: {
    tenantRef: string;
    actorRef: string;
    eventRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const event = await this.work.getCalendarEvent(
      this.pool,
      input.tenantRef,
      input.actorRef,
      input.eventRef
    );
    if (!event) throw new NotFoundError("日历事件不存在。");
    return ManualCalendarEventViewSchema.parse(event);
  }

  async createCalendarEvent(input: {
    tenantRef: string;
    actorRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = CreateCalendarEventRequestSchema.parse(input.request);
    requireValidTimeZone(request.timezone);
    requireTimeRange(request.startAt, request.endAt);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash(request),
      action: request.purpose,
      resourceRef: input.actorRef,
      requestedFieldMask: ["calendarEvent.content", "calendarEvent.time"],
      operation: async ({ client, writeContext, receipts }) => {
        if (request.relatedTodoRef) {
          await this.requiredTodo(client, input.tenantRef, input.actorRef, request.relatedTodoRef);
        }
        const eventRef = `calendar-event:${randomUUID()}`;
        receipts.push(...(await this.work.insertCalendarEvent(client, {
          eventRef,
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          title: request.title,
          description: request.description,
          startAt: request.startAt,
          endAt: request.endAt,
          timezone: request.timezone,
          allDay: request.allDay,
          eventType: request.eventType,
          relatedTodoRef: request.relatedTodoRef,
          createdBy: input.actorRef,
          metadata: createWriteMetadata(writeContext, "work", "calendar-event"),
          historyMetadata: createWriteMetadata(writeContext, "work", "calendar-event-history"),
          outboxMetadata: createWriteMetadata(writeContext, "work", "calendar-event-outbox"),
          historyRef: `calendar-history:${randomUUID()}`,
          outboxRef: `outbox:${randomUUID()}`
        })));
        return {
          replayed: false,
          event: await this.requiredCalendarEvent(client, input.tenantRef, input.actorRef, eventRef)
        };
      }
    });
    return CalendarEventMutationResultSchema.parse(result);
  }

  async updateCalendarEvent(input: {
    tenantRef: string;
    actorRef: string;
    eventRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = UpdateCalendarEventRequestSchema.parse(input.request);
    requireValidTimeZone(request.timezone);
    requireTimeRange(request.startAt, request.endAt);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ eventRef: input.eventRef, ...request }),
      action: request.purpose,
      resourceRef: input.eventRef,
      requestedFieldMask: ["calendarEvent.content", "calendarEvent.time"],
      operation: async ({ client, writeContext, receipts }) => {
        const changed = await this.work.updateCalendarEvent(client, {
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          eventRef: input.eventRef,
          expectedVersion: request.expectedVersion,
          title: request.title,
          description: request.description,
          startAt: request.startAt,
          endAt: request.endAt,
          timezone: request.timezone,
          allDay: request.allDay,
          eventType: request.eventType,
          updatedAt: writeContext.createdAt,
          metadata: createWriteMetadata(writeContext, "work", "calendar-event-update"),
          outboxMetadata: createWriteMetadata(writeContext, "work", "calendar-event-update-outbox"),
          outboxRef: `outbox:${randomUUID()}`
        });
        if (!changed) this.calendarVersionConflict(request.expectedVersion);
        receipts.push(...changed!);
        return {
          replayed: false,
          event: await this.requiredCalendarEvent(client, input.tenantRef, input.actorRef, input.eventRef)
        };
      }
    });
    return CalendarEventMutationResultSchema.parse(result);
  }

  async transitionCalendarEvent(input: {
    tenantRef: string;
    actorRef: string;
    eventRef: string;
    action: "complete" | "cancel";
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = CalendarEventActionRequestSchema.parse(input.request);
    const expectedPurpose = `calendar-event.${input.action}`;
    if (request.purpose !== expectedPurpose) {
      throw new AuthorizationDeniedError("日历命令用途与状态转换不匹配。");
    }
    const toStatus: "completed" | "cancelled" = input.action === "complete" ? "completed" : "cancelled";
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ eventRef: input.eventRef, action: input.action, ...request }),
      action: request.purpose,
      resourceRef: input.eventRef,
      requestedFieldMask: ["calendarEvent.status"],
      operation: async ({ client, writeContext, receipts }) => {
        const changed = await this.work.transitionCalendarEvent(client, {
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          eventRef: input.eventRef,
          expectedVersion: request.expectedVersion,
          toStatus,
          occurredAt: writeContext.createdAt,
          metadata: createWriteMetadata(writeContext, "work", `calendar-event-${input.action}`),
          historyMetadata: createWriteMetadata(writeContext, "work", `calendar-event-${input.action}-history`),
          outboxMetadata: createWriteMetadata(writeContext, "work", `calendar-event-${input.action}-outbox`),
          historyRef: `calendar-history:${randomUUID()}`,
          outboxRef: `outbox:${randomUUID()}`
        });
        if (!changed) this.calendarVersionConflict(request.expectedVersion);
        receipts.push(...changed!);
        return {
          replayed: false,
          event: await this.requiredCalendarEvent(client, input.tenantRef, input.actorRef, input.eventRef)
        };
      }
    });
    return CalendarEventMutationResultSchema.parse(result);
  }

  async scheduleTodo(input: {
    tenantRef: string;
    actorRef: string;
    todoRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = ScheduleTodoRequestSchema.parse(input.request);
    requireValidTimeZone(request.timezone);
    requireTimeRange(request.startAt, request.endAt);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ todoRef: input.todoRef, ...request }),
      action: request.purpose,
      resourceRef: input.todoRef,
      requestedFieldMask: ["todo.status", "calendarEvent.time", "todoCalendarLink"],
      operation: async ({ client, writeContext, receipts }) => {
        const todo = await this.requiredTodo(client, input.tenantRef, input.actorRef, input.todoRef, true);
        if (todo.version !== request.expectedTodoVersion || todo.status !== "active") {
          this.todoVersionConflict(request.expectedTodoVersion);
        }
        const eventRef = `calendar-event:${randomUUID()}`;
        receipts.push(...(await this.work.insertCalendarEvent(client, {
          eventRef,
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          title: todo.title,
          description: todo.description,
          startAt: request.startAt,
          endAt: request.endAt,
          timezone: request.timezone,
          allDay: request.allDay,
          eventType: "todo_time_block",
          relatedTodoRef: todo.todoRef,
          createdBy: input.actorRef,
          metadata: createWriteMetadata(writeContext, "work", "todo-calendar-event"),
          historyMetadata: createWriteMetadata(writeContext, "work", "todo-calendar-event-history"),
          outboxMetadata: createWriteMetadata(writeContext, "work", "todo-calendar-event-outbox"),
          historyRef: `calendar-history:${randomUUID()}`,
          outboxRef: `outbox:${randomUUID()}`
        })));
        receipts.push(await this.work.insertTodoCalendarLink(client, {
          linkRef: `todo-calendar-link:${randomUUID()}`,
          todoRef: todo.todoRef,
          eventRef,
          metadata: createWriteMetadata(writeContext, "work", "todo-calendar-link")
        }));
        return {
          replayed: false,
          todo: await this.requiredTodo(client, input.tenantRef, input.actorRef, input.todoRef),
          event: await this.requiredCalendarEvent(client, input.tenantRef, input.actorRef, eventRef)
        };
      }
    });
    return ScheduleTodoResultSchema.parse(result);
  }

  async listActionItems(input: {
    tenantRef: string;
    actorRef: string;
    includeDeferred?: boolean;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    await this.refreshProjections(input);
    return TeacherWorkProjectionListSchema.parse({
      items: await this.work.listProjections(this.pool, {
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        kind: "action",
        ...(input.includeDeferred !== undefined
          ? { includeDeferred: input.includeDeferred }
          : {})
      }),
      generatedAt: new Date().toISOString()
    });
  }

  async getProjection(input: {
    tenantRef: string;
    actorRef: string;
    projectionRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    await this.refreshProjections(input);
    const projection = await this.work.getProjection(
      this.pool,
      input.tenantRef,
      input.actorRef,
      input.projectionRef
    );
    if (!projection) throw new NotFoundError("教师工作投影不存在。");
    return TeacherWorkProjectionViewSchema.parse(projection);
  }

  async updateProjectionPreference(input: {
    tenantRef: string;
    actorRef: string;
    projectionRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = WorkProjectionPreferenceRequestSchema.parse(input.request);
    await this.refreshProjections(input);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ projectionRef: input.projectionRef, ...request }),
      action: request.purpose,
      resourceRef: input.projectionRef,
      requestedFieldMask: ["teacherWorkPreference"],
      operation: async ({ client, writeContext, receipts }) => {
        const projection = await this.work.getProjection(
          client,
          input.tenantRef,
          input.actorRef,
          input.projectionRef
        );
        if (!projection) throw new NotFoundError("教师工作投影不存在。");
        if (projection.sourceVersion !== request.sourceVersion) {
          throw new DomainConflictError(
            "WORK_PROJECTION_SOURCE_VERSION_CONFLICT",
            "来源业务状态已经变化，请刷新后重新设置提醒。",
            { expectedVersion: request.sourceVersion, actualVersion: projection.sourceVersion }
          );
        }
        const restore = request.purpose === "teacher-work-projection.preference.restore";
        const changed = await this.work.upsertProjectionPreference(client, {
          preferenceRef: `work-preference:${randomUUID()}`,
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          projectionRef: input.projectionRef,
          sourceVersion: request.sourceVersion,
          expectedPreferenceVersion: request.expectedPreferenceVersion,
          ...(restore || request.pinned !== undefined
            ? { pinned: restore ? false : request.pinned! }
            : {}),
          ...(restore || request.snoozedUntil !== undefined
            ? { snoozedUntil: restore ? null : request.snoozedUntil! }
            : {}),
          ...(restore || request.hiddenUntil !== undefined
            ? { hiddenUntil: restore ? null : request.hiddenUntil! }
            : {}),
          updatedAt: writeContext.createdAt,
          metadata: createWriteMetadata(writeContext, "work", "teacher-work-preference"),
          outboxMetadata: createWriteMetadata(writeContext, "work", "teacher-work-preference-outbox"),
          outboxRef: `outbox:${randomUUID()}`
        });
        if (!changed) {
          throw new DomainConflictError(
            "WORK_PREFERENCE_VERSION_CONFLICT",
            "提醒偏好版本已经变化。",
            { expectedVersion: request.expectedPreferenceVersion }
          );
        }
        receipts.push(...changed.receipts);
        const refreshed = await this.work.getProjection(
          client,
          input.tenantRef,
          input.actorRef,
          input.projectionRef
        );
        if (!refreshed) throw new NotFoundError("教师工作投影不存在。");
        return { replayed: false, projection: refreshed, preferenceVersion: changed.version };
      }
    });
    return WorkProjectionPreferenceResultSchema.parse(result);
  }

  async getOverview(input: {
    tenantRef: string;
    actorRef: string;
    timezone?: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const timezone = input.timezone ?? "Asia/Shanghai";
    requireValidTimeZone(timezone);
    await this.refreshProjections(input);
    const { start, end } = dayBounds(new Date(), timezone);
    const soon = new Date(new Date(end).getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString();
    const [todos, manual, calendar, actions, recentFiles] = await Promise.all([
      this.work.listTodos(this.pool, {
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        status: "active",
        includeSnoozed: false
      }),
      this.work.listCalendarEvents(this.pool, {
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        from: start,
        to: end
      }),
      this.work.listProjections(this.pool, {
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        kind: "calendar",
        from: start,
        to: end
      }),
      this.work.listProjections(this.pool, {
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        kind: "action"
      }),
      this.listRecentFiles(input.tenantRef, input.actorRef)
    ]);
    const todayTodos = todos.filter((todo) => todo.dueAt === null || todo.dueAt < end).slice(0, 8);
    const todayCalendar = [
      ...manual.map((event) => ({ sourceKind: "manual" as const, event, readOnly: false as const, deepLink: event.relatedTodoRef ? "/schedule" : null })),
      ...calendar.map((projection) => ({ sourceKind: "source_projection" as const, projection, readOnly: true as const, deepLink: projection.deepLink }))
    ];
    return TeacherWorkbenchOverviewSchema.parse({
      todayCalendar,
      todayTodos,
      actionItems: actions.slice(0, 12),
      dueSoon: actions.filter((item) => item.dueAt && item.dueAt <= soon).slice(0, 8),
      pendingGradingCount: sumProjectionCount(actions, "assignment_grading"),
      pendingPlanReviewCount: actions.filter((item) => item.sourceType === "teaching_plan_review" || item.sourceType === "proposal_review").length,
      incompletePreparationCount: actions.filter((item) => item.sourceType === "lesson_preparation").length,
      modelFailureCount: actions.filter((item) => item.sourceType === "model_execution_failure").length,
      recentFiles,
      generatedAt: new Date().toISOString()
    });
  }

  async handoffTodoToAgent(input: {
    tenantRef: string;
    actorRef: string;
    todoRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = TodoAgentHandoffRequestSchema.parse(input.request);
    const todo = await this.getTodo(input);
    if (todo.version !== request.expectedTodoVersion || todo.status !== "active") {
      this.todoVersionConflict(request.expectedTodoVersion);
    }
    const lessonLink = todo.resourceLinks.find((link) => link.resourceKind === "lesson");
    if (!lessonLink) {
      throw new DomainConflictError(
        "TODO_AGENT_LESSON_CONTEXT_REQUIRED",
        "在 Agent 中处理待办前，请先关联一个课时。"
      );
    }
    const taskList = await this.lessonPreparation.listTasks({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef
    });
    let task = taskList.items.find(
      (item) => item.lessonRef === lessonLink.resourceRef && item.status !== "completed" && item.status !== "cancelled"
    );
    if (!task) {
      try {
        task = (await this.lessonPreparation.createTask({
          tenantRef: input.tenantRef,
          actorRef: input.actorRef,
          request: {
            lessonRef: lessonLink.resourceRef,
            dueAt: todo.dueAt,
            priority: todo.priority,
            purpose: "lesson-preparation.create",
            idempotencyKey: `todo-agent-create:${hash(todo.todoRef).slice(0, 24)}`
          }
        })).task;
      } catch (error) {
        if (!(error instanceof DomainConflictError) || error.code !== "OPEN_LESSON_PREPARATION_TASK_EXISTS") throw error;
        const refreshed = await this.lessonPreparation.listTasks({ tenantRef: input.tenantRef, actorRef: input.actorRef });
        task = refreshed.items.find((item) => item.lessonRef === lessonLink.resourceRef && item.status !== "completed" && item.status !== "cancelled");
      }
    }
    if (!task) throw new DomainConflictError("TODO_AGENT_TASK_UNAVAILABLE", "无法创建或恢复备课任务。");
    const resourceRefs = todo.resourceLinks.map((link) => link.resourceRef);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ todoRef: input.todoRef, taskRef: task.taskRef, resourceRefs, ...request }),
      action: request.purpose,
      resourceRef: input.todoRef,
      requestedFieldMask: ["todo.ref", "todo.resourceLinks", "taskWorkingSet.resourceRefs"],
      operation: async ({ client, writeContext, receipts }) => {
        const currentTodo = await this.requiredTodo(client, input.tenantRef, input.actorRef, input.todoRef, true);
        if (currentTodo.version !== request.expectedTodoVersion || currentTodo.status !== "active") this.todoVersionConflict(request.expectedTodoVersion);
        const currentSet = await this.work.getWorkingSet(client, task!.taskRef);
        if (!currentSet) throw new NotFoundError("备课 TaskWorkingSet 不存在。");
        if (currentSet.sourceTodoRef && currentSet.sourceTodoRef !== input.todoRef) {
          throw new DomainConflictError(
            "TASK_ALREADY_LINKED_TO_DIFFERENT_TODO",
            "该备课任务已经关联另一条教师待办。"
          );
        }
        if (currentSet.sourceTodoRef !== input.todoRef || hash(currentSet.sourceResourceRefs ?? []) !== hash(resourceRefs)) {
          const receipt = await this.work.attachTodoContext(client, {
            taskRef: task!.taskRef,
            expectedWorkingSetVersion: currentSet.version,
            todoRef: input.todoRef,
            resourceRefs,
            revisionRef: `working-set-revision:${randomUUID()}`,
            updatedAt: writeContext.createdAt,
            metadata: createWriteMetadata(writeContext, "work", "todo-agent-working-set")
          });
          if (!receipt) {
            throw new DomainConflictError(
              "TASK_WORKING_SET_VERSION_CONFLICT",
              "TaskWorkingSet 版本已经变化。",
              { expectedVersion: currentSet.version }
            );
          }
          receipts.push(receipt);
        }
        const workingSet = await this.work.getWorkingSet(client, task!.taskRef);
        if (!workingSet) throw new NotFoundError("备课 TaskWorkingSet 不存在。");
        return {
          replayed: false,
          todoRef: input.todoRef,
          taskRef: task!.taskRef,
          workingSet,
          deepLink: `/agent/tasks/${encodeURIComponent(task!.taskRef)}`
        };
      }
    });
    return TodoAgentHandoffResultSchema.parse(result);
  }

  async refreshProjections(input: {
    tenantRef: string;
    actorRef: string;
  }): Promise<number> {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const snapshots = await this.buildProjectionSnapshots(input.tenantRef, input.actorRef);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.work.syncProjections(client, {
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        snapshots,
        projectedAt: new Date().toISOString()
      });
      await client.query("COMMIT");
      return snapshots.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async buildProjectionSnapshots(
    tenantRef: string,
    teacherRef: string
  ): Promise<WorkProjectionSnapshot[]> {
    const [preparation, lessons, plans, assignments, grading, commonErrors, failures, proposals] = await Promise.all([
      this.pool.query<{
        task_ref: string; title: string; status: string; version: number;
        due_at: Date | null; lesson_ref: string; lesson_title: string;
      }>(
        `SELECT task.task_ref, task.title, task.status, task.version,
                details.due_at, details.lesson_ref, lesson.title AS lesson_title
           FROM work.task AS task
           JOIN work.lesson_preparation_task_details AS details ON details.task_ref = task.task_ref
           JOIN education.lesson AS lesson ON lesson.lesson_ref = details.lesson_ref
          WHERE details.tenant_ref = $1
            AND task.actor_ref = $2
            AND task.status IN ('planned', 'in_progress', 'awaiting_plan_review', 'ready_for_use')`,
        [tenantRef, teacherRef]
      ),
      this.pool.query<{
        lesson_ref: string; title: string; planned_at: Date;
        duration_minutes: number; preparation_state: string; updated_at: Date;
      }>(
        `SELECT lesson.lesson_ref, lesson.title, lesson.planned_at,
                lesson.duration_minutes, lesson.preparation_state, lesson.updated_at
           FROM education.lesson AS lesson
           JOIN education.curriculum_unit AS unit ON unit.unit_ref = lesson.unit_ref
           JOIN education.course_run AS course ON course.course_run_ref = unit.course_run_ref
          WHERE course.tenant_ref = $1 AND lesson.planned_at IS NOT NULL`,
        [tenantRef]
      ),
      this.pool.query<{
        revision_ref: string; lesson_ref: string; preparation_task_ref: string | null;
        updated_at: Date;
      }>(
        `SELECT lifecycle.revision_ref, lifecycle.lesson_ref,
                lifecycle.preparation_task_ref, lifecycle.updated_at
           FROM artifact.teaching_plan_scope_lifecycle AS lifecycle
           JOIN education.lesson AS lesson ON lesson.lesson_ref = lifecycle.lesson_ref
           JOIN education.curriculum_unit AS unit ON unit.unit_ref = lesson.unit_ref
           JOIN education.course_run AS course ON course.course_run_ref = unit.course_run_ref
          WHERE lifecycle.lifecycle_status = 'active_in_review'
            AND course.tenant_ref = $1
            AND lifecycle.actor_ref = $2`,
        [tenantRef, teacherRef]
      ),
      this.pool.query<{
        assignment_ref: string; assignment_status: string; aggregate_version: number;
        title: string; due_at: Date | null; lesson_ref: string;
        not_submitted_count: number;
      }>(
        `SELECT assignment.assignment_ref, assignment.assignment_status,
                assignment.aggregate_version, version.title, version.due_at,
                assignment.lesson_ref,
                greatest(
                  (SELECT count(*)::int
                     FROM education.course_run_enrollment AS enrollment
                    WHERE enrollment.course_run_ref = assignment.course_run_ref
                      AND enrollment.enrollment_status = 'active') -
                  (SELECT count(DISTINCT submission.enrollment_ref)::int
                     FROM education.submission AS submission
                    WHERE submission.assignment_ref = assignment.assignment_ref),
                  0
                )::int AS not_submitted_count
           FROM education.assignment AS assignment
           JOIN education.assignment_version AS version
             ON version.assignment_ref = assignment.assignment_ref
            AND version.version_number = assignment.current_version_number
          WHERE assignment.tenant_ref = $1
            AND assignment.created_by = $2
            AND assignment.assignment_status IN ('draft', 'published')`,
        [tenantRef, teacherRef]
      ),
      this.pool.query<{
        assignment_ref: string; task_ref: string; task_version: number;
        pending_count: number; confirmed_count: number; title: string;
      }>(
        `SELECT details.assignment_ref, details.task_ref,
                task.version AS task_version, details.pending_count,
                details.confirmed_count, version.title
           FROM work.assignment_grading_task_details AS details
           JOIN work.task AS task ON task.task_ref = details.task_ref
           JOIN education.assignment AS assignment ON assignment.assignment_ref = details.assignment_ref
           JOIN education.assignment_version AS version
             ON version.assignment_ref = assignment.assignment_ref
            AND version.version_number = assignment.current_version_number
          WHERE details.tenant_ref = $1
            AND task.actor_ref = $2
            AND details.pending_count > 0`,
        [tenantRef, teacherRef]
      ),
      this.pool.query<{
        assignment_ref: string; title: string; affected_count: number; source_version: string;
      }>(
        `SELECT assignment.assignment_ref, version.title,
                count(*) FILTER (WHERE item_grade.outcome <> 'correct')::int AS affected_count,
                concat(assignment.aggregate_version, ':', count(*), ':', max(decision.updated_at)) AS source_version
           FROM education.assignment AS assignment
           JOIN education.assignment_version AS version
             ON version.assignment_ref = assignment.assignment_ref
            AND version.version_number = assignment.current_version_number
           JOIN education.submission AS submission ON submission.assignment_ref = assignment.assignment_ref
           JOIN education.submission_attempt_details AS attempt ON attempt.submission_ref = submission.submission_ref
           JOIN education.teacher_grade_decision AS decision
             ON decision.attempt_ref = attempt.attempt_ref AND decision.decision_status = 'confirmed'
           JOIN education.teacher_item_grade AS item_grade ON item_grade.grade_decision_ref = decision.grade_decision_ref
          WHERE assignment.tenant_ref = $1
            AND assignment.created_by = $2
            AND item_grade.outcome <> 'correct'
            AND NOT EXISTS (
              SELECT 1 FROM work.task_working_set AS working_set
               WHERE working_set.source_assignment_ref = assignment.assignment_ref
            )
          GROUP BY assignment.assignment_ref, version.title, assignment.aggregate_version`,
        [tenantRef, teacherRef]
      ),
      this.pool.query<{
        execution_ref: string; task_ref: string; status: string;
        attempt_count: number; updated_at: Date; safe_message: string | null;
      }>(
        `SELECT execution.execution_ref, execution.task_ref, execution.status,
                execution.attempt_count, execution.updated_at, execution.safe_message
           FROM capability.model_execution AS execution
           JOIN work.lesson_preparation_task_details AS details ON details.task_ref = execution.task_ref
          WHERE details.tenant_ref = $1
            AND execution.actor_ref = $2
            AND execution.status IN ('timed_out', 'retryable_failed', 'validation_failed', 'permanently_failed')`,
        [tenantRef, teacherRef]
      ),
      this.pool.query<{
        proposal_revision_ref: string; task_ref: string; revision_number: number;
      }>(
        `SELECT result.proposal_revision_ref, result.task_ref, revision.revision_number
           FROM work.task_result AS result
           JOIN work.lesson_preparation_task_details AS details ON details.task_ref = result.task_ref
           JOIN artifact.artifact_revision AS revision ON revision.revision_ref = result.proposal_revision_ref
           LEFT JOIN work.suggestion_disposition AS disposition
             ON disposition.proposal_revision_ref = result.proposal_revision_ref
          WHERE details.tenant_ref = $1
            AND revision.actor_ref = $2
            AND disposition.disposition_ref IS NULL`,
        [tenantRef, teacherRef]
      )
    ]);

    const snapshots: WorkProjectionSnapshot[] = [];
    for (const row of preparation.rows) {
      const review = row.status === "awaiting_plan_review";
      const ready = row.status === "ready_for_use";
      snapshots.push(this.snapshot({
        tenantRef, teacherRef, kind: "action", module: "work", type: "lesson_preparation",
        sourceRef: row.task_ref, sourceVersion: String(row.version),
        title: `${review ? "审核" : ready ? "完成" : "继续"}备课：${row.lesson_title}`,
        summary: row.title, displayStatus: row.status, dueAt: iso(row.due_at),
        recommendedAction: review ? "审核计划" : ready ? "完成备课" : "继续备课",
        deepLink: `${review || ready ? "/teaching-plan" : "/agent"}/tasks/${encodeURIComponent(row.task_ref)}`,
        priority: review || ready ? "high" : "normal"
      }));
    }
    for (const row of lessons.rows) {
      const startAt = row.planned_at.toISOString();
      const endAt = new Date(row.planned_at.getTime() + row.duration_minutes * 60_000).toISOString();
      snapshots.push(this.snapshot({
        tenantRef, teacherRef, kind: "calendar", module: "education", type: "lesson_schedule",
        sourceRef: row.lesson_ref, sourceVersion: `${row.updated_at.toISOString()}:${row.preparation_state}`,
        title: `上课：${row.title}`, summary: `${row.duration_minutes} 分钟`,
        displayStatus: row.preparation_state, startAt, endAt,
        recommendedAction: "打开课时", deepLink: `/teaching/lessons/${encodeURIComponent(row.lesson_ref)}`,
        priority: "normal"
      }));
    }
    for (const row of plans.rows) {
      if (!row.preparation_task_ref) continue;
      snapshots.push(this.snapshot({
        tenantRef, teacherRef, kind: "action", module: "artifact", type: "teaching_plan_review",
        sourceRef: row.revision_ref, sourceVersion: row.updated_at.toISOString(),
        title: "审核待批准教学计划", summary: "计划仍为 active in-review，不是当前正式教学计划。",
        displayStatus: "active_in_review", recommendedAction: "审核计划",
        deepLink: `/teaching-plan/tasks/${encodeURIComponent(row.preparation_task_ref)}`,
        priority: "high"
      }));
    }
    for (const row of assignments.rows) {
      if (row.assignment_status === "draft") {
        snapshots.push(this.snapshot({
          tenantRef, teacherRef, kind: "action", module: "education", type: "assignment_draft",
          sourceRef: row.assignment_ref, sourceVersion: String(row.aggregate_version),
          title: `待发布作业：${row.title}`, summary: "作业仍为草稿，需要教师审核并显式发布。",
          displayStatus: "draft", dueAt: iso(row.due_at), recommendedAction: "继续编辑",
          deepLink: "/assignments", priority: "normal"
        }));
      }
      if (row.assignment_status === "published" && row.due_at) {
        snapshots.push(this.snapshot({
          tenantRef, teacherRef, kind: "calendar", module: "education", type: "assignment_deadline",
          sourceRef: row.assignment_ref, sourceVersion: `${row.aggregate_version}:${row.due_at.toISOString()}`,
          title: `作业截止：${row.title}`, summary: "来源作业截止时间，只能在作业页面修改。",
          displayStatus: "published", startAt: row.due_at.toISOString(),
          endAt: new Date(row.due_at.getTime() + 30 * 60_000).toISOString(),
          dueAt: row.due_at.toISOString(), recommendedAction: "查看作业",
          deepLink: "/assignments", priority: "high"
        }));
        if (row.not_submitted_count > 0) {
          snapshots.push(this.snapshot({
            tenantRef, teacherRef, kind: "action", module: "education", type: "assignment_not_submitted",
            sourceRef: row.assignment_ref,
            sourceVersion: `${row.aggregate_version}:${row.not_submitted_count}`,
            title: `作业未交：${row.title}`,
            summary: `${row.not_submitted_count} 人尚未提交；未交不会按 0 分处理。`,
            displayStatus: "not_submitted", dueAt: row.due_at.toISOString(),
            recommendedAction: "查看作业明细", deepLink: "/assignments", priority: "normal"
          }));
        }
        if (row.due_at.getTime() < Date.now()) {
          snapshots.push(this.snapshot({
            tenantRef, teacherRef, kind: "action", module: "education", type: "assignment_overdue_open",
            sourceRef: row.assignment_ref, sourceVersion: `${row.aggregate_version}:${row.due_at.toISOString()}`,
            title: `已截止待关闭：${row.title}`, summary: "作业已超过截止时间但仍为 published。",
            displayStatus: "published_overdue", dueAt: row.due_at.toISOString(),
            recommendedAction: "查看并关闭", deepLink: "/assignments", priority: "high"
          }));
        }
      }
    }
    for (const row of grading.rows) {
      snapshots.push(this.snapshot({
        tenantRef, teacherRef, kind: "action", module: "work", type: "assignment_grading",
        sourceRef: row.task_ref, sourceVersion: `${row.task_version}:${row.pending_count}:${row.confirmed_count}`,
        title: `待确认批改：${row.title}`, summary: `${row.pending_count} 份提交尚待教师确认。`,
        displayStatus: "pending", recommendedAction: "去批改", deepLink: "/assignments", priority: "high"
      }));
    }
    for (const row of commonErrors.rows) {
      snapshots.push(this.snapshot({
        tenantRef, teacherRef, kind: "action", module: "education", type: "assignment_common_error",
        sourceRef: row.assignment_ref, sourceVersion: row.source_version,
        title: `调整下一课：${row.title}`, summary: `${row.affected_count} 条已确认作答显示共性错误，尚未创建调整任务。`,
        displayStatus: "needs_adjustment", recommendedAction: "选择 Evidence 并调整下一课",
        deepLink: "/assignments", priority: "normal"
      }));
    }
    for (const row of failures.rows) {
      if (!row.task_ref) continue;
      snapshots.push(this.snapshot({
        tenantRef, teacherRef, kind: "action", module: "capability", type: "model_execution_failure",
        sourceRef: row.execution_ref, sourceVersion: `${row.status}:${row.attempt_count}:${row.updated_at.toISOString()}`,
        title: "备课助手需要处理", summary: row.safe_message ?? "模型执行未成功，可查看安全原因并人工重试。",
        displayStatus: row.status, recommendedAction: "查看运行并重试",
        deepLink: `/runs/tasks/${encodeURIComponent(row.task_ref)}`, priority: "high"
      }));
    }
    for (const row of proposals.rows) {
      snapshots.push(this.snapshot({
        tenantRef, teacherRef, kind: "action", module: "artifact", type: "proposal_review",
        sourceRef: row.proposal_revision_ref, sourceVersion: String(row.revision_number),
        title: "继续审阅教学建议", summary: "Proposal 已持久化，等待教师接受、修改、拒绝或稍后处理。",
        displayStatus: "pending_review", recommendedAction: "继续审阅",
        deepLink: `/copilot/proposals/${encodeURIComponent(row.proposal_revision_ref)}`, priority: "high"
      }));
    }
    return snapshots;
  }

  private snapshot(input: {
    tenantRef: string;
    teacherRef: string;
    kind: "action" | "calendar" | "information";
    module: "work" | "education" | "artifact" | "capability";
    type: string;
    sourceRef: string;
    sourceVersion: string;
    title: string;
    summary: string;
    displayStatus: string;
    dueAt?: string | null;
    startAt?: string | null;
    endAt?: string | null;
    recommendedAction: string;
    deepLink: string;
    priority: "high" | "normal" | "low";
  }): WorkProjectionSnapshot {
    return {
      projectionRef: projectionRef(input.kind, input.module, input.type, input.sourceRef),
      tenantRef: input.tenantRef,
      teacherRef: input.teacherRef,
      projectionKind: input.kind,
      sourceModule: input.module,
      sourceType: input.type,
      sourceRef: input.sourceRef,
      sourceVersion: input.sourceVersion,
      title: input.title,
      summary: input.summary,
      displayStatus: input.displayStatus,
      dueAt: input.dueAt ?? null,
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
      recommendedAction: input.recommendedAction,
      deepLink: input.deepLink,
      priority: input.priority,
      status: "active"
    };
  }

  private async listRecentFiles(tenantRef: string, teacherRef: string) {
    const result = await this.pool.query<{
      asset_ref: string;
      display_name: string;
      version_number: number;
      source: string;
      updated_at: Date;
    }>(
      `SELECT asset.asset_ref, asset.display_name, version.version_number,
              asset.source, asset.updated_at
         FROM artifact.file_asset AS asset
         JOIN artifact.file_version AS version ON version.version_ref = asset.current_version_ref
        WHERE asset.tenant_ref = $1
          AND asset.created_by = $2
          AND asset.lifecycle_status = 'active'
        ORDER BY asset.updated_at DESC, asset.asset_ref
        LIMIT 6`,
      [tenantRef, teacherRef]
    );
    return result.rows.map((row) => ({
      assetRef: row.asset_ref,
      displayName: row.display_name,
      versionNumber: row.version_number,
      source: row.source,
      updatedAt: row.updated_at.toISOString(),
      deepLink: `/files?asset=${encodeURIComponent(row.asset_ref)}`
    }));
  }

  private async resolveResource(
    tenantRef: string,
    kind: TeacherResourceKind,
    resourceRef: string
  ): Promise<SourceResource> {
    if (kind === "lesson") {
      const result = await this.pool.query<{ title: string }>(
        `SELECT lesson.title
           FROM education.lesson AS lesson
           JOIN education.curriculum_unit AS unit ON unit.unit_ref = lesson.unit_ref
           JOIN education.course_run AS course ON course.course_run_ref = unit.course_run_ref
          WHERE course.tenant_ref = $1 AND lesson.lesson_ref = $2`,
        [tenantRef, resourceRef]
      );
      const row = result.rows[0];
      if (row) return { label: row.title, deepLink: `/teaching/lessons/${encodeURIComponent(resourceRef)}` };
    }
    if (kind === "assignment") {
      const result = await this.pool.query<{ title: string }>(
        `SELECT version.title
           FROM education.assignment AS assignment
           JOIN education.assignment_version AS version
             ON version.assignment_ref = assignment.assignment_ref
            AND version.version_number = assignment.current_version_number
          WHERE assignment.tenant_ref = $1 AND assignment.assignment_ref = $2`,
        [tenantRef, resourceRef]
      );
      const row = result.rows[0];
      if (row) return { label: row.title, deepLink: "/assignments" };
    }
    if (kind === "file") {
      const result = await this.pool.query<{ display_name: string }>(
        `SELECT display_name FROM artifact.file_asset
          WHERE tenant_ref = $1 AND asset_ref = $2 AND lifecycle_status = 'active'`,
        [tenantRef, resourceRef]
      );
      const row = result.rows[0];
      if (row) return { label: row.display_name, deepLink: `/files?asset=${encodeURIComponent(resourceRef)}` };
    }
    if (kind === "teaching_plan") {
      const result = await this.pool.query<{ preparation_task_ref: string | null }>(
        `SELECT lifecycle.preparation_task_ref
           FROM artifact.teaching_plan_scope_lifecycle AS lifecycle
           JOIN education.lesson AS lesson ON lesson.lesson_ref = lifecycle.lesson_ref
           JOIN education.curriculum_unit AS unit ON unit.unit_ref = lesson.unit_ref
           JOIN education.course_run AS course ON course.course_run_ref = unit.course_run_ref
          WHERE course.tenant_ref = $1
            AND (lifecycle.revision_ref = $2 OR lifecycle.artifact_ref = $2)
          ORDER BY lifecycle.updated_at DESC LIMIT 1`,
        [tenantRef, resourceRef]
      );
      const row = result.rows[0];
      if (row) return {
        label: "教学计划",
        deepLink: row.preparation_task_ref
          ? `/teaching-plan/tasks/${encodeURIComponent(row.preparation_task_ref)}`
          : "/teaching-plan"
      };
    }
    throw new NotFoundError("关联资源不存在或不在当前教师授权范围内。");
  }

  private async requiredTodo(
    executor: PostgresClient,
    tenantRef: string,
    teacherRef: string,
    todoRef: string,
    lock = false
  ) {
    const todo = await this.work.getTodo(executor, tenantRef, teacherRef, todoRef, lock);
    if (!todo) throw new NotFoundError("教师待办不存在。");
    return todo;
  }

  private async requiredCalendarEvent(
    executor: PostgresClient,
    tenantRef: string,
    teacherRef: string,
    eventRef: string
  ) {
    const event = await this.work.getCalendarEvent(executor, tenantRef, teacherRef, eventRef);
    if (!event) throw new NotFoundError("日历事件不存在。");
    return event;
  }

  private async executeCommand<T extends Record<string, unknown>>(input: {
    tenantRef: string;
    actorRef: string;
    purpose: string;
    idempotencyKey: string;
    requestFingerprint: string;
    action: string;
    resourceRef: string;
    requestedFieldMask: string[];
    operation: (context: CommandContext) => Promise<T>;
  }): Promise<T | Record<string, unknown>> {
    const rootKey = [input.tenantRef, input.actorRef, input.purpose, input.idempotencyKey].join("|");
    const decisionRef = stableDecisionRef(rootKey);
    const now = new Date().toISOString();
    const writeContext: WriteContext = {
      actorRef: input.actorRef,
      purpose: input.purpose,
      rootIdempotencyKey: input.idempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt: now
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(client, {
        idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: input.requestFingerprint,
        metadata: createWriteMetadata(writeContext, "governance", "gate2-8-command-idempotency")
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return { ...reservation.result, replayed: true };
      }
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: input.purpose,
        action: input.action,
        resourceRef: input.resourceRef,
        requestedFieldMask: input.requestedFieldMask,
        effect: "allow",
        reasonCodes: ["synthetic-teacher-role", "teacher-owned-work-scope"],
        policyVersion: "policy:gate2-8-teacher-workbench-local@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(writeContext, "governance", "gate2-8-command-authorization")
        })
      ];
      const result = await input.operation({ client, writeContext, receipts });
      await this.governance.completeIdempotency(client, { rootKey, result, completedAt: now });
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

  private todoVersionConflict(expectedVersion: number): never {
    throw new DomainConflictError(
      "TEACHER_TODO_VERSION_OR_STATE_CONFLICT",
      "待办版本或状态已经变化。",
      { expectedVersion }
    );
  }

  private calendarVersionConflict(expectedVersion: number): never {
    throw new DomainConflictError(
      "CALENDAR_EVENT_VERSION_OR_STATE_CONFLICT",
      "日历事件版本或状态已经变化。",
      { expectedVersion }
    );
  }

  private assertDemoActor(tenantRef: string, actorRef: string): void {
    if (tenantRef !== gate2DemoRefs.tenantRef || actorRef !== gate2DemoRefs.teacherRef) {
      throw new AuthorizationDeniedError("当前教师无权访问其他 tenant 或教师的工作台数据。");
    }
  }
}

function sumProjectionCount(
  projections: TeacherWorkProjectionView[],
  sourceType: string
): number {
  return projections
    .filter((item) => item.sourceType === sourceType)
    .reduce((sum, item) => {
      const match = item.summary.match(/(\d+)/u);
      return sum + Number(match?.[1] ?? 1);
    }, 0);
}

function dayBounds(now: Date, timezone: string): { start: string; end: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const year = Number(parts["year"]);
  const month = Number(parts["month"]);
  const day = Number(parts["day"]);
  const start = zonedDateToUtc(year, month, day, 0, 0, timezone);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const end = zonedDateToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    timezone
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

function zonedDateToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  for (let index = 0; index < 2; index += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(candidate))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    const represented = Date.UTC(
      Number(parts["year"]),
      Number(parts["month"]) - 1,
      Number(parts["day"]),
      Number(parts["hour"]),
      Number(parts["minute"])
    );
    candidate += target - represented;
  }
  return new Date(candidate);
}

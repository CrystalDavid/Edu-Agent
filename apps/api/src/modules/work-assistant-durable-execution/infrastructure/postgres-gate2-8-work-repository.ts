import type {
  CalendarEventStatus,
  CalendarEventType,
  FormalWriteMetadata,
  FormalWriteReceipt,
  ManualCalendarEventView,
  TeacherResourceKind,
  TeacherResourceLink,
  TeacherTodoPriority,
  TeacherTodoStatus,
  TeacherTodoView,
  TeacherWorkProjectionView,
  TaskWorkingSet
} from "@edu-agent/contracts";
import {
  ManualCalendarEventViewSchema,
  TaskWorkingSetSchema,
  TeacherTodoViewSchema,
  TeacherWorkProjectionViewSchema
} from "@edu-agent/contracts";

import type {
  PostgresClient,
  SqlExecutor
} from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues,
  toPostgresJson
} from "../../../platform/postgres/write-context.js";

type WorkMetadata = FormalWriteMetadata & { owner: "work" };

export type WorkProjectionSnapshot = Omit<
  TeacherWorkProjectionView,
  | "pinned"
  | "snoozedUntil"
  | "hiddenUntil"
  | "preferenceVersion"
  | "lastProjectedAt"
>;

type TodoRow = {
  todo_ref: string;
  tenant_ref: string;
  teacher_ref: string;
  title: string;
  description: string;
  priority: TeacherTodoPriority;
  due_at: Date | null;
  status: TeacherTodoStatus;
  version: number;
  pinned: boolean;
  snoozed_until: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  cancelled_at: Date | null;
};

type ResourceLinkRow = {
  link_ref: string;
  resource_kind: TeacherResourceKind;
  resource_ref: string;
  label: string;
  deep_link: string;
  created_at: Date;
};

type CalendarRow = {
  event_ref: string;
  tenant_ref: string;
  teacher_ref: string;
  title: string;
  description: string;
  start_at: Date;
  end_at: Date;
  timezone: string;
  all_day: boolean;
  event_type: CalendarEventType;
  status: CalendarEventStatus;
  related_todo_ref: string | null;
  version: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  cancelled_at: Date | null;
};

type ProjectionRow = {
  projection_ref: string;
  tenant_ref: string;
  teacher_ref: string;
  projection_kind: "action" | "calendar" | "information";
  source_module: "work" | "education" | "artifact" | "capability";
  source_type: string;
  source_ref: string;
  source_version: string;
  title: string;
  summary: string;
  display_status: string;
  due_at: Date | null;
  start_at: Date | null;
  end_at: Date | null;
  recommended_action: string;
  deep_link: string;
  priority: TeacherTodoPriority;
  status: "active" | "resolved";
  last_projected_at: Date;
  pinned: boolean | null;
  snoozed_until: Date | null;
  hidden_until: Date | null;
  preference_version: number | null;
};

const todoSelect = `
  SELECT todo_ref, tenant_ref, teacher_ref, title, description,
         priority, due_at, status, version, pinned, snoozed_until,
         created_by, created_at, updated_at, completed_at, cancelled_at
    FROM work.teacher_todo`;

const calendarSelect = `
  SELECT event_ref, tenant_ref, teacher_ref, title, description,
         start_at, end_at, timezone, all_day, event_type, status,
         related_todo_ref, version, created_by, created_at, updated_at,
         completed_at, cancelled_at
    FROM work.calendar_event`;

const projectionSelect = `
  SELECT projection.projection_ref, projection.tenant_ref,
         projection.teacher_ref, projection.projection_kind,
         projection.source_module, projection.source_type,
         projection.source_ref, projection.source_version,
         projection.title, projection.summary,
         projection.display_status, projection.due_at,
         projection.start_at, projection.end_at,
         projection.recommended_action, projection.deep_link,
         projection.priority, projection.status,
         projection.last_projected_at,
         preference.pinned, preference.snoozed_until,
         preference.hidden_until,
         preference.version AS preference_version
    FROM work.teacher_work_projection AS projection
    LEFT JOIN work.teacher_work_preference AS preference
      ON preference.target_ref = projection.projection_ref
     AND preference.target_version = projection.source_version
     AND preference.tenant_ref = projection.tenant_ref
     AND preference.teacher_ref = projection.teacher_ref`;

export class PostgresGate28WorkRepository {
  async listTodos(
    executor: SqlExecutor,
    input: {
      tenantRef: string;
      teacherRef: string;
      status: TeacherTodoStatus | "all";
      dueBefore?: string;
      includeSnoozed: boolean;
    }
  ): Promise<TeacherTodoView[]> {
    const result = await executor.query<TodoRow>(
      `${todoSelect}
       WHERE tenant_ref = $1
         AND teacher_ref = $2
         AND ($3::text = 'all' OR status = $3)
         AND ($4::timestamptz IS NULL OR due_at <= $4)
         AND (
           $5::boolean = true
           OR snoozed_until IS NULL
           OR snoozed_until <= now()
         )
       ORDER BY pinned DESC,
                CASE priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                due_at NULLS LAST,
                updated_at DESC`,
      [
        input.tenantRef,
        input.teacherRef,
        input.status,
        input.dueBefore ?? null,
        input.includeSnoozed
      ]
    );
    return Promise.all(
      result.rows.map((row) => this.hydrateTodo(executor, row))
    );
  }

  async getTodo(
    executor: SqlExecutor,
    tenantRef: string,
    teacherRef: string,
    todoRef: string,
    lock = false
  ): Promise<TeacherTodoView | undefined> {
    const result = await executor.query<TodoRow>(
      `${todoSelect}
       WHERE tenant_ref = $1 AND teacher_ref = $2 AND todo_ref = $3
       ${lock ? "FOR UPDATE" : ""}`,
      [tenantRef, teacherRef, todoRef]
    );
    const row = result.rows[0];
    return row ? this.hydrateTodo(executor, row) : undefined;
  }

  async insertTodo(
    client: PostgresClient,
    input: {
      todoRef: string;
      tenantRef: string;
      teacherRef: string;
      title: string;
      description: string;
      priority: TeacherTodoPriority;
      dueAt: string | null;
      createdBy: string;
      metadata: WorkMetadata;
      historyMetadata: WorkMetadata;
      outboxMetadata: WorkMetadata;
      historyRef: string;
      outboxRef: string;
    }
  ): Promise<FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO work.teacher_todo (
         todo_ref, tenant_ref, teacher_ref, title, description,
         priority, due_at, status, version, created_by, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'active', 1, $8, $9,
         $10, $11, $12, $13, $14, $15, $16
       )`,
      [
        input.todoRef,
        input.tenantRef,
        input.teacherRef,
        input.title,
        input.description,
        input.priority,
        input.dueAt,
        input.createdBy,
        input.metadata.createdAt,
        ...formalMetadataValues(input.metadata)
      ]
    );
    await this.insertTodoHistory(client, {
      historyRef: input.historyRef,
      todoRef: input.todoRef,
      fromStatus: null,
      toStatus: "active",
      todoVersion: 1,
      reason: "教师创建个人待办",
      metadata: input.historyMetadata
    });
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: "TeacherTodoCreated",
      aggregateRef: input.todoRef,
      payload: { todoRef: input.todoRef, status: "active", version: 1 },
      metadata: input.outboxMetadata
    });
    return [
      createReceipt({ writeRef: input.todoRef, recordType: "TeacherTodo", metadata: input.metadata }),
      createReceipt({ writeRef: input.historyRef, recordType: "TeacherTodoStatusHistory", metadata: input.historyMetadata }),
      createReceipt({ writeRef: input.outboxRef, recordType: "OutboxRecord", metadata: input.outboxMetadata })
    ];
  }

  async updateTodo(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      todoRef: string;
      expectedVersion: number;
      title: string;
      description: string;
      priority: TeacherTodoPriority;
      dueAt: string | null;
      updatedAt: string;
      metadata: WorkMetadata;
      outboxMetadata: WorkMetadata;
      outboxRef: string;
    }
  ): Promise<FormalWriteReceipt[] | undefined> {
    const updated = await client.query<{ version: number }>(
      `UPDATE work.teacher_todo
          SET title = $5, description = $6, priority = $7, due_at = $8,
              version = version + 1, updated_at = $9
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND todo_ref = $3
          AND version = $4 AND status = 'active'
        RETURNING version`,
      [input.tenantRef, input.teacherRef, input.todoRef, input.expectedVersion,
        input.title, input.description, input.priority, input.dueAt, input.updatedAt]
    );
    const version = updated.rows[0]?.version;
    if (!version) return undefined;
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: "TeacherTodoUpdated",
      aggregateRef: input.todoRef,
      payload: { todoRef: input.todoRef, status: "active", version },
      metadata: input.outboxMetadata
    });
    return [
      createReceipt({ writeRef: input.todoRef, recordType: "TeacherTodo", metadata: input.metadata }),
      createReceipt({ writeRef: input.outboxRef, recordType: "OutboxRecord", metadata: input.outboxMetadata })
    ];
  }

  async transitionTodo(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      todoRef: string;
      expectedVersion: number;
      fromStatuses: TeacherTodoStatus[];
      toStatus: TeacherTodoStatus;
      occurredAt: string;
      reason: string;
      metadata: WorkMetadata;
      historyMetadata: WorkMetadata;
      outboxMetadata: WorkMetadata;
      historyRef: string;
      outboxRef: string;
    }
  ): Promise<FormalWriteReceipt[] | undefined> {
    const current = await client.query<{
      version: number;
      status: TeacherTodoStatus;
    }>(
      `SELECT version, status
         FROM work.teacher_todo
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND todo_ref = $3
        FOR UPDATE`,
      [input.tenantRef, input.teacherRef, input.todoRef]
    );
    const before = current.rows[0];
    if (
      !before ||
      before.version !== input.expectedVersion ||
      !input.fromStatuses.includes(before.status)
    ) {
      return undefined;
    }
    const updated = await client.query<{ version: number }>(
      `UPDATE work.teacher_todo
          SET status = $5,
              version = version + 1,
              completed_at = CASE WHEN $5 = 'completed' THEN $6::timestamptz ELSE NULL END,
              cancelled_at = CASE WHEN $5 = 'cancelled' THEN $6::timestamptz ELSE NULL END,
              updated_at = $6
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND todo_ref = $3
          AND version = $4
        RETURNING version`,
      [input.tenantRef, input.teacherRef, input.todoRef, input.expectedVersion,
        input.toStatus, input.occurredAt]
    );
    const version = updated.rows[0]?.version;
    if (!version) return undefined;
    await this.insertTodoHistory(client, {
      historyRef: input.historyRef,
      todoRef: input.todoRef,
      fromStatus: before.status,
      toStatus: input.toStatus,
      todoVersion: version,
      reason: input.reason,
      metadata: input.historyMetadata
    });
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: input.toStatus === "active" ? "TeacherTodoReopened" : input.toStatus === "completed" ? "TeacherTodoCompleted" : "TeacherTodoCancelled",
      aggregateRef: input.todoRef,
      payload: { todoRef: input.todoRef, status: input.toStatus, version },
      metadata: input.outboxMetadata
    });
    return [
      createReceipt({ writeRef: input.todoRef, recordType: "TeacherTodo", metadata: input.metadata }),
      createReceipt({ writeRef: input.historyRef, recordType: "TeacherTodoStatusHistory", metadata: input.historyMetadata }),
      createReceipt({ writeRef: input.outboxRef, recordType: "OutboxRecord", metadata: input.outboxMetadata })
    ];
  }

  async updateTodoPreference(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      todoRef: string;
      expectedVersion: number;
      pinned?: boolean;
      snoozedUntil?: string | null;
      updatedAt: string;
      metadata: WorkMetadata;
      outboxMetadata: WorkMetadata;
      outboxRef: string;
    }
  ): Promise<FormalWriteReceipt[] | undefined> {
    const updated = await client.query<{ version: number }>(
      `UPDATE work.teacher_todo
          SET pinned = COALESCE($5::boolean, pinned),
              snoozed_until = CASE WHEN $6::boolean THEN $7::timestamptz ELSE snoozed_until END,
              version = version + 1,
              updated_at = $8
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND todo_ref = $3
          AND version = $4
        RETURNING version`,
      [input.tenantRef, input.teacherRef, input.todoRef, input.expectedVersion,
        input.pinned ?? null, input.snoozedUntil !== undefined,
        input.snoozedUntil ?? null, input.updatedAt]
    );
    const version = updated.rows[0]?.version;
    if (!version) return undefined;
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: "TeacherTodoPreferenceUpdated",
      aggregateRef: input.todoRef,
      payload: { todoRef: input.todoRef, version },
      metadata: input.outboxMetadata
    });
    return [
      createReceipt({ writeRef: input.todoRef, recordType: "TeacherTodoPreference", metadata: input.metadata }),
      createReceipt({ writeRef: input.outboxRef, recordType: "OutboxRecord", metadata: input.outboxMetadata })
    ];
  }

  async insertTodoResourceLink(
    client: PostgresClient,
    input: {
      linkRef: string;
      tenantRef: string;
      teacherRef: string;
      todoRef: string;
      expectedVersion: number;
      resourceKind: TeacherResourceKind;
      resourceRef: string;
      label: string;
      deepLink: string;
      updatedAt: string;
      metadata: WorkMetadata;
      outboxMetadata: WorkMetadata;
      outboxRef: string;
    }
  ): Promise<FormalWriteReceipt[] | undefined> {
    const changed = await client.query<{ version: number }>(
      `UPDATE work.teacher_todo
          SET version = version + 1, updated_at = $5
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND todo_ref = $3
          AND version = $4 AND status = 'active'
        RETURNING version`,
      [input.tenantRef, input.teacherRef, input.todoRef, input.expectedVersion, input.updatedAt]
    );
    const version = changed.rows[0]?.version;
    if (!version) return undefined;
    await client.query(
      `INSERT INTO work.teacher_todo_resource_link (
         link_ref, todo_ref, resource_kind, resource_ref, label, deep_link,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [input.linkRef, input.todoRef, input.resourceKind, input.resourceRef,
        input.label, input.deepLink, ...formalMetadataValues(input.metadata)]
    );
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: "TeacherTodoResourceLinked",
      aggregateRef: input.todoRef,
      payload: { todoRef: input.todoRef, resourceKind: input.resourceKind, resourceRef: input.resourceRef, version },
      metadata: input.outboxMetadata
    });
    return [
      createReceipt({ writeRef: input.todoRef, recordType: "TeacherTodo", metadata: input.metadata }),
      createReceipt({ writeRef: input.linkRef, recordType: "TeacherTodoResourceLink", metadata: input.metadata }),
      createReceipt({ writeRef: input.outboxRef, recordType: "OutboxRecord", metadata: input.outboxMetadata })
    ];
  }

  async listCalendarEvents(
    executor: SqlExecutor,
    input: { tenantRef: string; teacherRef: string; from: string; to: string }
  ): Promise<ManualCalendarEventView[]> {
    const result = await executor.query<CalendarRow>(
      `${calendarSelect}
       WHERE tenant_ref = $1 AND teacher_ref = $2
         AND status <> 'cancelled'
         AND start_at < $4::timestamptz AND end_at > $3::timestamptz
       ORDER BY start_at, end_at, event_ref`,
      [input.tenantRef, input.teacherRef, input.from, input.to]
    );
    return Promise.all(result.rows.map((row) => this.hydrateCalendar(executor, row)));
  }

  async getCalendarEvent(
    executor: SqlExecutor,
    tenantRef: string,
    teacherRef: string,
    eventRef: string,
    lock = false
  ): Promise<ManualCalendarEventView | undefined> {
    const result = await executor.query<CalendarRow>(
      `${calendarSelect}
       WHERE tenant_ref = $1 AND teacher_ref = $2 AND event_ref = $3
       ${lock ? "FOR UPDATE" : ""}`,
      [tenantRef, teacherRef, eventRef]
    );
    const row = result.rows[0];
    return row ? this.hydrateCalendar(executor, row) : undefined;
  }

  async insertCalendarEvent(
    client: PostgresClient,
    input: {
      eventRef: string;
      tenantRef: string;
      teacherRef: string;
      title: string;
      description: string;
      startAt: string;
      endAt: string;
      timezone: string;
      allDay: boolean;
      eventType: CalendarEventType;
      relatedTodoRef: string | null;
      createdBy: string;
      metadata: WorkMetadata;
      historyMetadata: WorkMetadata;
      outboxMetadata: WorkMetadata;
      historyRef: string;
      outboxRef: string;
    }
  ): Promise<FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO work.calendar_event (
         event_ref, tenant_ref, teacher_ref, title, description,
         start_at, end_at, timezone, all_day, event_type, status,
         related_todo_ref, version, created_by, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled',
         $11, 1, $12, $13, $14, $15, $16, $17, $18, $19, $20
       )`,
      [input.eventRef, input.tenantRef, input.teacherRef, input.title,
        input.description, input.startAt, input.endAt, input.timezone,
        input.allDay, input.eventType, input.relatedTodoRef, input.createdBy,
        input.metadata.createdAt, ...formalMetadataValues(input.metadata)]
    );
    await this.insertCalendarHistory(client, {
      historyRef: input.historyRef,
      eventRef: input.eventRef,
      fromStatus: null,
      toStatus: "scheduled",
      eventVersion: 1,
      reason: "教师创建日历事件",
      metadata: input.historyMetadata
    });
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: "CalendarEventScheduled",
      aggregateRef: input.eventRef,
      payload: { eventRef: input.eventRef, status: "scheduled", version: 1 },
      metadata: input.outboxMetadata
    });
    return [
      createReceipt({ writeRef: input.eventRef, recordType: "CalendarEvent", metadata: input.metadata }),
      createReceipt({ writeRef: input.historyRef, recordType: "CalendarEventStatusHistory", metadata: input.historyMetadata }),
      createReceipt({ writeRef: input.outboxRef, recordType: "OutboxRecord", metadata: input.outboxMetadata })
    ];
  }

  async updateCalendarEvent(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      eventRef: string;
      expectedVersion: number;
      title: string;
      description: string;
      startAt: string;
      endAt: string;
      timezone: string;
      allDay: boolean;
      eventType: CalendarEventType;
      updatedAt: string;
      metadata: WorkMetadata;
      outboxMetadata: WorkMetadata;
      outboxRef: string;
    }
  ): Promise<FormalWriteReceipt[] | undefined> {
    const updated = await client.query<{ version: number }>(
      `UPDATE work.calendar_event
          SET title = $5, description = $6, start_at = $7, end_at = $8,
              timezone = $9, all_day = $10, event_type = $11,
              version = version + 1, updated_at = $12
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND event_ref = $3
          AND version = $4 AND status = 'scheduled'
        RETURNING version`,
      [input.tenantRef, input.teacherRef, input.eventRef, input.expectedVersion,
        input.title, input.description, input.startAt, input.endAt,
        input.timezone, input.allDay, input.eventType, input.updatedAt]
    );
    const version = updated.rows[0]?.version;
    if (!version) return undefined;
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: "CalendarEventUpdated",
      aggregateRef: input.eventRef,
      payload: { eventRef: input.eventRef, status: "scheduled", version },
      metadata: input.outboxMetadata
    });
    return [
      createReceipt({ writeRef: input.eventRef, recordType: "CalendarEvent", metadata: input.metadata }),
      createReceipt({ writeRef: input.outboxRef, recordType: "OutboxRecord", metadata: input.outboxMetadata })
    ];
  }

  async transitionCalendarEvent(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      eventRef: string;
      expectedVersion: number;
      toStatus: "completed" | "cancelled";
      occurredAt: string;
      metadata: WorkMetadata;
      historyMetadata: WorkMetadata;
      outboxMetadata: WorkMetadata;
      historyRef: string;
      outboxRef: string;
    }
  ): Promise<FormalWriteReceipt[] | undefined> {
    const updated = await client.query<{ version: number }>(
      `UPDATE work.calendar_event
          SET status = $5::text, version = version + 1,
              completed_at = CASE
                WHEN $5::text = 'completed' THEN $6::timestamptz
                ELSE NULL::timestamptz
              END,
              cancelled_at = CASE
                WHEN $5::text = 'cancelled' THEN $6::timestamptz
                ELSE NULL::timestamptz
              END,
              updated_at = $6::timestamptz
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND event_ref = $3
          AND version = $4 AND status = 'scheduled'
        RETURNING version`,
      [input.tenantRef, input.teacherRef, input.eventRef, input.expectedVersion,
        input.toStatus, input.occurredAt]
    );
    const version = updated.rows[0]?.version;
    if (!version) return undefined;
    await this.insertCalendarHistory(client, {
      historyRef: input.historyRef,
      eventRef: input.eventRef,
      fromStatus: "scheduled",
      toStatus: input.toStatus,
      eventVersion: version,
      reason: input.toStatus === "completed" ? "教师确认日历事件已发生" : "教师取消日历事件",
      metadata: input.historyMetadata
    });
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: input.toStatus === "completed" ? "CalendarEventCompleted" : "CalendarEventCancelled",
      aggregateRef: input.eventRef,
      payload: { eventRef: input.eventRef, status: input.toStatus, version },
      metadata: input.outboxMetadata
    });
    return [
      createReceipt({ writeRef: input.eventRef, recordType: "CalendarEvent", metadata: input.metadata }),
      createReceipt({ writeRef: input.historyRef, recordType: "CalendarEventStatusHistory", metadata: input.historyMetadata }),
      createReceipt({ writeRef: input.outboxRef, recordType: "OutboxRecord", metadata: input.outboxMetadata })
    ];
  }

  async insertTodoCalendarLink(
    client: PostgresClient,
    input: { linkRef: string; todoRef: string; eventRef: string; metadata: WorkMetadata }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO work.todo_calendar_link (
         link_ref, todo_ref, event_ref,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [input.linkRef, input.todoRef, input.eventRef, ...formalMetadataValues(input.metadata)]
    );
    return createReceipt({ writeRef: input.linkRef, recordType: "TodoCalendarLink", metadata: input.metadata });
  }

  async syncProjections(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      snapshots: WorkProjectionSnapshot[];
      projectedAt: string;
    }
  ): Promise<void> {
    for (const snapshot of input.snapshots) {
      await client.query(
        `INSERT INTO work.teacher_work_projection (
           projection_ref, tenant_ref, teacher_ref, projection_kind,
           source_module, source_type, source_ref, source_version,
           title, summary, display_status, due_at, start_at, end_at,
           recommended_action, deep_link, priority, status, last_projected_at,
           actor_ref, purpose, owner_module, idempotency_key,
           authorization_decision_ref, audit_ref, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           $14, $15, $16, $17, $18, $19,
           'system:teacher-work-projection', 'teacher-work-projection.rebuild',
           'work', $20, 'authorization:teacher-work-projection-system',
           $21, $19
         )
         ON CONFLICT (
           tenant_ref, teacher_ref, projection_kind,
           source_module, source_type, source_ref
         ) DO UPDATE SET
           source_version = EXCLUDED.source_version,
           title = EXCLUDED.title,
           summary = EXCLUDED.summary,
           display_status = EXCLUDED.display_status,
           due_at = EXCLUDED.due_at,
           start_at = EXCLUDED.start_at,
           end_at = EXCLUDED.end_at,
           recommended_action = EXCLUDED.recommended_action,
           deep_link = EXCLUDED.deep_link,
           priority = EXCLUDED.priority,
           status = EXCLUDED.status,
           last_projected_at = EXCLUDED.last_projected_at`,
        [snapshot.projectionRef, snapshot.tenantRef, snapshot.teacherRef,
          snapshot.projectionKind, snapshot.sourceModule, snapshot.sourceType,
          snapshot.sourceRef, snapshot.sourceVersion, snapshot.title,
          snapshot.summary, snapshot.displayStatus, snapshot.dueAt,
          snapshot.startAt, snapshot.endAt, snapshot.recommendedAction,
          snapshot.deepLink, snapshot.priority, snapshot.status,
          input.projectedAt, `projection:${snapshot.projectionRef}`,
          `audit:projection:${snapshot.projectionRef}`]
      );
    }
    const activeRefs = input.snapshots.map((item) => item.projectionRef);
    await client.query(
      `UPDATE work.teacher_work_projection
          SET status = 'resolved', last_projected_at = $3
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND status = 'active'
          AND NOT (projection_ref = ANY($4::text[]))`,
      [input.tenantRef, input.teacherRef, input.projectedAt, activeRefs]
    );
  }

  async listProjections(
    executor: SqlExecutor,
    input: {
      tenantRef: string;
      teacherRef: string;
      kind?: "action" | "calendar" | "information";
      from?: string;
      to?: string;
      includeDeferred?: boolean;
    }
  ): Promise<TeacherWorkProjectionView[]> {
    const result = await executor.query<ProjectionRow>(
      `${projectionSelect}
       WHERE projection.tenant_ref = $1
         AND projection.teacher_ref = $2
         AND projection.status = 'active'
         AND ($3::text IS NULL OR projection.projection_kind = $3)
         AND (
           $4::timestamptz IS NULL OR $5::timestamptz IS NULL
           OR (
             COALESCE(projection.start_at, projection.due_at) < $5
             AND COALESCE(projection.end_at, projection.due_at + interval '1 second') > $4
           )
         )
         AND (
           $6::boolean = true
           OR preference.snoozed_until IS NULL
           OR preference.snoozed_until <= now()
         )
         AND (
           $6::boolean = true
           OR preference.hidden_until IS NULL
           OR preference.hidden_until <= now()
         )
       ORDER BY COALESCE(preference.pinned, false) DESC,
                CASE projection.priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                projection.due_at NULLS LAST,
                projection.last_projected_at DESC`,
      [input.tenantRef, input.teacherRef, input.kind ?? null,
        input.from ?? null, input.to ?? null, input.includeDeferred ?? false]
    );
    return result.rows.map(toProjection);
  }

  async getProjection(
    executor: SqlExecutor,
    tenantRef: string,
    teacherRef: string,
    projectionRef: string
  ): Promise<TeacherWorkProjectionView | undefined> {
    const result = await executor.query<ProjectionRow>(
      `${projectionSelect}
       WHERE projection.tenant_ref = $1 AND projection.teacher_ref = $2
         AND projection.projection_ref = $3`,
      [tenantRef, teacherRef, projectionRef]
    );
    const row = result.rows[0];
    return row ? toProjection(row) : undefined;
  }

  async upsertProjectionPreference(
    client: PostgresClient,
    input: {
      preferenceRef: string;
      tenantRef: string;
      teacherRef: string;
      projectionRef: string;
      sourceVersion: string;
      expectedPreferenceVersion: number;
      pinned?: boolean;
      snoozedUntil?: string | null;
      hiddenUntil?: string | null;
      updatedAt: string;
      metadata: WorkMetadata;
      outboxMetadata: WorkMetadata;
      outboxRef: string;
    }
  ): Promise<{ version: number; receipts: FormalWriteReceipt[] } | undefined> {
    const existing = await client.query<{ preference_ref: string; version: number; pinned: boolean; snoozed_until: Date | null; hidden_until: Date | null }>(
      `SELECT preference_ref, version, pinned, snoozed_until, hidden_until
         FROM work.teacher_work_preference
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND target_ref = $3
          AND target_version = $4
        FOR UPDATE`,
      [input.tenantRef, input.teacherRef, input.projectionRef, input.sourceVersion]
    );
    const current = existing.rows[0];
    let version: number;
    if (!current) {
      if (input.expectedPreferenceVersion !== 0) return undefined;
      await client.query(
        `INSERT INTO work.teacher_work_preference (
           preference_ref, tenant_ref, teacher_ref, target_kind,
           target_ref, target_version, pinned, snoozed_until, hidden_until,
           version, updated_at,
           actor_ref, purpose, owner_module, idempotency_key,
           authorization_decision_ref, audit_ref, created_at
         ) VALUES (
           $1, $2, $3, 'projection', $4, $5, $6, $7, $8, 1, $9,
           $10, $11, $12, $13, $14, $15, $16
         )`,
        [input.preferenceRef, input.tenantRef, input.teacherRef,
          input.projectionRef, input.sourceVersion, input.pinned ?? false,
          input.snoozedUntil ?? null, input.hiddenUntil ?? null,
          input.updatedAt, ...formalMetadataValues(input.metadata)]
      );
      version = 1;
    } else {
      if (current.version !== input.expectedPreferenceVersion) return undefined;
      const updated = await client.query<{ version: number }>(
        `UPDATE work.teacher_work_preference
            SET pinned = $5,
                snoozed_until = $6,
                hidden_until = $7,
                version = version + 1,
                updated_at = $8
          WHERE tenant_ref = $1 AND teacher_ref = $2 AND target_ref = $3
            AND target_version = $4 AND version = $9
          RETURNING version`,
        [input.tenantRef, input.teacherRef, input.projectionRef,
          input.sourceVersion, input.pinned ?? current.pinned,
          input.snoozedUntil !== undefined ? input.snoozedUntil : current.snoozed_until,
          input.hiddenUntil !== undefined ? input.hiddenUntil : current.hidden_until,
          input.updatedAt, input.expectedPreferenceVersion]
      );
      const updatedVersion = updated.rows[0]?.version;
      if (!updatedVersion) return undefined;
      version = updatedVersion;
    }
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: "TeacherWorkPreferenceUpdated",
      aggregateRef: input.projectionRef,
      payload: { projectionRef: input.projectionRef, sourceVersion: input.sourceVersion, version },
      metadata: input.outboxMetadata
    });
    return {
      version,
      receipts: [
        createReceipt({ writeRef: input.preferenceRef, recordType: "TeacherWorkPreference", metadata: input.metadata }),
        createReceipt({ writeRef: input.outboxRef, recordType: "OutboxRecord", metadata: input.outboxMetadata })
      ]
    };
  }

  async attachTodoContext(
    client: PostgresClient,
    input: {
      taskRef: string;
      expectedWorkingSetVersion: number;
      todoRef: string;
      resourceRefs: string[];
      revisionRef: string;
      updatedAt: string;
      metadata: WorkMetadata;
    }
  ): Promise<FormalWriteReceipt | undefined> {
    const updated = await client.query<{
      current_version: number;
      course_run_ref: string;
      curriculum_unit_ref: string;
      lesson_ref: string;
      learning_objective_refs: string[];
      evidence_refs: string[];
      baseline_teaching_plan_ref: string | null;
      source_lesson_ref: string | null;
      source_assignment_ref: string | null;
      source_assignment_item_refs: string[];
      source_reflection_ref: string | null;
      source_delivery_revision_ref: string | null;
      source_observation_revision_refs: string[];
      context_purpose: string;
      requested_field_mask: string[];
    }>(
      `UPDATE work.task_working_set
          SET current_version = current_version + 1,
              source_todo_ref = $3,
              source_resource_refs = $4,
              updated_by = $5,
              updated_at = $6
        WHERE task_ref = $1 AND current_version = $2
        RETURNING current_version, course_run_ref, curriculum_unit_ref,
                  lesson_ref, learning_objective_refs, evidence_refs,
                  baseline_teaching_plan_ref, source_lesson_ref,
                  source_assignment_ref, source_assignment_item_refs,
                  source_reflection_ref, source_delivery_revision_ref,
                  source_observation_revision_refs,
                  context_purpose, requested_field_mask`,
      [input.taskRef, input.expectedWorkingSetVersion, input.todoRef,
        toPostgresJson(input.resourceRefs), input.metadata.actorRef, input.updatedAt]
    );
    const row = updated.rows[0];
    if (!row) return undefined;
    await client.query(
      `INSERT INTO work.task_working_set_revision (
         working_set_revision_ref, task_ref, working_set_version,
         course_run_ref, curriculum_unit_ref, lesson_ref,
         learning_objective_refs, evidence_refs, baseline_teaching_plan_ref,
         source_lesson_ref, source_assignment_ref, source_assignment_item_refs,
         source_todo_ref, source_resource_refs, context_purpose,
         source_reflection_ref, source_delivery_revision_ref,
         source_observation_revision_refs,
         requested_field_mask,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
         $23, $24, $25, $26
       )`,
      [input.revisionRef, input.taskRef, row.current_version,
        row.course_run_ref, row.curriculum_unit_ref, row.lesson_ref,
        toPostgresJson(row.learning_objective_refs), toPostgresJson(row.evidence_refs),
        row.baseline_teaching_plan_ref, row.source_lesson_ref,
        row.source_assignment_ref, toPostgresJson(row.source_assignment_item_refs),
        input.todoRef, toPostgresJson(input.resourceRefs), row.context_purpose,
        row.source_reflection_ref, row.source_delivery_revision_ref,
        toPostgresJson(row.source_observation_revision_refs),
        toPostgresJson(row.requested_field_mask), ...formalMetadataValues(input.metadata)]
    );
    return createReceipt({ writeRef: input.revisionRef, recordType: "TaskWorkingSet", metadata: input.metadata });
  }

  async getWorkingSet(
    executor: SqlExecutor,
    taskRef: string
  ): Promise<TaskWorkingSet | undefined> {
    const result = await executor.query<{
      task_ref: string;
      current_version: number;
      course_run_ref: string;
      curriculum_unit_ref: string;
      lesson_ref: string;
      learning_objective_refs: string[];
      evidence_refs: string[];
      baseline_teaching_plan_ref: string | null;
      source_lesson_ref: string | null;
      source_assignment_ref: string | null;
      source_assignment_item_refs: string[];
      source_todo_ref: string | null;
      source_resource_refs: string[];
      source_reflection_ref: string | null;
      source_delivery_revision_ref: string | null;
      source_observation_revision_refs: string[];
      context_purpose: string;
      requested_field_mask: string[];
      updated_at: Date;
    }>(
      `SELECT task_ref, current_version, course_run_ref,
              curriculum_unit_ref, lesson_ref, learning_objective_refs,
              evidence_refs, baseline_teaching_plan_ref, source_lesson_ref,
              source_assignment_ref, source_assignment_item_refs,
              source_todo_ref, source_resource_refs,
              source_reflection_ref, source_delivery_revision_ref,
              source_observation_revision_refs, context_purpose,
              requested_field_mask, updated_at
         FROM work.task_working_set
        WHERE task_ref = $1`,
      [taskRef]
    );
    const row = result.rows[0];
    return row
      ? TaskWorkingSetSchema.parse({
          taskRef: row.task_ref,
          version: row.current_version,
          courseRunRef: row.course_run_ref,
          curriculumUnitRef: row.curriculum_unit_ref,
          lessonRef: row.lesson_ref,
          learningObjectiveRefs: row.learning_objective_refs,
          evidenceRefs: row.evidence_refs,
          baselineTeachingPlanRef: row.baseline_teaching_plan_ref,
          sourceLessonRef: row.source_lesson_ref,
          sourceAssignmentRef: row.source_assignment_ref,
          sourceAssignmentItemRefs: row.source_assignment_item_refs,
          sourceTodoRef: row.source_todo_ref,
          sourceResourceRefs: row.source_resource_refs,
          sourceReflectionRef: row.source_reflection_ref,
          sourceDeliveryRevisionRef: row.source_delivery_revision_ref,
          sourceObservationRevisionRefs: row.source_observation_revision_refs,
          purpose: row.context_purpose,
          requestedFieldMask: row.requested_field_mask,
          updatedAt: row.updated_at.toISOString()
        })
      : undefined;
  }

  private async hydrateTodo(executor: SqlExecutor, row: TodoRow): Promise<TeacherTodoView> {
    const [links, events] = await Promise.all([
      executor.query<ResourceLinkRow>(
        `SELECT link_ref, resource_kind, resource_ref, label, deep_link, created_at
           FROM work.teacher_todo_resource_link
          WHERE todo_ref = $1 ORDER BY created_at, link_ref`,
        [row.todo_ref]
      ),
      executor.query<{ event_ref: string }>(
        `SELECT event_ref FROM work.todo_calendar_link
          WHERE todo_ref = $1 ORDER BY created_at, event_ref`,
        [row.todo_ref]
      )
    ]);
    return TeacherTodoViewSchema.parse({
      todoRef: row.todo_ref,
      tenantRef: row.tenant_ref,
      teacherRef: row.teacher_ref,
      title: row.title,
      description: row.description,
      priority: row.priority,
      dueAt: row.due_at?.toISOString() ?? null,
      status: row.status,
      version: row.version,
      pinned: row.pinned,
      snoozedUntil: row.snoozed_until?.toISOString() ?? null,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
      cancelledAt: row.cancelled_at?.toISOString() ?? null,
      resourceLinks: links.rows.map(toResourceLink),
      scheduledEventRefs: events.rows.map((item) => item.event_ref)
    });
  }

  private async hydrateCalendar(executor: SqlExecutor, row: CalendarRow): Promise<ManualCalendarEventView> {
    const links = row.related_todo_ref
      ? await executor.query<ResourceLinkRow>(
          `SELECT link_ref, resource_kind, resource_ref, label, deep_link, created_at
             FROM work.teacher_todo_resource_link
            WHERE todo_ref = $1 ORDER BY created_at, link_ref`,
          [row.related_todo_ref]
        )
      : { rows: [] as ResourceLinkRow[] };
    return ManualCalendarEventViewSchema.parse({
      eventRef: row.event_ref,
      tenantRef: row.tenant_ref,
      teacherRef: row.teacher_ref,
      title: row.title,
      description: row.description,
      startAt: row.start_at.toISOString(),
      endAt: row.end_at.toISOString(),
      timezone: row.timezone,
      allDay: row.all_day,
      eventType: row.event_type,
      status: row.status,
      relatedTodoRef: row.related_todo_ref,
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
      cancelledAt: row.cancelled_at?.toISOString() ?? null,
      resourceLinks: links.rows.map(toResourceLink)
    });
  }

  private async insertTodoHistory(
    client: PostgresClient,
    input: {
      historyRef: string;
      todoRef: string;
      fromStatus: TeacherTodoStatus | null;
      toStatus: TeacherTodoStatus;
      todoVersion: number;
      reason: string;
      metadata: WorkMetadata;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO work.teacher_todo_status_history (
         history_ref, todo_ref, from_status, to_status, todo_version, reason,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [input.historyRef, input.todoRef, input.fromStatus, input.toStatus,
        input.todoVersion, input.reason, ...formalMetadataValues(input.metadata)]
    );
  }

  private async insertCalendarHistory(
    client: PostgresClient,
    input: {
      historyRef: string;
      eventRef: string;
      fromStatus: CalendarEventStatus | null;
      toStatus: CalendarEventStatus;
      eventVersion: number;
      reason: string;
      metadata: WorkMetadata;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO work.calendar_event_status_history (
         history_ref, event_ref, from_status, to_status, event_version, reason,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [input.historyRef, input.eventRef, input.fromStatus, input.toStatus,
        input.eventVersion, input.reason, ...formalMetadataValues(input.metadata)]
    );
  }

  private async insertOutbox(
    client: PostgresClient,
    input: {
      outboxRef: string;
      eventName: string;
      aggregateRef: string;
      payload: Record<string, unknown>;
      metadata: WorkMetadata;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO work.outbox_record (
         outbox_ref, event_name, aggregate_ref, payload,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [input.outboxRef, input.eventName, input.aggregateRef,
        toPostgresJson(input.payload), ...formalMetadataValues(input.metadata)]
    );
  }
}

function toResourceLink(row: ResourceLinkRow): TeacherResourceLink {
  return {
    linkRef: row.link_ref,
    resourceKind: row.resource_kind,
    resourceRef: row.resource_ref,
    label: row.label,
    deepLink: row.deep_link,
    createdAt: row.created_at.toISOString()
  };
}

function toProjection(row: ProjectionRow): TeacherWorkProjectionView {
  return TeacherWorkProjectionViewSchema.parse({
    projectionRef: row.projection_ref,
    tenantRef: row.tenant_ref,
    teacherRef: row.teacher_ref,
    projectionKind: row.projection_kind,
    sourceModule: row.source_module,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    sourceVersion: row.source_version,
    title: row.title,
    summary: row.summary,
    displayStatus: row.display_status,
    dueAt: row.due_at?.toISOString() ?? null,
    startAt: row.start_at?.toISOString() ?? null,
    endAt: row.end_at?.toISOString() ?? null,
    recommendedAction: row.recommended_action,
    deepLink: row.deep_link,
    priority: row.priority,
    status: row.status,
    pinned: row.pinned ?? false,
    snoozedUntil: row.snoozed_until?.toISOString() ?? null,
    hiddenUntil: row.hidden_until?.toISOString() ?? null,
    preferenceVersion: row.preference_version ?? 0,
    lastProjectedAt: row.last_projected_at.toISOString()
  });
}

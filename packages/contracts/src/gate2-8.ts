import { z } from "zod";

import { TaskWorkingSetSchema } from "./gate2-5.js";

export const TeacherTodoStatusSchema = z.enum([
  "active",
  "completed",
  "cancelled"
]);

export const TeacherTodoPrioritySchema = z.enum([
  "high",
  "normal",
  "low"
]);

export const TeacherResourceKindSchema = z.enum([
  "lesson",
  "assignment",
  "file",
  "teaching_plan",
  "lesson_reflection",
  "lesson_delivery",
  "classroom_observation"
]);

export const TeacherResourceLinkSchema = z.object({
  linkRef: z.string().min(1),
  resourceKind: TeacherResourceKindSchema,
  resourceRef: z.string().min(1),
  label: z.string().min(1),
  deepLink: z.string().min(1),
  createdAt: z.string().datetime()
});

export const TeacherTodoViewSchema = z.object({
  todoRef: z.string().min(1),
  tenantRef: z.string().min(1),
  teacherRef: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  priority: TeacherTodoPrioritySchema,
  dueAt: z.string().datetime().nullable(),
  status: TeacherTodoStatusSchema,
  version: z.number().int().positive(),
  pinned: z.boolean(),
  snoozedUntil: z.string().datetime().nullable(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  resourceLinks: z.array(TeacherResourceLinkSchema),
  scheduledEventRefs: z.array(z.string().min(1))
});

export const TeacherTodoListSchema = z.object({
  items: z.array(TeacherTodoViewSchema)
});

export const TeacherTodoListQuerySchema = z.object({
  status: z.enum(["active", "completed", "cancelled", "all"])
    .default("active"),
  dueBefore: z.string().datetime().optional(),
  includeSnoozed: z.enum(["true", "false"]).default("false")
});

export const CreateTeacherTodoRequestSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(4_000).default(""),
  priority: TeacherTodoPrioritySchema.default("normal"),
  dueAt: z.string().datetime().nullable().default(null),
  purpose: z.literal("teacher-todo.create"),
  idempotencyKey: z.string().min(8)
});

export const UpdateTeacherTodoRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().min(1).max(300),
  description: z.string().max(4_000),
  priority: TeacherTodoPrioritySchema,
  dueAt: z.string().datetime().nullable(),
  purpose: z.literal("teacher-todo.update"),
  idempotencyKey: z.string().min(8)
});

export const TeacherTodoActionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  purpose: z.enum([
    "teacher-todo.complete",
    "teacher-todo.reopen",
    "teacher-todo.cancel"
  ]),
  idempotencyKey: z.string().min(8)
});

export const TeacherTodoPreferenceRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  pinned: z.boolean().optional(),
  snoozedUntil: z.string().datetime().nullable().optional(),
  purpose: z.literal("teacher-todo.preference.update"),
  idempotencyKey: z.string().min(8)
}).refine(
  (value) => value.pinned !== undefined || value.snoozedUntil !== undefined,
  { message: "At least one Todo preference must be supplied." }
);

export const LinkTeacherTodoResourceRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  resourceKind: TeacherResourceKindSchema,
  resourceRef: z.string().min(1),
  purpose: z.literal("teacher-todo.resource.link"),
  idempotencyKey: z.string().min(8)
});

export const TeacherTodoMutationResultSchema = z.object({
  replayed: z.boolean(),
  todo: TeacherTodoViewSchema
});

export const CalendarEventStatusSchema = z.enum([
  "scheduled",
  "completed",
  "cancelled"
]);

export const CalendarEventTypeSchema = z.enum([
  "class",
  "meeting",
  "grading",
  "lesson_preparation",
  "custom_reminder",
  "todo_time_block",
  "assignment_deadline"
]);

export const ManualCalendarEventViewSchema = z.object({
  eventRef: z.string().min(1),
  tenantRef: z.string().min(1),
  teacherRef: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().min(1),
  allDay: z.boolean(),
  eventType: CalendarEventTypeSchema,
  status: CalendarEventStatusSchema,
  relatedTodoRef: z.string().min(1).nullable(),
  version: z.number().int().positive(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  resourceLinks: z.array(TeacherResourceLinkSchema)
});

export const CreateCalendarEventRequestSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(4_000).default(""),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().min(1).default("Asia/Shanghai"),
  allDay: z.boolean().default(false),
  eventType: CalendarEventTypeSchema.exclude([
    "assignment_deadline"
  ]).default("custom_reminder"),
  relatedTodoRef: z.string().min(1).nullable().default(null),
  purpose: z.literal("calendar-event.create"),
  idempotencyKey: z.string().min(8)
});

export const UpdateCalendarEventRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().min(1).max(300),
  description: z.string().max(4_000),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().min(1),
  allDay: z.boolean(),
  eventType: CalendarEventTypeSchema.exclude([
    "assignment_deadline"
  ]),
  purpose: z.literal("calendar-event.update"),
  idempotencyKey: z.string().min(8)
});

export const CalendarEventActionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  purpose: z.enum([
    "calendar-event.complete",
    "calendar-event.cancel"
  ]),
  idempotencyKey: z.string().min(8)
});

export const CalendarEventMutationResultSchema = z.object({
  replayed: z.boolean(),
  event: ManualCalendarEventViewSchema
});

export const ScheduleTodoRequestSchema = z.object({
  expectedTodoVersion: z.number().int().positive(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().min(1).default("Asia/Shanghai"),
  allDay: z.boolean().default(false),
  purpose: z.literal("teacher-todo.schedule"),
  idempotencyKey: z.string().min(8)
});

export const ScheduleTodoResultSchema = z.object({
  replayed: z.boolean(),
  todo: TeacherTodoViewSchema,
  event: ManualCalendarEventViewSchema
});

export const TeacherWorkProjectionKindSchema = z.enum([
  "action",
  "calendar",
  "information"
]);

export const TeacherWorkProjectionViewSchema = z.object({
  projectionRef: z.string().min(1),
  tenantRef: z.string().min(1),
  teacherRef: z.string().min(1),
  projectionKind: TeacherWorkProjectionKindSchema,
  sourceModule: z.enum([
    "work",
    "education",
    "artifact",
    "capability"
  ]),
  sourceType: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceVersion: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  displayStatus: z.string().min(1),
  dueAt: z.string().datetime().nullable(),
  startAt: z.string().datetime().nullable(),
  endAt: z.string().datetime().nullable(),
  recommendedAction: z.string().min(1),
  deepLink: z.string().min(1),
  priority: TeacherTodoPrioritySchema,
  status: z.enum(["active", "resolved"]),
  pinned: z.boolean(),
  snoozedUntil: z.string().datetime().nullable(),
  hiddenUntil: z.string().datetime().nullable(),
  preferenceVersion: z.number().int().nonnegative(),
  lastProjectedAt: z.string().datetime()
});

export const TeacherWorkProjectionListSchema = z.object({
  items: z.array(TeacherWorkProjectionViewSchema),
  generatedAt: z.string().datetime()
});

export const WorkProjectionPreferenceRequestSchema = z.object({
  sourceVersion: z.string().min(1),
  expectedPreferenceVersion: z.number().int().nonnegative(),
  pinned: z.boolean().optional(),
  snoozedUntil: z.string().datetime().nullable().optional(),
  hiddenUntil: z.string().datetime().nullable().optional(),
  purpose: z.enum([
    "teacher-work-projection.preference.update",
    "teacher-work-projection.preference.restore"
  ]),
  idempotencyKey: z.string().min(8)
});

export const WorkProjectionPreferenceResultSchema = z.object({
  replayed: z.boolean(),
  projection: TeacherWorkProjectionViewSchema,
  preferenceVersion: z.number().int().positive()
});

export const TeacherCalendarItemSchema = z.discriminatedUnion(
  "sourceKind",
  [
    z.object({
      sourceKind: z.literal("manual"),
      event: ManualCalendarEventViewSchema,
      readOnly: z.literal(false),
      deepLink: z.string().min(1).nullable()
    }),
    z.object({
      sourceKind: z.literal("source_projection"),
      projection: TeacherWorkProjectionViewSchema,
      readOnly: z.literal(true),
      deepLink: z.string().min(1)
    })
  ]
);

export const TeacherCalendarListQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  mode: z.enum(["day", "week", "month"]),
  timezone: z.string().min(1).default("Asia/Shanghai")
});

export const TeacherCalendarListSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  timezone: z.string().min(1),
  items: z.array(TeacherCalendarItemSchema)
});

export const WorkbenchRecentFileSchema = z.object({
  assetRef: z.string().min(1),
  displayName: z.string().min(1),
  versionNumber: z.number().int().positive(),
  source: z.string().min(1),
  updatedAt: z.string().datetime(),
  deepLink: z.string().min(1)
});

export const TeacherWorkbenchOverviewSchema = z.object({
  todayCalendar: z.array(TeacherCalendarItemSchema),
  todayTodos: z.array(TeacherTodoViewSchema),
  actionItems: z.array(TeacherWorkProjectionViewSchema),
  dueSoon: z.array(TeacherWorkProjectionViewSchema),
  pendingGradingCount: z.number().int().nonnegative(),
  pendingPlanReviewCount: z.number().int().nonnegative(),
  incompletePreparationCount: z.number().int().nonnegative(),
  modelFailureCount: z.number().int().nonnegative(),
  recentFiles: z.array(WorkbenchRecentFileSchema),
  generatedAt: z.string().datetime()
});

export const TodoAgentHandoffRequestSchema = z.object({
  expectedTodoVersion: z.number().int().positive(),
  purpose: z.literal("teacher-todo.agent-handoff"),
  idempotencyKey: z.string().min(8)
});

export const TodoAgentHandoffResultSchema = z.object({
  replayed: z.boolean(),
  todoRef: z.string().min(1),
  taskRef: z.string().min(1),
  workingSet: TaskWorkingSetSchema,
  deepLink: z.string().min(1)
});

export type TeacherTodoStatus = z.infer<typeof TeacherTodoStatusSchema>;
export type TeacherTodoPriority = z.infer<typeof TeacherTodoPrioritySchema>;
export type TeacherResourceKind = z.infer<typeof TeacherResourceKindSchema>;
export type TeacherResourceLink = z.infer<typeof TeacherResourceLinkSchema>;
export type TeacherTodoView = z.infer<typeof TeacherTodoViewSchema>;
export type TeacherTodoListQuery = z.infer<typeof TeacherTodoListQuerySchema>;
export type CreateTeacherTodoRequest = z.infer<typeof CreateTeacherTodoRequestSchema>;
export type UpdateTeacherTodoRequest = z.infer<typeof UpdateTeacherTodoRequestSchema>;
export type TeacherTodoActionRequest = z.infer<typeof TeacherTodoActionRequestSchema>;
export type TeacherTodoPreferenceRequest = z.infer<typeof TeacherTodoPreferenceRequestSchema>;
export type LinkTeacherTodoResourceRequest = z.infer<typeof LinkTeacherTodoResourceRequestSchema>;
export type CalendarEventStatus = z.infer<typeof CalendarEventStatusSchema>;
export type CalendarEventType = z.infer<typeof CalendarEventTypeSchema>;
export type ManualCalendarEventView = z.infer<typeof ManualCalendarEventViewSchema>;
export type CreateCalendarEventRequest = z.infer<typeof CreateCalendarEventRequestSchema>;
export type UpdateCalendarEventRequest = z.infer<typeof UpdateCalendarEventRequestSchema>;
export type CalendarEventActionRequest = z.infer<typeof CalendarEventActionRequestSchema>;
export type ScheduleTodoRequest = z.infer<typeof ScheduleTodoRequestSchema>;
export type TeacherWorkProjectionView = z.infer<typeof TeacherWorkProjectionViewSchema>;
export type WorkProjectionPreferenceRequest = z.infer<typeof WorkProjectionPreferenceRequestSchema>;
export type TeacherCalendarListQuery = z.infer<typeof TeacherCalendarListQuerySchema>;
export type TeacherCalendarItem = z.infer<typeof TeacherCalendarItemSchema>;
export type TeacherWorkbenchOverview = z.infer<typeof TeacherWorkbenchOverviewSchema>;
export type TodoAgentHandoffRequest = z.infer<typeof TodoAgentHandoffRequestSchema>;

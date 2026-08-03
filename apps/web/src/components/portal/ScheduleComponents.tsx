import { useEffect, useMemo, useState } from "react";

import type {
  ManualCalendarEventView,
  TeacherCalendarItem,
  TeacherTodoView,
  TeacherWorkProjectionView
} from "@edu-agent/contracts";
import { Button, Checkbox, Modal, Select } from "antd";

import {
  calendarEventTypeLabel,
  cleanDisplayText,
  workProjectionStatusLabel,
  workSourceLabel
} from "../../presentation";
import { WorkspaceIcon } from "../WorkspaceIcon";
import { ModuleCard, StatusPill } from "./PortalPrimitives";

export type CalendarMode = "day" | "week" | "month";

const teacherTimezone = "Asia/Shanghai";

export type CalendarEventDraft = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  eventType:
    | "class"
    | "meeting"
    | "grading"
    | "lesson_preparation"
    | "custom_reminder";
};

export function CalendarView(props: {
  mode: CalendarMode;
  selectedDate: string;
  events: TeacherCalendarItem[];
  loading: boolean;
  error: string | null;
  onModeChange: (mode: CalendarMode) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onCreate: (draft: CalendarEventDraft) => Promise<void>;
  onUpdate: (
    event: ManualCalendarEventView,
    draft: CalendarEventDraft
  ) => Promise<void>;
  onCancelEvent: (event: ManualCalendarEventView) => Promise<void>;
  onOpenSource: (deepLink: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ManualCalendarEventView | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const defaultStart = `${props.selectedDate}T15:00`;
  const defaultEnd = `${props.selectedDate}T16:00`;

  const save = async (draft: CalendarEventDraft) => {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) await props.onUpdate(editing, draft);
      else await props.onCreate(draft);
      setEditing(null);
      setCreateOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "日历事件保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="calendar-workspace" data-testid="calendar-view">
      <header className="calendar-toolbar">
        <div className="segmented-control" aria-label="日历视图">
          {([
            ["day", "日"],
            ["week", "周"],
            ["month", "月"]
          ] as const).map(([mode, label]) => (
            <button
              type="button"
              key={mode}
              className={props.mode === mode ? "is-active" : ""}
              aria-pressed={props.mode === mode}
              onClick={() => props.onModeChange(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="calendar-period">
          <button type="button" aria-label="上一周期" onClick={props.onPrevious}>
            <WorkspaceIcon name="arrowLeft" />
          </button>
          <button type="button" onClick={props.onToday}>今天</button>
          <button type="button" aria-label="下一周期" onClick={props.onNext}>
            <WorkspaceIcon name="arrowRight" />
          </button>
          <strong>{periodLabel(props.selectedDate, props.mode)}</strong>
        </div>
        <Button
          type="primary"
          icon={<WorkspaceIcon name="plus" />}
          onClick={() => setCreateOpen(true)}
        >
          新建日程
        </Button>
      </header>

      {props.error ? <p role="alert" className="inline-error">{props.error}</p> : null}
      {props.loading ? <p className="loading-copy">正在读取日历…</p> : null}
      {!props.loading && props.mode === "day" ? (
        <DayCalendar
          date={props.selectedDate}
          events={props.events}
          onEdit={setEditing}
          onOpenSource={props.onOpenSource}
        />
      ) : null}
      {!props.loading && props.mode === "week" ? (
        <WeekCalendar
          date={props.selectedDate}
          events={props.events}
          onEdit={setEditing}
          onOpenSource={props.onOpenSource}
        />
      ) : null}
      {!props.loading && props.mode === "month" ? (
        <MonthCalendar
          date={props.selectedDate}
          events={props.events}
          onEdit={setEditing}
          onOpenSource={props.onOpenSource}
        />
      ) : null}

      <CalendarEventModal
        open={createOpen || editing !== null}
        initial={editing
          ? {
              title: editing.title,
              description: editing.description,
              startAt: toLocalInput(editing.startAt),
              endAt: toLocalInput(editing.endAt),
              eventType: editing.eventType === "todo_time_block"
                ? "custom_reminder"
                : editing.eventType as CalendarEventDraft["eventType"]
            }
          : {
              title: "",
              description: "",
              startAt: defaultStart,
              endAt: defaultEnd,
              eventType: "custom_reminder"
            }}
        editing={editing !== null}
        saving={saving}
        error={formError}
        onCancel={() => {
          setCreateOpen(false);
          setEditing(null);
          setFormError(null);
        }}
        onSave={save}
        {...(editing
          ? { onCancelEvent: async () => {
              setSaving(true);
              setFormError(null);
              try {
                await props.onCancelEvent(editing);
                setEditing(null);
              } catch (error) {
                setFormError(error instanceof Error ? error.message : "Calendar event cancellation failed");
              } finally {
                setSaving(false);
              }
            } }
          : {})}
      />
    </section>
  );
}

function CalendarEventModal(props: {
  open: boolean;
  initial: CalendarEventDraft;
  editing: boolean;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (draft: CalendarEventDraft) => Promise<void>;
  onCancelEvent?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(props.initial);
  useEffect(() => {
    if (props.open) setDraft(props.initial);
  }, [props.open, props.initial]);
  return (
    <Modal
      title={props.editing ? "编辑手工日程" : "新建手工日程"}
      open={props.open}
      onCancel={props.onCancel}
      okText={props.saving ? "保存中…" : "保存"}
      cancelText="取消"
      okButtonProps={{ disabled: props.saving || !draft.title.trim() }}
      onOk={() => void props.onSave(draft)}
    >
      <div className="demo-form">
        <label>
          标题
          <input
            data-testid="calendar-title-input"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label>
          说明
          <textarea
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>
        <label>
          类型
          <Select
            value={draft.eventType}
            onChange={(eventType) => setDraft({ ...draft, eventType })}
            options={[
              { value: "class", label: "上课" },
              { value: "meeting", label: "会议" },
              { value: "grading", label: "批改" },
              { value: "lesson_preparation", label: "备课" },
              { value: "custom_reminder", label: "自定义提醒" }
            ]}
          />
        </label>
        <label>
          开始
          <input
            type="datetime-local"
            value={draft.startAt}
            onChange={(event) => setDraft({ ...draft, startAt: event.target.value })}
          />
        </label>
        <label>
          结束
          <input
            type="datetime-local"
            value={draft.endAt}
            onChange={(event) => setDraft({ ...draft, endAt: event.target.value })}
          />
        </label>
        <p>手工日程可以在这里调整时间；来源业务日程需进入源页面修改。</p>
        {props.error ? <p role="alert">{props.error}</p> : null}
        {props.editing && props.onCancelEvent ? (
          <Button danger disabled={props.saving} onClick={() => void props.onCancelEvent?.()}>
            Cancel this event
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}

function DayCalendar(props: {
  date: string;
  events: TeacherCalendarItem[];
  onEdit: (event: ManualCalendarEventView) => void;
  onOpenSource: (deepLink: string) => void;
}) {
  const events = props.events.filter((event) => eventDate(event) === props.date);
  return (
    <div className="day-calendar" data-testid="day-calendar">
      {Array.from({ length: 12 }, (_, index) => `${String(index + 7).padStart(2, "0")}:00`).map((hour) => (
        <div className="day-calendar__row" key={hour}>
          <time>{hour}</time>
          <div>
            {events.filter((event) => eventHour(event) === hour.slice(0, 2)).map((event) => (
              <CalendarEntry
                key={eventKey(event)}
                item={event}
                onEdit={props.onEdit}
                onOpenSource={props.onOpenSource}
              />
            ))}
          </div>
        </div>
      ))}
      {events.length === 0 ? <p className="empty-copy">当天没有日历事件。</p> : null}
    </div>
  );
}

function WeekCalendar(props: {
  date: string;
  events: TeacherCalendarItem[];
  onEdit: (event: ManualCalendarEventView) => void;
  onOpenSource: (deepLink: string) => void;
}) {
  const dates = weekDates(props.date);
  return (
    <div className="week-calendar" data-testid="week-calendar">
      {dates.map((date) => (
        <section key={date} className={date === localDate(new Date()) ? "is-today" : ""}>
          <header>
            <span>{weekdayLabel(date)}</span>
            <strong>{date.slice(-2)}</strong>
          </header>
          <div>
            {props.events.filter((event) => eventDate(event) === date).map((event) => (
              <CalendarEntry
                key={eventKey(event)}
                item={event}
                compact
                onEdit={props.onEdit}
                onOpenSource={props.onOpenSource}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MonthCalendar(props: {
  date: string;
  events: TeacherCalendarItem[];
  onEdit: (event: ManualCalendarEventView) => void;
  onOpenSource: (deepLink: string) => void;
}) {
  const dates = monthGridDates(props.date);
  const month = props.date.slice(0, 7);
  return (
    <div className="month-calendar" data-testid="month-calendar">
      <header>
        {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => <span key={day}>{day}</span>)}
      </header>
      <div className="month-calendar__grid">
        {dates.map((date) => (
          <article
            key={date}
            className={`${date.slice(0, 7) !== month ? "is-muted" : ""}${date === localDate(new Date()) ? " is-today" : ""}`}
          >
            <strong>{Number(date.slice(-2))}</strong>
            {props.events.filter((event) => eventDate(event) === date).slice(0, 3).map((event) => (
              <button
                type="button"
                key={eventKey(event)}
                className={event.sourceKind === "manual" ? "month-entry" : "month-entry month-entry--source"}
                onClick={() => event.sourceKind === "manual"
                  ? props.onEdit(event.event)
                  : props.onOpenSource(event.deepLink)}
              >
                {eventTitle(event)}
              </button>
            ))}
          </article>
        ))}
      </div>
    </div>
  );
}

function CalendarEntry(props: {
  item: TeacherCalendarItem;
  compact?: boolean;
  onEdit: (event: ManualCalendarEventView) => void;
  onOpenSource: (deepLink: string) => void;
}) {
  const manual = props.item.sourceKind === "manual";
  const title = eventTitle(props.item);
  const status = props.item.sourceKind === "manual"
    ? calendarEventTypeLabel(props.item.event.eventType)
    : workProjectionStatusLabel(props.item.projection.displayStatus);
  const activate = () => {
    if (props.item.sourceKind === "manual") props.onEdit(props.item.event);
    else props.onOpenSource(props.item.deepLink);
  };
  return (
    <button
      type="button"
      className={manual ? "calendar-event" : "calendar-event calendar-event--source"}
      onClick={activate}
      title={manual ? "编辑手工日程" : "来源业务日程只读，点击进入源页面"}
    >
      {!props.compact ? <StatusPill tone={manual ? "blue" : "warning"}>{manual ? "手工" : "来源"}</StatusPill> : null}
      <strong>{cleanDisplayText(title)}</strong>
      <span>{formatTime(eventStart(props.item))}–{formatTime(eventEnd(props.item))} · {status}</span>
    </button>
  );
}

export function TodoPanel(props: {
  todos: TeacherTodoView[];
  projections: TeacherWorkProjectionView[];
  lessonOptions: Array<{ value: string; label: string }>;
  loading: boolean;
  error: string | null;
  onCreate: (draft: {
    title: string;
    description: string;
    priority: "high" | "normal" | "low";
    dueAt: string | null;
  }) => Promise<void>;
  onUpdate: (todo: TeacherTodoView, draft: {
    title: string;
    description: string;
    priority: "high" | "normal" | "low";
    dueAt: string | null;
  }) => Promise<void>;
  onComplete: (todo: TeacherTodoView) => Promise<void>;
  onReopen: (todo: TeacherTodoView) => Promise<void>;
  onCancel: (todo: TeacherTodoView) => Promise<void>;
  onPin: (todo: TeacherTodoView) => Promise<void>;
  onSnooze: (todo: TeacherTodoView) => Promise<void>;
  onRestoreTodo: (todo: TeacherTodoView) => Promise<void>;
  onSchedule: (
    todo: TeacherTodoView,
    startAt: string,
    endAt: string
  ) => Promise<void>;
  onLinkLesson: (todo: TeacherTodoView, lessonRef: string) => Promise<void>;
  onSendToAgent: (todo: TeacherTodoView) => Promise<void>;
  onOpenSource: (deepLink: string) => void;
  onSnoozeSource: (projection: TeacherWorkProjectionView) => Promise<void>;
  onPinSource: (projection: TeacherWorkProjectionView) => Promise<void>;
  onRestoreSource: (projection: TeacherWorkProjectionView) => Promise<void>;
}) {
  const [filter, setFilter] = useState<"active" | "completed" | "cancelled" | "later" | "source">("active");
  const [showDeferredSources, setShowDeferredSources] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTodo, setEditTodo] = useState<TeacherTodoView | null>(null);
  const [scheduleTodo, setScheduleTodo] = useState<TeacherTodoView | null>(null);
  const [linkTodo, setLinkTodo] = useState<TeacherTodoView | null>(null);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const filtered = useMemo(() => {
    if (filter === "source") return [];
    if (filter === "later") {
      return props.todos.filter((todo) => todo.status === "active" && isFuture(todo.snoozedUntil));
    }
    return props.todos.filter((todo) => todo.status === filter && (filter !== "active" || !isFuture(todo.snoozedUntil)));
  }, [filter, props.todos]);
  const visibleProjections = useMemo(
    () => showDeferredSources
      ? props.projections
      : props.projections.filter((projection) => !isFuture(projection.snoozedUntil) && !isFuture(projection.hiddenUntil)),
    [props.projections, showDeferredSources]
  );

  const run = async (ref: string, action: () => Promise<void>) => {
    setBusyRef(ref);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusyRef(null);
    }
  };

  return (
    <ModuleCard
      className="todo-panel"
      title="待办与业务提醒"
      description="手工待办可直接完成；来源事项必须回到源业务处理"
      action={<Button size="small" onClick={() => setCreateOpen(true)}>新建待办</Button>}
      testId="todo-panel"
    >
      <div className="todo-filter">
        {([
          ["active", "进行中"],
          ["completed", "已完成"],
          ["cancelled", "已取消"],
          ["later", "稍后提醒"],
          ["source", `业务提醒 ${visibleProjections.length}`]
        ] as const).map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={filter === value ? "is-active" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {props.error ? <p role="alert">{props.error}</p> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
      {props.loading ? <p>正在读取真实工作台数据…</p> : null}
      <div className="todo-list">
        {filter !== "source" ? filtered.map((todo) => (
          <article key={todo.todoRef} data-testid={`todo-${todo.todoRef}`}>
            <Checkbox
              checked={todo.status === "completed"}
              disabled={busyRef === todo.todoRef || todo.status === "cancelled"}
              onChange={() => void run(todo.todoRef, () => todo.status === "completed"
                ? props.onReopen(todo)
                : props.onComplete(todo))}
              aria-label={`${todo.status === "completed" ? "重新打开" : "完成"} ${todo.title}`}
            />
            <div>
              <strong>{todo.pinned ? "📌 " : ""}{todo.title}</strong>
              <span>{todo.description || "个人待办"}</span>
              <small>{todo.dueAt ? formatDateTime(todo.dueAt) : "未设截止"} · {priorityLabel(todo.priority)}</small>
              {todo.resourceLinks.length > 0 ? (
                <small>{todo.resourceLinks.map((link) => link.label).join(" · ")}</small>
              ) : null}
            </div>
            <div className="todo-actions">
              <button type="button" title={todo.pinned ? "取消置顶" : "置顶"} onClick={() => void run(todo.todoRef, () => props.onPin(todo))}>
                <WorkspaceIcon name="star" />
              </button>
              {todo.status === "active" && filter !== "later" ? (
                <>
                  <button type="button" title="编辑待办" onClick={() => setEditTodo(todo)}>
                    <WorkspaceIcon name="edit" />
                  </button>
                  <button type="button" title="安排到日历" onClick={() => setScheduleTodo(todo)}>
                    <WorkspaceIcon name="calendar" />
                  </button>
                  <button type="button" title="关联课时" onClick={() => setLinkTodo(todo)}>
                    <WorkspaceIcon name="lesson" />
                  </button>
                  <button type="button" title="明天提醒" onClick={() => void run(todo.todoRef, () => props.onSnooze(todo))}>
                    <WorkspaceIcon name="clock" />
                  </button>
                  <button
                    type="button"
                    title={todo.resourceLinks.some((link) => link.resourceKind === "lesson")
                      ? "在 Agent 中处理"
                      : "请先关联课时"}
                    disabled={!todo.resourceLinks.some((link) => link.resourceKind === "lesson")}
                    onClick={() => void run(todo.todoRef, () => props.onSendToAgent(todo))}
                  >
                    <WorkspaceIcon name="agent" />
                  </button>
                  <button type="button" title="取消待办" onClick={() => void run(todo.todoRef, () => props.onCancel(todo))}>
                    <WorkspaceIcon name="trash" />
                  </button>
                </>
              ) : null}
              {filter === "later" ? (
                <button type="button" title="恢复显示" onClick={() => void run(todo.todoRef, () => props.onRestoreTodo(todo))}>
                  <WorkspaceIcon name="reset" />
                </button>
              ) : null}
            </div>
          </article>
        )) : <>
          <div className="source-work-item__toolbar">
            <Button size="small" onClick={() => setShowDeferredSources((value) => !value)}>
              {showDeferredSources ? "隐藏已稍后提醒" : "查看已稍后提醒"}
            </Button>
          </div>
          {visibleProjections.map((projection) => (
          <article key={projection.projectionRef} className="source-work-item">
            <span className="source-work-item__marker"><WorkspaceIcon name="attachment" /></span>
            <div>
              <strong>{projection.pinned ? "📌 " : ""}{cleanDisplayText(projection.title)}</strong>
              <span>{cleanDisplayText(projection.summary)}</span>
              <small>{workSourceLabel(projection.sourceModule)} · {workProjectionStatusLabel(projection.displayStatus)}{projection.dueAt ? ` · ${formatDateTime(projection.dueAt)}` : ""}</small>
            </div>
            <div className="source-work-item__actions">
              <Button size="small" onClick={() => void run(projection.projectionRef, () => props.onPinSource(projection))}>
                {projection.pinned ? "取消置顶" : "置顶"}
              </Button>
              <Button size="small" type="primary" onClick={() => props.onOpenSource(projection.deepLink)}>
                {projection.recommendedAction}
              </Button>
              <Button size="small" onClick={() => void run(projection.projectionRef, () => props.onSnoozeSource(projection))}>
                明天提醒
              </Button>
              {isFuture(projection.snoozedUntil) || isFuture(projection.hiddenUntil) ? (
                <Button size="small" onClick={() => void run(projection.projectionRef, () => props.onRestoreSource(projection))}>
                  恢复显示
                </Button>
              ) : null}
            </div>
          </article>
          ))}
        </>}
        {!props.loading && filter !== "source" && filtered.length === 0 ? <p className="empty-copy">当前分组没有待办。</p> : null}
        {!props.loading && filter === "source" && visibleProjections.length === 0 ? <p className="empty-copy">当前没有需要教师处理的来源事项。</p> : null}
      </div>

      <TodoCreateModal
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onSave={async (draft) => {
          await run("create", () => props.onCreate(draft));
          setCreateOpen(false);
        }}
      />
      <TodoEditModal
        todo={editTodo}
        onCancel={() => setEditTodo(null)}
        onSave={async (draft) => {
          if (!editTodo) return;
          await run(editTodo.todoRef, () => props.onUpdate(editTodo, draft));
          setEditTodo(null);
        }}
      />
      <TodoScheduleModal
        todo={scheduleTodo}
        onCancel={() => setScheduleTodo(null)}
        onSave={async (startAt, endAt) => {
          if (!scheduleTodo) return;
          await run(scheduleTodo.todoRef, () => props.onSchedule(scheduleTodo, startAt, endAt));
          setScheduleTodo(null);
        }}
      />
      <TodoLessonModal
        todo={linkTodo}
        options={props.lessonOptions}
        onCancel={() => setLinkTodo(null)}
        onSave={async (lessonRef) => {
          if (!linkTodo) return;
          await run(linkTodo.todoRef, () => props.onLinkLesson(linkTodo, lessonRef));
          setLinkTodo(null);
        }}
      />
    </ModuleCard>
  );
}

function TodoCreateModal(props: {
  open: boolean;
  onCancel: () => void;
  onSave: (draft: {
    title: string;
    description: string;
    priority: "high" | "normal" | "low";
    dueAt: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"high" | "normal" | "low">("normal");
  const [dueAt, setDueAt] = useState("");
  useEffect(() => {
    if (!props.open) {
      setTitle("");
      setDescription("");
      setPriority("normal");
      setDueAt("");
    }
  }, [props.open]);
  return (
    <Modal
      title="新建个人待办"
      open={props.open}
      onCancel={props.onCancel}
      okText="创建"
      okButtonProps={{ disabled: !title.trim() }}
      onOk={() => void props.onSave({
        title: title.trim(),
        description: description.trim(),
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null
      })}
    >
      <div className="demo-form">
        <label>标题<input data-testid="todo-title-input" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>说明<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>优先级<Select value={priority} onChange={setPriority} options={[
          { value: "high", label: "高" },
          { value: "normal", label: "普通" },
          { value: "low", label: "低" }
        ]} /></label>
        <label>截止时间<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
      </div>
    </Modal>
  );
}

function TodoEditModal(props: {
  todo: TeacherTodoView | null;
  onCancel: () => void;
  onSave: (draft: {
    title: string;
    description: string;
    priority: "high" | "normal" | "low";
    dueAt: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"high" | "normal" | "low">("normal");
  const [dueAt, setDueAt] = useState("");
  useEffect(() => {
    if (!props.todo) return;
    setTitle(props.todo.title);
    setDescription(props.todo.description);
    setPriority(props.todo.priority);
    setDueAt(props.todo.dueAt ? toLocalInput(props.todo.dueAt) : "");
  }, [props.todo]);
  return (
    <Modal
      title="编辑个人待办"
      open={props.todo !== null}
      onCancel={props.onCancel}
      okText="保存"
      okButtonProps={{ disabled: !title.trim() }}
      onOk={() => void props.onSave({
        title: title.trim(),
        description: description.trim(),
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null
      })}
    >
      <div className="demo-form">
        <label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>说明<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>优先级<Select value={priority} onChange={setPriority} options={[
          { value: "high", label: "高" },
          { value: "normal", label: "普通" },
          { value: "low", label: "低" }
        ]} /></label>
        <label>截止时间<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
      </div>
    </Modal>
  );
}

function TodoScheduleModal(props: {
  todo: TeacherTodoView | null;
  onCancel: () => void;
  onSave: (startAt: string, endAt: string) => Promise<void>;
}) {
  const tomorrow = addDays(localDate(new Date()), 1);
  const [startAt, setStartAt] = useState(`${tomorrow}T15:00`);
  const [endAt, setEndAt] = useState(`${tomorrow}T16:00`);
  useEffect(() => {
    if (props.todo) {
      const next = addDays(localDate(new Date()), 1);
      setStartAt(`${next}T15:00`);
      setEndAt(`${next}T16:00`);
    }
  }, [props.todo]);
  return (
    <Modal
      key={props.todo?.todoRef ?? "closed"}
      title={`安排到日历${props.todo ? `：${props.todo.title}` : ""}`}
      open={props.todo !== null}
      onCancel={props.onCancel}
      okText="创建时间块"
      onOk={() => void props.onSave(new Date(startAt).toISOString(), new Date(endAt).toISOString())}
    >
      <div className="demo-form">
        <label>开始<input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label>
        <label>结束<input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} /></label>
        <p>这会创建独立 CalendarEvent；完成任一对象不会自动完成另一个。</p>
      </div>
    </Modal>
  );
}

function TodoLessonModal(props: {
  todo: TeacherTodoView | null;
  options: Array<{ value: string; label: string }>;
  onCancel: () => void;
  onSave: (lessonRef: string) => Promise<void>;
}) {
  const [lessonRef, setLessonRef] = useState(props.options[0]?.value ?? "");
  useEffect(() => {
    if (props.todo) setLessonRef(props.options[0]?.value ?? "");
  }, [props.todo, props.options]);
  return (
    <Modal
      key={props.todo?.todoRef ?? "closed"}
      title="关联课时"
      open={props.todo !== null}
      onCancel={props.onCancel}
      okText="关联"
      okButtonProps={{ disabled: !lessonRef }}
      onOk={() => void props.onSave(lessonRef)}
    >
      <Select
        style={{ width: "100%" }}
        value={lessonRef || null}
        placeholder="选择课时"
        options={props.options}
        onChange={(value: string) => setLessonRef(value)}
      />
      <p>关联后，Agent 只会封存待办和明确关联的资源引用，不会自动执行或完成待办。</p>
    </Modal>
  );
}

function eventKey(item: TeacherCalendarItem): string {
  return item.sourceKind === "manual" ? item.event.eventRef : item.projection.projectionRef;
}

function isFuture(value: string | null): boolean {
  return value !== null && new Date(value).getTime() > Date.now();
}

function eventTitle(item: TeacherCalendarItem): string {
  return cleanDisplayText(
    item.sourceKind === "manual" ? item.event.title : item.projection.title
  );
}

function eventStart(item: TeacherCalendarItem): string {
  return item.sourceKind === "manual" ? item.event.startAt : item.projection.startAt ?? item.projection.dueAt ?? "";
}

function eventEnd(item: TeacherCalendarItem): string {
  return item.sourceKind === "manual" ? item.event.endAt : item.projection.endAt ?? item.projection.dueAt ?? "";
}

function eventDate(item: TeacherCalendarItem): string {
  return zonedDateTime(eventStart(item)).date;
}

function eventHour(item: TeacherCalendarItem): string {
  return zonedDateTime(eventStart(item)).hour;
}

function formatTime(value: string): string {
  const parts = zonedDateTime(value);
  return `${parts.hour}:${parts.minute}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: teacherTimezone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function priorityLabel(value: "high" | "normal" | "low"): string {
  return value === "high" ? "高优先级" : value === "low" ? "低优先级" : "普通优先级";
}

function toLocalInput(value: string): string {
  const parts = zonedDateTime(value);
  return `${parts.date}T${parts.hour}:${parts.minute}`;
}

export function localDate(date: Date): string {
  return zonedDateTime(date.toISOString()).date;
}

function zonedDateTime(value: string): {
  date: string;
  hour: string;
  minute: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: teacherTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    hour: read("hour"),
    minute: read("minute")
  };
}

export function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekDates(value: string): string[] {
  const date = new Date(`${value}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  const monday = addDays(value, 1 - day);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function monthGridDates(value: string): string[] {
  const first = `${value.slice(0, 7)}-01`;
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay() || 7;
  const start = addDays(first, 1 - weekday);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function weekdayLabel(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("zh-CN", { weekday: "short" });
}

function periodLabel(value: string, mode: CalendarMode): string {
  if (mode === "day") return new Date(`${value}T12:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  if (mode === "month") return new Date(`${value.slice(0, 7)}-01T12:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "long" });
  const dates = weekDates(value);
  return `${dates[0]} — ${dates[6]}`;
}

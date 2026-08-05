import { useEffect, useMemo, useState, type CSSProperties } from "react";

import type {
  ManualCalendarEventView,
  TeacherCalendarItem,
  TeacherTodoView,
  TeacherWorkProjectionView
} from "@edu-agent/contracts";
import { Button, Modal, Select, Switch } from "antd";

import {
  cleanDisplayText,
  workProjectionStatusLabel,
  workSourceLabel
} from "../../presentation";
import { WorkspaceIcon } from "../WorkspaceIcon";
import { ModuleCard } from "./PortalPrimitives";

export type CalendarMode = "day" | "week" | "month";

const teacherTimezone = "Asia/Shanghai";

export type CalendarEventDraft = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  eventType:
    | "class"
    | "meeting"
    | "grading"
    | "lesson_preparation"
    | "duty"
    | "school_affair"
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
  onDateSelect: (date: string) => void;
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
          onDateSelect={props.onDateSelect}
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
              allDay: editing.allDay,
              eventType: editing.eventType === "todo_time_block"
                ? "custom_reminder"
                : editing.eventType as CalendarEventDraft["eventType"]
            }
          : {
              title: "",
              description: "",
              startAt: defaultStart,
              endAt: defaultEnd,
              allDay: false,
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
  const invalidRange = !draft.startAt || !draft.endAt ||
    new Date(draft.endAt).getTime() <= new Date(draft.startAt).getTime();
  return (
    <Modal
      className="calendar-event-modal"
      title={props.editing ? "编辑日程" : "新建日程"}
      open={props.open}
      width={640}
      onCancel={props.onCancel}
      footer={(
        <div className="calendar-modal__footer">
          <div>
            {props.editing && props.onCancelEvent ? (
              <Button danger type="text" disabled={props.saving} onClick={() => void props.onCancelEvent?.()}>
                删除日程
              </Button>
            ) : null}
          </div>
          <div>
            <Button onClick={props.onCancel}>取消</Button>
            <Button
              type="primary"
              loading={props.saving}
              disabled={!draft.title.trim() || invalidRange}
              onClick={() => void props.onSave(draft)}
            >
              保存
            </Button>
          </div>
        </div>
      )}
    >
      <div className="calendar-event-form">
        <label className="calendar-form-field calendar-form-field--wide">
          标题
          <input
            data-testid="calendar-title-input"
            autoFocus
            placeholder="例如：八年级 3 班数学课"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label className="calendar-form-field calendar-form-field--wide">
          类型
          <Select
            value={draft.eventType}
            onChange={(eventType) => setDraft({ ...draft, eventType })}
            options={[
              { value: "class", label: "上课" },
              { value: "meeting", label: "会议" },
              { value: "grading", label: "批改 / 作业处理" },
              { value: "lesson_preparation", label: "备课" },
              { value: "duty", label: "巡班 / 值班" },
              { value: "school_affair", label: "学校事务" },
              { value: "custom_reminder", label: "个人提醒 / 其他" }
            ]}
          />
        </label>
        <div className="calendar-all-day calendar-form-field--wide">
          <span><strong>全天</strong><small>不显示具体开始和结束时刻</small></span>
          <Switch checked={draft.allDay} onChange={(allDay) => setDraft({ ...draft, allDay })} />
        </div>
        <DateTimeField label="开始" value={draft.startAt} allDay={draft.allDay} onChange={(startAt) => setDraft({ ...draft, startAt })} />
        <DateTimeField label="结束" value={draft.endAt} allDay={draft.allDay} onChange={(endAt) => setDraft({ ...draft, endAt })} />
        <label className="calendar-form-field calendar-form-field--wide">
          说明 <span>可选</span>
          <textarea
            rows={3}
            placeholder="补充本次日程需要记住的信息"
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>
        {invalidRange ? <p role="alert" className="calendar-form-error">结束时间需要晚于开始时间。</p> : null}
        {props.error ? <p role="alert" className="calendar-form-error">{props.error}</p> : null}
      </div>
    </Modal>
  );
}

function DateTimeField(props: {
  label: string;
  value: string;
  allDay: boolean;
  onChange: (value: string) => void;
}) {
  const [date, time = "09:00"] = props.value.split("T");
  return (
    <div className="calendar-form-field">
      <span>{props.label}</span>
      <div className={props.allDay ? "calendar-date-time is-all-day" : "calendar-date-time"}>
        <input aria-label={`${props.label}日期`} type="date" value={date} onChange={(event) => props.onChange(`${event.target.value}T${time}`)} />
        {!props.allDay ? (
          <input aria-label={`${props.label}时间`} type="time" step={300} value={time} onChange={(event) => props.onChange(`${date}T${event.target.value}`)} />
        ) : null}
      </div>
    </div>
  );
}

const calendarStartHour = 6;
const calendarEndHour = 22;
const calendarHourHeight = 72;
const calendarGridHeight = (calendarEndHour - calendarStartHour) * calendarHourHeight;
const calendarHours = Array.from(
  { length: calendarEndHour - calendarStartHour + 1 },
  (_, index) => `${String(calendarStartHour + index).padStart(2, "0")}:00`
);

function DayCalendar(props: {
  date: string;
  events: TeacherCalendarItem[];
  onEdit: (event: ManualCalendarEventView) => void;
  onOpenSource: (deepLink: string) => void;
}) {
  const events = props.events.filter((event) => eventDate(event) === props.date);
  const allDayEvents = events.filter(isAllDayEvent);
  const timedEvents = events.filter((event) => !isAllDayEvent(event));
  const nowTop = props.date === localDate(new Date()) ? currentTimeTop() : null;
  return (
    <div className="day-calendar" data-testid="day-calendar">
      <div className="calendar-day-summary">
        <div><strong>{weekdayLabel(props.date)}</strong><span>{formatMonthDay(props.date)}</span></div>
        <span>{events.length === 0 ? "今天留有充足时间" : `${events.length} 项安排`}</span>
      </div>
      {allDayEvents.length > 0 ? (
        <div className="calendar-all-day-strip"><span>全天</span><div>{allDayEvents.map((event) => (
          <CalendarEntry key={eventKey(event)} item={event} compact onEdit={props.onEdit} onOpenSource={props.onOpenSource} />
        ))}</div></div>
      ) : null}
      <div className="calendar-time-grid" style={{ height: calendarGridHeight }}>
        <div className="calendar-time-axis">
          {calendarHours.map((hour) => <time key={hour} style={{ top: timeLabelTop(hour) }}>{hour}</time>)}
        </div>
        <div className="calendar-time-stage">
          {calendarHours.slice(0, -1).map((hour) => <span className="calendar-hour-line" key={hour} style={{ top: timeLabelTop(hour) }} />)}
          {timedEvents.map((event) => (
            <CalendarEntry key={eventKey(event)} item={event} style={eventPosition(event)} onEdit={props.onEdit} onOpenSource={props.onOpenSource} />
          ))}
          {nowTop !== null ? <span className="calendar-now-line" style={{ top: nowTop }}><i /></span> : null}
        </div>
      </div>
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
      <div className="week-calendar__header">
        <span />
        {dates.map((date) => (
          <div key={date} className={date === localDate(new Date()) ? "is-today" : ""}>
            <span>{weekdayLabel(date)}</span><strong>{Number(date.slice(-2))}</strong>
          </div>
        ))}
      </div>
      <div className="week-calendar__all-day">
        <span>全天</span>
        {dates.map((date) => (
          <div key={date}>{props.events.filter((event) => eventDate(event) === date && isAllDayEvent(event)).map((event) => (
            <CalendarEntry key={eventKey(event)} item={event} compact onEdit={props.onEdit} onOpenSource={props.onOpenSource} />
          ))}</div>
        ))}
      </div>
      <div className="week-calendar__body">
        <div className="calendar-time-axis" style={{ height: calendarGridHeight }}>
          {calendarHours.map((hour) => <time key={hour} style={{ top: timeLabelTop(hour) }}>{hour}</time>)}
        </div>
        <div className="week-calendar__columns" style={{ height: calendarGridHeight }}>
          {dates.map((date) => (
            <div className={date === localDate(new Date()) ? "week-calendar__day is-today" : "week-calendar__day"} key={date}>
              {calendarHours.slice(0, -1).map((hour) => <span className="calendar-hour-line" key={hour} style={{ top: timeLabelTop(hour) }} />)}
              {props.events.filter((event) => eventDate(event) === date && !isAllDayEvent(event)).map((event) => (
                <CalendarEntry key={eventKey(event)} item={event} compact style={eventPosition(event)} onEdit={props.onEdit} onOpenSource={props.onOpenSource} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthCalendar(props: {
  date: string;
  events: TeacherCalendarItem[];
  onEdit: (event: ManualCalendarEventView) => void;
  onOpenSource: (deepLink: string) => void;
  onDateSelect: (date: string) => void;
}) {
  const dates = monthGridDates(props.date);
  const month = props.date.slice(0, 7);
  return (
    <div className="month-calendar" data-testid="month-calendar">
      <header>{["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => <span key={day}>{day}</span>)}</header>
      <div className="month-calendar__grid">
        {dates.map((date) => {
          const dayEvents = props.events.filter((event) => eventDate(event) === date);
          return (
            <article key={date} className={`${date.slice(0, 7) !== month ? "is-muted" : ""}${date === localDate(new Date()) ? " is-today" : ""}`}>
              <button type="button" className="month-day-number" onClick={() => props.onDateSelect(date)} aria-label={`查看 ${date} 日程`}>
                {Number(date.slice(-2))}
              </button>
              {dayEvents.slice(0, 3).map((event) => {
                const category = calendarCategory(event);
                return (
                  <button type="button" key={eventKey(event)} className={`month-entry calendar-category--${category.key}`} onClick={() => event.sourceKind === "manual" ? props.onEdit(event.event) : props.onOpenSource(event.deepLink)}>
                    <span>{isAllDayEvent(event) ? "全天" : formatTime(eventStart(event))}</span>{cleanDisplayText(eventTitle(event))}
                  </button>
                );
              })}
              {dayEvents.length > 3 ? <button type="button" className="month-more" onClick={() => props.onDateSelect(date)}>还有 {dayEvents.length - 3} 项</button> : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function CalendarEntry(props: {
  item: TeacherCalendarItem;
  compact?: boolean;
  style?: CSSProperties;
  onEdit: (event: ManualCalendarEventView) => void;
  onOpenSource: (deepLink: string) => void;
}) {
  const manual = props.item.sourceKind === "manual";
  const category = calendarCategory(props.item);
  const handleOpen = () => {
    if (props.item.sourceKind === "manual") {
      props.onEdit(props.item.event);
      return;
    }
    props.onOpenSource(props.item.deepLink);
  };
  return (
    <button
      type="button"
      style={props.style}
      className={`calendar-event calendar-category--${category.key}${manual ? "" : " calendar-event--source"}${props.compact ? " is-compact" : ""}`}
      onClick={handleOpen}
      title={manual ? "编辑日程" : "进入来源业务处理"}
    >
      <strong>{cleanDisplayText(eventTitle(props.item))}</strong>
      <span>{isAllDayEvent(props.item) ? "全天" : `${formatTime(eventStart(props.item))}–${formatTime(eventEnd(props.item))}`} · {category.label}</span>
    </button>
  );
}

export function TodoPanel(props: {
  todos: TeacherTodoView[];
  projections: TeacherWorkProjectionView[];
  calendarEvents: TeacherCalendarItem[];
  selectedDate: string;
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
  const [filter, setFilter] = useState<"active" | "completed">("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTodo, setEditTodo] = useState<TeacherTodoView | null>(null);
  const [scheduleTodo, setScheduleTodo] = useState<TeacherTodoView | null>(null);
  const [linkTodo, setLinkTodo] = useState<TeacherTodoView | null>(null);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const filtered = useMemo(
    () => props.todos.filter((todo) => todo.status === filter && (filter !== "active" || !isFuture(todo.snoozedUntil))),
    [filter, props.todos]
  );
  const visibleProjections = useMemo(
    () => props.projections.filter((projection) => !isFuture(projection.snoozedUntil) && !isFuture(projection.hiddenUntil)),
    [props.projections]
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
      title="待办"
      description="个人安排与需要处理的教学事项"
      action={<Button size="small" icon={<WorkspaceIcon name="plus" />} onClick={() => setCreateOpen(true)}>新建</Button>}
      testId="todo-panel"
    >
      <div className="todo-filter">
        {([
          ["active", "进行中"],
          ["completed", "已完成"]
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
      {props.loading ? <p className="loading-copy">正在整理待办…</p> : null}
      <div className="todo-list">
        {filtered.map((todo) => (
          <article key={todo.todoRef} className={todo.status === "completed" ? "todo-checklist-item is-completed" : "todo-checklist-item"} data-testid={`todo-${todo.todoRef}`}>
            <button
              type="button"
              className="todo-check-circle"
              aria-pressed={todo.status === "completed"}
              disabled={busyRef === todo.todoRef || todo.status === "cancelled"}
              onClick={() => void run(todo.todoRef, () => todo.status === "completed"
                ? props.onReopen(todo)
                : props.onComplete(todo))}
              aria-label={`${todo.status === "completed" ? "重新打开" : "完成"} ${todo.title}`}
            >{todo.status === "completed" ? <WorkspaceIcon name="check" /> : null}</button>
            <div className="todo-checklist-content">
              <strong>{todo.pinned ? "📌 " : ""}{todo.title}</strong>
              {todo.description ? <span>{todo.description}</span> : null}
              <small>{todo.dueAt ? formatDateTime(todo.dueAt) : "时间待定"} · {priorityLabel(todo.priority)}{todo.resourceLinks.length > 0 ? ` · ${todo.resourceLinks.map((link) => link.label).join(" / ")}` : ""}</small>
            </div>
            {todo.status === "active" ? <div className="todo-actions">
              <button type="button" title={todo.pinned ? "取消置顶" : "置顶"} onClick={() => void run(todo.todoRef, () => props.onPin(todo))}>
                <WorkspaceIcon name="star" />
              </button>
              <button type="button" title="编辑待办" onClick={() => setEditTodo(todo)}><WorkspaceIcon name="edit" /></button>
              <button type="button" title="安排到日历" onClick={() => setScheduleTodo(todo)}><WorkspaceIcon name="calendar" /></button>
              <button type="button" title="关联课时" onClick={() => setLinkTodo(todo)}><WorkspaceIcon name="lesson" /></button>
              <button type="button" title={todo.resourceLinks.some((link) => link.resourceKind === "lesson") ? "在 Agent 中处理" : "请先关联课时"} disabled={!todo.resourceLinks.some((link) => link.resourceKind === "lesson")} onClick={() => void run(todo.todoRef, () => props.onSendToAgent(todo))}><WorkspaceIcon name="agent" /></button>
            </div> : null}
          </article>
        ))}
        {filter === "active" ? visibleProjections.map((projection) => (
          <article key={projection.projectionRef} className="todo-checklist-item source-work-item">
            <button type="button" className="todo-source-circle" aria-label={`处理 ${cleanDisplayText(projection.title)}`} onClick={() => props.onOpenSource(projection.deepLink)}><WorkspaceIcon name="arrowRight" /></button>
            <div className="todo-checklist-content">
              <strong>{projection.pinned ? "📌 " : ""}{cleanDisplayText(projection.title)}</strong>
              <span>{cleanDisplayText(projection.summary)}</span>
              <small>系统提醒 · {workSourceLabel(projection.sourceModule)} · {workProjectionStatusLabel(projection.displayStatus)}{projection.dueAt ? ` · ${formatDateTime(projection.dueAt)}` : ""}</small>
            </div>
            <div className="source-work-item__actions">
              <button type="button" title={projection.pinned ? "取消置顶" : "置顶"} onClick={() => void run(projection.projectionRef, () => props.onPinSource(projection))}><WorkspaceIcon name="star" /></button>
              <Button size="small" type="link" onClick={() => props.onOpenSource(projection.deepLink)}>{projection.recommendedAction}</Button>
            </div>
          </article>
        )) : null}
        {!props.loading && filtered.length === 0 && (filter === "completed" || visibleProjections.length === 0) ? <p className="empty-copy">{filter === "active" ? "当前没有待处理事项。" : "还没有已完成待办。"}</p> : null}
      </div>

      <ScheduleStatistics events={props.calendarEvents} selectedDate={props.selectedDate} />

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

function ScheduleStatistics(props: {
  events: TeacherCalendarItem[];
  selectedDate: string;
}) {
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const range = useMemo(
    () => statisticsDateRange(props.selectedDate, period),
    [period, props.selectedDate]
  );
  const segments = useMemo(() => {
    const totals = new Map<CalendarCategoryKey, number>();
    for (const event of props.events) {
      const date = eventDate(event);
      if (date < range.from || date >= range.to) continue;
      const category = calendarCategory(event);
      totals.set(category.key, (totals.get(category.key) ?? 0) + eventDurationMinutes(event));
    }
    return [...totals.entries()]
      .map(([key, minutes]) => ({ ...calendarCategoryMeta[key], key, minutes }))
      .sort((left, right) => right.minutes - left.minutes);
  }, [props.events, range.from, range.to]);
  const total = segments.reduce((sum, segment) => sum + segment.minutes, 0);
  let cursor = 0;
  const gradient = segments.length === 0
    ? "conic-gradient(#E9EDF5 0 100%)"
    : `conic-gradient(${segments.map((segment) => {
        const start = cursor;
        cursor += segment.minutes / total * 100;
        return `${segment.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
      }).join(", ")})`;
  return (
    <section className="schedule-statistics" aria-label="时间分布">
      <header>
        <div><strong>时间分布</strong><span>看看教学时间主要花在哪里</span></div>
        <div className="schedule-statistics__period">
          {(["day", "week", "month"] as const).map((value) => (
            <button type="button" key={value} className={period === value ? "is-active" : ""} onClick={() => setPeriod(value)}>
              {{ day: "今日", week: "本周", month: "本月" }[value]}
            </button>
          ))}
        </div>
      </header>
      <div className="schedule-statistics__body">
        <div className="schedule-donut" style={{ "--schedule-chart": gradient } as CSSProperties}>
          <div><strong>{formatDuration(total)}</strong><span>已安排</span></div>
        </div>
        <div className="schedule-statistics__legend">
          {segments.length > 0 ? segments.slice(0, 6).map((segment) => (
            <div key={segment.key}><i style={{ background: segment.color }} /><span>{segment.label}</span><strong>{Math.round(segment.minutes / total * 100)}%</strong></div>
          )) : <p className="empty-copy">当前周期还没有日程。</p>}
        </div>
      </div>
    </section>
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

type CalendarCategoryKey =
  | "class"
  | "meeting"
  | "lesson_preparation"
  | "grading"
  | "duty"
  | "school_affair"
  | "personal"
  | "assignment"
  | "other";

const calendarCategoryMeta: Record<CalendarCategoryKey, {
  label: string;
  color: string;
}> = {
  class: { label: "上课", color: "#4F7EF7" },
  meeting: { label: "会议", color: "#9B72E8" },
  lesson_preparation: { label: "备课", color: "#3EAA82" },
  grading: { label: "批改", color: "#EF8A55" },
  duty: { label: "巡班 / 值班", color: "#20A7B5" },
  school_affair: { label: "学校事务", color: "#D25F82" },
  personal: { label: "个人提醒", color: "#D5A02D" },
  assignment: { label: "作业截止", color: "#E96B5B" },
  other: { label: "其他", color: "#738198" }
};

function calendarCategory(item: TeacherCalendarItem): {
  key: CalendarCategoryKey;
  label: string;
  color: string;
} {
  if (item.sourceKind === "manual") {
    const key = ({
      class: "class",
      meeting: "meeting",
      grading: "grading",
      lesson_preparation: "lesson_preparation",
      duty: "duty",
      school_affair: "school_affair",
      custom_reminder: "personal",
      todo_time_block: "personal",
      assignment_deadline: "assignment"
    } as const)[item.event.eventType] ?? "other";
    return { key, ...calendarCategoryMeta[key] };
  }
  const source = `${item.projection.sourceType} ${item.projection.title}`.toLowerCase();
  const key: CalendarCategoryKey = source.includes("assignment") || source.includes("作业")
    ? "assignment"
    : source.includes("lesson") || source.includes("备课") || source.includes("teaching_plan")
      ? "lesson_preparation"
      : item.projection.sourceModule === "capability"
        ? "personal"
        : "school_affair";
  return { key, ...calendarCategoryMeta[key] };
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

function isAllDayEvent(item: TeacherCalendarItem): boolean {
  return item.sourceKind === "manual" && item.event.allDay;
}

function eventPosition(item: TeacherCalendarItem): CSSProperties {
  const start = zonedDateTime(eventStart(item));
  const end = zonedDateTime(eventEnd(item));
  const startMinutes = Number(start.hour) * 60 + Number(start.minute);
  const endMinutes = Number(end.hour) * 60 + Number(end.minute);
  const gridStart = calendarStartHour * 60;
  const gridEnd = calendarEndHour * 60;
  const visibleStart = Math.max(gridStart, Math.min(gridEnd, startMinutes));
  const visibleEnd = Math.max(visibleStart + 15, Math.min(gridEnd, endMinutes));
  return {
    top: (visibleStart - gridStart) / 60 * calendarHourHeight + 3,
    height: Math.max(34, (visibleEnd - visibleStart) / 60 * calendarHourHeight - 6)
  };
}

function currentTimeTop(): number | null {
  const now = zonedDateTime(new Date().toISOString());
  const minutes = Number(now.hour) * 60 + Number(now.minute);
  if (minutes < calendarStartHour * 60 || minutes > calendarEndHour * 60) return null;
  return (minutes - calendarStartHour * 60) / 60 * calendarHourHeight;
}

function timeLabelTop(value: string): number {
  return (Number(value.slice(0, 2)) - calendarStartHour) * calendarHourHeight;
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

function formatMonthDay(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

function statisticsDateRange(value: string, period: "day" | "week" | "month"): { from: string; to: string } {
  if (period === "day") return { from: value, to: addDays(value, 1) };
  if (period === "week") {
    const dates = weekDates(value);
    return { from: dates[0]!, to: addDays(dates[6]!, 1) };
  }
  const from = `${value.slice(0, 7)}-01`;
  const nextMonth = new Date(`${from}T12:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return { from, to: nextMonth.toISOString().slice(0, 10) };
}

function eventDurationMinutes(item: TeacherCalendarItem): number {
  if (isAllDayEvent(item)) return 8 * 60;
  const duration = (new Date(eventEnd(item)).getTime() - new Date(eventStart(item)).getTime()) / 60_000;
  return Math.max(30, Math.min(8 * 60, Number.isFinite(duration) ? duration : 30));
}

function formatDuration(minutes: number): string {
  if (minutes === 0) return "0 小时";
  const hours = minutes / 60;
  return `${hours >= 10 ? Math.round(hours) : hours.toFixed(hours % 1 === 0 ? 0 : 1)} 小时`;
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

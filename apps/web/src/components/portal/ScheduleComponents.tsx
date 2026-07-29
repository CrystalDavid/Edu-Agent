import { useMemo, useState } from "react";

import { Button, Checkbox, Modal, Select } from "antd";

import {
  scheduleEvents,
  type ScheduleEvent,
  teacherTodos,
  type TeacherTodo
} from "../../teacher-portal-data";
import { WorkspaceIcon } from "../WorkspaceIcon";
import { ModuleCard, StatusPill } from "./PortalPrimitives";

export type CalendarMode = "day" | "week" | "month";

const weekDays = [
  { date: "2026-07-27", label: "周一", day: "27" },
  { date: "2026-07-28", label: "周二", day: "28" },
  { date: "2026-07-29", label: "周三", day: "29" },
  { date: "2026-07-30", label: "周四", day: "30" },
  { date: "2026-07-31", label: "周五", day: "31" },
  { date: "2026-08-01", label: "周六", day: "01" },
  { date: "2026-08-02", label: "周日", day: "02" }
];

const monthDays = Array.from({ length: 35 }, (_, index) => {
  const day = index - 2;
  if (day < 1) return { value: 28 + day, muted: true, month: "6" };
  if (day > 31) return { value: day - 31, muted: true, month: "8" };
  return { value: day, muted: false, month: "7" };
});

export function CalendarView(props: {
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [periodShift, setPeriodShift] = useState(0);
  const periodLabel =
    props.mode === "day"
      ? ["2026 年 7 月 29 日", "2026 年 7 月 30 日", "2026 年 7 月 31 日"][periodShift + 1]
      : props.mode === "week"
        ? ["7 月 20 日–7 月 26 日", "7 月 27 日–8 月 2 日", "8 月 3 日–8 月 9 日"][periodShift + 1]
        : ["2026 年 6 月", "2026 年 7 月", "2026 年 8 月"][periodShift + 1];
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
          <button type="button" aria-label="上一周期" onClick={() => setPeriodShift((value) => Math.max(-1, value - 1))}><WorkspaceIcon name="arrowLeft" /></button>
          <button type="button" onClick={() => setPeriodShift(0)}>今天</button>
          <button type="button" aria-label="下一周期" onClick={() => setPeriodShift((value) => Math.min(1, value + 1))}><WorkspaceIcon name="arrowRight" /></button>
          <strong>{periodLabel}</strong>
        </div>
        <Button type="primary" icon={<WorkspaceIcon name="plus" />} onClick={() => setCreateOpen(true)}>
          新建日程
        </Button>
      </header>

      {props.mode === "day" ? <DayCalendar events={scheduleEvents.filter((event) => event.date === "2026-07-30")} /> : null}
      {props.mode === "week" ? <WeekCalendar events={scheduleEvents} /> : null}
      {props.mode === "month" ? <MonthCalendar /> : null}

      <Modal
        title="新建日程"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        okText="保存演示日程"
        cancelText="取消"
        onOk={() => setCreateOpen(false)}
      >
        <div className="demo-form">
          <label>标题<input defaultValue="备课时间" /></label>
          <label>类型
            <Select
              defaultValue="备课"
              options={["课程", "会议", "教研", "备课", "批改"].map((value) => ({ value, label: value }))}
            />
          </label>
          <p>仅供界面预览，保存后不会写入正式日历。</p>
        </div>
      </Modal>
    </section>
  );
}

function DayCalendar({ events }: { events: ScheduleEvent[] }) {
  const hours = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
  return (
    <div className="day-calendar" data-testid="day-calendar">
      <div className="current-time-line"><span>现在 11:18</span></div>
      {hours.map((hour) => (
        <div className="day-calendar__row" key={hour}>
          <time>{hour}</time>
          <div>
            {events
              .filter((event) => event.start.startsWith(hour.slice(0, 2)))
              .map((event) => (
                <article className="calendar-event" key={event.id}>
                  <StatusPill tone={event.kind === "课程" ? "blue" : "neutral"}>{event.kind}</StatusPill>
                  <strong>{event.title}</strong>
                  <span>{event.start}–{event.end} · {event.location}</span>
                </article>
              ))}
            {hour === "15:00" ? <span className="free-time">可安排 60 分钟</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function WeekCalendar({ events }: { events: ScheduleEvent[] }) {
  return (
    <div className="week-calendar" data-testid="week-calendar">
      {weekDays.map((day) => (
        <section key={day.date} className={day.date === "2026-07-30" ? "is-today" : ""}>
          <header>
            <span>{day.label}</span>
            <strong>{day.day}</strong>
          </header>
          <div>
            {events
              .filter((event) => event.date === day.date)
              .map((event) => (
                <article key={event.id}>
                  <time>{event.start}</time>
                  <strong>{event.title}</strong>
                  <span>{event.kind}</span>
                </article>
              ))}
            {day.date === "2026-07-29" ? <article className="week-todo">拖入待办 · 整理课堂练习</article> : null}
          </div>
        </section>
      ))}
    </div>
  );
}

function MonthCalendar() {
  const eventCounts: Record<number, string[]> = {
    3: ["单元复盘"],
    8: ["教研活动"],
    15: ["材料截止"],
    24: ["单元测试"],
    30: ["3 节课", "备课组会议"],
    31: ["教研复盘"]
  };
  return (
    <div className="month-calendar" data-testid="month-calendar">
      <header>
        {["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>周{day}</span>)}
      </header>
      <div className="month-calendar__grid">
        {monthDays.map((item, index) => (
          <article
            key={`${item.month}:${item.value}:${index}`}
            className={`${item.muted ? "is-muted" : ""}${item.value === 30 && !item.muted ? " is-today" : ""}`}
          >
            <strong>{item.value}</strong>
            {!item.muted && eventCounts[item.value]?.map((label) => <span key={label}>{label}</span>)}
          </article>
        ))}
      </div>
    </div>
  );
}

type TodoFilter = "今天" | "本周" | "已延期" | "已完成" | "等待他人";

export function TodoPanel(props: {
  onSendToAgent: (todo: TeacherTodo) => void;
}) {
  const [todos, setTodos] = useState(teacherTodos);
  const [filter, setFilter] = useState<TodoFilter>("今天");
  const [converted, setConverted] = useState<string | null>(null);
  const filtered = useMemo(() => {
    if (filter === "已延期" || filter === "已完成" || filter === "等待他人") {
      return todos.filter((todo) => todo.status === filter);
    }
    if (filter === "本周") return todos.filter((todo) => todo.status !== "已完成");
    return todos.filter((todo) => ["今天", "明天"].some((word) => todo.due.includes(word)) && todo.status !== "已完成");
  }, [filter, todos]);

  const toggle = (id: string) => {
    setTodos((items) => items.map((todo) => todo.id === id
      ? { ...todo, status: todo.status === "已完成" ? "待处理" : "已完成" }
      : todo));
  };

  return (
    <ModuleCard
      className="todo-panel"
      title="待办"
      description="可调整时间的个人任务"
      action={<button type="button" className="text-action" onClick={() => setTodos(teacherTodos)}>恢复</button>}
      testId="todo-panel"
    >
      <div className="todo-filter">
        {(["今天", "本周", "已延期", "已完成", "等待他人"] as TodoFilter[]).map((item) => (
          <button type="button" key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="todo-list">
        {filtered.map((todo) => (
          <article key={todo.id}>
            <Checkbox checked={todo.status === "已完成"} onChange={() => toggle(todo.id)} aria-label={`完成 ${todo.title}`} />
            <div>
              <strong>{todo.title}</strong>
              <span>{todo.context}</span>
              <small>{todo.due} · {todo.priority}</small>
            </div>
            <div className="todo-actions">
              <button type="button" title="调整优先级" onClick={() => setTodos((items) => items.map((item) => item.id === todo.id ? { ...item, priority: item.priority === "重要" ? "普通" : "重要" } : item))}>
                <WorkspaceIcon name="star" />
              </button>
              <button type="button" title="转成日程" onClick={() => setConverted(todo.id)}>
                <WorkspaceIcon name="calendar" />
              </button>
              <button type="button" title="交给 Agent" onClick={() => props.onSendToAgent(todo)}>
                <WorkspaceIcon name="agent" />
              </button>
            </div>
          </article>
        ))}
        {filtered.length === 0 ? <p className="empty-copy">当前分组没有待办。</p> : null}
      </div>
      {converted ? (
        <div className="inline-confirmation" role="status">
          已将待办加入日程草稿（仅供界面预览）
          <button type="button" onClick={() => setConverted(null)}>关闭</button>
        </div>
      ) : null}
    </ModuleCard>
  );
}

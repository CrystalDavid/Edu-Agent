import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ManualCalendarEventView,
  TeacherCalendarItem,
  TeacherTodoView,
  TeacherWorkProjectionView
} from "@edu-agent/contracts";

import {
  createCalendarEvent,
  createTeacherTodo,
  handoffTeacherTodoToAgent,
  linkTeacherTodoResource,
  loadLessonPreparationSummary,
  loadTeacherCalendar,
  loadTeacherTodos,
  loadTeacherWorkActionItems,
  scheduleTeacherTodo,
  transitionCalendarEvent,
  transitionTeacherTodo,
  updateCalendarEvent,
  updateTeacherTodo,
  updateTeacherTodoPreference,
  updateWorkProjectionPreference
} from "../api";
import {
  addDays,
  CalendarView,
  type CalendarEventDraft,
  type CalendarMode,
  localDate,
  TodoPanel
} from "../components/portal/ScheduleComponents";
import type { AppRoute } from "../route";

const timezone = "Asia/Shanghai";

export function TeacherSchedulePage(props: {
  navigate: (route: AppRoute) => void;
}) {
  const initial = readCalendarLocation();
  const [mode, setMode] = useState<CalendarMode>(initial.mode);
  const [selectedDate, setSelectedDate] = useState(initial.date);
  const [calendar, setCalendar] = useState<TeacherCalendarItem[]>([]);
  const [todos, setTodos] = useState<TeacherTodoView[]>([]);
  const [projections, setProjections] = useState<TeacherWorkProjectionView[]>([]);
  const [lessonOptions, setLessonOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const range = useMemo(() => calendarRange(selectedDate, mode), [selectedDate, mode]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [calendarResult, todoResult, projectionResult, preparation] = await Promise.all([
        loadTeacherCalendar({
          from: range.from,
          to: range.to,
          mode,
          timezone
        }),
        loadTeacherTodos({ status: "all", includeSnoozed: "true" }),
        loadTeacherWorkActionItems(true),
        loadLessonPreparationSummary()
      ]);
      setCalendar(calendarResult.items);
      setTodos(todoResult.items);
      setProjections(projectionResult.items);
      setLessonOptions(preparation.recentLessons.map((lesson) => ({
        value: lesson.lessonRef,
        label: lesson.title
      })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "教师工作台加载失败");
    } finally {
      setLoading(false);
    }
  }, [mode, range.from, range.to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    writeCalendarLocation(mode, selectedDate);
  }, [mode, selectedDate]);

  useEffect(() => {
    const onPopState = () => {
      const next = readCalendarLocation();
      setMode(next.mode);
      setSelectedDate(next.date);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const movePeriod = (direction: -1 | 1) => {
    setSelectedDate((current) => {
      if (mode === "day") return addDays(current, direction);
      if (mode === "week") return addDays(current, direction * 7);
      const date = new Date(`${current}T12:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + direction);
      return date.toISOString().slice(0, 10);
    });
  };

  const openDeepLink = (deepLink: string) => {
    window.history.pushState({}, "", deepLink);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const saveCalendar = async (
    draft: CalendarEventDraft,
    existing?: ManualCalendarEventView
  ) => {
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      startAt: new Date(draft.startAt).toISOString(),
      endAt: new Date(draft.endAt).toISOString(),
      timezone,
      allDay: draft.allDay,
      eventType: draft.eventType
    };
    if (existing) {
      await updateCalendarEvent(existing.eventRef, {
        ...payload,
        expectedVersion: existing.version,
        purpose: "calendar-event.update",
        idempotencyKey: `calendar-update:${crypto.randomUUID()}`
      });
    } else {
      await createCalendarEvent({
        ...payload,
        relatedTodoRef: null,
        purpose: "calendar-event.create",
        idempotencyKey: `calendar-create:${crypto.randomUUID()}`
      });
    }
    await refresh();
  };

  return (
    <div className="portal-page schedule-page" data-testid="schedule-page">
      <div className="schedule-layout">
        <CalendarView
          mode={mode}
          selectedDate={selectedDate}
          events={calendar}
          loading={loading}
          error={error}
          onModeChange={setMode}
          onPrevious={() => movePeriod(-1)}
          onNext={() => movePeriod(1)}
          onDateSelect={(date) => {
            setSelectedDate(date);
            setMode("day");
          }}
          onCreate={(draft) => saveCalendar(draft)}
          onUpdate={(event, draft) => saveCalendar(draft, event)}
          onCancelEvent={async (event) => {
            await transitionCalendarEvent(event.eventRef, "cancel", {
              expectedVersion: event.version,
              purpose: "calendar-event.cancel",
              idempotencyKey: `calendar-cancel:${crypto.randomUUID()}`
            });
            await refresh();
          }}
          onOpenSource={openDeepLink}
        />
        <TodoPanel
          todos={todos}
          projections={projections}
          calendarEvents={calendar}
          selectedDate={selectedDate}
          lessonOptions={lessonOptions}
          loading={loading}
          error={error}
          onCreate={async (draft) => {
            await createTeacherTodo({
              ...draft,
              purpose: "teacher-todo.create",
              idempotencyKey: `todo-create:${crypto.randomUUID()}`
            });
            await refresh();
          }}
          onUpdate={async (todo, draft) => {
            await updateTeacherTodo(todo.todoRef, {
              expectedVersion: todo.version,
              ...draft,
              purpose: "teacher-todo.update",
              idempotencyKey: `todo-update:${crypto.randomUUID()}`
            });
            await refresh();
          }}
          onComplete={async (todo) => {
            await transitionTeacherTodo(todo.todoRef, "complete", {
              expectedVersion: todo.version,
              purpose: "teacher-todo.complete",
              idempotencyKey: `todo-complete:${crypto.randomUUID()}`
            });
            await refresh();
          }}
          onReopen={async (todo) => {
            await transitionTeacherTodo(todo.todoRef, "reopen", {
              expectedVersion: todo.version,
              purpose: "teacher-todo.reopen",
              idempotencyKey: `todo-reopen:${crypto.randomUUID()}`
            });
            await refresh();
          }}
          onCancel={async (todo) => {
            await transitionTeacherTodo(todo.todoRef, "cancel", {
              expectedVersion: todo.version,
              purpose: "teacher-todo.cancel",
              idempotencyKey: `todo-cancel:${crypto.randomUUID()}`
            });
            await refresh();
          }}
          onPin={async (todo) => {
            await updateTeacherTodoPreference(todo.todoRef, {
              expectedVersion: todo.version,
              pinned: !todo.pinned,
              purpose: "teacher-todo.preference.update",
              idempotencyKey: `todo-pin:${crypto.randomUUID()}`
            });
            await refresh();
          }}
          onSnooze={async (todo) => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);
            await updateTeacherTodoPreference(todo.todoRef, {
              expectedVersion: todo.version,
              snoozedUntil: tomorrow.toISOString(),
              purpose: "teacher-todo.preference.update",
              idempotencyKey: `todo-snooze:${crypto.randomUUID()}`
            });
            await refresh();
          }}
          onRestoreTodo={async (todo) => {
            await updateTeacherTodoPreference(todo.todoRef, {
              expectedVersion: todo.version,
              snoozedUntil: null,
              purpose: "teacher-todo.preference.update",
              idempotencyKey: `todo-restore:${crypto.randomUUID()}`
            });
            await refresh();
          }}
          onSchedule={async (todo, startAt, endAt) => {
            await scheduleTeacherTodo(todo.todoRef, {
              expectedTodoVersion: todo.version,
              startAt,
              endAt,
              timezone,
              allDay: false,
              purpose: "teacher-todo.schedule",
              idempotencyKey: `todo-schedule:${crypto.randomUUID()}`
            });
            await refresh();
          }}
          onLinkLesson={async (todo, lessonRef) => {
            await linkTeacherTodoResource(todo.todoRef, {
              expectedVersion: todo.version,
              resourceKind: "lesson",
              resourceRef: lessonRef,
              purpose: "teacher-todo.resource.link",
              idempotencyKey: `todo-link:${crypto.randomUUID()}`
            });
            await refresh();
          }}
          onSendToAgent={async (todo) => {
            const result = await handoffTeacherTodoToAgent(todo.todoRef, {
              expectedTodoVersion: todo.version,
              purpose: "teacher-todo.agent-handoff",
              idempotencyKey: `todo-agent:${crypto.randomUUID()}`
            });
            openDeepLink(result.deepLink);
          }}
          onOpenSource={openDeepLink}
          onSnoozeSource={async (projection) => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);
            await updateWorkProjectionPreference(projection.projectionRef, {
              sourceVersion: projection.sourceVersion,
              expectedPreferenceVersion: projection.preferenceVersion,
              snoozedUntil: tomorrow.toISOString(),
              purpose: "teacher-work-projection.preference.update",
              idempotencyKey: `projection-snooze:${crypto.randomUUID()}`
            });
            await refresh();
          }}
          onPinSource={async (projection) => {
            await updateWorkProjectionPreference(projection.projectionRef, {
              sourceVersion: projection.sourceVersion,
              expectedPreferenceVersion: projection.preferenceVersion,
              pinned: !projection.pinned,
              purpose: "teacher-work-projection.preference.update",
              idempotencyKey: `projection-pin:${crypto.randomUUID()}`
            });
            await refresh();
          }}
          onRestoreSource={async (projection) => {
            await updateWorkProjectionPreference(projection.projectionRef, {
              sourceVersion: projection.sourceVersion,
              expectedPreferenceVersion: projection.preferenceVersion,
              purpose: "teacher-work-projection.preference.restore",
              idempotencyKey: `projection-restore:${crypto.randomUUID()}`
            });
            await refresh();
          }}
        />
      </div>
    </div>
  );
}

function readCalendarLocation(): { mode: CalendarMode; date: string } {
  const search = new URLSearchParams(window.location.search);
  const rawMode = search.get("view");
  const rawDate = search.get("date");
  const mode: CalendarMode = rawMode === "week" || rawMode === "month" ? rawMode : "day";
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/u.test(rawDate)
    ? rawDate
    : localDate(new Date());
  return { mode, date };
}

function writeCalendarLocation(mode: CalendarMode, date: string): void {
  const search = new URLSearchParams(window.location.search);
  search.set("view", mode);
  search.set("date", date);
  const next = `${window.location.pathname}?${search.toString()}`;
  if (`${window.location.pathname}${window.location.search}` !== next) {
    window.history.replaceState({}, "", next);
  }
}

function calendarRange(date: string, mode: CalendarMode): { from: string; to: string } {
  if (mode === "day") {
    return { from: startIso(date), to: startIso(addDays(date, 1)) };
  }
  if (mode === "week") {
    const current = new Date(`${date}T12:00:00Z`);
    const day = current.getUTCDay() || 7;
    const monday = addDays(date, 1 - day);
    return { from: startIso(monday), to: startIso(addDays(monday, 7)) };
  }
  const first = `${date.slice(0, 7)}-01`;
  const nextMonth = new Date(`${first}T12:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return { from: startIso(first), to: startIso(nextMonth.toISOString().slice(0, 10)) };
}

function startIso(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toISOString();
}

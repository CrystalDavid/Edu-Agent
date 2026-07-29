import { useState } from "react";

import type { AppRoute } from "../route";
import type { TeacherTodo } from "../teacher-portal-data";
import { CalendarView, TodoPanel, type CalendarMode } from "../components/portal/ScheduleComponents";
import { PageHeader } from "../components/portal/PortalPrimitives";

export function TeacherSchedulePage(props: {
  navigate: (route: AppRoute) => void;
}) {
  const [mode, setMode] = useState<CalendarMode>("day");
  const sendTodo = (todo: TeacherTodo) => {
    window.sessionStorage.setItem("agent-todo-context", todo.id);
    props.navigate("/agent");
  };
  return (
    <div className="portal-page schedule-page" data-testid="schedule-page">
      <PageHeader title="日程" subtitle="把有明确时间的安排和可调整的待办分开管理" />
      <div className="schedule-layout">
        <CalendarView mode={mode} onModeChange={setMode} />
        <TodoPanel onSendToAgent={sendTodo} />
      </div>
    </div>
  );
}

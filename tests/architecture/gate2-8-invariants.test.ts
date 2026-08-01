import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Gate 2.8 architecture invariants", () => {
  it("keeps manual teacher work and rebuildable source projections in Work ownership", () => {
    const migration = source(
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0008_gate2_8_teacher_workbench.sql"
    );
    for (const table of [
      "work.teacher_todo",
      "work.calendar_event",
      "work.todo_calendar_link",
      "work.teacher_work_projection",
      "work.teacher_work_preference"
    ]) {
      expect(migration).toContain(table);
    }
    expect(migration).not.toContain("teacher_dashboard");
    expect(migration).not.toContain("assignment_copy");
    expect(migration).not.toContain("teaching_plan_copy");
  });

  it("projects source work without mutating source module tables", () => {
    const service = source(
      "apps/api/src/composition/postgres-teacher-workbench-service.ts"
    );
    expect(service).toContain("buildProjectionSnapshots");
    expect(service).toContain("syncProjections");
    expect(service).not.toMatch(/UPDATE\s+education\./iu);
    expect(service).not.toMatch(/UPDATE\s+artifact\./iu);
    expect(service).not.toMatch(/UPDATE\s+capability\./iu);
    expect(service).not.toMatch(/UPDATE\s+work\.task\b/iu);
  });

  it("uses the Product composition root and the existing outbox worker", () => {
    const container = source("apps/api/src/composition/product-container.ts");
    const worker = source("apps/api/src/composition/local-copilot-outbox-worker.ts");
    expect(container).toContain("PostgresTeacherWorkbenchService");
    expect(container).toContain("teacherWorkbench.refreshProjections");
    expect(worker).toContain("TeacherTodoCreated");
    expect(worker).toContain("TeacherGradeDecisionConfirmed");
    expect(worker).toContain("projectionCount");
  });

  it("keeps overview and all calendar views on typed PostgreSQL APIs", () => {
    const schedule = source("apps/web/src/pages/TeacherSchedulePage.tsx");
    const components = source("apps/web/src/components/portal/ScheduleComponents.tsx");
    const overview = source("apps/web/src/pages/OverviewPage.tsx");
    const agent = source("apps/web/src/pages/AgentWorkspacePage.tsx");
    expect(schedule).toContain("loadTeacherCalendar");
    expect(schedule).toContain("loadTeacherTodos");
    expect(schedule).toContain("loadTeacherWorkActionItems");
    expect(components).toContain("props.events");
    expect(overview).toContain("loadTeacherWorkbenchOverview");
    expect(schedule).not.toContain("teacher-portal-data");
    expect(schedule).not.toContain("sessionStorage");
    expect(agent).not.toContain("agent-todo-context");
    expect(agent).not.toContain("teacherTodos");
  });

  it("centralizes Gate 2.8 routes and DTO validation in contracts", () => {
    const contracts = source("packages/contracts/src/gate2-8.ts");
    const routes = source("packages/contracts/src/api-routes.ts");
    const webApi = source("apps/web/src/api.ts");
    expect(contracts).toContain("TeacherTodoViewSchema");
    expect(contracts).toContain("TeacherCalendarListSchema");
    expect(contracts).toContain("TeacherWorkbenchOverviewSchema");
    expect(contracts).toContain("TodoAgentHandoffResultSchema");
    expect(routes).toContain("workbenchOverview");
    expect(routes).toContain("todoAgentHandoff");
    expect(webApi).toContain("apiRoutes.teacher.workbenchOverview");
    expect(webApi).not.toContain('"/api/v1/teacher/todos"');
  });
});

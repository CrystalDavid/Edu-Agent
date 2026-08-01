import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Gate 2.7 architecture invariants", () => {
  it("keeps Assignment, immutable Attempts, grading, and Evidence in Education ownership", () => {
    const migration = source(
      "apps/api/src/modules/education-domain/infrastructure/migrations/0005_gate2_7_assignment_learning_evidence.sql"
    );
    for (const table of [
      "education.course_run_enrollment",
      "education.assignment",
      "education.assignment_version",
      "education.assignment_item",
      "education.submission",
      "education.submission_attempt_details",
      "education.teacher_grade_decision",
      "education.assignment_evidence_source"
    ]) {
      expect(migration).toContain(table);
    }
    expect(migration).toContain("submission_attempt_details_immutable");
    expect(migration).toContain("assignment_version_immutable");
    expect(migration).toContain("assignment_current_confirmed_grade_unique");
    expect(migration).not.toContain("learner_state_estimate");
    expect(migration).not.toContain("student_profile");
  });

  it("reuses Work Task and task-scoped context instead of a second work or Agent binding aggregate", () => {
    const migration = source(
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0007_gate2_7_assignment_work_context.sql"
    );
    const service = source(
      "apps/api/src/composition/postgres-assignment-learning-service.ts"
    );
    expect(migration).toContain("work.assignment_grading_task_details");
    expect(migration).toContain("source_assignment_ref");
    expect(migration).not.toContain("teacher_work_item");
    expect(migration).not.toContain("agent_context_binding");
    expect(service).toContain("insertLessonPreparationTask");
    expect(service).toContain("validateSelectedEvidence");
    expect(service).toContain("EVIDENCE_SELECTION_NOT_AUTHORIZED");
  });

  it("keeps model authorization limited to the selected WorkingSet Evidence", () => {
    const copilot = source(
      "apps/api/src/composition/postgres-gate2-teacher-copilot-service.ts"
    );
    const invocation = source(
      "apps/api/src/composition/postgres-model-invocation-service.ts"
    );
    for (const implementation of [copilot, invocation]) {
      expect(implementation).toContain("workingSet.evidenceRefs");
      expect(implementation).toContain("authorizedEvidenceRefs");
      expect(implementation).toContain("sourceAssignmentRef");
      expect(implementation).toContain("sourceAssignmentItemRefs");
    }
  });

  it("serves teacher product pages from typed APIs rather than the old homework and student mocks", () => {
    const teaching = source("apps/web/src/pages/TeachingWorkspacePage.tsx");
    const assignment = source("apps/web/src/pages/AssignmentWorkspace.tsx");
    const student = source("apps/web/src/pages/StudentWorkspacePage.tsx");
    const overview = source("apps/web/src/pages/OverviewPage.tsx");
    expect(teaching).toContain("<AssignmentWorkspace");
    expect(teaching).not.toContain("<HomeworkWorkspace");
    expect(assignment).toContain("loadAssignmentAnalytics");
    expect(assignment).toContain("createAdjustmentTask");
    expect(student).toContain("loadCourseRunEnrollments");
    expect(student).toContain("loadLearnerEvidence");
    expect(student).not.toContain("teacher-portal-data");
    expect(student).not.toContain("sessionStorage");
    expect(overview).toContain("loadAssignmentOverview");
  });

  it("keeps route strings and Zod DTOs in contracts", () => {
    const routes = source("packages/contracts/src/api-routes.ts");
    const contracts = source("packages/contracts/src/gate2-7.ts");
    const webApi = source("apps/web/src/api.ts");
    expect(routes).toContain("assignmentAdjustment");
    expect(routes).toContain("learnerEvidence");
    expect(contracts).toContain("CreateAdjustmentTaskRequestSchema");
    expect(contracts).toContain("TeacherAssignmentOverviewSchema");
    expect(webApi).toContain("apiRoutes.teacher.assignmentAdjustment");
    expect(webApi).not.toContain('"/api/v1/teacher/assignments"');
  });
});

import { z } from "zod";

const encodeRouteSegment = (value: string): string =>
  encodeURIComponent(value);

const teacherPreparationTaskRoute = (taskRef: string): string =>
  `/api/v1/teacher/lesson-preparation/tasks/${encodeRouteSegment(
    taskRef
  )}`;

const teacherLessonRoute = (lessonRef: string): string =>
  `/api/v1/teacher/lessons/${encodeRouteSegment(lessonRef)}`;

export const apiRoutes = {
  health: "/api/health",
  teacher: {
    courseRuns: "/api/v1/teacher/course-runs",
    courseRunPattern: "/api/v1/teacher/course-runs/:courseRunRef",
    courseRun: (courseRunRef: string): string =>
      `/api/v1/teacher/course-runs/${encodeRouteSegment(courseRunRef)}`,
    courseRunUnitsPattern:
      "/api/v1/teacher/course-runs/:courseRunRef/units",
    courseRunUnits: (courseRunRef: string): string =>
      `/api/v1/teacher/course-runs/${encodeRouteSegment(
        courseRunRef
      )}/units`,
    unitPattern: "/api/v1/teacher/units/:unitRef",
    unit: (unitRef: string): string =>
      `/api/v1/teacher/units/${encodeRouteSegment(unitRef)}`,
    unitLessonsPattern:
      "/api/v1/teacher/units/:unitRef/lessons",
    unitLessons: (unitRef: string): string =>
      `/api/v1/teacher/units/${encodeRouteSegment(unitRef)}/lessons`,
    lessonPattern: "/api/v1/teacher/lessons/:lessonRef",
    lesson: (lessonRef: string): string =>
      `/api/v1/teacher/lessons/${encodeRouteSegment(lessonRef)}`,
    lessonPreparationSummary:
      "/api/v1/teacher/lesson-preparation/summary",
    preparationTasks:
      "/api/v1/teacher/lesson-preparation/tasks",
    preparationTaskPattern:
      "/api/v1/teacher/lesson-preparation/tasks/:taskRef",
    preparationTask: teacherPreparationTaskRoute,
    preparationTaskStartPattern:
      "/api/v1/teacher/lesson-preparation/tasks/:taskRef/start",
    preparationTaskStart: (taskRef: string): string =>
      `${teacherPreparationTaskRoute(taskRef)}/start`,
    preparationTaskReopenPattern:
      "/api/v1/teacher/lesson-preparation/tasks/:taskRef/reopen",
    preparationTaskReopen: (taskRef: string): string =>
      `${teacherPreparationTaskRoute(taskRef)}/reopen`,
    preparationTaskCompletePattern:
      "/api/v1/teacher/lesson-preparation/tasks/:taskRef/complete",
    preparationTaskComplete: (taskRef: string): string =>
      `${teacherPreparationTaskRoute(taskRef)}/complete`,
    preparationTaskCancelPattern:
      "/api/v1/teacher/lesson-preparation/tasks/:taskRef/cancel",
    preparationTaskCancel: (taskRef: string): string =>
      `${teacherPreparationTaskRoute(taskRef)}/cancel`,
    preparationTaskHistoryPattern:
      "/api/v1/teacher/lesson-preparation/tasks/:taskRef/history",
    preparationTaskHistory: (taskRef: string): string =>
      `${teacherPreparationTaskRoute(taskRef)}/history`,
    taskWorkingSetPattern:
      "/api/v1/teacher/lesson-preparation/tasks/:taskRef/working-set",
    taskWorkingSet: (taskRef: string): string =>
      `${teacherPreparationTaskRoute(taskRef)}/working-set`,
    taskResourceSelectionsPattern:
      "/api/v1/teacher/lesson-preparation/tasks/:taskRef/resource-selections",
    taskResourceSelections: (taskRef: string): string =>
      `${teacherPreparationTaskRoute(taskRef)}/resource-selections`,
    taskAuthorizedContextPlanPattern:
      "/api/v1/teacher/lesson-preparation/tasks/:taskRef/authorized-context-plan",
    taskAuthorizedContextPlan: (taskRef: string): string =>
      `${teacherPreparationTaskRoute(taskRef)}/authorized-context-plan`,
    taskContextManifestPattern:
      "/api/v1/teacher/lesson-preparation/tasks/:taskRef/context-manifest",
    taskContextManifest: (taskRef: string): string =>
      `${teacherPreparationTaskRoute(taskRef)}/context-manifest`,
    lessonTeachingPlansPattern:
      "/api/v1/teacher/lessons/:lessonRef/teaching-plans",
    lessonTeachingPlans: (lessonRef: string): string =>
      `${teacherLessonRoute(lessonRef)}/teaching-plans`
  },
  demo: {
    bootstrap: "/api/v1/demo/workspace",
    createTeacherCopilotTask:
      "/api/v1/demo/teacher-copilot/tasks",
    pendingProposals:
      "/api/v1/demo/teacher-copilot/proposals",
    proposalDetailPattern:
      "/api/v1/demo/teacher-copilot/proposals/:proposalRevisionRef",
    proposalDetail: (proposalRevisionRef: string): string =>
      `/api/v1/demo/teacher-copilot/proposals/${encodeRouteSegment(
        proposalRevisionRef
      )}`,
    suggestionDispositionPattern:
      "/api/v1/demo/suggestions/:proposalRevisionRef/dispositions",
    suggestionDisposition: (proposalRevisionRef: string): string =>
      `/api/v1/demo/suggestions/${encodeRouteSegment(
        proposalRevisionRef
      )}/dispositions`,
    runExplanationPattern: "/api/v1/demo/runs/:taskRef",
    runExplanation: (taskRef: string): string =>
      `/api/v1/demo/runs/${encodeRouteSegment(taskRef)}`,
    teachingPlanRevisionPattern:
      "/api/v1/demo/teaching-plan/revisions/:revisionRef",
    teachingPlanRevision: (revisionRef: string): string =>
      `/api/v1/demo/teaching-plan/revisions/${encodeRouteSegment(
        revisionRef
      )}`,
    approveTeachingPlanPattern:
      "/api/v1/demo/teaching-plan/revisions/:revisionRef/approve",
    approveTeachingPlan: (revisionRef: string): string =>
      `/api/v1/demo/teaching-plan/revisions/${encodeRouteSegment(
        revisionRef
      )}/approve`,
    currentApprovedTeachingPlan:
      "/api/v1/demo/teaching-plan/current-approved",
    currentInReviewTeachingPlan:
      "/api/v1/demo/teaching-plan/current-in-review",
    teachingPlanDrafts:
      "/api/v1/demo/teaching-plan/drafts",
    teachingPlanHistory:
      "/api/v1/demo/teaching-plan/history"
  },
  walkingSkeleton: {
    command: "/api/v1/commands/walking-skeleton",
    artifactQuery: "/api/v1/queries/artifact",
    ingress: "/api/v1/ingress"
  }
} as const;

export const ApiHealthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("edu-agent-api"),
  mode: z.literal("mock")
});

export const ApiErrorResponseSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  method: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  details: z.record(z.string(), z.unknown()).optional()
});

export type ApiHealth = z.infer<typeof ApiHealthSchema>;
export type ApiErrorResponse = z.infer<
  typeof ApiErrorResponseSchema
>;

import { z } from "zod";

const encodeRouteSegment = (value: string): string =>
  encodeURIComponent(value);

const teacherPreparationTaskRoute = (taskRef: string): string =>
  `/api/v1/teacher/lesson-preparation/tasks/${encodeRouteSegment(
    taskRef
  )}`;

const teacherLessonRoute = (lessonRef: string): string =>
  `/api/v1/teacher/lessons/${encodeRouteSegment(lessonRef)}`;

const teacherModelInvocationRoute = (
  modelExecutionRef: string
): string =>
  `/api/v1/teacher/model-invocations/${encodeRouteSegment(
    modelExecutionRef
  )}`;

const teacherFileRoute = (assetRef: string): string =>
  `/api/v1/teacher/files/${encodeRouteSegment(assetRef)}`;

const teacherFileVersionRoute = (
  assetRef: string,
  versionRef: string
): string =>
  `${teacherFileRoute(assetRef)}/versions/${encodeRouteSegment(
    versionRef
  )}`;

const teacherTeachingPlanRevisionRoute = (
  revisionRef: string
): string =>
  `/api/v1/teacher/teaching-plan/revisions/${encodeRouteSegment(
    revisionRef
  )}`;

const teacherAssignmentRoute = (assignmentRef: string): string =>
  `/api/v1/teacher/assignments/${encodeRouteSegment(assignmentRef)}`;

const teacherSubmissionRoute = (submissionRef: string): string =>
  `/api/v1/teacher/submissions/${encodeRouteSegment(submissionRef)}`;

const teacherGradeDecisionRoute = (
  gradeDecisionRef: string
): string =>
  `/api/v1/teacher/grade-decisions/${encodeRouteSegment(
    gradeDecisionRef
  )}`;

const teacherTodoRoute = (todoRef: string): string =>
  `/api/v1/teacher/todos/${encodeRouteSegment(todoRef)}`;

const teacherCalendarEventRoute = (eventRef: string): string =>
  `/api/v1/teacher/calendar-events/${encodeRouteSegment(eventRef)}`;

const teacherWorkProjectionRoute = (projectionRef: string): string =>
  `/api/v1/teacher/workbench/projections/${encodeRouteSegment(projectionRef)}`;

const teacherLessonDeliveryRoute = (deliveryRef: string): string =>
  `/api/v1/teacher/classroom/deliveries/${encodeRouteSegment(deliveryRef)}`;

const teacherClassroomObservationRoute = (observationRef: string): string =>
  `/api/v1/teacher/classroom/observations/${encodeRouteSegment(observationRef)}`;

const teacherReflectionRoute = (reflectionRef: string): string =>
  `/api/v1/teacher/reflections/${encodeRouteSegment(reflectionRef)}`;

export const apiRoutes = {
  health: "/api/health",
  authentication: {
    provider: "/api/v1/auth/provider",
    session: "/api/v1/auth/session",
    sessionRefresh: "/api/v1/auth/session/refresh",
    localLogin: "/api/v1/auth/local-login",
    localCredentialLogin: "/api/v1/auth/local-credential-login",
    localSmsCode: "/api/v1/auth/local-sms-code",
    oidcStart: "/api/v1/auth/oidc/start",
    oidcCallback: "/api/v1/auth/oidc/callback",
    logout: "/api/v1/auth/logout",
    switchWorkspace: "/api/v1/auth/workspace",
    activeSessions: "/api/v1/auth/sessions",
    revokeSessionPattern: "/api/v1/auth/sessions/:sessionRef/revoke",
    revokeSession: (sessionRef: string): string =>
      `/api/v1/auth/sessions/${encodeRouteSegment(sessionRef)}/revoke`
  },
  organization: {
    currentSchool: "/api/v1/organization/current",
    members: "/api/v1/admin/members",
    memberPattern: "/api/v1/admin/members/:membershipRef",
    memberStatusPattern: "/api/v1/admin/members/:membershipRef/status",
    memberStatus: (membershipRef: string): string =>
      `/api/v1/admin/members/${encodeRouteSegment(membershipRef)}/status`,
    memberRolesPattern: "/api/v1/admin/members/:membershipRef/roles",
    memberRoles: (membershipRef: string): string =>
      `/api/v1/admin/members/${encodeRouteSegment(membershipRef)}/roles`,
    memberCourseAccessPattern:
      "/api/v1/admin/members/:membershipRef/course-runs",
    memberCourseAccess: (membershipRef: string): string =>
      `/api/v1/admin/members/${encodeRouteSegment(membershipRef)}/course-runs`,
    securityEvents: "/api/v1/admin/security-events"
  },
  userGovernance: {
    requests: "/api/v1/user-governance/requests"
  },
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
      `${teacherLessonRoute(lessonRef)}/teaching-plans`,
    modelProviderAvailability:
      "/api/v1/teacher/model-provider/availability",
    modelProviderCapabilities:
      "/api/v1/teacher/model-provider/capabilities",
    modelUsageSummary:
      "/api/v1/teacher/model-provider/usage",
    modelInvocations:
      "/api/v1/teacher/model-invocations",
    modelInvocationPattern:
      "/api/v1/teacher/model-invocations/:modelExecutionRef",
    modelInvocation: teacherModelInvocationRoute,
    modelInvocationCancelPattern:
      "/api/v1/teacher/model-invocations/:modelExecutionRef/cancel",
    modelInvocationCancel: (modelExecutionRef: string): string =>
      `${teacherModelInvocationRoute(modelExecutionRef)}/cancel`,
    modelInvocationRetryPattern:
      "/api/v1/teacher/model-invocations/:modelExecutionRef/retry",
    modelInvocationRetry: (modelExecutionRef: string): string =>
      `${teacherModelInvocationRoute(modelExecutionRef)}/retry`,
    files: "/api/v1/teacher/files",
    filePattern: "/api/v1/teacher/files/:assetRef",
    file: teacherFileRoute,
    fileVersionsPattern:
      "/api/v1/teacher/files/:assetRef/versions",
    fileVersions: (assetRef: string): string =>
      `${teacherFileRoute(assetRef)}/versions`,
    fileVersionContentPattern:
      "/api/v1/teacher/files/:assetRef/versions/:versionRef/content",
    fileVersionContent: (
      assetRef: string,
      versionRef: string
    ): string =>
      `${teacherFileVersionRoute(assetRef, versionRef)}/content`,
    fileCurrentContentPattern:
      "/api/v1/teacher/files/:assetRef/content",
    fileCurrentContent: (assetRef: string): string =>
      `${teacherFileRoute(assetRef)}/content`,
    fileDeletePattern:
      "/api/v1/teacher/files/:assetRef/delete",
    fileDelete: (assetRef: string): string =>
      `${teacherFileRoute(assetRef)}/delete`,
    fileRestorePattern:
      "/api/v1/teacher/files/:assetRef/restore",
    fileRestore: (assetRef: string): string =>
      `${teacherFileRoute(assetRef)}/restore`,
    fileBindingsPattern:
      "/api/v1/teacher/files/:assetRef/bindings",
    fileBindings: (assetRef: string): string =>
      `${teacherFileRoute(assetRef)}/bindings`,
    teachingPlanDocxExportPattern:
      "/api/v1/teacher/teaching-plan/revisions/:revisionRef/exports/docx",
    teachingPlanDocxExport: (revisionRef: string): string =>
      `${teacherTeachingPlanRevisionRoute(revisionRef)}/exports/docx`,
    assignments: "/api/v1/teacher/assignments",
    assignmentPattern: "/api/v1/teacher/assignments/:assignmentRef",
    assignment: teacherAssignmentRoute,
    assignmentVersionsPattern:
      "/api/v1/teacher/assignments/:assignmentRef/versions",
    assignmentVersions: (assignmentRef: string): string =>
      `${teacherAssignmentRoute(assignmentRef)}/versions`,
    assignmentPublishPattern:
      "/api/v1/teacher/assignments/:assignmentRef/publish",
    assignmentPublish: (assignmentRef: string): string =>
      `${teacherAssignmentRoute(assignmentRef)}/publish`,
    assignmentClosePattern:
      "/api/v1/teacher/assignments/:assignmentRef/close",
    assignmentClose: (assignmentRef: string): string =>
      `${teacherAssignmentRoute(assignmentRef)}/close`,
    assignmentArchivePattern:
      "/api/v1/teacher/assignments/:assignmentRef/archive",
    assignmentArchive: (assignmentRef: string): string =>
      `${teacherAssignmentRoute(assignmentRef)}/archive`,
    assignmentSyntheticSubmissionsPattern:
      "/api/v1/teacher/assignments/:assignmentRef/synthetic-submissions",
    assignmentSyntheticSubmissions: (assignmentRef: string): string =>
      `${teacherAssignmentRoute(assignmentRef)}/synthetic-submissions`,
    assignmentSubmissionsPattern:
      "/api/v1/teacher/assignments/:assignmentRef/submissions",
    assignmentSubmissions: (assignmentRef: string): string =>
      `${teacherAssignmentRoute(assignmentRef)}/submissions`,
    assignmentGradingQueuePattern:
      "/api/v1/teacher/assignments/:assignmentRef/grading-queue",
    assignmentGradingQueue: (assignmentRef: string): string =>
      `${teacherAssignmentRoute(assignmentRef)}/grading-queue`,
    assignmentAnalyticsPattern:
      "/api/v1/teacher/assignments/:assignmentRef/analytics",
    assignmentAnalytics: (assignmentRef: string): string =>
      `${teacherAssignmentRoute(assignmentRef)}/analytics`,
    assignmentEvidencePattern:
      "/api/v1/teacher/assignments/:assignmentRef/evidence",
    assignmentEvidence: (assignmentRef: string): string =>
      `${teacherAssignmentRoute(assignmentRef)}/evidence`,
    assignmentAdjustmentPattern:
      "/api/v1/teacher/assignments/:assignmentRef/adjust-next-lesson",
    assignmentAdjustment: (assignmentRef: string): string =>
      `${teacherAssignmentRoute(assignmentRef)}/adjust-next-lesson`,
    submissionPattern: "/api/v1/teacher/submissions/:submissionRef",
    submission: teacherSubmissionRoute,
    submissionGradeDraftPattern:
      "/api/v1/teacher/submissions/:submissionRef/grade-draft",
    submissionGradeDraft: (submissionRef: string): string =>
      `${teacherSubmissionRoute(submissionRef)}/grade-draft`,
    gradeDecisionConfirmPattern:
      "/api/v1/teacher/grade-decisions/:gradeDecisionRef/confirm",
    gradeDecisionConfirm: (gradeDecisionRef: string): string =>
      `${teacherGradeDecisionRoute(gradeDecisionRef)}/confirm`,
    gradeDecisionReopenPattern:
      "/api/v1/teacher/grade-decisions/:gradeDecisionRef/reopen",
    gradeDecisionReopen: (gradeDecisionRef: string): string =>
      `${teacherGradeDecisionRoute(gradeDecisionRef)}/reopen`,
    gradeDecisionHistoryPattern:
      "/api/v1/teacher/submissions/:submissionRef/grade-history",
    gradeDecisionHistory: (submissionRef: string): string =>
      `${teacherSubmissionRoute(submissionRef)}/grade-history`,
    courseRunEnrollmentsPattern:
      "/api/v1/teacher/course-runs/:courseRunRef/enrollments",
    courseRunEnrollments: (courseRunRef: string): string =>
      `/api/v1/teacher/course-runs/${encodeRouteSegment(
        courseRunRef
      )}/enrollments`,
    learnerEvidencePattern:
      "/api/v1/teacher/course-runs/:courseRunRef/learners/:learnerRef/evidence",
    learnerEvidence: (courseRunRef: string, learnerRef: string): string =>
      `/api/v1/teacher/course-runs/${encodeRouteSegment(
        courseRunRef
      )}/learners/${encodeRouteSegment(learnerRef)}/evidence`,
    assignmentOverview: "/api/v1/teacher/assignment-overview",
    todos: "/api/v1/teacher/todos",
    todoPattern: "/api/v1/teacher/todos/:todoRef",
    todo: teacherTodoRoute,
    todoCompletePattern: "/api/v1/teacher/todos/:todoRef/complete",
    todoComplete: (todoRef: string): string => `${teacherTodoRoute(todoRef)}/complete`,
    todoReopenPattern: "/api/v1/teacher/todos/:todoRef/reopen",
    todoReopen: (todoRef: string): string => `${teacherTodoRoute(todoRef)}/reopen`,
    todoCancelPattern: "/api/v1/teacher/todos/:todoRef/cancel",
    todoCancel: (todoRef: string): string => `${teacherTodoRoute(todoRef)}/cancel`,
    todoPreferencePattern: "/api/v1/teacher/todos/:todoRef/preference",
    todoPreference: (todoRef: string): string => `${teacherTodoRoute(todoRef)}/preference`,
    todoResourcesPattern: "/api/v1/teacher/todos/:todoRef/resources",
    todoResources: (todoRef: string): string => `${teacherTodoRoute(todoRef)}/resources`,
    todoSchedulePattern: "/api/v1/teacher/todos/:todoRef/schedule",
    todoSchedule: (todoRef: string): string => `${teacherTodoRoute(todoRef)}/schedule`,
    todoAgentHandoffPattern: "/api/v1/teacher/todos/:todoRef/agent-handoff",
    todoAgentHandoff: (todoRef: string): string => `${teacherTodoRoute(todoRef)}/agent-handoff`,
    calendarEvents: "/api/v1/teacher/calendar-events",
    calendarEventPattern: "/api/v1/teacher/calendar-events/:eventRef",
    calendarEvent: teacherCalendarEventRoute,
    calendarEventCompletePattern: "/api/v1/teacher/calendar-events/:eventRef/complete",
    calendarEventComplete: (eventRef: string): string => `${teacherCalendarEventRoute(eventRef)}/complete`,
    calendarEventCancelPattern: "/api/v1/teacher/calendar-events/:eventRef/cancel",
    calendarEventCancel: (eventRef: string): string => `${teacherCalendarEventRoute(eventRef)}/cancel`,
    workbenchOverview: "/api/v1/teacher/workbench/overview",
    workbenchActionItems: "/api/v1/teacher/workbench/action-items",
    workbenchProjectionPattern: "/api/v1/teacher/workbench/projections/:projectionRef",
    workbenchProjection: teacherWorkProjectionRoute,
    workbenchProjectionPreferencePattern: "/api/v1/teacher/workbench/projections/:projectionRef/preference",
    workbenchProjectionPreference: (projectionRef: string): string => `${teacherWorkProjectionRoute(projectionRef)}/preference`,
    lessonImplementationSummaryPattern: "/api/v1/teacher/lessons/:lessonRef/implementation-summary",
    lessonImplementationSummary: (lessonRef: string): string =>
      `${teacherLessonRoute(lessonRef)}/implementation-summary`,
    lessonDeliveries: "/api/v1/teacher/classroom/deliveries",
    lessonDeliveryPattern: "/api/v1/teacher/classroom/deliveries/:deliveryRef",
    lessonDelivery: teacherLessonDeliveryRoute,
    lessonDeliveryConfirmPattern: "/api/v1/teacher/classroom/deliveries/:deliveryRef/confirm",
    lessonDeliveryConfirm: (deliveryRef: string): string => `${teacherLessonDeliveryRoute(deliveryRef)}/confirm`,
    lessonDeliveryAmendPattern: "/api/v1/teacher/classroom/deliveries/:deliveryRef/amend",
    lessonDeliveryAmend: (deliveryRef: string): string => `${teacherLessonDeliveryRoute(deliveryRef)}/amend`,
    classroomObservations: "/api/v1/teacher/classroom/observations",
    classroomObservationPattern: "/api/v1/teacher/classroom/observations/:observationRef",
    classroomObservation: teacherClassroomObservationRoute,
    classroomObservationConfirmPattern: "/api/v1/teacher/classroom/observations/:observationRef/confirm",
    classroomObservationConfirm: (observationRef: string): string => `${teacherClassroomObservationRoute(observationRef)}/confirm`,
    classroomObservationSupersedePattern: "/api/v1/teacher/classroom/observations/:observationRef/supersede",
    classroomObservationSupersede: (observationRef: string): string => `${teacherClassroomObservationRoute(observationRef)}/supersede`,
    reflections: "/api/v1/teacher/reflections",
    reflectionPattern: "/api/v1/teacher/reflections/:reflectionRef",
    reflection: teacherReflectionRoute,
    reflectionConfirmPattern: "/api/v1/teacher/reflections/:reflectionRef/confirm",
    reflectionConfirm: (reflectionRef: string): string => `${teacherReflectionRoute(reflectionRef)}/confirm`,
    reflectionGeneratePattern: "/api/v1/teacher/reflections/:reflectionRef/generate",
    reflectionGenerate: (reflectionRef: string): string => `${teacherReflectionRoute(reflectionRef)}/generate`,
    reflectionFollowUpsPattern: "/api/v1/teacher/reflections/:reflectionRef/follow-ups",
    reflectionFollowUps: (reflectionRef: string): string => `${teacherReflectionRoute(reflectionRef)}/follow-ups`,
    pendingReflections: "/api/v1/teacher/reflections/pending"
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
  mode: z.enum(["mock", "ark"])
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

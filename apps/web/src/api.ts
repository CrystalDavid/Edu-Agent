import {
  apiRoutes,
  ActiveSessionListSchema,
  AdminMemberListSchema,
  AuthenticationProviderAvailabilitySchema,
  AuthenticationSessionStatusSchema,
  CreateDataGovernanceRequestSchema,
  CreateMemberRequestSchema,
  DataGovernanceRequestListSchema,
  LocalCredentialLoginRequestSchema,
  LocalLoginRequestSchema,
  LocalSmsChallengeSchema,
  RequestLocalSmsCodeSchema,
  RefreshSessionRequestSchema,
  RevokeSessionRequestSchema,
  SchoolDetailSchema,
  SecurityEventListSchema,
  SwitchWorkspaceRequestSchema,
  UpdateMemberCourseAccessRequestSchema,
  UpdateMemberRolesRequestSchema,
  UpdateMemberStatusRequestSchema,
  AdjustmentTaskResultSchema,
  AmendLessonDeliveryRequestSchema,
  AssignmentActionRequestSchema,
  AssignmentAnalyticsSchema,
  AssignmentDetailSchema,
  AssignmentListSchema,
  AssignmentResultSchema,
  CalendarEventActionRequestSchema,
  CalendarEventMutationResultSchema,
  ClassroomObservationListQuerySchema,
  ClassroomObservationListSchema,
  ClassroomObservationDetailSchema,
  ClassroomObservationMutationResultSchema,
  ApproveTeachingPlanRequestSchema,
  ApproveTeachingPlanResultSchema,
  ApiHealthSchema,
  AuthorizedContextPlanSchema,
  ConfirmGradeRequestSchema,
  ConfirmClassroomObservationRequestSchema,
  ConfirmLessonDeliveryRequestSchema,
  ConfirmReflectionRequestSchema,
  CourseRunEnrollmentListSchema,
  CancelModelInvocationRequestSchema,
  CourseRunListSchema,
  CreateCalendarEventRequestSchema,
  CreateClassroomObservationRequestSchema,
  CreateLessonDeliveryRequestSchema,
  CreateLessonPreparationTaskRequestSchema,
  CreateAdjustmentTaskRequestSchema,
  CreateAssignmentRequestSchema,
  CreateModelInvocationRequestSchema,
  CreateModelInvocationResultSchema,
  CreateReflectionDraftRequestSchema,
  CreateReflectionFollowUpRequestSchema,
  CurriculumUnitListSchema,
  CreateTeacherCopilotTaskRequestSchema,
  CreateTeacherCopilotTaskResultSchema,
  CreateTeacherTodoRequestSchema,
  FileAssetDetailSchema,
  FileAssetListQuerySchema,
  FileAssetListSchema,
  FileBindingRequestSchema,
  FileLifecycleRequestSchema,
  FileMutationResultSchema,
  FileUploadMetadataSchema,
  FileVersionUploadMetadataSchema,
  GradeDecisionHistorySchema,
  GradeDecisionResultSchema,
  GenerateReflectionRequestSchema,
  GradingQueueSchema,
  LearnerRecentEvidenceSchema,
  LessonListSchema,
  LessonDeliveryDetailSchema,
  LessonDeliveryMutationResultSchema,
  LessonImplementationSummarySchema,
  LessonPreparationSummarySchema,
  LessonPreparationTaskActionRequestSchema,
  LessonPreparationTaskDetailSchema,
  LessonPreparationTaskListSchema,
  LessonPreparationTaskResultSchema,
  LessonTeachingPlanStateSchema,
  LinkTeacherTodoResourceRequestSchema,
  ModelExecutionViewSchema,
  ModelUsageSummarySchema,
  PendingProposalListSchema,
  PendingReflectionQueueSchema,
  ProposalReviewDetailSchema,
  RunExplanationSchema,
  ProviderAvailabilitySchema,
  ProviderCapabilitiesSchema,
  ReflectionDetailSchema,
  ReflectionGenerationResultSchema,
  ReflectionFollowUpResultSchema,
  ReflectionMutationResultSchema,
  RetryModelInvocationRequestSchema,
  ReopenGradeRequestSchema,
  SaveGradeDraftRequestSchema,
  ScheduleTodoRequestSchema,
  ScheduleTodoResultSchema,
  SuggestionDispositionRequestSchema,
  SuggestionDispositionResultSchema,
  SupersedeClassroomObservationRequestSchema,
  TaskResourceSelectionRequestSchema,
  TaskWorkingSetResultSchema,
  SubmissionDetailSchema,
  SubmissionListSchema,
  SyntheticSubmissionImportRequestSchema,
  SyntheticSubmissionImportResultSchema,
  TeacherAssignmentOverviewSchema,
  TeacherCalendarListQuerySchema,
  TeacherCalendarListSchema,
  TeacherTodoActionRequestSchema,
  TeacherTodoListQuerySchema,
  TeacherTodoListSchema,
  TeacherTodoMutationResultSchema,
  TeacherTodoPreferenceRequestSchema,
  TeacherTodoViewSchema,
  TeacherWorkbenchOverviewSchema,
  TeacherWorkProjectionListSchema,
  TeacherWorkProjectionViewSchema,
  TeacherWorkspaceSchema,
  TeachingPlanRevisionViewSchema,
  TeachingPlanDocxExportRequestSchema,
  TeachingPlanDocxExportResultSchema,
  UpdateAssignmentDraftRequestSchema,
  UpdateClassroomObservationDraftRequestSchema,
  UpdateLessonDeliveryDraftRequestSchema,
  UpdateReflectionDraftRequestSchema,
  TodoAgentHandoffRequestSchema,
  TodoAgentHandoffResultSchema,
  UpdateCalendarEventRequestSchema,
  UpdateTeacherTodoRequestSchema,
  WorkProjectionPreferenceRequestSchema,
  WorkProjectionPreferenceResultSchema,
  type ApiHealth,
  type AuthenticationSessionStatus,
  type CreateDataGovernanceRequest,
  type CreateMemberRequest,
  type LocalCredentialLoginRequest,
  type LocalLoginRequest,
  type LocalSmsChallenge,
  type SwitchWorkspaceRequest,
  type UpdateMemberCourseAccessRequest,
  type UpdateMemberRolesRequest,
  type UpdateMemberStatusRequest,
  type AmendLessonDeliveryRequest,
  type AssignmentActionRequest,
  type AssignmentAnalytics,
  type AssignmentDetail,
  type AuthorizedContextPlan,
  type ApproveTeachingPlanRequest,
  type ApproveTeachingPlanResult,
  type CancelModelInvocationRequest,
  type CalendarEventActionRequest,
  type ClassroomObservationListQuery,
  type ConfirmClassroomObservationRequest,
  type ConfirmLessonDeliveryRequest,
  type ConfirmReflectionRequest,
  type ConfirmGradeRequest,
  type CreateAdjustmentTaskRequest,
  type CreateCalendarEventRequest,
  type CreateClassroomObservationRequest,
  type CreateLessonDeliveryRequest,
  type CreateAssignmentRequest,
  type CreateModelInvocationRequest,
  type CreateModelInvocationResult,
  type CreateReflectionDraftRequest,
  type CreateReflectionFollowUpRequest,
  type CreateTeacherCopilotTaskRequest,
  type CreateTeacherCopilotTaskResult,
  type CreateTeacherTodoRequest,
  type CreateLessonPreparationTaskRequest,
  type FileAssetDetail,
  type FileAssetListQuery,
  type FileBindingRequest,
  type FileLifecycleRequest,
  type FileUploadMetadata,
  type FileVersionUploadMetadata,
  type GenerateReflectionRequest,
  type LinkTeacherTodoResourceRequest,
  type ReopenGradeRequest,
  type SaveGradeDraftRequest,
  type ScheduleTodoRequest,
  type LessonPreparationSummary,
  type LessonPreparationTaskActionRequest,
  type LessonPreparationTaskDetail,
  type LessonTeachingPlanState,
  type ModelExecutionView,
  type ModelUsageSummary,
  type PendingProposalList,
  type ProposalReviewDetail,
  type RunExplanation,
  type ProviderAvailability,
  type ProviderCapabilities,
  type RetryModelInvocationRequest,
  type SuggestionDispositionRequest,
  type SuggestionDispositionResult,
  type SupersedeClassroomObservationRequest,
  type TaskResourceSelectionRequest,
  type TaskWorkingSet,
  type TeacherCalendarListQuery,
  type TeacherTodoActionRequest,
  type TeacherTodoListQuery,
  type TeacherTodoPreferenceRequest,
  type TeacherWorkspace,
  type TodoAgentHandoffRequest,
  type TeachingPlanDocxExportRequest,
  type SyntheticSubmissionImportRequest,
  type UpdateCalendarEventRequest,
  type UpdateClassroomObservationDraftRequest,
  type UpdateLessonDeliveryDraftRequest,
  type UpdateReflectionDraftRequest,
  type UpdateTeacherTodoRequest,
  type WorkProjectionPreferenceRequest,
  type UpdateAssignmentDraftRequest
} from "@edu-agent/contracts";

import {
  ApiConfigurationError,
  resolveApiUrl
} from "./api-url";

let activeCsrfToken: string | null = null;

function rememberSession(status: AuthenticationSessionStatus): void {
  activeCsrfToken = status.authenticated ? status.csrfToken : null;
}

export type RecoverableCopilotTask =
  | CreateTeacherCopilotTaskResult
  | ProposalReviewDetail;

type ResponseSchema<T> = {
  safeParse: (
    value: unknown
  ) =>
    | { success: true; data: T }
    | { success: false; error: unknown };
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly service: string,
    readonly requestUrl: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  service: string,
  path: string,
  schema: ResponseSchema<T>,
  init?: RequestInit
): Promise<T> {
  let requestUrl: string;
  try {
    requestUrl = resolveApiUrl(
      path,
      import.meta.env.VITE_API_BASE_URL,
      window.location.origin
    );
  } catch (error) {
    if (error instanceof ApiConfigurationError) {
      throw new ApiError(
        0,
        error.code,
        error.message,
        service,
        path
      );
    }
    throw error;
  }

  if (import.meta.env.DEV) {
    console.info(
      `Frontend requested: ${(init?.method ?? "GET").toUpperCase()} ${requestUrl}`
    );
  }

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      ...init,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...((init?.method ?? "GET").toUpperCase() !== "GET" &&
        (init?.method ?? "GET").toUpperCase() !== "HEAD" &&
        activeCsrfToken
          ? { "x-csrf-token": activeCsrfToken }
          : {}),
        ...init?.headers
      }
    });
  } catch {
    throw new ApiError(
      0,
      "API_UNREACHABLE",
      "无法连接本地 API；请确认演示服务已启动。",
      service,
      requestUrl
    );
  }
  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => ({}))) as {
      code?: string;
      message?: string;
      details?: Record<string, unknown>;
    };
    const authenticationAttempt =
      path === apiRoutes.authentication.localLogin ||
      path === apiRoutes.authentication.localCredentialLogin ||
      path === apiRoutes.authentication.localSmsCode;
    if (response.status === 401 && !authenticationAttempt) {
      activeCsrfToken = null;
      window.dispatchEvent(new CustomEvent("edu-agent:session-expired"));
    }
    throw new ApiError(
      response.status,
      payload.code ?? "UNKNOWN_API_ERROR",
      payload.message ?? `请求失败（HTTP ${response.status}）`,
      service,
      requestUrl,
      payload.details
    );
  }

  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      "INVALID_API_RESPONSE",
      `${service} 返回了不符合契约的数据。`,
      service,
      requestUrl
    );
  }
  return parsed.data;
}

function encodedFileMetadata(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

async function downloadRequest(path: string): Promise<Blob> {
  const requestUrl = resolveApiUrl(
    path,
    import.meta.env.VITE_API_BASE_URL,
    window.location.origin
  );
  const response = await fetch(requestUrl, {
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    throw new ApiError(
      response.status,
      payload.code ?? "FILE_DOWNLOAD_FAILED",
      payload.message ?? "文件下载失败。",
      "文件下载",
      requestUrl
    );
  }
  return response.blob();
}

export function checkApiHealth(): Promise<ApiHealth> {
  return request("API 健康检查", apiRoutes.health, ApiHealthSchema);
}

export function loadAuthenticationProvider() {
  return request(
    "身份供应商状态",
    apiRoutes.authentication.provider,
    AuthenticationProviderAvailabilitySchema
  );
}

export async function loadAuthenticationSession() {
  const status = await request(
    "登录会话",
    apiRoutes.authentication.session,
    AuthenticationSessionStatusSchema
  );
  rememberSession(status);
  return status;
}

export async function loginWithLocalIdentity(input: LocalLoginRequest) {
  LocalLoginRequestSchema.parse(input);
  const status = await request(
    "本地身份登录",
    apiRoutes.authentication.localLogin,
    AuthenticationSessionStatusSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
  rememberSession(status);
  return status;
}

export async function requestLocalSmsCode(
  phone: string
): Promise<LocalSmsChallenge> {
  const input = RequestLocalSmsCodeSchema.parse({ phone });
  return request(
    "获取登录验证码",
    apiRoutes.authentication.localSmsCode,
    LocalSmsChallengeSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function loginWithLocalCredentials(
  input: LocalCredentialLoginRequest
) {
  LocalCredentialLoginRequestSchema.parse(input);
  const status = await request(
    "手机号登录",
    apiRoutes.authentication.localCredentialLogin,
    AuthenticationSessionStatusSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
  rememberSession(status);
  return status;
}

export async function switchAuthenticationWorkspace(
  input: SwitchWorkspaceRequest
) {
  SwitchWorkspaceRequestSchema.parse(input);
  const status = await request(
    "切换学校工作空间",
    apiRoutes.authentication.switchWorkspace,
    AuthenticationSessionStatusSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
  rememberSession(status);
  return status;
}

export async function refreshAuthenticationSession(
  expectedSessionVersion: number
) {
  const input = RefreshSessionRequestSchema.parse({ expectedSessionVersion });
  const status = await request(
    "续期登录会话",
    apiRoutes.authentication.sessionRefresh,
    AuthenticationSessionStatusSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
  rememberSession(status);
  return status;
}

export async function logoutAuthenticationSession(): Promise<void> {
  const requestUrl = resolveApiUrl(
    apiRoutes.authentication.logout,
    import.meta.env.VITE_API_BASE_URL,
    window.location.origin
  );
  const response = await fetch(requestUrl, {
    method: "POST",
    credentials: "include",
    ...(activeCsrfToken
      ? { headers: { "x-csrf-token": activeCsrfToken } }
      : {})
  });
  activeCsrfToken = null;
  if (!response.ok && response.status !== 401) {
    throw new ApiError(
      response.status,
      "LOGOUT_FAILED",
      "退出登录失败。",
      "退出登录",
      requestUrl
    );
  }
}

export function loadActiveSessions() {
  return request(
    "活跃会话",
    apiRoutes.authentication.activeSessions,
    ActiveSessionListSchema
  );
}

export function revokeAuthenticationSession(
  sessionRef: string,
  expectedVersion: number
) {
  const input = RevokeSessionRequestSchema.parse({ expectedVersion });
  return request(
    "撤销登录会话",
    apiRoutes.authentication.revokeSession(sessionRef),
    {
      safeParse(value: unknown) {
        return value && typeof value === "object"
          ? { success: true as const, data: value as Record<string, unknown> }
          : { success: false as const, error: new Error("Invalid revoke result") };
      }
    },
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function loadCurrentSchool() {
  return request(
    "当前学校",
    apiRoutes.organization.currentSchool,
    SchoolDetailSchema
  );
}

export function loadSchoolMembers() {
  return request(
    "学校成员",
    apiRoutes.organization.members,
    AdminMemberListSchema
  );
}

export function createSchoolMember(input: CreateMemberRequest) {
  CreateMemberRequestSchema.parse(input);
  return request(
    "创建学校成员",
    apiRoutes.organization.members,
    {
      safeParse(value: unknown) {
        const parsed = value as { membershipRef?: unknown; userRef?: unknown; version?: unknown };
        return typeof parsed?.membershipRef === "string" &&
          typeof parsed.userRef === "string" &&
          typeof parsed.version === "number"
          ? { success: true as const, data: parsed as { membershipRef: string; userRef: string; version: number } }
          : { success: false as const, error: new Error("Invalid member result") };
      }
    },
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function updateSchoolMemberStatus(
  membershipRef: string,
  input: UpdateMemberStatusRequest
) {
  UpdateMemberStatusRequestSchema.parse(input);
  return request(
    "更新成员状态",
    apiRoutes.organization.memberStatus(membershipRef),
    {
      safeParse(value: unknown) {
        return { success: true as const, data: value as Record<string, unknown> };
      }
    },
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export function updateSchoolMemberRoles(
  membershipRef: string,
  input: UpdateMemberRolesRequest
) {
  UpdateMemberRolesRequestSchema.parse(input);
  return request(
    "更新成员角色",
    apiRoutes.organization.memberRoles(membershipRef),
    {
      safeParse(value: unknown) {
        return { success: true as const, data: value as Record<string, unknown> };
      }
    },
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export function updateSchoolMemberCourseAccess(
  membershipRef: string,
  input: UpdateMemberCourseAccessRequest
) {
  UpdateMemberCourseAccessRequestSchema.parse(input);
  return request(
    "更新课程权限",
    apiRoutes.organization.memberCourseAccess(membershipRef),
    {
      safeParse(value: unknown) {
        return { success: true as const, data: value as Record<string, unknown> };
      }
    },
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export function loadSecurityEvents() {
  return request(
    "安全审计",
    apiRoutes.organization.securityEvents,
    SecurityEventListSchema
  );
}

export function loadDataGovernanceRequests() {
  return request(
    "数据治理请求",
    apiRoutes.userGovernance.requests,
    DataGovernanceRequestListSchema
  );
}

export function createUserDataGovernanceRequest(
  input: CreateDataGovernanceRequest
) {
  CreateDataGovernanceRequestSchema.parse(input);
  return request(
    "创建数据治理请求",
    apiRoutes.userGovernance.requests,
    DataGovernanceRequestListSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function loadWorkspace(): Promise<TeacherWorkspace> {
  return request(
    "教师工作台启动数据",
    apiRoutes.demo.bootstrap,
    TeacherWorkspaceSchema
  );
}

export function loadCourseRuns() {
  return request(
    "课程列表",
    apiRoutes.teacher.courseRuns,
    CourseRunListSchema
  );
}

export function loadCurriculumUnits(courseRunRef: string) {
  return request(
    "课程单元",
    apiRoutes.teacher.courseRunUnits(courseRunRef),
    CurriculumUnitListSchema
  );
}

export function loadLessons(unitRef: string) {
  return request(
    "课时列表",
    apiRoutes.teacher.unitLessons(unitRef),
    LessonListSchema
  );
}

export function loadLessonPreparationSummary(): Promise<LessonPreparationSummary> {
  return request(
    "备课概览",
    apiRoutes.teacher.lessonPreparationSummary,
    LessonPreparationSummarySchema
  );
}

export function loadLessonPreparationTasks() {
  return request(
    "备课任务",
    apiRoutes.teacher.preparationTasks,
    LessonPreparationTaskListSchema
  );
}

export function loadLessonPreparationTask(
  taskRef: string
): Promise<LessonPreparationTaskDetail> {
  return request(
    "备课任务详情",
    apiRoutes.teacher.preparationTask(taskRef),
    LessonPreparationTaskDetailSchema
  );
}

export function createLessonPreparationTask(
  input: CreateLessonPreparationTaskRequest
) {
  CreateLessonPreparationTaskRequestSchema.parse(input);
  return request(
    "创建备课任务",
    apiRoutes.teacher.preparationTasks,
    LessonPreparationTaskResultSchema,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export function transitionLessonPreparationTask(
  taskRef: string,
  action: "start" | "reopen" | "complete" | "cancel",
  input: LessonPreparationTaskActionRequest
) {
  LessonPreparationTaskActionRequestSchema.parse(input);
  const path = {
    start: apiRoutes.teacher.preparationTaskStart(taskRef),
    reopen: apiRoutes.teacher.preparationTaskReopen(taskRef),
    complete:
      apiRoutes.teacher.preparationTaskComplete(taskRef),
    cancel: apiRoutes.teacher.preparationTaskCancel(taskRef)
  }[action];
  return request(
    `备课任务：${action}`,
    path,
    LessonPreparationTaskResultSchema,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export function updateTaskResourceSelection(
  taskRef: string,
  operation: "add" | "remove",
  input: TaskResourceSelectionRequest
): Promise<{ replayed: boolean; workingSet: TaskWorkingSet }> {
  TaskResourceSelectionRequestSchema.parse(input);
  return request(
    "备课上下文选择",
    apiRoutes.teacher.taskResourceSelections(taskRef),
    TaskWorkingSetResultSchema,
    {
      method: operation === "add" ? "POST" : "DELETE",
      body: JSON.stringify(input)
    }
  );
}

export function loadLessonTeachingPlans(
  lessonRef: string
): Promise<LessonTeachingPlanState> {
  return request(
    "课时教学计划",
    apiRoutes.teacher.lessonTeachingPlans(lessonRef),
    LessonTeachingPlanStateSchema
  );
}

export function loadTaskAuthorizedContextPlan(
  taskRef: string
): Promise<AuthorizedContextPlan> {
  return request(
    "已授权上下文",
    apiRoutes.teacher.taskAuthorizedContextPlan(taskRef),
    AuthorizedContextPlanSchema
  );
}

export function createTeacherCopilotTask(
  input: CreateTeacherCopilotTaskRequest
): Promise<CreateTeacherCopilotTaskResult> {
  CreateTeacherCopilotTaskRequestSchema.parse(input);
  return request(
    "教师助手任务",
    apiRoutes.demo.createTeacherCopilotTask,
    CreateTeacherCopilotTaskResultSchema,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export function loadModelProviderAvailability(): Promise<ProviderAvailability> {
  return request(
    "模型服务可用性",
    apiRoutes.teacher.modelProviderAvailability,
    ProviderAvailabilitySchema
  );
}

export function loadProviderCapabilities(): Promise<ProviderCapabilities | null> {
  return request(
    "模型能力摘要",
    apiRoutes.teacher.modelProviderCapabilities,
    ProviderCapabilitiesSchema.nullable()
  );
}

export function loadModelUsageSummary(): Promise<ModelUsageSummary> {
  return request(
    "模型用量摘要",
    apiRoutes.teacher.modelUsageSummary,
    ModelUsageSummarySchema
  );
}

export function createModelInvocation(
  input: CreateModelInvocationRequest
): Promise<CreateModelInvocationResult> {
  CreateModelInvocationRequestSchema.parse(input);
  return request(
    "创建模型调用",
    apiRoutes.teacher.modelInvocations,
    CreateModelInvocationResultSchema,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export function loadModelInvocation(
  modelExecutionRef: string
): Promise<ModelExecutionView> {
  return request(
    "模型调用状态",
    apiRoutes.teacher.modelInvocation(modelExecutionRef),
    ModelExecutionViewSchema
  );
}

export function cancelModelInvocation(
  modelExecutionRef: string,
  input: CancelModelInvocationRequest
): Promise<ModelExecutionView> {
  CancelModelInvocationRequestSchema.parse(input);
  return request(
    "取消模型调用",
    apiRoutes.teacher.modelInvocationCancel(
      modelExecutionRef
    ),
    ModelExecutionViewSchema,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export function retryModelInvocation(
  modelExecutionRef: string,
  input: RetryModelInvocationRequest
): Promise<CreateModelInvocationResult> {
  RetryModelInvocationRequestSchema.parse(input);
  return request(
    "重试模型调用",
    apiRoutes.teacher.modelInvocationRetry(
      modelExecutionRef
    ),
    CreateModelInvocationResultSchema,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export function disposeSuggestion(
  proposalRevisionRef: string,
  input: SuggestionDispositionRequest
): Promise<SuggestionDispositionResult> {
  SuggestionDispositionRequestSchema.parse(input);
  return request(
    "建议处置",
    apiRoutes.demo.suggestionDisposition(proposalRevisionRef),
    SuggestionDispositionResultSchema,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export function loadPendingProposals(): Promise<PendingProposalList> {
  return request(
    "待审建议列表",
    apiRoutes.demo.pendingProposals,
    PendingProposalListSchema
  );
}

export function loadProposalDetail(
  proposalRevisionRef: string
): Promise<ProposalReviewDetail> {
  return request(
    "建议审阅详情",
    apiRoutes.demo.proposalDetail(proposalRevisionRef),
    ProposalReviewDetailSchema
  );
}

export function approveTeachingPlan(
  revisionRef: string,
  input: ApproveTeachingPlanRequest
): Promise<ApproveTeachingPlanResult> {
  ApproveTeachingPlanRequestSchema.parse(input);
  return request(
    "批准教学计划",
    apiRoutes.demo.approveTeachingPlan(revisionRef),
    ApproveTeachingPlanResultSchema,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export async function loadTeachingPlanState(): Promise<{
  currentApproved: TeacherWorkspace["currentTeachingPlan"];
  currentInReview: TeacherWorkspace["currentInReviewPlan"];
  drafts: Array<TeacherWorkspace["currentTeachingPlan"]>;
  history: Array<TeacherWorkspace["currentTeachingPlan"]>;
}> {
  const [
    currentApproved,
    currentInReview,
    drafts,
    history
  ] = await Promise.all([
    request(
      "当前已批准教学计划",
      apiRoutes.demo.currentApprovedTeachingPlan,
      TeachingPlanRevisionViewSchema
    ),
    request(
      "当前待审核教学计划",
      apiRoutes.demo.currentInReviewTeachingPlan,
      TeachingPlanRevisionViewSchema.nullable()
    ),
    request(
      "教学计划草稿",
      apiRoutes.demo.teachingPlanDrafts,
      TeachingPlanRevisionViewSchema.array()
    ),
    request(
      "教学计划版本历史",
      apiRoutes.demo.teachingPlanHistory,
      TeachingPlanRevisionViewSchema.array()
    )
  ]);
  return {
    currentApproved,
    currentInReview,
    drafts,
    history
  };
}

export function loadRunExplanation(
  taskRef: string
): Promise<RunExplanation> {
  return request(
    "运行说明",
    apiRoutes.demo.runExplanation(taskRef),
    RunExplanationSchema
  );
}

export function loadTeachingPlanRevision(
  revisionRef: string
): Promise<TeacherWorkspace["currentTeachingPlan"]> {
  return request(
    "教学计划修订",
    apiRoutes.demo.teachingPlanRevision(revisionRef),
    TeachingPlanRevisionViewSchema
  );
}

export async function loadTeacherWorkbench(): Promise<TeacherWorkspace> {
  await checkApiHealth();
  return loadWorkspace();
}

export function loadFiles(query: FileAssetListQuery) {
  const parsed = FileAssetListQuerySchema.parse(query);
  const search = new URLSearchParams();
  search.set("status", parsed.status);
  search.set("sort", parsed.sort);
  if (parsed.query) search.set("query", parsed.query);
  if (parsed.category) search.set("category", parsed.category);
  if (parsed.targetType) search.set("targetType", parsed.targetType);
  if (parsed.targetRef) search.set("targetRef", parsed.targetRef);
  return request(
    "文件列表",
    `${apiRoutes.teacher.files}?${search.toString()}`,
    FileAssetListSchema
  );
}

export function loadFile(assetRef: string): Promise<FileAssetDetail> {
  return request(
    "文件详情",
    apiRoutes.teacher.file(assetRef),
    FileAssetDetailSchema
  );
}

export function uploadFile(file: File, metadata: FileUploadMetadata) {
  FileUploadMetadataSchema.parse(metadata);
  return request(
    "上传文件",
    apiRoutes.teacher.files,
    FileMutationResultSchema,
    {
      method: "POST",
      headers: {
        "content-type": metadata.mimeType,
        "x-edu-file-metadata": encodedFileMetadata(metadata)
      },
      body: file
    }
  );
}

export function createFileVersion(
  assetRef: string,
  file: File,
  metadata: FileVersionUploadMetadata
) {
  FileVersionUploadMetadataSchema.parse(metadata);
  return request(
    "创建文件版本",
    apiRoutes.teacher.fileVersions(assetRef),
    FileMutationResultSchema,
    {
      method: "POST",
      headers: {
        "content-type": metadata.mimeType,
        "x-edu-file-metadata": encodedFileMetadata(metadata)
      },
      body: file
    }
  );
}

export function addFileBinding(
  assetRef: string,
  input: FileBindingRequest
) {
  FileBindingRequestSchema.parse(input);
  return request(
    "关联文件",
    apiRoutes.teacher.fileBindings(assetRef),
    FileMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function changeFileLifecycle(
  assetRef: string,
  nextStatus: "active" | "deleted",
  input: FileLifecycleRequest
) {
  FileLifecycleRequestSchema.parse(input);
  return request(
    nextStatus === "deleted" ? "删除文件" : "恢复文件",
    nextStatus === "deleted"
      ? apiRoutes.teacher.fileDelete(assetRef)
      : apiRoutes.teacher.fileRestore(assetRef),
    FileMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function exportTeachingPlanDocx(
  revisionRef: string,
  input: TeachingPlanDocxExportRequest
) {
  TeachingPlanDocxExportRequestSchema.parse(input);
  return request(
    "导出已批准教案",
    apiRoutes.teacher.teachingPlanDocxExport(revisionRef),
    TeachingPlanDocxExportResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function downloadFile(
  assetRef: string,
  versionRef?: string
): Promise<Blob> {
  return downloadRequest(
    versionRef
      ? apiRoutes.teacher.fileVersionContent(assetRef, versionRef)
      : apiRoutes.teacher.fileCurrentContent(assetRef)
  );
}

export function loadAssignments(lessonRef?: string) {
  const search = new URLSearchParams();
  if (lessonRef) search.set("lessonRef", lessonRef);
  return request(
    "作业列表",
    `${apiRoutes.teacher.assignments}${
      search.size > 0 ? `?${search.toString()}` : ""
    }`,
    AssignmentListSchema
  );
}

export function loadAssignment(
  assignmentRef: string
): Promise<AssignmentDetail> {
  return request(
    "作业详情",
    apiRoutes.teacher.assignment(assignmentRef),
    AssignmentDetailSchema
  );
}

export function createAssignment(input: CreateAssignmentRequest) {
  CreateAssignmentRequestSchema.parse(input);
  return request(
    "创建作业",
    apiRoutes.teacher.assignments,
    AssignmentResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function updateAssignmentDraft(
  assignmentRef: string,
  input: UpdateAssignmentDraftRequest
) {
  UpdateAssignmentDraftRequestSchema.parse(input);
  return request(
    "更新作业草稿",
    apiRoutes.teacher.assignment(assignmentRef),
    AssignmentResultSchema,
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export function transitionAssignment(
  assignmentRef: string,
  action: "publish" | "close" | "archive",
  input: AssignmentActionRequest
) {
  AssignmentActionRequestSchema.parse(input);
  const path =
    action === "publish"
      ? apiRoutes.teacher.assignmentPublish(assignmentRef)
      : action === "close"
        ? apiRoutes.teacher.assignmentClose(assignmentRef)
        : apiRoutes.teacher.assignmentArchive(assignmentRef);
  return request(
    "作业状态更新",
    path,
    AssignmentResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function importSyntheticSubmissions(
  assignmentRef: string,
  input: SyntheticSubmissionImportRequest
) {
  SyntheticSubmissionImportRequestSchema.parse(input);
  return request(
    "载入合成提交",
    apiRoutes.teacher.assignmentSyntheticSubmissions(assignmentRef),
    SyntheticSubmissionImportResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function loadAssignmentSubmissions(assignmentRef: string) {
  return request(
    "作业提交",
    apiRoutes.teacher.assignmentSubmissions(assignmentRef),
    SubmissionListSchema
  );
}

export function loadSubmission(submissionRef: string) {
  return request(
    "提交详情",
    apiRoutes.teacher.submission(submissionRef),
    SubmissionDetailSchema
  );
}

export function loadGradingQueue(assignmentRef: string) {
  return request(
    "批改队列",
    apiRoutes.teacher.assignmentGradingQueue(assignmentRef),
    GradingQueueSchema
  );
}

export function saveGradeDraft(
  submissionRef: string,
  input: SaveGradeDraftRequest
) {
  SaveGradeDraftRequestSchema.parse(input);
  return request(
    "保存批改草稿",
    apiRoutes.teacher.submissionGradeDraft(submissionRef),
    GradeDecisionResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function confirmGrade(
  gradeDecisionRef: string,
  input: ConfirmGradeRequest
) {
  ConfirmGradeRequestSchema.parse(input);
  return request(
    "确认批改",
    apiRoutes.teacher.gradeDecisionConfirm(gradeDecisionRef),
    GradeDecisionResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function reopenGrade(
  gradeDecisionRef: string,
  input: ReopenGradeRequest
) {
  ReopenGradeRequestSchema.parse(input);
  return request(
    "重新打开批改",
    apiRoutes.teacher.gradeDecisionReopen(gradeDecisionRef),
    GradeDecisionResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function loadGradeHistory(submissionRef: string) {
  return request(
    "批改历史",
    apiRoutes.teacher.gradeDecisionHistory(submissionRef),
    GradeDecisionHistorySchema
  );
}

export function loadAssignmentAnalytics(
  assignmentRef: string
): Promise<AssignmentAnalytics> {
  return request(
    "作业学习证据分析",
    apiRoutes.teacher.assignmentAnalytics(assignmentRef),
    AssignmentAnalyticsSchema
  );
}

export function loadCourseRunEnrollments(courseRunRef: string) {
  return request(
    "课程学习者",
    apiRoutes.teacher.courseRunEnrollments(courseRunRef),
    CourseRunEnrollmentListSchema
  );
}

export function loadLearnerEvidence(
  courseRunRef: string,
  learnerRef: string
) {
  return request(
    "学习者近期 Evidence",
    apiRoutes.teacher.learnerEvidence(courseRunRef, learnerRef),
    LearnerRecentEvidenceSchema
  );
}

export function createAdjustmentTask(
  assignmentRef: string,
  input: CreateAdjustmentTaskRequest
) {
  CreateAdjustmentTaskRequestSchema.parse(input);
  return request(
    "创建调整下一课任务",
    apiRoutes.teacher.assignmentAdjustment(assignmentRef),
    AdjustmentTaskResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function loadAssignmentOverview() {
  return request(
    "作业工作概览",
    apiRoutes.teacher.assignmentOverview,
    TeacherAssignmentOverviewSchema
  );
}

export function loadTeacherTodos(
  query: Partial<TeacherTodoListQuery> = {}
) {
  const parsed = TeacherTodoListQuerySchema.parse(query);
  const search = new URLSearchParams({
    status: parsed.status,
    includeSnoozed: parsed.includeSnoozed
  });
  if (parsed.dueBefore) search.set("dueBefore", parsed.dueBefore);
  return request(
    "教师待办列表",
    `${apiRoutes.teacher.todos}?${search.toString()}`,
    TeacherTodoListSchema
  );
}

export function loadTeacherTodo(todoRef: string) {
  return request(
    "教师待办详情",
    apiRoutes.teacher.todo(todoRef),
    TeacherTodoViewSchema
  );
}

export function createTeacherTodo(input: CreateTeacherTodoRequest) {
  CreateTeacherTodoRequestSchema.parse(input);
  return request(
    "创建教师待办",
    apiRoutes.teacher.todos,
    TeacherTodoMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function updateTeacherTodo(
  todoRef: string,
  input: UpdateTeacherTodoRequest
) {
  UpdateTeacherTodoRequestSchema.parse(input);
  return request(
    "更新教师待办",
    apiRoutes.teacher.todo(todoRef),
    TeacherTodoMutationResultSchema,
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export function transitionTeacherTodo(
  todoRef: string,
  action: "complete" | "reopen" | "cancel",
  input: TeacherTodoActionRequest
) {
  TeacherTodoActionRequestSchema.parse(input);
  const path = action === "complete"
    ? apiRoutes.teacher.todoComplete(todoRef)
    : action === "reopen"
      ? apiRoutes.teacher.todoReopen(todoRef)
      : apiRoutes.teacher.todoCancel(todoRef);
  return request(
    "更新教师待办状态",
    path,
    TeacherTodoMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function updateTeacherTodoPreference(
  todoRef: string,
  input: TeacherTodoPreferenceRequest
) {
  TeacherTodoPreferenceRequestSchema.parse(input);
  return request(
    "更新待办提醒",
    apiRoutes.teacher.todoPreference(todoRef),
    TeacherTodoMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function linkTeacherTodoResource(
  todoRef: string,
  input: LinkTeacherTodoResourceRequest
) {
  LinkTeacherTodoResourceRequestSchema.parse(input);
  return request(
    "关联待办资源",
    apiRoutes.teacher.todoResources(todoRef),
    TeacherTodoMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function scheduleTeacherTodo(
  todoRef: string,
  input: ScheduleTodoRequest
) {
  ScheduleTodoRequestSchema.parse(input);
  return request(
    "将待办安排到日历",
    apiRoutes.teacher.todoSchedule(todoRef),
    ScheduleTodoResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function handoffTeacherTodoToAgent(
  todoRef: string,
  input: TodoAgentHandoffRequest
) {
  TodoAgentHandoffRequestSchema.parse(input);
  return request(
    "在 Agent 中处理待办",
    apiRoutes.teacher.todoAgentHandoff(todoRef),
    TodoAgentHandoffResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function loadTeacherCalendar(query: TeacherCalendarListQuery) {
  const parsed = TeacherCalendarListQuerySchema.parse(query);
  const search = new URLSearchParams({
    from: parsed.from,
    to: parsed.to,
    mode: parsed.mode,
    timezone: parsed.timezone
  });
  return request(
    "教师日历",
    `${apiRoutes.teacher.calendarEvents}?${search.toString()}`,
    TeacherCalendarListSchema
  );
}

export function createCalendarEvent(input: CreateCalendarEventRequest) {
  CreateCalendarEventRequestSchema.parse(input);
  return request(
    "创建日历事件",
    apiRoutes.teacher.calendarEvents,
    CalendarEventMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function updateCalendarEvent(
  eventRef: string,
  input: UpdateCalendarEventRequest
) {
  UpdateCalendarEventRequestSchema.parse(input);
  return request(
    "更新日历事件",
    apiRoutes.teacher.calendarEvent(eventRef),
    CalendarEventMutationResultSchema,
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export function transitionCalendarEvent(
  eventRef: string,
  action: "complete" | "cancel",
  input: CalendarEventActionRequest
) {
  CalendarEventActionRequestSchema.parse(input);
  return request(
    "更新日历事件状态",
    action === "complete"
      ? apiRoutes.teacher.calendarEventComplete(eventRef)
      : apiRoutes.teacher.calendarEventCancel(eventRef),
    CalendarEventMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function loadTeacherWorkbenchOverview(timezone = "Asia/Shanghai") {
  const search = new URLSearchParams({ timezone });
  return request(
    "教师统一工作台",
    `${apiRoutes.teacher.workbenchOverview}?${search.toString()}`,
    TeacherWorkbenchOverviewSchema
  );
}

export function loadTeacherWorkActionItems(includeDeferred = false) {
  const search = new URLSearchParams({
    includeDeferred: String(includeDeferred)
  });
  return request(
    "教师业务提醒",
    `${apiRoutes.teacher.workbenchActionItems}?${search.toString()}`,
    TeacherWorkProjectionListSchema
  );
}

export function updateWorkProjectionPreference(
  projectionRef: string,
  input: WorkProjectionPreferenceRequest
) {
  WorkProjectionPreferenceRequestSchema.parse(input);
  return request(
    "更新业务提醒偏好",
    apiRoutes.teacher.workbenchProjectionPreference(projectionRef),
    WorkProjectionPreferenceResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function loadLessonImplementationSummary(lessonRef: string) {
  return request(
    "课时实施与反思摘要",
    apiRoutes.teacher.lessonImplementationSummary(lessonRef),
    LessonImplementationSummarySchema
  );
}

export function createLessonDelivery(input: CreateLessonDeliveryRequest) {
  CreateLessonDeliveryRequestSchema.parse(input);
  return request(
    "创建课堂实施草稿",
    apiRoutes.teacher.lessonDeliveries,
    LessonDeliveryMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function loadLessonDelivery(deliveryRef: string) {
  return request(
    "课堂实施记录",
    apiRoutes.teacher.lessonDelivery(deliveryRef),
    LessonDeliveryDetailSchema
  );
}

export function updateLessonDeliveryDraft(
  deliveryRef: string,
  input: UpdateLessonDeliveryDraftRequest
) {
  UpdateLessonDeliveryDraftRequestSchema.parse(input);
  return request(
    "更新课堂实施草稿",
    apiRoutes.teacher.lessonDelivery(deliveryRef),
    LessonDeliveryMutationResultSchema,
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export function confirmLessonDelivery(
  deliveryRef: string,
  input: ConfirmLessonDeliveryRequest
) {
  ConfirmLessonDeliveryRequestSchema.parse(input);
  return request(
    "确认课堂实施事实",
    apiRoutes.teacher.lessonDeliveryConfirm(deliveryRef),
    LessonDeliveryMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function amendLessonDelivery(
  deliveryRef: string,
  input: AmendLessonDeliveryRequest
) {
  AmendLessonDeliveryRequestSchema.parse(input);
  return request(
    "修订课堂实施记录",
    apiRoutes.teacher.lessonDeliveryAmend(deliveryRef),
    LessonDeliveryMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function createClassroomObservation(
  input: CreateClassroomObservationRequest
) {
  CreateClassroomObservationRequestSchema.parse(input);
  return request(
    "创建课堂观察",
    apiRoutes.teacher.classroomObservations,
    ClassroomObservationMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function loadClassroomObservations(
  input: ClassroomObservationListQuery
) {
  ClassroomObservationListQuerySchema.parse(input);
  const search = new URLSearchParams({ lessonRef: input.lessonRef });
  if (input.objectiveRef) search.set("objectiveRef", input.objectiveRef);
  if (input.learnerRef) search.set("learnerRef", input.learnerRef);
  return request(
    "课堂观察列表",
    `${apiRoutes.teacher.classroomObservations}?${search.toString()}`,
    ClassroomObservationListSchema
  );
}

export function loadClassroomObservation(observationRef: string) {
  return request(
    "课堂观察详情",
    apiRoutes.teacher.classroomObservation(observationRef),
    ClassroomObservationDetailSchema
  );
}

export function updateClassroomObservationDraft(
  observationRef: string,
  input: UpdateClassroomObservationDraftRequest
) {
  UpdateClassroomObservationDraftRequestSchema.parse(input);
  return request(
    "更新课堂观察草稿",
    apiRoutes.teacher.classroomObservation(observationRef),
    ClassroomObservationMutationResultSchema,
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export function confirmClassroomObservation(
  observationRef: string,
  input: ConfirmClassroomObservationRequest
) {
  ConfirmClassroomObservationRequestSchema.parse(input);
  return request(
    "确认课堂观察",
    apiRoutes.teacher.classroomObservationConfirm(observationRef),
    ClassroomObservationMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function supersedeClassroomObservation(
  observationRef: string,
  input: SupersedeClassroomObservationRequest
) {
  SupersedeClassroomObservationRequestSchema.parse(input);
  return request(
    "修订课堂观察",
    apiRoutes.teacher.classroomObservationSupersede(observationRef),
    ClassroomObservationMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function createReflectionDraft(input: CreateReflectionDraftRequest) {
  CreateReflectionDraftRequestSchema.parse(input);
  return request(
    "创建课后反思草稿",
    apiRoutes.teacher.reflections,
    ReflectionMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function loadReflection(reflectionRef: string) {
  return request(
    "课后反思",
    apiRoutes.teacher.reflection(reflectionRef),
    ReflectionDetailSchema
  );
}

export function updateReflectionDraft(
  reflectionRef: string,
  input: UpdateReflectionDraftRequest
) {
  UpdateReflectionDraftRequestSchema.parse(input);
  return request(
    "更新课后反思草稿",
    apiRoutes.teacher.reflection(reflectionRef),
    ReflectionMutationResultSchema,
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export function generateReflection(
  reflectionRef: string,
  input: GenerateReflectionRequest
) {
  GenerateReflectionRequestSchema.parse(input);
  return request(
    "生成课后反思草稿",
    apiRoutes.teacher.reflectionGenerate(reflectionRef),
    ReflectionGenerationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function confirmReflection(
  reflectionRef: string,
  input: ConfirmReflectionRequest
) {
  ConfirmReflectionRequestSchema.parse(input);
  return request(
    "确认课后反思",
    apiRoutes.teacher.reflectionConfirm(reflectionRef),
    ReflectionMutationResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function createReflectionFollowUp(
  reflectionRef: string,
  input: CreateReflectionFollowUpRequest
) {
  CreateReflectionFollowUpRequestSchema.parse(input);
  return request(
    "创建反思后续行动",
    apiRoutes.teacher.reflectionFollowUps(reflectionRef),
    ReflectionFollowUpResultSchema,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function loadPendingReflections() {
  return request(
    "待完成课后反思",
    apiRoutes.teacher.pendingReflections,
    PendingReflectionQueueSchema
  );
}

import {
  apiRoutes,
  ApproveTeachingPlanRequestSchema,
  ApproveTeachingPlanResultSchema,
  ApiHealthSchema,
  AuthorizedContextPlanSchema,
  CancelModelInvocationRequestSchema,
  CourseRunListSchema,
  CreateLessonPreparationTaskRequestSchema,
  CreateModelInvocationRequestSchema,
  CreateModelInvocationResultSchema,
  CurriculumUnitListSchema,
  CreateTeacherCopilotTaskRequestSchema,
  CreateTeacherCopilotTaskResultSchema,
  LessonListSchema,
  LessonPreparationSummarySchema,
  LessonPreparationTaskActionRequestSchema,
  LessonPreparationTaskDetailSchema,
  LessonPreparationTaskListSchema,
  LessonPreparationTaskResultSchema,
  LessonTeachingPlanStateSchema,
  ModelExecutionViewSchema,
  ModelUsageSummarySchema,
  PendingProposalListSchema,
  ProposalReviewDetailSchema,
  RunExplanationSchema,
  ProviderAvailabilitySchema,
  ProviderCapabilitiesSchema,
  RetryModelInvocationRequestSchema,
  SuggestionDispositionRequestSchema,
  SuggestionDispositionResultSchema,
  TaskResourceSelectionRequestSchema,
  TaskWorkingSetResultSchema,
  TeacherWorkspaceSchema,
  TeachingPlanRevisionViewSchema,
  type ApiHealth,
  type AuthorizedContextPlan,
  type ApproveTeachingPlanRequest,
  type ApproveTeachingPlanResult,
  type CancelModelInvocationRequest,
  type CreateModelInvocationRequest,
  type CreateModelInvocationResult,
  type CreateTeacherCopilotTaskRequest,
  type CreateTeacherCopilotTaskResult,
  type CreateLessonPreparationTaskRequest,
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
  type TaskResourceSelectionRequest,
  type TaskWorkingSet,
  type TeacherWorkspace
} from "@edu-agent/contracts";

import {
  ApiConfigurationError,
  resolveApiUrl
} from "./api-url";

const demoHeaders = {
  "content-type": "application/json",
  "x-demo-tenant": "tenant:demo-school",
  "x-demo-actor": "user:teacher-001"
};

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
      headers: {
        ...demoHeaders,
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

export function checkApiHealth(): Promise<ApiHealth> {
  return request("API 健康检查", apiRoutes.health, ApiHealthSchema);
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

import {
  apiRoutes,
  ApiHealthSchema,
  CreateTeacherCopilotTaskResultSchema,
  RunExplanationSchema,
  SuggestionDispositionResultSchema,
  TeacherWorkspaceSchema,
  TeachingPlanRevisionViewSchema,
  type ApiHealth,
  type CreateTeacherCopilotTaskRequest,
  type CreateTeacherCopilotTaskResult,
  type RunExplanation,
  type SuggestionDispositionRequest,
  type SuggestionDispositionResult,
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
    readonly requestUrl: string
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
    };
    throw new ApiError(
      response.status,
      payload.code ?? "UNKNOWN_API_ERROR",
      payload.message ?? `请求失败（HTTP ${response.status}）`,
      service,
      requestUrl
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

export function createTeacherCopilotTask(
  input: CreateTeacherCopilotTaskRequest
): Promise<CreateTeacherCopilotTaskResult> {
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

export function disposeSuggestion(
  proposalRevisionRef: string,
  input: SuggestionDispositionRequest
): Promise<SuggestionDispositionResult> {
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
): Promise<TeacherWorkspace["latestTeachingPlan"]> {
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

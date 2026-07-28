import type {
  CreateTeacherCopilotTaskRequest,
  CreateTeacherCopilotTaskResult,
  RunExplanation,
  SuggestionDispositionRequest,
  SuggestionDispositionResult,
  TeacherWorkspace
} from "@edu-agent/contracts";

const demoHeaders = {
  "content-type": "application/json",
  "x-demo-tenant": "tenant:demo-school",
  "x-demo-actor": "user:teacher-001"
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...demoHeaders,
      ...init?.headers
    }
  });
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
      payload.message ?? `请求失败（HTTP ${response.status}）`
    );
  }
  return (await response.json()) as T;
}

export function loadWorkspace(): Promise<TeacherWorkspace> {
  return request("/api/v1/demo/workspace");
}

export function createTeacherCopilotTask(
  input: CreateTeacherCopilotTaskRequest
): Promise<CreateTeacherCopilotTaskResult> {
  return request("/api/v1/demo/teacher-copilot/tasks", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function disposeSuggestion(
  proposalRevisionRef: string,
  input: SuggestionDispositionRequest
): Promise<SuggestionDispositionResult> {
  return request(
    `/api/v1/demo/suggestions/${encodeURIComponent(
      proposalRevisionRef
    )}/dispositions`,
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
    `/api/v1/demo/runs/${encodeURIComponent(taskRef)}`
  );
}

export function loadTeachingPlanRevision(
  revisionRef: string
): Promise<TeacherWorkspace["latestTeachingPlan"]> {
  return request(
    `/api/v1/demo/teaching-plan/revisions/${encodeURIComponent(
      revisionRef
    )}`
  );
}

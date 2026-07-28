import { z } from "zod";

const encodeRouteSegment = (value: string): string =>
  encodeURIComponent(value);

export const apiRoutes = {
  health: "/api/health",
  demo: {
    bootstrap: "/api/v1/demo/workspace",
    createTeacherCopilotTask:
      "/api/v1/demo/teacher-copilot/tasks",
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
      )}`
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
  path: z.string().min(1).optional()
});

export type ApiHealth = z.infer<typeof ApiHealthSchema>;
export type ApiErrorResponse = z.infer<
  typeof ApiErrorResponseSchema
>;

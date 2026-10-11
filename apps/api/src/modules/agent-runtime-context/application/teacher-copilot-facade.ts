import type {
  ApproveTeachingPlanRequest,
  ApproveTeachingPlanResult,
  CreateTeacherCopilotTaskRequest,
  CreateTeacherCopilotTaskResult,
  SuggestionDispositionRequest,
  SuggestionDispositionResult
} from "@edu-agent/contracts";

/**
 * Stable application boundary for the teacher-controlled Agent workflow.
 *
 * The implementation orchestrates several state owners, but callers never
 * receive repositories, database clients, or provider SDK objects.
 */
export interface TeacherCopilotApplicationFacade {
  createTask(input: {
    tenantRef: string;
    actorRef: string;
    request: CreateTeacherCopilotTaskRequest;
  }): Promise<CreateTeacherCopilotTaskResult>;

  disposition(input: {
    tenantRef: string;
    actorRef: string;
    proposalRevisionRef: string;
    request: SuggestionDispositionRequest;
  }): Promise<SuggestionDispositionResult>;

  approveTeachingPlan(input: {
    tenantRef: string;
    actorRef: string;
    allowedCourseRunRefs: readonly string[];
    inReviewRevisionRef: string;
    request: ApproveTeachingPlanRequest;
  }): Promise<ApproveTeachingPlanResult>;
}

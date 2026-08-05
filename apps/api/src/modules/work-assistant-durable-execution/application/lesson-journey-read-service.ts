import type {
  FileAssetSummary,
  LessonImplementationSummary,
  LessonBriefSnapshot,
  LessonJourneyProjection,
  LessonPreparationTaskSummary,
  LessonTeachingPlanState,
  LessonView,
  PendingProposalList
} from "@edu-agent/contracts";

import {
  projectLessonJourney,
  type LessonJourneyAgentExecution
} from "./lesson-journey-projection.js";

type SuggestionSummary = PendingProposalList["items"][number];

export interface LessonJourneyReadContext {
  readonly tenantRef: string;
  readonly actorRef: string;
  readonly allowedCourseRunRefs: readonly string[];
  readonly lessonRef: string;
}

export interface LessonJourneySourceSnapshot {
  readonly lesson: LessonView;
  readonly tasks: readonly LessonPreparationTaskSummary[];
  readonly teachingPlans: LessonTeachingPlanState;
  readonly files: readonly FileAssetSummary[];
  readonly implementation: LessonImplementationSummary;
  readonly pendingProposals: readonly SuggestionSummary[];
  readonly agentExecution: LessonJourneyAgentExecution | null;
  readonly lessonBrief: LessonBriefSnapshot | null;
}

export interface LessonJourneySourceReader {
  loadAuthorizedSnapshot(
    context: LessonJourneyReadContext
  ): Promise<LessonJourneySourceSnapshot>;
}

export class LessonJourneyReadService {
  constructor(private readonly sources: LessonJourneySourceReader) {}

  async get(
    context: LessonJourneyReadContext
  ): Promise<LessonJourneyProjection> {
    return projectLessonJourney({
      ...(await this.sources.loadAuthorizedSnapshot(context)),
      generatedAt: new Date().toISOString()
    });
  }
}

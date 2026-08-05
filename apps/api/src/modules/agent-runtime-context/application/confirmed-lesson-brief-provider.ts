import type { LessonBriefSnapshot } from "@edu-agent/contracts";

export interface ConfirmedLessonBriefContextProvider {
  loadAdopted(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly lessonRef: string;
    readonly briefRef: string;
  }): Promise<LessonBriefSnapshot | null>;
}


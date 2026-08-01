import {
  AssignmentAnalyticsSchema,
  CreateAdjustmentTaskRequestSchema,
  SubmissionSummarySchema
} from "@edu-agent/contracts";
import { describe, expect, it } from "vitest";

describe("Gate 2.7 contracts", () => {
  it("represents missing submission without fabricating a zero score", () => {
    const result = SubmissionSummarySchema.parse({
      submissionRef: null,
      assignmentRef: "assignment:demo",
      learnerRef: "learner:anonymous-01",
      displayName: "匿名学习者 01",
      submissionState: "not_submitted",
      latestAttemptRef: null,
      attemptCount: 0,
      submittedAt: null,
      gradeDecisionRef: null,
      gradeStatus: null,
      score: null,
      maxScore: null
    });
    expect(result.score).toBeNull();
    expect(result.submissionRef).toBeNull();
  });

  it("requires explicit selected Evidence and item refs for teaching adjustment", () => {
    expect(() =>
      CreateAdjustmentTaskRequestSchema.parse({
        assignmentRef: "assignment:demo",
        sourceLessonRef: "lesson:source",
        targetLessonRef: "lesson:next",
        selectedEvidenceRefs: [],
        selectedItemRefs: [],
        dueAt: null,
        priority: "normal",
        purpose: "assignment.adjust-next-lesson",
        idempotencyKey: "gate27:test"
      })
    ).toThrow();
  });

  it("rejects analytics with an impossible score rate", () => {
    expect(() =>
      AssignmentAnalyticsSchema.parse({
        assignmentRef: "assignment:demo",
        enrolledCount: 12,
        submittedCount: 1,
        notSubmittedCount: 11,
        confirmedGradeCount: 1,
        averageScore: 8,
        medianScore: 8,
        maxScore: 15,
        itemPerformance: [],
        objectivePerformance: [
          {
            objectiveRef: "objective:demo",
            objectiveTitle: "目标",
            confirmedResponseCount: 1,
            averageScoreRate: 1.2,
            evidenceRefs: []
          }
        ],
        commonErrors: [],
        generatedAt: new Date().toISOString()
      })
    ).toThrow();
  });
});

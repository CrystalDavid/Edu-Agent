import type {
  FileAssetSummary,
  LessonImplementationSummary,
  LessonPreparationTaskSummary,
  LessonTeachingPlanState,
  LessonView,
  PendingProposalList
} from "@edu-agent/contracts";
import { describe, expect, it } from "vitest";

import {
  projectLessonJourney,
  type LessonJourneyProjectionInput
} from "../../apps/api/src/modules/work-assistant-durable-execution/application/lesson-journey-projection.js";

const now = "2026-08-05T08:00:00.000Z";

describe("LessonJourneyProjection", () => {
  it("starts at understand.ready when no preparation Task exists", () => {
    const projection = projectLessonJourney(input());

    expect(projection).toMatchObject({
      currentStage: "understand",
      status: "ready",
      nextBestAction: { kind: "start_preparation" }
    });
    expect(projection.completedMilestones).toEqual(["lesson_context_ready"]);
  });

  it("waits for teacher review when a Proposal is ready", () => {
    const projection = projectLessonJourney(input({
      tasks: [task("in_progress")],
      pendingProposals: [proposal()]
    }));

    expect(projection).toMatchObject({
      currentStage: "plan",
      status: "waiting_for_teacher",
      nextBestAction: { kind: "review_proposal" }
    });
  });

  it("never treats an approved TeachingPlan as delivered", () => {
    const projection = projectLessonJourney(input({
      tasks: [task("ready_for_use")],
      teachingPlans: plans({ approved: true }),
      files: [file()]
    }));

    expect(projection).toMatchObject({
      currentStage: "deliver",
      status: "ready",
      nextBestAction: { kind: "record_delivery" }
    });
    expect(projection.completedMilestones).toContain("teaching_plan_approved");
    expect(projection.completedMilestones).not.toContain("delivery_confirmed");
    expect(projection.status).not.toBe("completed");
  });

  it("does not complete the journey when Reflection has no teacher-selected follow-up", () => {
    const projection = projectLessonJourney(input({
      tasks: [task("completed")],
      teachingPlans: plans({ approved: true }),
      files: [file()],
      implementation: implementation({
        confirmedDelivery: true,
        confirmedReflection: true,
        followUp: false
      })
    }));

    expect(projection).toMatchObject({
      currentStage: "improve",
      status: "waiting_for_teacher",
      nextBestAction: { kind: "choose_follow_up" }
    });
    expect(projection.completedMilestones).toContain("reflection_confirmed");
    expect(projection.completedMilestones).not.toContain("follow_up_created");
  });

  it("completes only after a confirmed Reflection has a follow-up source", () => {
    const projection = projectLessonJourney(input({
      tasks: [task("completed")],
      teachingPlans: plans({ approved: true }),
      files: [file()],
      implementation: implementation({
        confirmedDelivery: true,
        confirmedReflection: true,
        followUp: true
      })
    }));

    expect(projection).toMatchObject({
      currentStage: "improve",
      status: "completed",
      nextBestAction: { kind: "view_completed_journey" }
    });
  });

  it("returns refs and versions without copying Evidence payloads", () => {
    const projection = projectLessonJourney(input());

    expect(projection.sourceRefs).toEqual([
      expect.objectContaining({ kind: "lesson", ref: "lesson:1" })
    ]);
    expect(JSON.stringify(projection)).not.toContain("evidence:foreign-school");
    expect(JSON.stringify(projection)).not.toContain("currentEvidenceRefs");
  });
});

function input(
  overrides: Partial<LessonJourneyProjectionInput> = {}
): LessonJourneyProjectionInput {
  return {
    lesson: lesson(),
    tasks: [],
    teachingPlans: plans(),
    files: [],
    implementation: implementation(),
    pendingProposals: [],
    agentExecution: null,
    generatedAt: now,
    ...overrides
  };
}

function lesson(): LessonView {
  return {
    lessonRef: "lesson:1",
    unitRef: "unit:1",
    courseRunRef: "course-run:1",
    sequence: 1,
    title: "一次函数",
    plannedAt: now,
    durationMinutes: 45,
    preparationState: "not_started",
    learningObjectives: [{
      objectiveRef: "objective:1",
      title: "理解斜率",
      description: "能够解释斜率变化"
    }],
    currentEvidenceRefs: ["evidence:foreign-school"],
    currentApprovedPlanRef: null,
    activePreparationTaskRef: null
  };
}

function task(
  status: LessonPreparationTaskSummary["status"]
): LessonPreparationTaskSummary {
  return {
    taskRef: "task:1",
    taskType: "lesson_preparation",
    title: "准备一次函数",
    status,
    version: 2,
    courseRunRef: "course-run:1",
    curriculumUnitRef: "unit:1",
    lessonRef: "lesson:1",
    lessonTitle: "一次函数",
    dueAt: now,
    priority: "normal",
    approvedPlanRef: status === "ready_for_use" || status === "completed"
      ? "plan-revision:1"
      : null,
    createdBy: "teacher:1",
    createdAt: now,
    updatedAt: now
  };
}

function plans(options: { approved?: boolean } = {}): LessonTeachingPlanState {
  const approved = options.approved
    ? ({
        revisionRef: "plan-revision:1",
        revisionNumber: 3,
        state: "approved"
      } as LessonTeachingPlanState["currentApproved"])
    : null;
  return {
    lessonRef: "lesson:1",
    preparationTaskRef: approved ? "task:1" : null,
    currentApproved: approved,
    activeInReview: null,
    drafts: [],
    superseded: [],
    history: approved ? [approved] : []
  };
}

function proposal(): PendingProposalList["items"][number] {
  return {
    proposalRevisionRef: "proposal-revision:1",
    preparationTaskRef: "task:1",
    lessonRef: "lesson:1",
    status: "pending",
    createdAt: now
  } as PendingProposalList["items"][number];
}

function file(): FileAssetSummary {
  return {
    assetRef: "file:1",
    displayName: "一次函数教案.docx",
    category: "lesson_plan",
    source: "teaching_plan_export",
    status: "active",
    version: 2,
    currentVersion: {
      versionRef: "file-version:1",
      assetRef: "file:1",
      versionNumber: 2,
      originalFileName: "plan.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: ".docx",
      previewKind: "office",
      sizeBytes: 1024,
      sha256: "a".repeat(64),
      contentSummary: "一次函数教案",
      createdBy: "teacher:1",
      createdAt: now
    },
    bindingCount: 1,
    deletionProtected: true,
    createdBy: "teacher:1",
    createdAt: now,
    updatedAt: now
  };
}

function implementation(options: {
  confirmedDelivery?: boolean;
  confirmedReflection?: boolean;
  followUp?: boolean;
} = {}): LessonImplementationSummary {
  const delivery = options.confirmedDelivery
    ? ({
        deliveryRef: "delivery:1",
        aggregateVersion: 1,
        currentDraft: null,
        currentConfirmed: {
          deliveryRevisionRef: "delivery-revision:1",
          revisionNumber: 1,
          revisionVersion: 1
        },
        history: []
      } as unknown as NonNullable<LessonImplementationSummary["delivery"]>)
    : null;
  const reflection = options.confirmedReflection
    ? ({
        reflectionRef: "reflection:1",
        reflectionTaskRef: "reflection-task:1",
        generationStatus: "confirmed",
        currentModelExecutionRef: null,
        currentDraft: null,
        currentConfirmed: {
          reflectionRevisionRef: "reflection-revision:1",
          reflectionRef: "reflection:1",
          revisionNumber: 1,
          status: "confirmed"
        },
        history: [],
        followUps: options.followUp
          ? [{
              followUpRef: "follow-up:1",
              actionType: "teacher_todo",
              targetRef: "todo:1",
              targetStatus: "active",
              deepLink: "/schedule",
              createdAt: now
            }]
          : []
      } as unknown as NonNullable<LessonImplementationSummary["reflection"]>)
    : null;
  return {
    lessonRef: "lesson:1",
    delivery,
    currentDelivery: delivery?.currentConfirmed ?? null,
    observedMoves: [],
    instructionalDecisions: [],
    observations: [],
    reflection,
    implementationPending: false,
    reflectionPending: false
  };
}

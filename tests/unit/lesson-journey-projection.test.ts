import type {
  LessonBriefSnapshot,
  LessonImplementationSummary,
  LessonPreparationTaskSummary,
  LessonTeachingPlanState,
  LessonView,
  MaterialBundleProjection,
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
      nextBestAction: { kind: "generate_lesson_brief" }
    });
    expect(projection.completedMilestones).toEqual(["lesson_context_ready"]);
  });

  it("waits for teacher judgment after a Lesson Brief candidate is generated", () => {
    const projection = projectLessonJourney(input({
      lessonBrief: brief("waiting_for_teacher")
    }));

    expect(projection).toMatchObject({
      currentStage: "understand",
      status: "waiting_for_teacher",
      nextBestAction: { kind: "review_lesson_brief" }
    });
    expect(projection.completedMilestones).not.toContain("lesson_brief_adopted");
  });

  it("offers a Brief before materials even when an approved plan already exists", () => {
    const projection = projectLessonJourney(input({
      teachingPlans: plans({ approved: true })
    }));

    expect(projection).toMatchObject({
      currentStage: "understand",
      status: "ready",
      nextBestAction: { kind: "generate_lesson_brief" }
    });
    expect(projection.completedMilestones).toContain("teaching_plan_approved");
  });

  it("continues the formal workflow after the teacher defers a Brief", () => {
    const projection = projectLessonJourney(input({
      lessonBrief: brief("deferred"),
      teachingPlans: plans({ approved: true })
    }));

    expect(projection).toMatchObject({
      currentStage: "materials",
      status: "ready",
      nextBestAction: { kind: "prepare_materials" }
    });
  });

  it("uses an adopted Brief as a milestone without turning it into Lesson truth", () => {
    const projection = projectLessonJourney(input({
      lessonBrief: brief("adopted"),
      tasks: [task("planned")]
    }));

    expect(projection).toMatchObject({
      currentStage: "plan",
      status: "ready",
      nextBestAction: { kind: "generate_teaching_plan" }
    });
    expect(projection.completedMilestones).toContain("lesson_brief_adopted");
    expect(projection.sourceRefs).toContainEqual(expect.objectContaining({
      kind: "lesson_brief_run",
      ref: "agent-run:brief-1"
    }));
  });

  it("offers a new Proposal when an adopted Brief starts a revision of an approved plan", () => {
    const projection = projectLessonJourney(input({
      lessonBrief: brief("adopted"),
      tasks: [task("in_progress")],
      teachingPlans: plans({ approved: true })
    }));

    expect(projection).toMatchObject({
      currentStage: "plan",
      status: "in_progress",
      nextBestAction: { kind: "generate_teaching_plan" }
    });
    expect(projection.completedMilestones).toContain("teaching_plan_approved");
    expect(projection.completedMilestones).toContain("lesson_brief_adopted");
    expect(projection.completedMilestones).not.toContain("delivery_confirmed");
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
      materialBundle: bundle("ready")
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
      materialBundle: bundle("ready"),
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
      materialBundle: bundle("ready"),
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
    materialBundle: bundle("blocked_no_approved_plan"),
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

function brief(status: LessonBriefSnapshot["status"]): LessonBriefSnapshot {
  return {
    lessonRef: "lesson:1",
    sourceRefs: [{
      kind: "lesson",
      ref: "lesson:1",
      version: "1",
      contentHash: "a".repeat(64),
      provenance: "education.lesson",
      included: true
    }],
    sourceVersionVector: { "lesson:lesson:1": "1" },
    objectiveSummaries: [],
    teachingFocusCandidates: [],
    difficultyCandidates: [],
    classEvidenceSummary: [],
    suggestedAttentionPoints: [],
    knownGaps: ["尚未接入教材知识源"],
    generatedBySkillRef: "lesson-analysis@1",
    agentRunRef: "agent-run:brief-1",
    contextManifestRef: "context-manifest:brief-1",
    contextManifestHash: "b".repeat(64),
    contentHash: "c".repeat(64),
    teacherAdjustment: null,
    disposition: status === "waiting_for_teacher" ? null : {
      action: status,
      selectedCandidateIds: [],
      teacherRef: "teacher:1",
      taskRef: status === "adopted" ? "task:1" : null,
      decidedAt: now
    },
    status,
    generatedAt: now
  };
}

function bundle(
  status: MaterialBundleProjection["status"]
): MaterialBundleProjection {
  return {
    lessonRef: "lesson:1",
    approvedTeachingPlanRevisionRef:
      status === "blocked_no_approved_plan" ? null : "plan-revision:1",
    approvedTeachingPlanRevisionNumber:
      status === "blocked_no_approved_plan" ? null : 3,
    status,
    items: ([
      "lesson_plan",
      "slide_outline",
      "exercise_set",
      "board_design",
      "differentiated_support"
    ] as const).map((kind, index) => ({
      kind,
      label: kind,
      status: status === "ready" ? "adopted" as const : "missing" as const,
      assetRef: status === "ready" ? `file:${index + 1}` : null,
      assetVersion: status === "ready" ? 2 : null,
      versionRef: status === "ready" ? `file-version:${index + 1}` : null,
      versionNumber: status === "ready" ? 2 : null,
      originalFileName: status === "ready" ? `${kind}.md` : null,
      mimeType: status === "ready" ? "text/markdown" : null,
      previewKind: status === "ready" ? "text" as const : null,
      sourceTeachingPlanRevisionRef:
        status === "ready" ? "plan-revision:1" : null,
      generatedBySkillRef:
        status === "ready" ? "material-generation@1" : null,
      agentRunRef: status === "ready" ? "agent-run:material" : null,
      contextManifestHash: status === "ready" ? "d".repeat(64) : null,
      contentHash: status === "ready" ? "e".repeat(64) : null,
      updatedAt: status === "ready" ? now : null
    })),
    sourceVersionVector: {},
    generatedAt: now
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

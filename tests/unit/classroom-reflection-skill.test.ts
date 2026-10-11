import { describe, expect, it, vi } from "vitest";

import {
  classroomReflectionSkillV1,
  type ClassroomReflectionSkillInput
} from "../../apps/api/src/agent/skills/classroom-reflection/index.js";
import {
  ClassroomFeedbackService,
  type ClassroomFeedbackDeliveryPort,
  type ClassroomFeedbackRunStore,
  type ClassroomFeedbackSourceReader
} from "../../apps/api/src/modules/agent-runtime-context/application/classroom-feedback-service.js";
import { VersionedSkillRegistry } from "../../apps/api/src/agent/skills/index.js";

describe("classroom-reflection@1", () => {
  it("is a published, human-controlled Draft skill", () => {
    expect(classroomReflectionSkillV1.manifest).toMatchObject({
      ref: "classroom-reflection@1",
      status: "published",
      purpose: "classroom_reflection",
      approvalPolicy: {
        outputKind: "draft",
        humanApprovalRequired: true
      },
      toolPolicy: { mode: "disabled", allowedTools: [] }
    });
  });

  it("turns quick feedback into a five-step Delivery Draft and candidates", () => {
    const context = classroomReflectionSkillV1.buildContext(classroomInput());
    const output = classroomReflectionSkillV1.generate(context.input);
    const validation = classroomReflectionSkillV1.validate({
      output,
      sources: context.manifest.sourceRefs,
      expectedTeachingPlanRevisionRef:
        context.input.approvedTeachingPlan.revisionRef
    });
    const evaluation = classroomReflectionSkillV1.evaluate({
      context,
      validation
    });

    expect(output.schemaVersion).toBe("classroom-delivery-draft@1");
    expect(output.deliveryDraft.steps.map((step) => step.stepKey)).toEqual([
      "opening",
      "explanation",
      "activity",
      "practice",
      "summary"
    ]);
    expect(output.deliveryDraft.steps.find((step) =>
      step.stepKey === "practice"
    )?.disposition).toBe("adjusted");
    expect(output.observationCandidates.length).toBeGreaterThan(0);
    expect(output.observationCandidates.every((candidate) =>
      candidate.status === "candidate" &&
      candidate.teacherConfirmationRequired
    )).toBe(true);
    expect(validation.valid).toBe(true);
    expect(evaluation.passed).toBe(true);
  });

  it("excludes unauthorized Evidence from the ContextManifest and output", () => {
    const input = classroomInput();
    input.evidence.push({
      evidenceRef: "evidence:school-b",
      evidenceType: "claim",
      summary: "This belongs to another school.",
      status: "confirmed",
      sourceRefs: ["lesson:school-b"],
      source: source("evidence:school-b", "1", "foreign_workspace")
    });

    const context = classroomReflectionSkillV1.buildContext(input);
    const output = classroomReflectionSkillV1.generate(context.input);

    expect(context.input.evidence.map((item) => item.evidenceRef)).toEqual([
      "evidence:authorized"
    ]);
    expect(context.manifest.sourceRefs).toContainEqual(expect.objectContaining({
      ref: "evidence:school-b",
      included: false,
      provenance: "excluded_by_authorization_or_lesson_scope"
    }));
    expect(JSON.stringify(output)).not.toContain("evidence:school-b");
  });

  it("does not write a Delivery Draft when generation or validation fails", async () => {
    const {
      teacherFeedback: _teacherFeedback,
      generatedAt: _generatedAt,
      ...sourceSnapshot
    } = classroomInput();
    const sourceReader: ClassroomFeedbackSourceReader = {
      load: vi.fn().mockResolvedValue(sourceSnapshot)
    };
    const runStore: ClassroomFeedbackRunStore = {
      saveClassroomFeedback: vi.fn(),
      findLatestClassroomFeedback: vi.fn()
    };
    const deliveryPort: ClassroomFeedbackDeliveryPort = {
      createDraft: vi.fn()
    };
    const brokenRegistry = new VersionedSkillRegistry();
    brokenRegistry.register({
      ...classroomReflectionSkillV1,
      generate: () => {
        throw new Error("simulated generation failure");
      }
    });
    const service = new ClassroomFeedbackService(
      sourceReader,
      runStore,
      deliveryPort,
      brokenRegistry,
      () => new Date("2026-08-06T08:00:00.000Z")
    );

    await expect(service.generate({
      context: {
        tenantRef: "tenant:school-a",
        actorRef: "teacher:lin",
        lessonRef: "lesson:linear-function"
      },
      request: requestPayload()
    })).rejects.toThrow("simulated generation failure");
    expect(runStore.saveClassroomFeedback).not.toHaveBeenCalled();
    expect(deliveryPort.createDraft).not.toHaveBeenCalled();
  });
});

function classroomInput(): ClassroomReflectionSkillInput {
  return {
    tenantRef: "tenant:school-a",
    actorRef: "teacher:lin",
    lesson: {
      lessonRef: "lesson:linear-function",
      courseRunRef: "course-run:math-8-3",
      unitRef: "unit:linear-function",
      title: "Linear functions",
      plannedAt: "2026-08-06T00:30:00.000Z",
      durationMinutes: 45,
      learningObjectiveRefs: ["objective:linear-function"],
      source: source("lesson:linear-function", "3", "education.lesson")
    },
    approvedTeachingPlan: {
      artifactRef: "teaching-plan:linear-function",
      revisionRef: "teaching-plan-revision:approved-3",
      revisionNumber: 3,
      title: "Linear functions plan",
      content: {
        objective: "Explain a linear relationship.",
        lessonFocus: "Connect slope with a graph.",
        openingActivity: "Compare two familiar graphs.",
        teacherQuestions: ["What changes?", "How can we verify it?"],
        studentActivity: "Discuss the graphs in pairs.",
        supportStrategy: "Provide a comparison table.",
        independentCheck: "Complete one graph interpretation.",
        followUp: "Review the exit response.",
        evidenceRefs: ["evidence:authorized"]
      },
      source: source(
        "teaching-plan-revision:approved-3",
        "3:approved",
        "artifact.teaching_plan_revision"
      )
    },
    teacherFeedback: {
      overall: "adjusted",
      pace: "slower",
      studentResponse: "partial_difficulty",
      abnormalSections: ["practice"],
      note: "The independent check needed more scaffolding."
    },
    evidence: [{
      evidenceRef: "evidence:authorized",
      evidenceType: "observation",
      summary: "Some learners confused slope and intercept.",
      status: "confirmed",
      sourceRefs: ["lesson:linear-function"],
      source: source(
        "evidence:authorized",
        "2:confirmed",
        "education.evidence"
      )
    }],
    observationDrafts: [],
    confirmedPreferences: [{
      preferenceRef: "preference:concise",
      preferenceKey: "reflection_style",
      preferenceValue: "Prefer concise summaries.",
      version: 1,
      source: source(
        "preference:concise",
        "1:active",
        "personalization.teacher_preference"
      )
    }],
    authorizedEvidenceRefs: ["evidence:authorized"],
    excludedEvidenceRefs: [],
    generatedAt: "2026-08-06T08:00:00.000Z"
  };
}

function requestPayload() {
  return {
    courseRunRef: "course-run:math-8-3",
    lessonRef: "lesson:linear-function",
    expectedApprovedTeachingPlanRevisionRef:
      "teaching-plan-revision:approved-3",
    overall: "adjusted",
    pace: "slower",
    studentResponse: "partial_difficulty",
    abnormalSections: ["practice"],
    note: "The independent check needed more scaffolding.",
    purpose: "lesson-delivery.quick-feedback.generate",
    idempotencyKey: "unit:classroom-feedback:1"
  };
}

function source(ref: string, version: string, provenance: string) {
  return {
    ref,
    version,
    contentHash: "a".repeat(64),
    provenance
  };
}

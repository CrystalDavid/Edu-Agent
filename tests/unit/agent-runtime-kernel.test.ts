import { describe, expect, it } from "vitest";

import {
  RuntimeKernelTransitionError,
  assertCheckpointIntegrity,
  compatibilityAgentRunStatus,
  createLessonPreparationCheckpoint,
  createRuntimeCheckpoint,
  parseRuntimeCheckpoint,
  transitionRuntimeCheckpoint,
  type AgentDefinition
} from "../../apps/api/src/modules/agent-runtime-context/domain/runtime-kernel.js";

const createdAt = "2026-08-04T01:00:00.000Z";

function lessonCheckpoint() {
  return createLessonPreparationCheckpoint({
    agentRunRef: "agent-run:phase4",
    taskRef: "task:lesson-preparation",
    tenantRef: "tenant:school-a",
    actorRef: "user:teacher-a",
    purpose: "teacher-copilot.lesson-preparation",
    contextPlanRef: "authorized-context-plan:1",
    contextPlanHash: "context-plan-hash",
    contextManifestRef: "context-manifest:1",
    contextManifestHash: "context-manifest-hash",
    tokenBudget: 8_000,
    promptBundleRef: "lesson-preparation@1",
    requestHash: "request-hash",
    skill: {
      skillId: "lesson-preparation",
      skillVersion: "1",
      skillRef: "lesson-preparation@1",
      contentHash: "skill-content-hash",
      purpose: "lesson_preparation"
    },
    createdAt
  });
}

describe("Agent Runtime Kernel", () => {
  it("creates an immutable, versioned Lesson Preparation run", () => {
    const checkpoint = lessonCheckpoint();

    expect(checkpoint.status).toBe("queued");
    expect(checkpoint.agentDefinitionId).toBe(
      "lesson-preparation-agent"
    );
    expect(checkpoint.skillId).toBe("lesson-preparation");
    expect(checkpoint.skillVersion).toBe("1");
    expect(checkpoint.skillRef).toBe("lesson-preparation@1");
    expect(checkpoint.skillContentHash).toBe("skill-content-hash");
    expect(checkpoint.steps.map((step) => step.kind)).toEqual([
      "retrieve",
      "plan",
      "invoke_model",
      "validate",
      "create_proposal"
    ]);
    expect(checkpoint.steps.slice(0, 2).map((step) => step.status)).toEqual([
      "succeeded",
      "succeeded"
    ]);
    expect(Object.isFrozen(checkpoint)).toBe(true);
    expect(Object.isFrozen(checkpoint.steps)).toBe(true);
    expect(() => assertCheckpointIntegrity(checkpoint)).not.toThrow();
  });

  it("runs model, validation and Proposal creation then waits for the teacher", () => {
    const initial = lessonCheckpoint();
    const running = transitionRuntimeCheckpoint(initial, {
      type: "model_started",
      modelExecutionRef: "model-execution:1",
      attempt: 1,
      at: "2026-08-04T01:01:00.000Z"
    });
    const validating = transitionRuntimeCheckpoint(running, {
      type: "validation_started",
      modelExecutionRef: "model-execution:1",
      outputHash: "validated-output-hash",
      at: "2026-08-04T01:02:00.000Z"
    });
    const waiting = transitionRuntimeCheckpoint(validating, {
      type: "proposal_created",
      proposalRef: "artifact-revision:proposal-1",
      outputHash: "validated-output-hash",
      at: "2026-08-04T01:03:00.000Z"
    });

    expect(initial.status).toBe("queued");
    expect(running.status).toBe("running");
    expect(validating.status).toBe("validating");
    expect(waiting.status).toBe("waiting_for_human");
    expect(waiting.proposalRef).toBe("artifact-revision:proposal-1");
    expect(waiting.steps.every((step) => step.status === "succeeded")).toBe(
      true
    );
    expect(compatibilityAgentRunStatus(waiting.status)).toBe("completed");

    const approved = transitionRuntimeCheckpoint(waiting, {
      type: "human_approved",
      at: "2026-08-04T01:04:00.000Z"
    });
    expect(approved.status).toBe("succeeded");
  });

  it("records process recovery and safely requeues an interrupted step", () => {
    const running = transitionRuntimeCheckpoint(lessonCheckpoint(), {
      type: "model_started",
      modelExecutionRef: "model-execution:1",
      attempt: 1,
      at: "2026-08-04T01:01:00.000Z"
    });
    const recovered = transitionRuntimeCheckpoint(running, {
      type: "recovered",
      at: "2026-08-04T01:02:00.000Z"
    });

    expect(recovered.status).toBe("queued");
    expect(recovered.recoveryCount).toBe(1);
    expect(recovered.lastRecoveredAt).toBe("2026-08-04T01:02:00.000Z");
    expect(
      recovered.steps.find((step) => step.kind === "invoke_model")?.status
    ).toBe("queued");

    const resumed = transitionRuntimeCheckpoint(recovered, {
      type: "model_started",
      modelExecutionRef: "model-execution:1",
      attempt: 2,
      at: "2026-08-04T01:03:00.000Z"
    });
    expect(resumed.status).toBe("running");
    expect(
      resumed.steps.find((step) => step.kind === "invoke_model")?.attempt
    ).toBe(2);
  });

  it("supports explicit retry without losing the failed checkpoint history", () => {
    const running = transitionRuntimeCheckpoint(lessonCheckpoint(), {
      type: "model_started",
      modelExecutionRef: "model-execution:1",
      attempt: 1,
      at: "2026-08-04T01:01:00.000Z"
    });
    const failed = transitionRuntimeCheckpoint(running, {
      type: "failed",
      safeErrorCategory: "REQUEST_TIMED_OUT",
      at: "2026-08-04T01:02:00.000Z"
    });
    const retried = transitionRuntimeCheckpoint(failed, {
      type: "retry_requested",
      modelExecutionRef: "model-execution:2",
      at: "2026-08-04T01:03:00.000Z"
    });

    expect(failed.status).toBe("failed");
    expect(retried.status).toBe("queued");
    expect(retried.checkpointVersion).toBe(failed.checkpointVersion + 1);
    expect(retried.modelExecutionRef).toBe("model-execution:2");
  });

  it("can retry a failed tool or wait for human intervention", () => {
    const definition: AgentDefinition = {
      agentDefinitionId: "tool-agent",
      version: "1",
      purpose: "test-tool-recovery",
      allowedSkillVersions: ["tool-skill@1"],
      toolPolicy: {
        allowedTools: ["safe.lookup"],
        mode: "explicit"
      },
      approvalPolicy: {
        proposalOnly: true,
        humanApprovalRequired: true
      }
    };
    const initial = createRuntimeCheckpoint({
      definition,
      skill: {
        skillId: "tool-skill",
        skillVersion: "1",
        skillRef: "tool-skill@1",
        contentHash: "tool-skill-content-hash",
        purpose: "test-tool-recovery"
      },
      agentRunRef: "agent-run:tool",
      taskRef: "task:tool",
      tenantRef: "tenant:school-a",
      actorRef: "user:teacher-a",
      purpose: "test-tool-recovery",
      contextPlan: {
        ref: "context-plan:tool",
        contentHash: "plan-hash",
        tokenBudget: 1_000
      },
      contextManifest: {
        ref: "context-manifest:tool",
        contentHash: "manifest-hash",
        tokenBudget: 1_000
      },
      steps: [
        { kind: "invoke_tool", inputHash: "tool-input-hash" },
        { kind: "validate", inputHash: "validation-input-hash" }
      ],
      createdAt
    });
    const waiting = transitionRuntimeCheckpoint(initial, {
      type: "waiting_for_tool",
      toolInvocationRef: "tool-invocation:1",
      attempt: 1,
      at: "2026-08-04T01:01:00.000Z"
    });
    const failed = transitionRuntimeCheckpoint(waiting, {
      type: "failed",
      safeErrorCategory: "TOOL_UNAVAILABLE",
      at: "2026-08-04T01:02:00.000Z"
    });
    const retry = transitionRuntimeCheckpoint(failed, {
      type: "tool_retry_requested",
      at: "2026-08-04T01:03:00.000Z"
    });
    const waitingAgain = transitionRuntimeCheckpoint(retry, {
      type: "waiting_for_tool",
      toolInvocationRef: "tool-invocation:2",
      attempt: 2,
      at: "2026-08-04T01:04:00.000Z"
    });
    const human = transitionRuntimeCheckpoint(waitingAgain, {
      type: "human_intervention_requested",
      at: "2026-08-04T01:05:00.000Z"
    });

    expect(waiting.status).toBe("waiting_for_tool");
    expect(retry.status).toBe("queued");
    expect(human.status).toBe("waiting_for_human");
  });

  it("fails closed when a persisted checkpoint is tampered with", () => {
    const checkpoint = lessonCheckpoint();
    const tampered = {
      ...checkpoint,
      status: "succeeded"
    };

    expect(() => parseRuntimeCheckpoint(tampered)).toThrow(
      RuntimeKernelTransitionError
    );
  });
});

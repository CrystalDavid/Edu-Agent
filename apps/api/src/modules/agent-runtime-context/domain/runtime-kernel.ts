import { createHash } from "node:crypto";

export type AgentRunKernelStatus =
  | "queued"
  | "running"
  | "waiting_for_tool"
  | "waiting_for_human"
  | "validating"
  | "succeeded"
  | "failed"
  | "cancelled";

export type RunStepKind =
  | "retrieve"
  | "plan"
  | "invoke_model"
  | "invoke_tool"
  | "validate"
  | "create_proposal";

export type RunStepStatus =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped";

export interface AgentDefinition {
  readonly agentDefinitionId: string;
  readonly version: string;
  readonly purpose: string;
  readonly allowedSkillVersions: readonly string[];
  readonly toolPolicy: {
    readonly allowedTools: readonly string[];
    readonly mode: "disabled" | "explicit";
  };
  readonly approvalPolicy: {
    readonly proposalOnly: true;
    readonly humanApprovalRequired: true;
  };
}

export interface RunStep {
  readonly stepRef: string;
  readonly sequence: number;
  readonly kind: RunStepKind;
  readonly status: RunStepStatus;
  readonly inputHash: string;
  readonly outputRef: string | null;
  readonly attempt: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly safeErrorCategory: string | null;
}

export interface RuntimeContextReference {
  readonly ref: string;
  readonly contentHash: string;
  readonly tokenBudget: number;
}

export interface AgentRunCheckpoint {
  readonly schemaVersion: 1;
  readonly checkpointRef: string;
  readonly checkpointVersion: number;
  readonly agentRunRef: string;
  readonly taskRef: string;
  readonly tenantRef: string;
  readonly actorRef: string;
  readonly purpose: string;
  readonly agentDefinitionId: string;
  readonly agentDefinitionVersion: string;
  readonly skillId?: string;
  readonly skillVersion: string;
  readonly skillRef?: string;
  readonly skillContentHash?: string;
  readonly status: AgentRunKernelStatus;
  readonly currentStepRef: string | null;
  readonly steps: readonly RunStep[];
  readonly contextPlan: RuntimeContextReference;
  readonly contextManifest: RuntimeContextReference;
  readonly modelExecutionRef: string | null;
  readonly proposalRef: string | null;
  readonly recoveryCount: number;
  readonly lastRecoveredAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly contentHash: string;
}

export type RuntimeKernelEvent =
  | {
      readonly type: "model_started";
      readonly modelExecutionRef: string;
      readonly attempt: number;
      readonly at: string;
    }
  | {
      readonly type: "validation_started";
      readonly modelExecutionRef: string;
      readonly outputHash: string;
      readonly at: string;
    }
  | {
      readonly type: "proposal_created";
      readonly proposalRef: string;
      readonly outputHash: string;
      readonly at: string;
    }
  | {
      readonly type: "waiting_for_tool";
      readonly toolInvocationRef: string;
      readonly attempt: number;
      readonly at: string;
    }
  | {
      readonly type: "tool_succeeded";
      readonly toolInvocationRef: string;
      readonly at: string;
    }
  | {
      readonly type: "tool_retry_requested";
      readonly at: string;
    }
  | {
      readonly type: "human_intervention_requested";
      readonly at: string;
    }
  | {
      readonly type: "failed";
      readonly safeErrorCategory: string;
      readonly at: string;
    }
  | {
      readonly type: "cancelled";
      readonly at: string;
    }
  | {
      readonly type: "retry_requested";
      readonly modelExecutionRef: string;
      readonly at: string;
    }
  | {
      readonly type: "recovered";
      readonly at: string;
    }
  | {
      readonly type: "human_approved";
      readonly at: string;
    };

export interface CreateLessonPreparationCheckpointInput {
  readonly agentRunRef: string;
  readonly taskRef: string;
  readonly tenantRef: string;
  readonly actorRef: string;
  readonly purpose: string;
  readonly contextPlanRef: string;
  readonly contextPlanHash: string;
  readonly contextManifestRef: string;
  readonly contextManifestHash: string;
  readonly tokenBudget: number;
  readonly promptBundleRef: string;
  readonly requestHash: string;
  readonly skill: RuntimeSkillIdentity;
  readonly createdAt: string;
}

export interface RuntimeSkillIdentity {
  readonly skillId: string;
  readonly skillVersion: string;
  readonly skillRef: string;
  readonly contentHash: string;
  readonly purpose: string;
}

export interface CreateRuntimeCheckpointInput {
  readonly definition: AgentDefinition;
  readonly skill: RuntimeSkillIdentity;
  readonly agentRunRef: string;
  readonly taskRef: string;
  readonly tenantRef: string;
  readonly actorRef: string;
  readonly purpose: string;
  readonly contextPlan: RuntimeContextReference;
  readonly contextManifest: RuntimeContextReference;
  readonly steps: readonly {
    readonly kind: RunStepKind;
    readonly inputHash: string;
    readonly status?: "queued" | "succeeded";
    readonly outputRef?: string;
  }[];
  readonly createdAt: string;
}

export const lessonPreparationAgentDefinition: AgentDefinition =
  deepFreeze({
    agentDefinitionId: "lesson-preparation-agent",
    version: "7",
    purpose: "lesson_preparation",
    allowedSkillVersions: [
      "lesson-preparation@1",
      "lesson-preparation@2",
      "lesson-preparation@3",
      "lesson-preparation@4",
      "lesson-preparation@5",
      "lesson-preparation@6",
      "lesson-preparation@7"
    ],
    toolPolicy: {
      allowedTools: [],
      mode: "disabled"
    },
    approvalPolicy: {
      proposalOnly: true,
      humanApprovalRequired: true
    }
  });

export class RuntimeKernelTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeKernelTransitionError";
  }
}

export function createLessonPreparationCheckpoint(
  input: CreateLessonPreparationCheckpointInput
): AgentRunCheckpoint {
  const definition = lessonPreparationAgentDefinition;
  assertAllowedSkill(definition, input.skill, input.purpose);
  const steps: readonly RunStep[] = [
    createStep(input.agentRunRef, 1, "retrieve", input.contextPlanHash, {
      status: "succeeded",
      outputRef: input.contextManifestRef,
      startedAt: input.createdAt,
      completedAt: input.createdAt
    }),
    createStep(input.agentRunRef, 2, "plan", hashValue({
      contextManifestHash: input.contextManifestHash,
      promptBundleRef: input.promptBundleRef
    }), {
      status: "succeeded",
      outputRef: input.promptBundleRef,
      startedAt: input.createdAt,
      completedAt: input.createdAt
    }),
    createStep(input.agentRunRef, 3, "invoke_model", input.requestHash),
    createStep(input.agentRunRef, 4, "validate", hashValue({
      requestHash: input.requestHash,
      purpose: input.purpose
    })),
    createStep(input.agentRunRef, 5, "create_proposal", hashValue({
      taskRef: input.taskRef,
      proposalOnly: true
    }))
  ];

  return sealCheckpoint({
    schemaVersion: 1,
    checkpointRef: checkpointRef(input.agentRunRef, 1),
    checkpointVersion: 1,
    agentRunRef: input.agentRunRef,
    taskRef: input.taskRef,
    tenantRef: input.tenantRef,
    actorRef: input.actorRef,
    purpose: input.purpose,
    agentDefinitionId: definition.agentDefinitionId,
    agentDefinitionVersion: definition.version,
    skillId: input.skill.skillId,
    skillVersion: input.skill.skillVersion,
    skillRef: input.skill.skillRef,
    skillContentHash: input.skill.contentHash,
    status: "queued",
    currentStepRef: steps[2]!.stepRef,
    steps,
    contextPlan: {
      ref: input.contextPlanRef,
      contentHash: input.contextPlanHash,
      tokenBudget: input.tokenBudget
    },
    contextManifest: {
      ref: input.contextManifestRef,
      contentHash: input.contextManifestHash,
      tokenBudget: input.tokenBudget
    },
    modelExecutionRef: null,
    proposalRef: null,
    recoveryCount: 0,
    lastRecoveredAt: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  });
}

export function createRuntimeCheckpoint(
  input: CreateRuntimeCheckpointInput
): AgentRunCheckpoint {
  assertAllowedSkill(input.definition, input.skill, input.purpose);
  if (
    input.steps.some((step) => step.kind === "invoke_tool") &&
    input.definition.toolPolicy.mode !== "explicit"
  ) {
    throw new RuntimeKernelTransitionError(
      "A tool step requires an explicit tool policy."
    );
  }
  const steps = input.steps.map((step, index) =>
    createStep(
      input.agentRunRef,
      index + 1,
      step.kind,
      step.inputHash,
      step.status === "succeeded"
        ? {
            status: "succeeded",
            outputRef: step.outputRef ?? null,
            startedAt: input.createdAt,
            completedAt: input.createdAt
          }
        : {}
    )
  );
  const current = steps.find((step) => step.status === "queued");
  if (!current) {
    throw new RuntimeKernelTransitionError(
      "An AgentRun must contain at least one queued step."
    );
  }
  return sealCheckpoint({
    schemaVersion: 1,
    checkpointRef: checkpointRef(input.agentRunRef, 1),
    checkpointVersion: 1,
    agentRunRef: input.agentRunRef,
    taskRef: input.taskRef,
    tenantRef: input.tenantRef,
    actorRef: input.actorRef,
    purpose: input.purpose,
    agentDefinitionId: input.definition.agentDefinitionId,
    agentDefinitionVersion: input.definition.version,
    skillId: input.skill.skillId,
    skillVersion: input.skill.skillVersion,
    skillRef: input.skill.skillRef,
    skillContentHash: input.skill.contentHash,
    status: "queued",
    currentStepRef: current.stepRef,
    steps,
    contextPlan: input.contextPlan,
    contextManifest: input.contextManifest,
    modelExecutionRef: null,
    proposalRef: null,
    recoveryCount: 0,
    lastRecoveredAt: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  });
}

export function transitionRuntimeCheckpoint(
  checkpoint: AgentRunCheckpoint,
  event: RuntimeKernelEvent
): AgentRunCheckpoint {
  assertCheckpointIntegrity(checkpoint);
  switch (event.type) {
    case "model_started":
      return modelStarted(checkpoint, event);
    case "validation_started":
      return validationStarted(checkpoint, event);
    case "proposal_created":
      return proposalCreated(checkpoint, event);
    case "waiting_for_tool":
      return waitingForTool(checkpoint, event);
    case "tool_succeeded":
      return toolSucceeded(checkpoint, event);
    case "tool_retry_requested":
      return toolRetryRequested(checkpoint, event);
    case "human_intervention_requested":
      return humanInterventionRequested(checkpoint, event);
    case "failed":
      return failed(checkpoint, event);
    case "cancelled":
      return cancelled(checkpoint, event);
    case "retry_requested":
      return retryRequested(checkpoint, event);
    case "recovered":
      return recovered(checkpoint, event);
    case "human_approved":
      return humanApproved(checkpoint, event);
  }
}

export function parseRuntimeCheckpoint(
  value: unknown
): AgentRunCheckpoint {
  if (!isRecord(value)) {
    throw new RuntimeKernelTransitionError(
      "Runtime checkpoint is not an object."
    );
  }
  if (
    value["schemaVersion"] !== 1 ||
    typeof value["checkpointRef"] !== "string" ||
    typeof value["checkpointVersion"] !== "number" ||
    typeof value["agentRunRef"] !== "string" ||
    typeof value["status"] !== "string" ||
    !Array.isArray(value["steps"]) ||
    typeof value["contentHash"] !== "string"
  ) {
    throw new RuntimeKernelTransitionError(
      "Runtime checkpoint has an unsupported shape."
    );
  }
  const checkpoint = value as unknown as AgentRunCheckpoint;
  assertCheckpointIntegrity(checkpoint);
  return deepFreeze(checkpoint);
}

export function assertCheckpointIntegrity(
  checkpoint: AgentRunCheckpoint
): void {
  const { contentHash: _contentHash, ...content } = checkpoint;
  const expected = hashValue(content);
  if (expected !== checkpoint.contentHash) {
    throw new RuntimeKernelTransitionError(
      "Runtime checkpoint content hash does not match."
    );
  }
}

export function compatibilityAgentRunStatus(
  status: AgentRunKernelStatus
): "queued" | "running" | "validating" | "completed" | "failed" | "cancelled" {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
    case "waiting_for_tool":
      return "running";
    case "validating":
      return "validating";
    case "waiting_for_human":
    case "succeeded":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

function modelStarted(
  checkpoint: AgentRunCheckpoint,
  event: Extract<RuntimeKernelEvent, { type: "model_started" }>
): AgentRunCheckpoint {
  if (!(["queued", "running"] as const).includes(
    checkpoint.status as "queued" | "running"
  )) {
    throw invalidTransition(checkpoint, event.type);
  }
  const step = requireStep(checkpoint, "invoke_model");
  if (!(step.status === "queued" || step.status === "running")) {
    throw invalidTransition(checkpoint, event.type);
  }
  return nextCheckpoint(checkpoint, {
    status: "running",
    currentStepRef: step.stepRef,
    modelExecutionRef: event.modelExecutionRef,
    updatedAt: event.at,
    steps: replaceStep(checkpoint.steps, step.stepRef, {
      ...step,
      status: "running",
      attempt: event.attempt,
      startedAt: step.startedAt ?? event.at,
      completedAt: null,
      safeErrorCategory: null
    })
  });
}

function validationStarted(
  checkpoint: AgentRunCheckpoint,
  event: Extract<RuntimeKernelEvent, { type: "validation_started" }>
): AgentRunCheckpoint {
  if (!(checkpoint.status === "queued" || checkpoint.status === "running")) {
    throw invalidTransition(checkpoint, event.type);
  }
  const modelStep = requireStep(checkpoint, "invoke_model");
  const validationStep = requireStep(checkpoint, "validate");
  if (modelStep.status !== "running" || validationStep.status !== "queued") {
    throw invalidTransition(checkpoint, event.type);
  }
  const completedModel = {
    ...modelStep,
    status: "succeeded" as const,
    outputRef: event.modelExecutionRef,
    completedAt: event.at
  };
  const runningValidation = {
    ...validationStep,
    status: "running" as const,
    outputRef: `sha256:${event.outputHash}`,
    startedAt: event.at
  };
  return nextCheckpoint(checkpoint, {
    status: "validating",
    currentStepRef: validationStep.stepRef,
    modelExecutionRef: event.modelExecutionRef,
    updatedAt: event.at,
    steps: replaceSteps(checkpoint.steps, [completedModel, runningValidation])
  });
}

function toolRetryRequested(
  checkpoint: AgentRunCheckpoint,
  event: Extract<RuntimeKernelEvent, { type: "tool_retry_requested" }>
): AgentRunCheckpoint {
  if (checkpoint.status !== "failed") {
    throw invalidTransition(checkpoint, event.type);
  }
  const step = requireCurrentStep(checkpoint);
  if (step.kind !== "invoke_tool" || step.status !== "failed") {
    throw invalidTransition(checkpoint, event.type);
  }
  return nextCheckpoint(checkpoint, {
    status: "queued",
    updatedAt: event.at,
    steps: replaceStep(checkpoint.steps, step.stepRef, {
      ...step,
      status: "queued",
      outputRef: null,
      startedAt: null,
      completedAt: null,
      safeErrorCategory: null
    })
  });
}

function humanInterventionRequested(
  checkpoint: AgentRunCheckpoint,
  event: Extract<RuntimeKernelEvent, { type: "human_intervention_requested" }>
): AgentRunCheckpoint {
  if (!(checkpoint.status === "failed" || checkpoint.status === "waiting_for_tool")) {
    throw invalidTransition(checkpoint, event.type);
  }
  return nextCheckpoint(checkpoint, {
    status: "waiting_for_human",
    updatedAt: event.at
  });
}

function proposalCreated(
  checkpoint: AgentRunCheckpoint,
  event: Extract<RuntimeKernelEvent, { type: "proposal_created" }>
): AgentRunCheckpoint {
  if (checkpoint.status !== "validating") {
    throw invalidTransition(checkpoint, event.type);
  }
  const validationStep = requireStep(checkpoint, "validate");
  const proposalStep = requireStep(checkpoint, "create_proposal");
  if (validationStep.status !== "running" || proposalStep.status !== "queued") {
    throw invalidTransition(checkpoint, event.type);
  }
  return nextCheckpoint(checkpoint, {
    status: "waiting_for_human",
    currentStepRef: null,
    proposalRef: event.proposalRef,
    updatedAt: event.at,
    steps: replaceSteps(checkpoint.steps, [
      {
        ...validationStep,
        status: "succeeded",
        outputRef: `sha256:${event.outputHash}`,
        completedAt: event.at
      },
      {
        ...proposalStep,
        status: "succeeded",
        outputRef: event.proposalRef,
        startedAt: event.at,
        completedAt: event.at
      }
    ])
  });
}

function waitingForTool(
  checkpoint: AgentRunCheckpoint,
  event: Extract<RuntimeKernelEvent, { type: "waiting_for_tool" }>
): AgentRunCheckpoint {
  if (!(checkpoint.status === "queued" || checkpoint.status === "running")) {
    throw invalidTransition(checkpoint, event.type);
  }
  const step = requireCurrentStep(checkpoint);
  if (step.kind !== "invoke_tool") {
    throw invalidTransition(checkpoint, event.type);
  }
  return nextCheckpoint(checkpoint, {
    status: "waiting_for_tool",
    updatedAt: event.at,
    steps: replaceStep(checkpoint.steps, step.stepRef, {
      ...step,
      status: "waiting",
      outputRef: event.toolInvocationRef,
      attempt: event.attempt,
      startedAt: step.startedAt ?? event.at
    })
  });
}

function toolSucceeded(
  checkpoint: AgentRunCheckpoint,
  event: Extract<RuntimeKernelEvent, { type: "tool_succeeded" }>
): AgentRunCheckpoint {
  if (checkpoint.status !== "waiting_for_tool") {
    throw invalidTransition(checkpoint, event.type);
  }
  const step = requireCurrentStep(checkpoint);
  if (step.kind !== "invoke_tool" || step.status !== "waiting") {
    throw invalidTransition(checkpoint, event.type);
  }
  const next = checkpoint.steps.find(
    (candidate) => candidate.sequence > step.sequence && candidate.status === "queued"
  );
  return nextCheckpoint(checkpoint, {
    status: "running",
    currentStepRef: next?.stepRef ?? null,
    updatedAt: event.at,
    steps: replaceStep(checkpoint.steps, step.stepRef, {
      ...step,
      status: "succeeded",
      outputRef: event.toolInvocationRef,
      completedAt: event.at
    })
  });
}

function failed(
  checkpoint: AgentRunCheckpoint,
  event: Extract<RuntimeKernelEvent, { type: "failed" }>
): AgentRunCheckpoint {
  if (["succeeded", "cancelled", "waiting_for_human"].includes(checkpoint.status)) {
    throw invalidTransition(checkpoint, event.type);
  }
  const step = requireCurrentStep(checkpoint);
  return nextCheckpoint(checkpoint, {
    status: "failed",
    updatedAt: event.at,
    steps: replaceStep(checkpoint.steps, step.stepRef, {
      ...step,
      status: "failed",
      safeErrorCategory: event.safeErrorCategory,
      completedAt: event.at
    })
  });
}

function cancelled(
  checkpoint: AgentRunCheckpoint,
  event: Extract<RuntimeKernelEvent, { type: "cancelled" }>
): AgentRunCheckpoint {
  if (["succeeded", "cancelled"].includes(checkpoint.status)) {
    throw invalidTransition(checkpoint, event.type);
  }
  const current = checkpoint.currentStepRef
    ? checkpoint.steps.find((step) => step.stepRef === checkpoint.currentStepRef)
    : undefined;
  return nextCheckpoint(checkpoint, {
    status: "cancelled",
    updatedAt: event.at,
    steps: current
      ? replaceStep(checkpoint.steps, current.stepRef, {
          ...current,
          status: "cancelled",
          completedAt: event.at
        })
      : checkpoint.steps
  });
}

function retryRequested(
  checkpoint: AgentRunCheckpoint,
  event: Extract<RuntimeKernelEvent, { type: "retry_requested" }>
): AgentRunCheckpoint {
  if (!(checkpoint.status === "failed" || checkpoint.status === "cancelled")) {
    throw invalidTransition(checkpoint, event.type);
  }
  const step = requireCurrentStep(checkpoint);
  if (!(step.status === "failed" || step.status === "cancelled")) {
    throw invalidTransition(checkpoint, event.type);
  }
  return nextCheckpoint(checkpoint, {
    status: "queued",
    modelExecutionRef: event.modelExecutionRef,
    updatedAt: event.at,
    steps: replaceStep(checkpoint.steps, step.stepRef, {
      ...step,
      status: "queued",
      outputRef: null,
      startedAt: null,
      completedAt: null,
      safeErrorCategory: null
    })
  });
}

function recovered(
  checkpoint: AgentRunCheckpoint,
  event: Extract<RuntimeKernelEvent, { type: "recovered" }>
): AgentRunCheckpoint {
  if (["succeeded", "cancelled", "failed"].includes(checkpoint.status)) {
    throw invalidTransition(checkpoint, event.type);
  }
  const current = checkpoint.currentStepRef
    ? requireCurrentStep(checkpoint)
    : undefined;
  const shouldRequeue =
    current && ["running", "waiting"].includes(current.status);
  return nextCheckpoint(checkpoint, {
    status: shouldRequeue ? "queued" : checkpoint.status,
    recoveryCount: checkpoint.recoveryCount + 1,
    lastRecoveredAt: event.at,
    updatedAt: event.at,
    steps: shouldRequeue
      ? replaceStep(checkpoint.steps, current.stepRef, {
          ...current,
          status: "queued",
          startedAt: null,
          completedAt: null,
          safeErrorCategory: null
        })
      : checkpoint.steps
  });
}

function humanApproved(
  checkpoint: AgentRunCheckpoint,
  event: Extract<RuntimeKernelEvent, { type: "human_approved" }>
): AgentRunCheckpoint {
  if (checkpoint.status !== "waiting_for_human") {
    throw invalidTransition(checkpoint, event.type);
  }
  return nextCheckpoint(checkpoint, {
    status: "succeeded",
    updatedAt: event.at
  });
}

type UnsealedCheckpoint = Omit<AgentRunCheckpoint, "contentHash">;

function nextCheckpoint(
  current: AgentRunCheckpoint,
  patch: Partial<UnsealedCheckpoint>
): AgentRunCheckpoint {
  const version = current.checkpointVersion + 1;
  const { contentHash: _contentHash, ...base } = current;
  return sealCheckpoint({
    ...base,
    ...patch,
    checkpointVersion: version,
    checkpointRef: checkpointRef(current.agentRunRef, version)
  });
}

function sealCheckpoint(
  checkpoint: UnsealedCheckpoint
): AgentRunCheckpoint {
  return deepFreeze({
    ...checkpoint,
    contentHash: hashValue(checkpoint)
  });
}

function createStep(
  agentRunRef: string,
  sequence: number,
  kind: RunStepKind,
  inputHash: string,
  patch: Partial<RunStep> = {}
): RunStep {
  return {
    stepRef: `run-step:${agentRunRef}:${sequence}`,
    sequence,
    kind,
    status: "queued",
    inputHash,
    outputRef: null,
    attempt: 0,
    startedAt: null,
    completedAt: null,
    safeErrorCategory: null,
    ...patch
  };
}

function requireCurrentStep(checkpoint: AgentRunCheckpoint): RunStep {
  const step = checkpoint.steps.find(
    (candidate) => candidate.stepRef === checkpoint.currentStepRef
  );
  if (!step) {
    throw new RuntimeKernelTransitionError(
      `AgentRun ${checkpoint.agentRunRef} has no current step.`
    );
  }
  return step;
}

function requireStep(
  checkpoint: AgentRunCheckpoint,
  kind: RunStepKind
): RunStep {
  const step = checkpoint.steps.find((candidate) => candidate.kind === kind);
  if (!step) {
    throw new RuntimeKernelTransitionError(
      `AgentRun ${checkpoint.agentRunRef} has no ${kind} step.`
    );
  }
  return step;
}

function replaceStep(
  steps: readonly RunStep[],
  stepRef: string,
  replacement: RunStep
): readonly RunStep[] {
  return steps.map((step) => step.stepRef === stepRef ? replacement : step);
}

function replaceSteps(
  steps: readonly RunStep[],
  replacements: readonly RunStep[]
): readonly RunStep[] {
  const byRef = new Map(replacements.map((step) => [step.stepRef, step]));
  return steps.map((step) => byRef.get(step.stepRef) ?? step);
}

function invalidTransition(
  checkpoint: AgentRunCheckpoint,
  eventType: RuntimeKernelEvent["type"]
): RuntimeKernelTransitionError {
  return new RuntimeKernelTransitionError(
    `Cannot apply ${eventType} while AgentRun ${checkpoint.agentRunRef} is ${checkpoint.status}.`
  );
}

function assertAllowedSkill(
  definition: AgentDefinition,
  skill: RuntimeSkillIdentity,
  purpose: string
): void {
  if (!definition.allowedSkillVersions.includes(skill.skillRef)) {
    throw new RuntimeKernelTransitionError(
      `Skill ${skill.skillRef} is not allowed by ${definition.agentDefinitionId}@${definition.version}.`
    );
  }
  if (skill.purpose !== definition.purpose) {
    throw new RuntimeKernelTransitionError(
      `Skill ${skill.skillRef} purpose does not match ${definition.agentDefinitionId}@${definition.version}.`
    );
  }
  if (!purpose.trim() || !skill.contentHash.trim()) {
    throw new RuntimeKernelTransitionError(
      `Skill ${skill.skillRef} cannot be bound without a purpose and content hash.`
    );
  }
}

function checkpointRef(agentRunRef: string, version: number): string {
  return `runtime-checkpoint:${agentRunRef}:${version}`;
}

function hashValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

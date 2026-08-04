import type {
  FormalWriteMetadata,
  FormalWriteReceipt
} from "@edu-agent/contracts";

import type {
  RuntimeSkillLoaderPort
} from "../../../agent/skills/types.js";

import {
  compatibilityAgentRunStatus,
  createLessonPreparationCheckpoint,
  transitionRuntimeCheckpoint,
  type AgentRunCheckpoint,
  type CreateLessonPreparationCheckpointInput,
  type RuntimeKernelEvent
} from "../domain/runtime-kernel.js";

export interface StoredRuntimeCheckpoint {
  readonly compatibilityOutput: Record<string, unknown>;
  readonly checkpoint: AgentRunCheckpoint;
}

export interface RuntimeCheckpointStore<TUnitOfWork> {
  load(
    unitOfWork: TUnitOfWork,
    agentRunRef: string
  ): Promise<StoredRuntimeCheckpoint | null>;
  save(
    unitOfWork: TUnitOfWork,
    input: {
      readonly current: StoredRuntimeCheckpoint;
      readonly checkpoint: AgentRunCheckpoint;
      readonly compatibilityOutputPatch: Record<string, unknown>;
      readonly outboxRef: string;
      readonly eventType: RuntimeKernelEvent["type"];
      readonly metadata: FormalWriteMetadata & { readonly owner: "runtime" };
    }
  ): Promise<FormalWriteReceipt>;
}

export interface ContextProvider {
  provideAuthorizedContext(input: {
    readonly taskRef: string;
    readonly purpose: string;
  }): Promise<{
    readonly contextPlanRef: string;
    readonly contextManifestRef: string;
  }>;
}

export interface ModelExecutor {
  executeModel(input: {
    readonly agentRunRef: string;
    readonly contextManifestRef: string;
  }): Promise<{ readonly modelExecutionRef: string }>;
}

export interface ProposalCreator {
  createProposal(input: {
    readonly agentRunRef: string;
    readonly outputRef: string;
  }): Promise<{ readonly proposalRef: string }>;
}

export interface ToolExecutor {
  executeTool(input: {
    readonly agentRunRef: string;
    readonly toolName: string;
    readonly inputHash: string;
  }): Promise<{ readonly toolInvocationRef: string }>;
}

export class RuntimeKernelService<TUnitOfWork> {
  constructor(
    private readonly checkpoints: RuntimeCheckpointStore<TUnitOfWork>,
    private readonly skills: RuntimeSkillLoaderPort
  ) {}

  createLessonPreparationRun(
    input: Omit<CreateLessonPreparationCheckpointInput, "skill"> & {
      readonly skillRef: string;
    }
  ): AgentRunCheckpoint {
    const skill = this.skills.loadPublishedBinding(input.skillRef);
    return createLessonPreparationCheckpoint({
      ...input,
      skill: {
        skillId: skill.skillId,
        skillVersion: skill.skillVersion,
        skillRef: skill.skillRef,
        contentHash: skill.contentHash,
        purpose: skill.purpose
      }
    });
  }

  async transitionIfPresent(
    unitOfWork: TUnitOfWork,
    input: {
      readonly agentRunRef: string;
      readonly event: RuntimeKernelEvent;
      readonly compatibilityOutputPatch?: Record<string, unknown>;
      readonly outboxRef: string;
      readonly metadata: FormalWriteMetadata & { readonly owner: "runtime" };
    }
  ): Promise<{
    readonly checkpoint: AgentRunCheckpoint;
    readonly receipt: FormalWriteReceipt;
  } | null> {
    const current = await this.checkpoints.load(
      unitOfWork,
      input.agentRunRef
    );
    if (!current) return null;
    const checkpoint = transitionRuntimeCheckpoint(
      current.checkpoint,
      input.event
    );
    const receipt = await this.checkpoints.save(unitOfWork, {
      current,
      checkpoint,
      compatibilityOutputPatch:
        input.compatibilityOutputPatch ?? {},
      outboxRef: input.outboxRef,
      eventType: input.event.type,
      metadata: input.metadata
    });
    return { checkpoint, receipt };
  }

  compatibilityStatus(checkpoint: AgentRunCheckpoint) {
    return compatibilityAgentRunStatus(checkpoint.status);
  }
}

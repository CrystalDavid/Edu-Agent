import type {
  FormalWriteReceipt,
  ModelRequest,
  ModelResponse,
  OutboxRecord,
  RunBinding,
  ToolRequest,
  ToolResponse
} from "@edu-agent/contracts";

import type { MetadataFactory } from "../../../platform/metadata.js";
import type { IdGenerator } from "../../../platform/system.js";
import type { AgentRunRecord } from "../domain/agent-run.js";

export interface RuntimeRepository {
  saveAgentRun(agentRun: AgentRunRecord, outbox: OutboxRecord): void;
  listAgentRuns(): readonly AgentRunRecord[];
  listOutbox(): readonly OutboxRecord[];
}

export interface CapabilityExecutionPortResult {
  model: ModelResponse;
  tool: ToolResponse;
  receipts: readonly FormalWriteReceipt[];
}

export interface CapabilityExecutionPort {
  execute(input: {
    modelRequest: ModelRequest;
    toolRequest: ToolRequest;
    metadata: MetadataFactory;
  }): Promise<CapabilityExecutionPortResult>;
}

export interface RuntimeExecutionResult {
  agentRun: AgentRunRecord;
  outbox: OutboxRecord;
  receipts: readonly FormalWriteReceipt[];
}

export class RuntimeService {
  constructor(
    private readonly capability: CapabilityExecutionPort,
    private readonly repository: RuntimeRepository,
    private readonly ids: IdGenerator
  ) {}

  async execute(input: {
    binding: RunBinding;
    purpose: string;
    title: string;
    body: string;
    metadata: MetadataFactory;
  }): Promise<RuntimeExecutionResult> {
    const agentRunRef = this.ids.next("agent-run");
    const capability = await this.capability.execute({
      modelRequest: {
        requestRef: this.ids.next("model-request"),
        purpose: input.purpose,
        promptKey: "gate1a.walking-skeleton",
        input: {
          title: input.title,
          body: input.body
        }
      },
      toolRequest: {
        requestRef: this.ids.next("tool-request"),
        toolName: "fake.echo",
        input: {
          text: input.body
        }
      },
      metadata: input.metadata
    });

    const agentMetadata = input.metadata.create(
      "runtime",
      "agent-run"
    );
    const outboxMetadata = input.metadata.create(
      "runtime",
      "agent-outbox"
    );
    const agentRun: AgentRunRecord = {
      agentRunRef,
      binding: input.binding,
      status: "completed",
      modelProvider: capability.model.provider,
      modelProfile: capability.model.modelProfile,
      toolName: capability.tool.toolName,
      output: {
        title: capability.model.output.title,
        body: capability.model.output.body,
        toolEcho: capability.tool.output.echoed
      },
      metadata: agentMetadata
    };
    const outbox: OutboxRecord = {
      outboxRef: this.ids.next("outbox"),
      eventName: "AgentRunCompleted",
      aggregateRef: agentRunRef,
      payload: {
        runKind: input.binding.runKind,
        runRef: input.binding.runRef,
        modelProvider: capability.model.provider,
        toolName: capability.tool.toolName
      },
      metadata: outboxMetadata
    };

    this.repository.saveAgentRun(agentRun, outbox);

    return {
      agentRun,
      outbox,
      receipts: [
        ...capability.receipts,
        {
          writeRef: agentRunRef,
          recordType: "AgentRun",
          owner: "runtime",
          metadata: agentMetadata
        },
        {
          writeRef: outbox.outboxRef,
          recordType: "OutboxRecord",
          owner: "runtime",
          metadata: outboxMetadata
        }
      ]
    };
  }
}

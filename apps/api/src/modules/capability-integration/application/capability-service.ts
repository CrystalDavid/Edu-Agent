import type {
  FormalWriteReceipt,
  ModelRequest,
  OutboxRecord,
  ToolRequest
} from "@edu-agent/contracts";

import type { MetadataFactory } from "../../../platform/metadata.js";
import type { IdGenerator } from "../../../platform/system.js";
import type {
  CapabilityExecutionResult,
  LegacyModelProvider,
  Tool,
  ToolExecutionRecord
} from "../domain/capability.js";

export interface CapabilityRepository {
  saveExecution(
    execution: ToolExecutionRecord,
    outbox: OutboxRecord
  ): void;
  listExecutions(): readonly ToolExecutionRecord[];
  listOutbox(): readonly OutboxRecord[];
}

export interface CapabilityServiceResult {
  result: CapabilityExecutionResult;
  receipts: readonly FormalWriteReceipt[];
}

export class CapabilityService {
  constructor(
    private readonly model: LegacyModelProvider,
    private readonly tool: Tool,
    private readonly repository: CapabilityRepository,
    private readonly ids: IdGenerator
  ) {}

  async execute(input: {
    modelRequest: ModelRequest;
    toolRequest: ToolRequest;
    metadata: MetadataFactory;
  }): Promise<CapabilityServiceResult> {
    const modelResponse = await this.model.generate(input.modelRequest);
    const toolResponse = await this.tool.execute(input.toolRequest);
    const executionRef = this.ids.next("tool-execution");
    const executionMetadata = input.metadata.create(
      "capability",
      "tool-execution"
    );
    const outboxMetadata = input.metadata.create(
      "capability",
      "tool-outbox"
    );

    const execution: ToolExecutionRecord = {
      executionRef,
      toolName: toolResponse.toolName,
      input: input.toolRequest.input,
      output: toolResponse.output,
      metadata: executionMetadata
    };
    const outbox: OutboxRecord = {
      outboxRef: this.ids.next("outbox"),
      eventName: "FakeToolExecuted",
      aggregateRef: executionRef,
      payload: {
        toolName: toolResponse.toolName
      },
      metadata: outboxMetadata
    };

    this.repository.saveExecution(execution, outbox);

    return {
      result: {
        model: modelResponse,
        tool: toolResponse,
        toolExecution: execution,
        outbox
      },
      receipts: [
        {
          writeRef: executionRef,
          recordType: "ToolExecution",
          owner: "capability",
          metadata: executionMetadata
        },
        {
          writeRef: outbox.outboxRef,
          recordType: "OutboxRecord",
          owner: "capability",
          metadata: outboxMetadata
        }
      ]
    };
  }
}

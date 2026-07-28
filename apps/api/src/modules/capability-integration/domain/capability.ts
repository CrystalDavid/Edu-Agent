import type {
  FormalWriteMetadata,
  ModelRequest,
  ModelResponse,
  OutboxRecord,
  ToolRequest,
  ToolResponse
} from "@edu-agent/contracts";

export interface CapabilityDescriptor {
  capabilityRef: string;
  name: string;
  kind: "model" | "tool";
  description: string;
}

export interface ExecutionContract {
  contractRef: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
  sideEffect: "none" | "write";
  idempotent: boolean;
  preconditions: readonly string[];
  postconditions: readonly string[];
}

export interface GovernanceProfile {
  profileRef: string;
  risk: "read-only" | "write";
  requiresAuthorization: true;
  destructive: false;
  maxConcurrency: number;
}

export interface ToolExecutionRecord {
  executionRef: string;
  toolName: string;
  input: ToolRequest["input"];
  output: ToolResponse["output"];
  metadata: FormalWriteMetadata;
}

export interface CapabilityExecutionResult {
  model: ModelResponse;
  tool: ToolResponse;
  toolExecution: ToolExecutionRecord;
  outbox: OutboxRecord;
}

export interface ModelProvider {
  readonly descriptor: CapabilityDescriptor;
  readonly executionContract: ExecutionContract;
  readonly governanceProfile: GovernanceProfile;
  generate(request: ModelRequest): Promise<ModelResponse>;
}

export interface Tool {
  readonly descriptor: CapabilityDescriptor;
  readonly executionContract: ExecutionContract;
  readonly governanceProfile: GovernanceProfile;
  execute(request: ToolRequest): Promise<ToolResponse>;
}

import type {
  FormalWriteMetadata,
  ModelResponse,
  RunBinding,
  ToolResponse
} from "@edu-agent/contracts";

export interface AgentRunRecord {
  agentRunRef: string;
  binding: RunBinding;
  status: "completed";
  modelProvider: ModelResponse["provider"];
  modelProfile: ModelResponse["modelProfile"];
  toolName: ToolResponse["toolName"];
  output: {
    title: string;
    body: string;
    toolEcho: string;
  };
  metadata: FormalWriteMetadata;
}

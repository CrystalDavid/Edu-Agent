import {
  ToolRequestSchema,
  ToolResponseSchema,
  type ToolRequest,
  type ToolResponse
} from "@edu-agent/contracts";

import type {
  CapabilityDescriptor,
  ExecutionContract,
  GovernanceProfile,
  Tool
} from "../domain/capability.js";

export class FakeTool implements Tool {
  readonly descriptor: CapabilityDescriptor = {
    capabilityRef: "capability:tool:fake.echo",
    name: "fake.echo",
    kind: "tool",
    description: "Deterministic no-network echo tool for Gate 1A."
  };

  readonly executionContract: ExecutionContract = {
    contractRef: "execution-contract:tool:fake.echo@1",
    inputSchemaRef: "ToolRequestSchema@1",
    outputSchemaRef: "ToolResponseSchema@1",
    sideEffect: "none",
    idempotent: true,
    preconditions: ["authorized execution contract"],
    postconditions: ["output equals input text"]
  };

  readonly governanceProfile: GovernanceProfile = {
    profileRef: "governance-profile:tool:fake.echo@1",
    risk: "read-only",
    requiresAuthorization: true,
    destructive: false,
    maxConcurrency: 16
  };

  async execute(rawRequest: ToolRequest): Promise<ToolResponse> {
    const request = ToolRequestSchema.parse(rawRequest);
    return ToolResponseSchema.parse({
      toolName: "fake.echo",
      output: {
        echoed: request.input.text
      }
    });
  }
}

import {
  ModelRequestSchema,
  ModelResponseSchema,
  type ModelRequest,
  type ModelResponse
} from "@edu-agent/contracts";

import type {
  CapabilityDescriptor,
  ExecutionContract,
  GovernanceProfile,
  ModelProvider
} from "../domain/capability.js";

export class MockModelProvider implements ModelProvider {
  readonly descriptor: CapabilityDescriptor = {
    capabilityRef: "capability:model:mock",
    name: "MockModelProvider",
    kind: "model",
    description: "Gate 1A deterministic model fixture; performs no network call."
  };

  readonly executionContract: ExecutionContract = {
    contractRef: "execution-contract:model:mock@1",
    inputSchemaRef: "ModelRequestSchema@1",
    outputSchemaRef: "ModelResponseSchema@1",
    sideEffect: "none",
    idempotent: true,
    preconditions: ["validated synthetic input"],
    postconditions: ["validated deterministic output"]
  };

  readonly governanceProfile: GovernanceProfile = {
    profileRef: "governance-profile:model:mock@1",
    risk: "read-only",
    requiresAuthorization: true,
    destructive: false,
    maxConcurrency: 8
  };

  async generate(rawRequest: ModelRequest): Promise<ModelResponse> {
    const request = ModelRequestSchema.parse(rawRequest);
    return ModelResponseSchema.parse({
      provider: "mock",
      modelProfile: "deterministic-fixture",
      output: {
        title: `Mock: ${request.promptKey}`,
        body: String(request.input["body"] ?? "empty")
      },
      usage: {
        inputUnits: JSON.stringify(request.input).length,
        outputUnits: String(request.input["body"] ?? "").length
      }
    });
  }
}

import {
  ReflectionGenerationResultSchema,
  type CancelModelInvocationRequest,
  type CreateModelInvocationRequest,
  type CreateModelInvocationResult,
  type ModelExecutionView,
  type ModelUsageSummary,
  type ProviderAvailability,
  type ProviderCapabilities,
  type RetryModelInvocationRequest
} from "@edu-agent/contracts";

import type {
  ProviderCapabilityProbeResult
} from "./provider-capability.js";

export type ReflectionGenerationResult = ReturnType<
  typeof ReflectionGenerationResultSchema.parse
>;

export interface ModelInvocationRuntimeSettings {
  requestedMode: "mock" | "ark";
  activeProvider: "mock" | "volcengine-ark";
}

/**
 * Application boundary used by HTTP and workers for model executions.
 * Provider adapters remain behind ModelProvider and are never exposed here.
 */
export interface ModelInvocationApplicationFacade {
  readonly settings: ModelInvocationRuntimeSettings;

  getAvailability(): ProviderAvailability;
  getCapabilities(): Promise<ProviderCapabilities | null>;
  getUsageSummary(): Promise<ModelUsageSummary>;
  runCapabilityProbe(): Promise<ProviderCapabilities>;
  runCapabilityProbeDetailed(input: {
    live: boolean;
  }): Promise<ProviderCapabilityProbeResult>;

  createInvocation(input: {
    tenantRef: string;
    actorRef: string;
    request: CreateModelInvocationRequest;
  }): Promise<CreateModelInvocationResult>;

  createReflectionInvocation(input: {
    tenantRef: string;
    actorRef: string;
    request: unknown;
  }): Promise<ReflectionGenerationResult>;

  getInvocation(input: {
    tenantRef: string;
    actorRef: string;
    modelExecutionRef: string;
  }): Promise<ModelExecutionView>;

  cancelInvocation(input: {
    tenantRef: string;
    actorRef: string;
    modelExecutionRef: string;
    request: CancelModelInvocationRequest;
  }): Promise<ModelExecutionView>;

  retryInvocation(input: {
    tenantRef: string;
    actorRef: string;
    modelExecutionRef: string;
    request: RetryModelInvocationRequest;
  }): Promise<CreateModelInvocationResult>;

  processExecution(executionRef: string): Promise<void>;
}

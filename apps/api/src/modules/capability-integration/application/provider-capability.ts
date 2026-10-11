import type {
  ModelFailureCategory,
  ProviderCapabilities,
  ProviderCapabilitySupportStatus
} from "@edu-agent/contracts";

export type ProviderCapabilityProbeName =
  | "text"
  | "json_object"
  | "json_schema"
  | "function_calling"
  | "image_url"
  | "streaming";

export interface SafeProviderCapabilityProbeCall {
  probe: ProviderCapabilityProbeName;
  status: "succeeded" | "failed";
  capabilityStatus: ProviderCapabilitySupportStatus;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  providerRequestIdMasked: string | null;
  finishReason: string | null;
  safeErrorCategory: ModelFailureCategory | null;
  schemaPassed: boolean;
  policyPassed: boolean | null;
}

export interface ProviderCapabilityProbeResult {
  capabilities: ProviderCapabilities;
  calls: readonly SafeProviderCapabilityProbeCall[];
}

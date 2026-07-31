import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  ModelFailureCategory,
  ProviderCapabilities
} from "@edu-agent/contracts";

import type {
  SafeProviderCapabilityProbeCall
} from "../modules/capability-integration/application/provider-capability-probe.js";

export interface SafeLiveStructuredProbeCall {
  probe: "structured_teaching_output";
  status: "succeeded" | "failed";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  providerRequestIdMasked: string | null;
  finishReason: string | null;
  safeErrorCategory: ModelFailureCategory | null;
  schemaPassed: boolean;
  policyPassed: boolean;
}

export interface SafeLiveAcceptanceReport {
  schemaVersion: "gate-2-6a-live-acceptance@1";
  checkedAt: string;
  live: true;
  provider: "volcengine-ark";
  modelIdHash: string;
  status: "passed" | "failed";
  capabilities: Pick<
    ProviderCapabilities,
    | "imageUrlStatus"
    | "jsonObjectStatus"
    | "jsonSchemaStatus"
    | "functionCallingStatus"
    | "streamingStatus"
    | "reportsUsage"
    | "reportsRequestId"
    | "reportedModelMatches"
  >;
  calls: readonly (
    | SafeProviderCapabilityProbeCall
    | SafeLiveStructuredProbeCall
  )[];
  totals: {
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    latencyMs: number;
  };
}

export async function writeSafeLiveAcceptanceReport(
  report: SafeLiveAcceptanceReport
): Promise<string> {
  const directory = resolve(
    ".demo",
    "live-model-reports"
  );
  await mkdir(directory, { recursive: true });
  const fileName = `gate-2-6a-live-${report.checkedAt.replace(
    /[:.]/g,
    "-"
  )}.json`;
  const path = resolve(directory, fileName);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
  return path;
}

export function aggregateSafeLiveCalls(
  calls: SafeLiveAcceptanceReport["calls"]
): SafeLiveAcceptanceReport["totals"] {
  return calls.reduce(
    (totals, call) => ({
      requestCount: totals.requestCount + 1,
      inputTokens: totals.inputTokens + call.inputTokens,
      outputTokens: totals.outputTokens + call.outputTokens,
      totalTokens: totals.totalTokens + call.totalTokens,
      latencyMs: totals.latencyMs + call.latencyMs
    }),
    {
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs: 0
    }
  );
}

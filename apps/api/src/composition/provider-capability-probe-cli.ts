import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import {
  validateModelOutput
} from "../modules/capability-integration/application/model-output-validation.js";
import {
  maskProviderRequestId
} from "../modules/capability-integration/application/safe-model-logging.js";
import {
  readModelProviderSettings
} from "../modules/capability-integration/infrastructure/model-provider-config.js";
import {
  VolcengineArkProvider
} from "../modules/capability-integration/infrastructure/volcengine-ark-provider.js";
import {
  readPostgresEnvironment
} from "../platform/postgres/config.js";
import {
  aggregateSafeLiveCalls,
  writeSafeLiveAcceptanceReport,
  type SafeLiveStructuredProbeCall
} from "./live-model-acceptance-report.js";
import { createProductContainer } from "./product-container.js";
import {
  createSyntheticLiveModelRequest
} from "./synthetic-live-model-request.js";

const EXPECTED_ARK_BASE_URL =
  "https://ark.cn-beijing.volces.com/api/v3";
const EXPECTED_ARK_MODEL_ID =
  "doubao-seed-2-1-turbo-260628";

loadLocalEnvironmentWithoutDisplayingIt();

if (
  process.env.ENABLE_LIVE_MODEL_TESTS !== "true" ||
  process.env.MODEL_PROVIDER_MODE !== "ark" ||
  process.env.ARK_LIVE_STRICT !== "true"
) {
  throw new Error(
    "Strict Live Acceptance requires ENABLE_LIVE_MODEL_TESTS=true, MODEL_PROVIDER_MODE=ark and ARK_LIVE_STRICT=true. Skipping and fallback are forbidden."
  );
}

const settings = readModelProviderSettings();
if (
  !settings.liveStrict ||
  !settings.ark ||
  settings.activeProvider !== "volcengine-ark" ||
  settings.availability.fallbackToMock
) {
  throw new Error(
    "Strict Live Acceptance did not resolve to Volcengine Ark. No Mock or Fake fallback is permitted."
  );
}
if (settings.ark.baseUrl !== EXPECTED_ARK_BASE_URL) {
  throw new Error(
    "Strict Live Acceptance requires the approved Volcengine Ark Beijing API base URL."
  );
}
if (settings.ark.modelId !== EXPECTED_ARK_MODEL_ID) {
  throw new Error(
    "Strict Live Acceptance requires the approved Ark model ID."
  );
}

const product = createProductContainer(
  readPostgresEnvironment(),
  { modelSettings: settings }
);
try {
  const capabilityResult =
    await product.services.modelInvocations.runCapabilityProbeDetailed(
      { live: true }
    );
  const textCall = capabilityResult.calls.find(
    (call) => call.probe === "text"
  );
  const capabilityCorePassed =
    capabilityResult.capabilities.provider ===
      "volcengine-ark" &&
    capabilityResult.capabilities.live === true &&
    capabilityResult.capabilities.supportsText &&
    capabilityResult.capabilities.reportsUsage &&
    capabilityResult.capabilities.reportsRequestId &&
    capabilityResult.capabilities.reportedModelMatches &&
    textCall?.status === "succeeded" &&
    textCall.schemaPassed &&
    textCall.inputTokens > 0 &&
    textCall.outputTokens > 0 &&
    textCall.latencyMs > 0 &&
    Boolean(textCall.providerRequestIdMasked);

  const responseFormat =
    capabilityResult.capabilities.supportsJsonSchema
      ? "json_schema"
      : capabilityResult.capabilities.supportsJsonObject
        ? "json_object"
        : "prompt_json";
  const provider = new VolcengineArkProvider(settings.ark);
  const request = createSyntheticLiveModelRequest(
    responseFormat
  );
  const modelResult = await provider.invoke(request);
  let structuredCall: SafeLiveStructuredProbeCall;
  let structuredCorePassed = false;
  if (modelResult.status === "succeeded") {
    const validation = validateModelOutput({
      outputText: modelResult.outputText,
      request
    });
    const semanticRequirementsPassed =
      validation.valid &&
      validation.output.suggestions.every(
        (suggestion) =>
          suggestion.knownGaps.length > 0 &&
          suggestion.uncertaintyNote.trim().length > 0
      ) &&
      !/"state"\s*:\s*"approved"/u.test(
        modelResult.outputText
      );
    const inputTokens = modelResult.inputTokens ?? 0;
    const outputTokens = modelResult.outputTokens ?? 0;
    structuredCorePassed =
      modelResult.provider === "volcengine-ark" &&
      modelResult.modelId === settings.ark.modelId &&
      Boolean(modelResult.providerRequestId) &&
      inputTokens > 0 &&
      outputTokens > 0 &&
      modelResult.latencyMs > 0 &&
      semanticRequirementsPassed;
    structuredCall = {
      probe: "structured_teaching_output",
      status: "succeeded",
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      latencyMs: modelResult.latencyMs,
      providerRequestIdMasked: maskProviderRequestId(
        modelResult.providerRequestId
      ),
      finishReason: modelResult.finishReason ?? null,
      safeErrorCategory: null,
      schemaPassed: validation.valid,
      policyPassed:
        validation.valid || validation.category !== "policy"
    };
  } else {
    structuredCall = {
      probe: "structured_teaching_output",
      status: "failed",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      providerRequestIdMasked: maskProviderRequestId(
        modelResult.providerRequestId
      ),
      finishReason: null,
      safeErrorCategory: modelResult.category,
      schemaPassed: false,
      policyPassed: false
    };
  }

  const calls = [...capabilityResult.calls, structuredCall];
  const passed = capabilityCorePassed && structuredCorePassed;
  const report = {
    schemaVersion: "gate-2-6a-live-acceptance@1" as const,
    checkedAt: capabilityResult.capabilities.checkedAt,
    live: true as const,
    provider: "volcengine-ark" as const,
    modelIdHash: capabilityResult.capabilities.modelIdHash,
    status: passed ? ("passed" as const) : ("failed" as const),
    capabilities: {
      imageUrlStatus:
        capabilityResult.capabilities.imageUrlStatus,
      jsonObjectStatus:
        capabilityResult.capabilities.jsonObjectStatus,
      jsonSchemaStatus:
        capabilityResult.capabilities.jsonSchemaStatus,
      functionCallingStatus:
        capabilityResult.capabilities.functionCallingStatus,
      streamingStatus:
        capabilityResult.capabilities.streamingStatus,
      reportsUsage: capabilityResult.capabilities.reportsUsage,
      reportsRequestId:
        capabilityResult.capabilities.reportsRequestId,
      reportedModelMatches:
        capabilityResult.capabilities.reportedModelMatches
    },
    calls,
    totals: aggregateSafeLiveCalls(calls)
  };
  const reportPath = await writeSafeLiveAcceptanceReport(report);
  const safeSummary = {
    status: report.status,
    live: true,
    strictLiveMode: true,
    provider: "volcengine-ark",
    modelDisplayName: settings.ark.modelDisplayName,
    modelId: settings.ark.modelId,
    baseUrl: settings.ark.baseUrl,
    onlineInference: true,
    mockFallback: false,
    checkedAt: report.checkedAt,
    capabilities: report.capabilities,
    calls: report.calls,
    totals: report.totals,
    safeReportPath: reportPath
  };
  process.stdout.write(`${JSON.stringify(safeSummary, null, 2)}\n`);
  if (!passed) {
    throw new Error(
      "Strict Live Acceptance probe failed its local capability or structured-output checks. See the safe report; no Mock/Fake fallback occurred."
    );
  }
} finally {
  await product.close();
}

function loadLocalEnvironmentWithoutDisplayingIt(): void {
  const rootEnvironmentPath = fileURLToPath(
    new URL("../../../../.env.local", import.meta.url)
  );
  if (existsSync(rootEnvironmentPath)) {
    loadEnvFile(rootEnvironmentPath);
  }
  if (
    !process.env.POSTGRES_HOST &&
    !process.env.POSTGRES_APP_PASSWORD
  ) {
    const localPostgresEnvironmentPath = fileURLToPath(
      new URL(
        "../../../../environments/local/postgres/.env.local",
        import.meta.url
      )
    );
    if (existsSync(localPostgresEnvironmentPath)) {
      loadEnvFile(localPostgresEnvironmentPath);
    }
  }
}

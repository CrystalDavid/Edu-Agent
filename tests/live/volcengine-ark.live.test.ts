import {
  beforeAll,
  describe,
  expect,
  it
} from "vitest";

import {
  createSyntheticLiveModelRequest
} from "../../apps/api/src/composition/synthetic-live-model-request.js";
import {
  validateModelOutput
} from "../../apps/api/src/modules/capability-integration/application/model-output-validation.js";
import {
  ProviderCapabilityProbe,
  type ProviderCapabilityProbeResult
} from "../../apps/api/src/modules/capability-integration/application/provider-capability-probe.js";
import {
  readModelProviderSettings
} from "../../apps/api/src/modules/capability-integration/infrastructure/model-provider-config.js";
import {
  VolcengineArkProvider
} from "../../apps/api/src/modules/capability-integration/infrastructure/volcengine-ark-provider.js";

const strictLiveEnabled =
  process.env.ENABLE_LIVE_MODEL_TESTS === "true" &&
  process.env.MODEL_PROVIDER_MODE === "ark" &&
  process.env.ARK_LIVE_STRICT === "true";

if (
  process.env.ENABLE_LIVE_MODEL_TESTS === "true" &&
  !strictLiveEnabled
) {
  throw new Error(
    "Live tests require ARK_LIVE_STRICT=true and MODEL_PROVIDER_MODE=ark; fallback and partial enablement are forbidden."
  );
}

describe.skipIf(!strictLiveEnabled)(
  "Volcengine Ark strict live synthetic integration",
  () => {
    const settings = readModelProviderSettings();
    if (
      !settings.ark ||
      settings.activeProvider !== "volcengine-ark" ||
      settings.availability.fallbackToMock ||
      !settings.liveStrict
    ) {
      throw new Error(
        "Strict Live Ark test requires a complete Volcengine Ark configuration with no fallback."
      );
    }
    const provider = new VolcengineArkProvider(settings.ark);
    let probeResult: ProviderCapabilityProbeResult;

    beforeAll(async () => {
      probeResult = await new ProviderCapabilityProbe(
        provider,
        () => new Date(),
        { live: true }
      ).runDetailed();
    });

    it("authenticates against Ark and records live capability evidence", () => {
      const summary = probeResult.capabilities;
      const textCall = probeResult.calls.find(
        (call) => call.probe === "text"
      );
      expect(summary).toMatchObject({
        provider: "volcengine-ark",
        live: true,
        supportsText: true,
        reportsUsage: true,
        reportsRequestId: true,
        reportedModelMatches: true
      });
      expect(summary.modelIdHash).toHaveLength(64);
      expect(textCall).toMatchObject({
        status: "succeeded",
        capabilityStatus: "supported",
        schemaPassed: true
      });
      expect(textCall?.inputTokens).toBeGreaterThan(0);
      expect(textCall?.outputTokens).toBeGreaterThan(0);
      expect(textCall?.latencyMs).toBeGreaterThan(0);
      expect(textCall?.providerRequestIdMasked).toBeTruthy();
      for (const status of [
        summary.imageUrlStatus,
        summary.jsonObjectStatus,
        summary.jsonSchemaStatus,
        summary.functionCallingStatus,
        summary.streamingStatus
      ]) {
        expect([
          "supported",
          "unsupported",
          "partially_supported",
          "not_tested"
        ]).toContain(status);
      }
    });

    it("returns a validated Chinese lesson-preparation candidate without approving it", async () => {
      const responseFormat = probeResult.capabilities
        .supportsJsonSchema
        ? "json_schema"
        : probeResult.capabilities.supportsJsonObject
          ? "json_object"
          : "prompt_json";
      const request = createSyntheticLiveModelRequest(
        responseFormat
      );
      const result = await provider.invoke(request);
      expect(result.status).toBe("succeeded");
      if (result.status !== "succeeded") return;
      expect(result.provider).toBe("volcengine-ark");
      expect(result.modelId).toBe(settings.ark?.modelId);
      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.outputTokens).toBeGreaterThan(0);
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.providerRequestId).toBeTruthy();
      const validation = validateModelOutput({
        outputText: result.outputText,
        request
      });
      expect(validation.valid).toBe(true);
      if (!validation.valid) return;
      expect(validation.strategies.length).toBeGreaterThan(0);
      expect(
        validation.output.suggestions.every(
          (suggestion) =>
            suggestion.knownGaps.length > 0 &&
            suggestion.uncertaintyNote.length > 0
        )
      ).toBe(true);
      expect(JSON.stringify(validation.output)).not.toMatch(
        /"state"\s*:\s*"approved"/u
      );
    });
  }
);

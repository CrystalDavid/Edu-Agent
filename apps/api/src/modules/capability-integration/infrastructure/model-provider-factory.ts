import type { ModelProvider } from "../domain/capability.js";
import type { ModelProviderSettings } from "./model-provider-config.js";
import { MockModelProvider } from "./mock-model-provider.js";
import { ProviderCapabilityProbe } from "./provider-capability-probe.js";
import { VolcengineArkProvider } from "./volcengine-ark-provider.js";

export function createConfiguredModelProvider(
  settings: ModelProviderSettings
): ModelProvider {
  if (
    settings.activeProvider === "volcengine-ark" &&
    settings.ark
  ) {
    return new VolcengineArkProvider(settings.ark);
  }
  return new MockModelProvider();
}

export function createConfiguredProviderCapabilityProbe(
  provider: ModelProvider,
  clock: () => Date,
  options: { live?: boolean } = {}
): ProviderCapabilityProbe | null {
  if (!(provider instanceof VolcengineArkProvider)) return null;
  return new ProviderCapabilityProbe(provider, clock, options);
}

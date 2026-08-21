import { describe, expect, it } from "vitest";

import { readMemoryTemporaryOverridesSettings } from "../../apps/api/src/modules/agent-runtime-context/infrastructure/memory-temporary-overrides-config.js";

describe("temporary override feature flag", () => {
  it("defaults on locally and off in production", () => {
    expect(readMemoryTemporaryOverridesSettings({ NODE_ENV: "test" }).enabled)
      .toBe(true);
    expect(readMemoryTemporaryOverridesSettings({ NODE_ENV: "production" }).enabled)
      .toBe(false);
  });

  it("uses the explicit server value without exposing a secret", () => {
    expect(readMemoryTemporaryOverridesSettings({
      NODE_ENV: "production",
      MEMORY_TEMPORARY_OVERRIDES_ENABLED: "true"
    })).toEqual({
      enabled: true,
      policyVersion: "temporary-preference-override-policy@1"
    });
    expect(readMemoryTemporaryOverridesSettings({
      NODE_ENV: "test",
      MEMORY_TEMPORARY_OVERRIDES_ENABLED: "false"
    }).enabled).toBe(false);
  });
});

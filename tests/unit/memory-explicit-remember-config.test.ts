import { describe, expect, it } from "vitest";

import {
  readMemoryExplicitRememberSettings
} from "../../apps/api/src/modules/personalization-memory-analytics/infrastructure/memory-explicit-remember-config.js";

describe("MEMORY_EXPLICIT_REMEMBER_ENABLED", () => {
  it("defaults on for local/test and fail-closed for production", () => {
    expect(readMemoryExplicitRememberSettings({ NODE_ENV: "test" }).enabled)
      .toBe(true);
    expect(readMemoryExplicitRememberSettings({ NODE_ENV: "development" }).enabled)
      .toBe(true);
    expect(readMemoryExplicitRememberSettings({ NODE_ENV: "production" }).enabled)
      .toBe(false);
  });

  it("honors an explicit server-side setting", () => {
    expect(readMemoryExplicitRememberSettings({
      NODE_ENV: "production",
      MEMORY_EXPLICIT_REMEMBER_ENABLED: "true"
    }).enabled).toBe(true);
    expect(readMemoryExplicitRememberSettings({
      NODE_ENV: "test",
      MEMORY_EXPLICIT_REMEMBER_ENABLED: "false"
    }).enabled).toBe(false);
  });
});

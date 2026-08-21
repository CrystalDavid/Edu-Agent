import { describe, expect, it } from "vitest";

import {
  readMemoryExplicitForgetSettings
} from "../../apps/api/src/modules/personalization-memory-analytics/infrastructure/memory-explicit-forget-config.js";

describe("MEMORY_EXPLICIT_FORGET_ENABLED", () => {
  it("defaults on for local/test and fail-closed for production", () => {
    expect(readMemoryExplicitForgetSettings({ NODE_ENV: "test" }).enabled)
      .toBe(true);
    expect(readMemoryExplicitForgetSettings({ NODE_ENV: "development" }).enabled)
      .toBe(true);
    expect(readMemoryExplicitForgetSettings({ NODE_ENV: "production" }).enabled)
      .toBe(false);
  });

  it("honors an explicit server-side setting independently", () => {
    expect(readMemoryExplicitForgetSettings({
      NODE_ENV: "production",
      MEMORY_EXPLICIT_FORGET_ENABLED: "true"
    }).enabled).toBe(true);
    expect(readMemoryExplicitForgetSettings({
      NODE_ENV: "test",
      MEMORY_EXPLICIT_FORGET_ENABLED: "false"
    }).enabled).toBe(false);
  });
});

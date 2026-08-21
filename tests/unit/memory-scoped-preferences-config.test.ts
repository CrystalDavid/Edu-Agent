import { describe, expect, it } from "vitest";

import {
  readMemoryScopedPreferencesSettings
} from "../../apps/api/src/modules/personalization-memory-analytics/infrastructure/memory-scoped-preferences-config.js";

describe("MEMORY_SCOPED_PREFERENCES_ENABLED", () => {
  it("defaults on for local/test and fail-closed for production", () => {
    expect(readMemoryScopedPreferencesSettings({ NODE_ENV: "test" }).enabled)
      .toBe(true);
    expect(readMemoryScopedPreferencesSettings({ NODE_ENV: "development" }).enabled)
      .toBe(true);
    expect(readMemoryScopedPreferencesSettings({ NODE_ENV: "production" }).enabled)
      .toBe(false);
  });

  it("honors an explicit server-side setting", () => {
    expect(readMemoryScopedPreferencesSettings({
      NODE_ENV: "production",
      MEMORY_SCOPED_PREFERENCES_ENABLED: "true"
    }).enabled).toBe(true);
    expect(readMemoryScopedPreferencesSettings({
      NODE_ENV: "test",
      MEMORY_SCOPED_PREFERENCES_ENABLED: "false"
    }).enabled).toBe(false);
  });
});

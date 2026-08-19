import { describe, expect, it } from "vitest";

import {
  readMemoryApplicationObservabilitySettings
} from "../../apps/api/src/modules/personalization-memory-analytics/infrastructure/memory-application-observability-config.js";

describe("memory application observability configuration", () => {
  it("defaults local and test environments on while production fails closed", () => {
    expect(readMemoryApplicationObservabilitySettings({
      NODE_ENV: "test"
    })).toMatchObject({
      enabled: true,
      retentionDurationMilliseconds: 365 * 24 * 60 * 60 * 1000,
      policyVersion: "memory-application-observability@1",
      retentionPolicyVersion: "memory-application-retention@1"
    });
    expect(readMemoryApplicationObservabilitySettings({
      NODE_ENV: "production"
    }).enabled).toBe(false);
  });

  it("supports an explicit feature flag and positive retention duration", () => {
    expect(readMemoryApplicationObservabilitySettings({
      NODE_ENV: "production",
      MEMORY_APPLICATION_OBSERVABILITY_ENABLED: "true",
      MEMORY_APPLICATION_RETENTION_DAYS: "30"
    })).toMatchObject({
      enabled: true,
      retentionDurationMilliseconds: 30 * 24 * 60 * 60 * 1000
    });
    expect(readMemoryApplicationObservabilitySettings({
      NODE_ENV: "development",
      MEMORY_APPLICATION_OBSERVABILITY_ENABLED: "false"
    }).enabled).toBe(false);
  });

  it("rejects invalid flags and retention windows", () => {
    for (const environment of [
      { MEMORY_APPLICATION_OBSERVABILITY_ENABLED: "yes" },
      { MEMORY_APPLICATION_RETENTION_DAYS: "0" },
      { MEMORY_APPLICATION_RETENTION_DAYS: "1.5" }
    ]) {
      expect(() =>
        readMemoryApplicationObservabilitySettings(environment)
      ).toThrow();
    }
  });
});

import { describe, expect, it } from "vitest";

import {
  readMemoryApplicationObservabilitySettings
} from "../../apps/api/src/modules/personalization-memory-analytics/infrastructure/memory-application-observability-config.js";

describe("memory application observability configuration", () => {
  it.each([
    ["production", undefined, false],
    [undefined, "production", false],
    ["production", "test", false],
    ["test", "production", false],
    ["local", "development", true],
    ["test", "test", true]
  ] as const)(
    "defaults APP_ENV=%s and NODE_ENV=%s to collectionEnabled=%s",
    (appEnvironment, nodeEnvironment, expected) => {
      expect(readMemoryApplicationObservabilitySettings({
        ...(appEnvironment ? { APP_ENV: appEnvironment } : {}),
        ...(nodeEnvironment ? { NODE_ENV: nodeEnvironment } : {})
      }).collectionEnabled).toBe(expected);
    }
  );

  it("keeps local defaults and retention metadata explicit", () => {
    expect(readMemoryApplicationObservabilitySettings({
      APP_ENV: "test",
      NODE_ENV: "test"
    })).toMatchObject({
      collectionEnabled: true,
      retentionDurationMilliseconds: 365 * 24 * 60 * 60 * 1000,
      policyVersion: "memory-application-observability@1",
      retentionPolicyVersion: "memory-application-retention@1"
    });
  });

  it("allows only explicit true to enable production collection", () => {
    expect(readMemoryApplicationObservabilitySettings({
      APP_ENV: "production",
      NODE_ENV: "production",
      MEMORY_APPLICATION_OBSERVABILITY_ENABLED: "true",
      MEMORY_APPLICATION_RETENTION_DAYS: "30"
    })).toMatchObject({
      collectionEnabled: true,
      retentionDurationMilliseconds: 30 * 24 * 60 * 60 * 1000
    });
    expect(readMemoryApplicationObservabilitySettings({
      APP_ENV: "production",
      NODE_ENV: "production",
      MEMORY_APPLICATION_OBSERVABILITY_ENABLED: "false"
    }).collectionEnabled).toBe(false);
  });

  it("rejects invalid flags instead of interpreting them as enabled", () => {
    expect(() => readMemoryApplicationObservabilitySettings({
      APP_ENV: "production",
      MEMORY_APPLICATION_OBSERVABILITY_ENABLED: "yes"
    })).toThrow();
  });

  it("rejects invalid retention windows", () => {
    for (const environment of [
      { MEMORY_APPLICATION_RETENTION_DAYS: "0" },
      { MEMORY_APPLICATION_RETENTION_DAYS: "1.5" }
    ]) {
      expect(() =>
        readMemoryApplicationObservabilitySettings(environment)
      ).toThrow();
    }
  });
});

import { z } from "zod";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

const MemoryApplicationObservabilityEnvironmentSchema = z.object({
  NODE_ENV: z.string().optional(),
  APP_ENV: z.string().optional(),
  MEMORY_APPLICATION_OBSERVABILITY_ENABLED: z
    .enum(["true", "false"])
    .optional(),
  MEMORY_APPLICATION_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(365)
});

export interface MemoryApplicationObservabilitySettings {
  readonly collectionEnabled: boolean;
  readonly retentionDurationMilliseconds: number;
  readonly policyVersion: "memory-application-observability@1";
  readonly retentionPolicyVersion: "memory-application-retention@1";
}

export function readMemoryApplicationObservabilitySettings(
  environment: NodeJS.ProcessEnv = process.env
): MemoryApplicationObservabilitySettings {
  const parsed = MemoryApplicationObservabilityEnvironmentSchema.parse(
    environment
  );
  const production =
    parsed.NODE_ENV === "production" || parsed.APP_ENV === "production";
  const collectionEnabled =
    parsed.MEMORY_APPLICATION_OBSERVABILITY_ENABLED === undefined
    ? !production
    : parsed.MEMORY_APPLICATION_OBSERVABILITY_ENABLED === "true";
  return Object.freeze({
    collectionEnabled,
    retentionDurationMilliseconds:
      parsed.MEMORY_APPLICATION_RETENTION_DAYS * millisecondsPerDay,
    policyVersion: "memory-application-observability@1",
    retentionPolicyVersion: "memory-application-retention@1"
  });
}

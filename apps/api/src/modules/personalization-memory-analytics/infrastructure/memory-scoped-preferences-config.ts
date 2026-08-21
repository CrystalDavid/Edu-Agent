import { z } from "zod";

const MemoryScopedPreferencesEnvironmentSchema = z.object({
  NODE_ENV: z.string().optional(),
  APP_ENV: z.string().optional(),
  MEMORY_SCOPED_PREFERENCES_ENABLED: z.enum(["true", "false"]).optional()
});

export interface MemoryScopedPreferencesSettings {
  readonly enabled: boolean;
  readonly policyVersion: "teacher-preference-scope@1";
}

export function readMemoryScopedPreferencesSettings(
  environment: NodeJS.ProcessEnv = process.env
): MemoryScopedPreferencesSettings {
  const parsed = MemoryScopedPreferencesEnvironmentSchema.parse(environment);
  const production =
    parsed.NODE_ENV === "production" || parsed.APP_ENV === "production";
  return Object.freeze({
    enabled: parsed.MEMORY_SCOPED_PREFERENCES_ENABLED === undefined
      ? !production
      : parsed.MEMORY_SCOPED_PREFERENCES_ENABLED === "true",
    policyVersion: "teacher-preference-scope@1"
  });
}

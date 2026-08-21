import { z } from "zod";

const MemoryTemporaryOverridesEnvironmentSchema = z.object({
  NODE_ENV: z.string().optional(),
  APP_ENV: z.string().optional(),
  MEMORY_TEMPORARY_OVERRIDES_ENABLED: z.enum(["true", "false"]).optional()
});

export interface MemoryTemporaryOverridesSettings {
  readonly enabled: boolean;
  readonly policyVersion: "temporary-preference-override-policy@1";
}

export function readMemoryTemporaryOverridesSettings(
  environment: NodeJS.ProcessEnv = process.env
): MemoryTemporaryOverridesSettings {
  const parsed = MemoryTemporaryOverridesEnvironmentSchema.parse(environment);
  const production =
    parsed.NODE_ENV === "production" || parsed.APP_ENV === "production";
  return Object.freeze({
    enabled: parsed.MEMORY_TEMPORARY_OVERRIDES_ENABLED === undefined
      ? !production
      : parsed.MEMORY_TEMPORARY_OVERRIDES_ENABLED === "true",
    policyVersion: "temporary-preference-override-policy@1"
  });
}

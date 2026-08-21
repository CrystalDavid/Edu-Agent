import { z } from "zod";

const MemoryExplicitRememberEnvironmentSchema = z.object({
  NODE_ENV: z.string().optional(),
  APP_ENV: z.string().optional(),
  MEMORY_EXPLICIT_REMEMBER_ENABLED: z.enum(["true", "false"]).optional()
});

export interface MemoryExplicitRememberSettings {
  readonly enabled: boolean;
  readonly policyVersion: "explicit-memory-command-policy@1";
}

export function readMemoryExplicitRememberSettings(
  environment: NodeJS.ProcessEnv = process.env
): MemoryExplicitRememberSettings {
  const parsed = MemoryExplicitRememberEnvironmentSchema.parse(environment);
  const production =
    parsed.NODE_ENV === "production" || parsed.APP_ENV === "production";
  return Object.freeze({
    enabled: parsed.MEMORY_EXPLICIT_REMEMBER_ENABLED === undefined
      ? !production
      : parsed.MEMORY_EXPLICIT_REMEMBER_ENABLED === "true",
    policyVersion: "explicit-memory-command-policy@1"
  });
}

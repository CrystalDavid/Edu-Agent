import { z } from "zod";

const MemoryExplicitForgetEnvironmentSchema = z.object({
  NODE_ENV: z.string().optional(),
  APP_ENV: z.string().optional(),
  MEMORY_EXPLICIT_FORGET_ENABLED: z.enum(["true", "false"]).optional()
});

export interface MemoryExplicitForgetSettings {
  readonly enabled: boolean;
  readonly policyVersion: "explicit-forget-command-policy@1";
}

export function readMemoryExplicitForgetSettings(
  environment: NodeJS.ProcessEnv = process.env
): MemoryExplicitForgetSettings {
  const parsed = MemoryExplicitForgetEnvironmentSchema.parse(environment);
  const production =
    parsed.NODE_ENV === "production" || parsed.APP_ENV === "production";
  return Object.freeze({
    enabled: parsed.MEMORY_EXPLICIT_FORGET_ENABLED === undefined
      ? !production
      : parsed.MEMORY_EXPLICIT_FORGET_ENABLED === "true",
    policyVersion: "explicit-forget-command-policy@1"
  });
}

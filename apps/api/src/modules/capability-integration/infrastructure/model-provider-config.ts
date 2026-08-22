import { z } from "zod";

import {
  ProviderAvailabilitySchema,
  type ProviderAvailability
} from "@edu-agent/contracts";
import type {
  ModelBudgetConfig
} from "../application/model-budget-policy.js";

const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const nonnegativeNumber = (fallback: number) =>
  z.coerce.number().nonnegative().default(fallback);

const booleanFromEnvironment = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const strictLiveArkBaseUrl =
  "https://ark.cn-beijing.volces.com/api/v3";
const strictLiveArkModelId =
  "doubao-seed-2-1-turbo-260628";
const strictLiveArkModelDisplayName =
  "Doubao-Seed-2.1-turbo-260628";

const RawModelEnvironmentSchema = z.object({
  APP_ENV: z
    .enum(["local", "demo", "test", "production"])
    .default("local"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .optional(),
  MODEL_PROVIDER_MODE: z.enum(["mock", "ark"]).default("mock"),
  ARK_BASE_URL: z.string().trim().default(""),
  ARK_API_KEY: z.string().trim().default(""),
  ARK_MODEL_ID: z.string().trim().default(""),
  ARK_MODEL_DISPLAY_NAME: z.string().trim().default(""),
  ARK_API_MODE: z
    .literal("chat_completions")
    .default("chat_completions"),
  ENABLE_LIVE_MODEL_TESTS: booleanFromEnvironment,
  ARK_LIVE_STRICT: booleanFromEnvironment,
  MODEL_REQUEST_TIMEOUT_MS: positiveInteger(120_000),
  MODEL_MAX_OUTPUT_TOKENS: positiveInteger(8_192),
  MODEL_MAX_RETRIES: positiveInteger(2),
  MODEL_DEBUG_CONTENT: booleanFromEnvironment,
  MODEL_MAX_INPUT_TOKENS: positiveInteger(32_768),
  MODEL_MAX_SINGLE_COST: nonnegativeNumber(10),
  MODEL_DAILY_BUDGET: nonnegativeNumber(100),
  MODEL_TEACHER_DAILY_BUDGET: nonnegativeNumber(20),
  MODEL_MAX_CONCURRENCY: positiveInteger(2),
  MODEL_MAX_QUEUE_WAIT_MS: positiveInteger(300_000),
  ARK_INPUT_PRICE_PER_MILLION: nonnegativeNumber(0),
  ARK_OUTPUT_PRICE_PER_MILLION: nonnegativeNumber(0)
});

export interface VolcengineArkConfig {
  provider: "volcengine-ark";
  baseUrl: string;
  apiKey: string;
  modelId: string;
  modelDisplayName: string;
  apiMode: "chat_completions";
  timeoutMs: number;
  maxOutputTokens: number;
  maxAttempts: number;
}

export interface ModelProviderSettings {
  appEnvironment: "local" | "demo" | "test" | "production";
  requestedMode: "mock" | "ark";
  activeProvider: "mock" | "volcengine-ark";
  ark?: VolcengineArkConfig;
  budget: ModelBudgetConfig;
  debugContent: boolean;
  liveTestsEnabled: boolean;
  liveStrict: boolean;
  availability: ProviderAvailability;
}

function isPlaceholderSecret(value: string): boolean {
  return [
    "",
    "change-me",
    "your-api-key",
    "placeholder",
    "<ark-api-key>"
  ].includes(value.toLowerCase());
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function validArkBaseUrl(
  value: string,
  appEnvironment: ModelProviderSettings["appEnvironment"]
): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:") return true;
    return (
      parsed.protocol === "http:" &&
      appEnvironment !== "production" &&
      ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function readModelProviderSettings(
  environment: NodeJS.ProcessEnv = process.env
): ModelProviderSettings {
  const raw = RawModelEnvironmentSchema.parse(environment);
  const appEnvironment =
    raw.NODE_ENV === "production" ? "production" : raw.APP_ENV;

  if (
    raw.MODEL_DEBUG_CONTENT &&
    !["local", "demo"].includes(appEnvironment)
  ) {
    throw new Error(
      "MODEL_DEBUG_CONTENT is only allowed in APP_ENV=local/demo."
    );
  }
  if (appEnvironment === "production" && raw.MODEL_PROVIDER_MODE !== "ark") {
    throw new Error(
      "Production requires MODEL_PROVIDER_MODE=ark; Mock is not a production provider."
    );
  }
  if (raw.MODEL_MAX_RETRIES > 5) {
    throw new Error("MODEL_MAX_RETRIES must not exceed 5.");
  }

  const normalizedBaseUrl = normalizeBaseUrl(raw.ARK_BASE_URL);
  const missing: string[] = [];
  if (!normalizedBaseUrl) missing.push("ARK_BASE_URL");
  if (isPlaceholderSecret(raw.ARK_API_KEY)) missing.push("ARK_API_KEY");
  if (!raw.ARK_MODEL_ID) missing.push("ARK_MODEL_ID");
  if (!raw.ARK_MODEL_DISPLAY_NAME) {
    missing.push("ARK_MODEL_DISPLAY_NAME");
  }
  if (
    normalizedBaseUrl &&
    !validArkBaseUrl(normalizedBaseUrl, appEnvironment)
  ) {
    missing.push("valid ARK_BASE_URL");
  }

  const arkConfigured = missing.length === 0;
  if (raw.ARK_LIVE_STRICT) {
    if (!raw.ENABLE_LIVE_MODEL_TESTS) {
      throw new Error(
        "ARK_LIVE_STRICT requires ENABLE_LIVE_MODEL_TESTS=true."
      );
    }
    if (raw.MODEL_PROVIDER_MODE !== "ark") {
      throw new Error(
        "ARK_LIVE_STRICT requires MODEL_PROVIDER_MODE=ark."
      );
    }
    if (!arkConfigured) {
      throw new Error(
        `Strict Ark live configuration is incomplete: ${missing.join(", ")}. Mock fallback is forbidden.`
      );
    }
    if (normalizedBaseUrl !== strictLiveArkBaseUrl) {
      throw new Error(
        "ARK_LIVE_STRICT forbids Fake or alternate Ark base URLs."
      );
    }
    if (raw.ARK_MODEL_ID !== strictLiveArkModelId) {
      throw new Error(
        "ARK_LIVE_STRICT requires the approved Ark model ID."
      );
    }
    if (
      raw.ARK_MODEL_DISPLAY_NAME !==
      strictLiveArkModelDisplayName
    ) {
      throw new Error(
        "ARK_LIVE_STRICT requires the approved Ark model display name."
      );
    }
  }
  if (
    appEnvironment === "production" &&
    raw.MODEL_PROVIDER_MODE === "ark" &&
    !arkConfigured
  ) {
    throw new Error(
      `Ark production configuration is incomplete: ${missing.join(", ")}.`
    );
  }

  const activeProvider =
    raw.MODEL_PROVIDER_MODE === "ark" && arkConfigured
      ? ("volcengine-ark" as const)
      : ("mock" as const);
  const modelDisplayName =
    activeProvider === "volcengine-ark"
      ? raw.ARK_MODEL_DISPLAY_NAME
      : "Deterministic MockModelProvider";
  const safeReason =
    raw.MODEL_PROVIDER_MODE === "ark" && !arkConfigured
      ? "在线生成服务暂不可用，当前使用内置教学助手。"
      : null;
  const availability = ProviderAvailabilitySchema.parse({
    requestedMode: raw.MODEL_PROVIDER_MODE,
    activeProvider,
    configured:
      raw.MODEL_PROVIDER_MODE === "mock" || arkConfigured,
    available: true,
    fallbackToMock:
      raw.MODEL_PROVIDER_MODE === "ark" && !arkConfigured,
    modelDisplayName,
    apiMode: raw.ARK_API_MODE,
    liveTestsEnabled: raw.ENABLE_LIVE_MODEL_TESTS,
    safeReason
  });

  const ark: VolcengineArkConfig | undefined = arkConfigured
    ? {
        provider: "volcengine-ark",
        baseUrl: normalizedBaseUrl,
        apiKey: raw.ARK_API_KEY,
        modelId: raw.ARK_MODEL_ID,
        modelDisplayName: raw.ARK_MODEL_DISPLAY_NAME,
        apiMode: raw.ARK_API_MODE,
        timeoutMs: raw.MODEL_REQUEST_TIMEOUT_MS,
        maxOutputTokens: raw.MODEL_MAX_OUTPUT_TOKENS,
        maxAttempts: raw.MODEL_MAX_RETRIES
      }
    : undefined;

  return {
    appEnvironment,
    requestedMode: raw.MODEL_PROVIDER_MODE,
    activeProvider,
    ...(ark ? { ark } : {}),
    budget: {
      maxInputTokens: raw.MODEL_MAX_INPUT_TOKENS,
      maxOutputTokens: raw.MODEL_MAX_OUTPUT_TOKENS,
      maxSingleCost: raw.MODEL_MAX_SINGLE_COST,
      dailyBudget: raw.MODEL_DAILY_BUDGET,
      teacherDailyBudget: raw.MODEL_TEACHER_DAILY_BUDGET,
      maxConcurrency: raw.MODEL_MAX_CONCURRENCY,
      maxQueueWaitMs: raw.MODEL_MAX_QUEUE_WAIT_MS,
      inputPricePerMillion: raw.ARK_INPUT_PRICE_PER_MILLION,
      outputPricePerMillion: raw.ARK_OUTPUT_PRICE_PER_MILLION,
      allowedModelIds:
        activeProvider === "volcengine-ark" && ark
          ? [ark.modelId]
          : ["mock"]
    },
    debugContent: raw.MODEL_DEBUG_CONTENT,
    liveTestsEnabled: raw.ENABLE_LIVE_MODEL_TESTS,
    liveStrict: raw.ARK_LIVE_STRICT,
    availability
  };
}

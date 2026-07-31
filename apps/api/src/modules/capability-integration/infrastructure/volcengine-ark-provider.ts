import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam
} from "openai/resources/chat/completions";

import {
  ModelRequestSchemaV2,
  ModelResultSchema,
  type ModelFailureCategory,
  type ModelRequestV2,
  type ModelResult
} from "@edu-agent/contracts";

import type {
  CapabilityDescriptor,
  ExecutionContract,
  GovernanceProfile,
  ModelProvider
} from "../domain/capability.js";
import type {
  VolcengineArkConfig
} from "./model-provider-config.js";

export const teacherSuggestionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "suggestions"],
  properties: {
    schemaVersion: {
      type: "string",
      const: "teacher-copilot-suggestions@1"
    },
    suggestions: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "strategyId",
          "title",
          "summary",
          "rationale",
          "evidenceRefs",
          "knownGaps",
          "applicability",
          "unsuitableConditions",
          "teachingMoves",
          "proposedPlanChanges",
          "followUpEvidence",
          "uncertaintyNote",
          "courseRunRef",
          "lessonRef",
          "learningObjectiveRefs"
        ],
        properties: {
          strategyId: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          rationale: { type: "string" },
          evidenceRefs: {
            type: "array",
            items: { type: "string" }
          },
          knownGaps: {
            type: "array",
            items: { type: "string" }
          },
          applicability: { type: "string" },
          unsuitableConditions: {
            type: "array",
            items: { type: "string" }
          },
          teachingMoves: {
            type: "array",
            items: { type: "string" }
          },
          proposedPlanChanges: {
            type: "object",
            additionalProperties: false,
            required: [
              "objective",
              "lessonFocus",
              "openingActivity",
              "teacherQuestions",
              "studentActivity",
              "supportStrategy",
              "independentCheck",
              "followUp",
              "evidenceRefs"
            ],
            properties: {
              objective: { type: "string" },
              lessonFocus: { type: "string" },
              openingActivity: { type: "string" },
              teacherQuestions: {
                type: "array",
                items: { type: "string" }
              },
              studentActivity: { type: "string" },
              supportStrategy: { type: "string" },
              independentCheck: { type: "string" },
              followUp: { type: "string" },
              evidenceRefs: {
                type: "array",
                items: { type: "string" }
              }
            }
          },
          followUpEvidence: {
            type: "array",
            items: { type: "string" }
          },
          uncertaintyNote: { type: "string" },
          courseRunRef: { type: "string" },
          lessonRef: { type: "string" },
          learningObjectiveRefs: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }
} as const;

interface VolcengineArkProviderDependencies {
  client?: OpenAI;
  clock?: () => number;
}

type ArkChatCompletionCreateParams =
  ChatCompletionCreateParamsNonStreaming & {
    thinking: {
      type: "disabled";
    };
  };

export class VolcengineArkProvider implements ModelProvider {
  readonly descriptor: CapabilityDescriptor = {
    capabilityRef: "capability:model:volcengine-ark",
    name: "VolcengineArkProvider",
    kind: "model",
    description:
      "Server-only Volcengine Ark OpenAI-compatible Chat Completions adapter."
  };

  readonly executionContract: ExecutionContract = {
    contractRef: "execution-contract:model:volcengine-ark@1",
    inputSchemaRef: "ModelRequestSchemaV2@1",
    outputSchemaRef: "ModelResultSchema@1",
    sideEffect: "none",
    idempotent: false,
    preconditions: [
      "validated provider configuration",
      "sealed authorized synthetic context",
      "budget decision allows invocation"
    ],
    postconditions: [
      "safe provider result only",
      "no business state mutation"
    ]
  };

  readonly governanceProfile: GovernanceProfile = {
    profileRef: "governance-profile:model:volcengine-ark@1",
    risk: "read-only",
    requiresAuthorization: true,
    destructive: false,
    maxConcurrency: 2
  };

  private readonly client: OpenAI;
  private readonly clock: () => number;

  constructor(
    readonly config: VolcengineArkConfig,
    dependencies: VolcengineArkProviderDependencies = {}
  ) {
    this.client =
      dependencies.client ??
      new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        timeout: config.timeoutMs,
        maxRetries: 0
      });
    this.clock = dependencies.clock ?? Date.now;
  }

  async invoke(
    rawRequest: ModelRequestV2,
    options: {
      signal?: AbortSignal;
      requestHeaders?: Readonly<Record<string, string>>;
    } = {}
  ): Promise<ModelResult> {
    const request = ModelRequestSchemaV2.parse(rawRequest);
    const startedAt = this.clock();
    try {
      const body: ArkChatCompletionCreateParams = {
        model: this.config.modelId,
        messages: request.messages.map(
          (message): ChatCompletionMessageParam => ({
            role: message.role,
            content: message.content
          })
        ),
        stream: false,
        max_tokens: request.maxOutputTokens,
        // Ark's Seed 2.1 models enable deep thinking by default. The teacher
        // copilot expects a bounded, schema-validated response, so explicitly
        // disable it for the production invocation path. Capability probes stay
        // unmodified so they continue to measure the provider's raw features.
        thinking: {
          type: "disabled"
        },
        ...(request.responseFormat === "json_schema"
          ? {
              response_format: {
                type: "json_schema" as const,
                json_schema: {
                  name: "teacher_copilot_suggestions",
                  strict: true,
                  schema: teacherSuggestionJsonSchema
                }
              }
            }
          : request.responseFormat === "json_object"
            ? {
                response_format: {
                  type: "json_object" as const
                }
              }
            : {})
      };
      const completion = await this.client.chat.completions.create(
        body,
        {
          maxRetries: 0,
          timeout: request.timeoutMs,
          ...(options.signal ? { signal: options.signal } : {}),
          headers: {
            "Idempotency-Key": request.invocationRef,
            ...options.requestHeaders
          }
        }
      );
      if (
        typeof completion !== "object" ||
        completion === null ||
        !Array.isArray(completion.choices)
      ) {
        return ModelResultSchema.parse({
          status: "failed",
          category: "INVALID_PROVIDER_RESPONSE",
          retryable: false,
          safeMessage: "模型服务返回了无法解析的响应。"
        });
      }
      const outputText = completion.choices[0]?.message.content;
      if (typeof outputText !== "string" || outputText.trim() === "") {
        return ModelResultSchema.parse({
          status: "failed",
          category: "INVALID_PROVIDER_RESPONSE",
          retryable: false,
          safeMessage: "模型没有返回可验证的文本内容。",
          providerRequestId: providerRequestId(completion)
        });
      }
      return ModelResultSchema.parse({
        status: "succeeded",
        provider: "volcengine-ark",
        modelId: completion.model || this.config.modelId,
        providerRequestId: providerRequestId(completion),
        outputText,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        latencyMs: Math.max(0, this.clock() - startedAt),
        finishReason: completion.choices[0]?.finish_reason ?? undefined
      });
    } catch (error) {
      return ModelResultSchema.parse(
        classifyArkError(error)
      );
    }
  }

  async createProbeCompletion(input: {
    messages: ChatCompletionMessageParam[];
    stream?: false;
    responseFormat?:
      | { type: "json_object" }
      | {
          type: "json_schema";
          json_schema: {
            name: string;
            strict: boolean;
            schema: Record<string, unknown>;
          };
        };
    tools?: ChatCompletionCreateParamsNonStreaming["tools"];
    signal?: AbortSignal;
    requestHeaders?: Readonly<Record<string, string>>;
  }) {
    return this.client.chat.completions.create(
      {
        model: this.config.modelId,
        messages: input.messages,
        stream: false,
        max_tokens: Math.min(this.config.maxOutputTokens, 512),
        ...(input.responseFormat
          ? { response_format: input.responseFormat }
          : {}),
        ...(input.tools ? { tools: input.tools } : {})
      },
      {
        maxRetries: 0,
        timeout: this.config.timeoutMs,
        ...(input.signal ? { signal: input.signal } : {}),
        headers: {
          ...input.requestHeaders
        }
      }
    );
  }

  async createProbeStream(input: {
    messages: ChatCompletionMessageParam[];
    signal?: AbortSignal;
    requestHeaders?: Readonly<Record<string, string>>;
  }) {
    return this.client.chat.completions.create(
      {
        model: this.config.modelId,
        messages: input.messages,
        stream: true,
        max_tokens: 64
      },
      {
        maxRetries: 0,
        timeout: this.config.timeoutMs,
        ...(input.signal ? { signal: input.signal } : {}),
        headers: {
          ...input.requestHeaders
        }
      }
    );
  }
}

function providerRequestId(value: {
  id?: string;
  _request_id?: string | null;
}): string | undefined {
  return value._request_id ?? value.id ?? undefined;
}

function failedResult(input: {
  category: ModelFailureCategory;
  retryable: boolean;
  safeMessage: string;
  providerRequestId?: string | undefined;
  retryAfterMs?: number | undefined;
}) {
  return {
    status: "failed" as const,
    ...input
  };
}

export function classifyArkError(error: unknown) {
  if (error instanceof OpenAI.APIUserAbortError) {
    return failedResult({
      category: "REQUEST_CANCELLED",
      retryable: false,
      safeMessage: "模型调用已取消。"
    });
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return failedResult({
      category: "REQUEST_TIMED_OUT",
      retryable: true,
      safeMessage: "模型调用超时，可以稍后重试。"
    });
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    const providerId = error.requestID ?? undefined;
    const retryAfterMs = parseRetryAfter(
      error.headers?.get("retry-after") ?? null
    );
    if (status === 401) {
      return failedResult({
        category: "AUTHENTICATION_FAILED",
        retryable: false,
        safeMessage: "模型服务鉴权失败，请检查服务端配置。",
        providerRequestId: providerId
      });
    }
    if (status === 403) {
      return failedResult({
        category: "AUTHORIZATION_FAILED",
        retryable: false,
        safeMessage: "模型服务拒绝了当前调用权限。",
        providerRequestId: providerId
      });
    }
    if (status === 404) {
      return failedResult({
        category: "MODEL_NOT_FOUND",
        retryable: false,
        safeMessage: "配置的模型调用标识不可用。",
        providerRequestId: providerId
      });
    }
    if (status === 429) {
      return failedResult({
        category: "RATE_LIMITED",
        retryable: true,
        safeMessage: "模型服务当前限流，可以稍后重试。",
        providerRequestId: providerId,
        ...(retryAfterMs !== undefined
          ? { retryAfterMs }
          : {})
      });
    }
    if (status !== undefined && status >= 500) {
      return failedResult({
        category: "PROVIDER_UNAVAILABLE",
        retryable: true,
        safeMessage: "模型服务暂时不可用，可以稍后重试。",
        providerRequestId: providerId,
        ...(retryAfterMs !== undefined
          ? { retryAfterMs }
          : {})
      });
    }
    if (status === 400 || status === 422) {
      return failedResult({
        category: "INVALID_PROVIDER_RESPONSE",
        retryable: false,
        safeMessage: "模型请求或响应不符合当前 Provider 契约。",
        providerRequestId: providerId
      });
    }
    if (error instanceof OpenAI.APIConnectionError) {
      return failedResult({
        category: "PROVIDER_UNAVAILABLE",
        retryable: true,
        safeMessage: "暂时无法连接模型服务，可以稍后重试。",
        providerRequestId: providerId
      });
    }
  }
  if (
    error instanceof Error &&
    /abort|cancel/i.test(error.name + error.message)
  ) {
    return failedResult({
      category: "REQUEST_CANCELLED",
      retryable: false,
      safeMessage: "模型调用已取消。"
    });
  }
  if (
    error instanceof SyntaxError ||
    (error instanceof Error &&
      /(?:json|unexpected token|content[- ]type)/i.test(
        error.name + error.message
      ))
  ) {
    return failedResult({
      category: "INVALID_PROVIDER_RESPONSE",
      retryable: false,
      safeMessage: "模型服务返回了无法解析的响应。"
    });
  }
  return failedResult({
    category: "UNKNOWN_PROVIDER_ERROR",
    retryable: false,
    safeMessage: "模型服务返回了未分类的安全错误。"
  });
}

function parseRetryAfter(
  value: string | null
): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return Math.max(0, timestamp - Date.now());
}

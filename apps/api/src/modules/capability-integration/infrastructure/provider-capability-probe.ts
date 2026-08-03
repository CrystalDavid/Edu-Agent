import { createHash } from "node:crypto";

import {
  ProviderCapabilitiesSchema,
  type ProviderCapabilities,
  type ProviderCapabilitySupportStatus
} from "@edu-agent/contracts";
import { z } from "zod";

import type {
  ProviderCapabilityProbeName,
  ProviderCapabilityProbeResult,
  SafeProviderCapabilityProbeCall
} from "../application/provider-capability.js";
import {
  maskProviderRequestId
} from "../application/safe-model-logging.js";
import {
  classifyArkError,
  VolcengineArkProvider
} from "./volcengine-ark-provider.js";

export type {
  ProviderCapabilityProbeName,
  ProviderCapabilityProbeResult,
  SafeProviderCapabilityProbeCall
} from "../application/provider-capability.js";

export const SYNTHETIC_PUBLIC_TEST_IMAGE_URL =
  "https://ark-project.tos-cn-beijing.volces.com/images/view.jpeg";

const TextProbeOutputSchema = z.object({
  status: z.literal("ok"),
  language: z.literal("zh-CN")
});

const ImageUrlProbeOutputSchema = z.object({
  description: z.string().min(1).max(500),
  confirmedElements: z.array(z.string().min(1).max(200)),
  uncertainty: z.string().min(1).max(500)
});

interface ProbeCompletion {
  id?: string;
  _request_id?: string | null;
  model?: string;
  choices: readonly {
    message: {
      content?: string | null;
      tool_calls?: readonly unknown[];
    };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

export class ProviderCapabilityProbe {
  constructor(
    private readonly provider: VolcengineArkProvider,
    private readonly clock: () => Date = () => new Date(),
    private readonly options: {
      requestHeaders?: Readonly<Record<string, string>>;
      live?: boolean;
    } = {}
  ) {}

  async run(): Promise<ProviderCapabilities> {
    return (await this.runDetailed()).capabilities;
  }

  async runDetailed(): Promise<ProviderCapabilityProbeResult> {
    const calls: SafeProviderCapabilityProbeCall[] = [];
    const requestHeaderOptions = this.options.requestHeaders
      ? { requestHeaders: this.options.requestHeaders }
      : {};

    const textStatus = await this.runCompletionProbe({
      probe: "text",
      calls,
      invoke: () =>
        this.provider.createProbeCompletion({
          messages: [
            {
              role: "user",
              content:
                '请严格返回 JSON：\n{\n  "status": "ok",\n  "language": "zh-CN"\n}'
            }
          ],
          ...requestHeaderOptions
        }),
      validate: (result) =>
        TextProbeOutputSchema.safeParse(
          JSON.parse(result.choices[0]?.message.content ?? "")
        ).success
    });
    const textCall = calls.find((call) => call.probe === "text");

    const jsonObjectStatus = await this.runCompletionProbe({
      probe: "json_object",
      calls,
      invoke: () =>
        this.provider.createProbeCompletion({
          messages: [
            {
              role: "user",
              content:
                'JSON Object Probe：请只返回 JSON 对象 {"ok":true}。'
            }
          ],
          responseFormat: { type: "json_object" },
          ...requestHeaderOptions
        }),
      validate: (result) =>
        JSON.parse(result.choices[0]?.message.content ?? "").ok ===
        true
    });

    const jsonSchemaStatus = await this.runCompletionProbe({
      probe: "json_schema",
      calls,
      invoke: () =>
        this.provider.createProbeCompletion({
          messages: [
            {
              role: "user",
              content:
                'JSON Schema Probe：请只返回 JSON 对象 {"ok":true}。'
            }
          ],
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "probe",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["ok"],
                properties: {
                  ok: { type: "boolean", const: true }
                }
              }
            }
          },
          ...requestHeaderOptions
        }),
      validate: (result) =>
        JSON.parse(result.choices[0]?.message.content ?? "").ok ===
        true
    });

    const functionCallingStatus = await this.runCompletionProbe({
      probe: "function_calling",
      calls,
      invoke: () =>
        this.provider.createProbeCompletion({
          messages: [
            {
              role: "user",
              content:
                "Function Calling Probe：请调用 report_probe，并令参数 ok 为 true。"
            }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_probe",
                description:
                  "Report a synthetic capability probe.",
                parameters: {
                  type: "object",
                  additionalProperties: false,
                  required: ["ok"],
                  properties: {
                    ok: { type: "boolean" }
                  }
                }
              }
            }
          ],
          ...requestHeaderOptions
        }),
      validate: (result) =>
        Boolean(result.choices[0]?.message.tool_calls?.length)
    });

    const imageUrlStatus = await this.runCompletionProbe({
      probe: "image_url",
      calls,
      invoke: () =>
        this.provider.createProbeCompletion({
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: SYNTHETIC_PUBLIC_TEST_IMAGE_URL
                  }
                },
                {
                  type: "text",
                  text: [
                    "Image URL Probe",
                    "请只返回一个 JSON 对象，不要 Markdown 或解释。",
                    '{"description":"...","confirmedElements":["..."],"uncertainty":"..."}'
                  ].join("\n")
                }
              ]
            }
          ],
          ...requestHeaderOptions
        }),
      validate: (result) =>
        ImageUrlProbeOutputSchema.safeParse(
          JSON.parse(result.choices[0]?.message.content ?? "")
        ).success
    });

    const streamingStatus = await this.runStreamingProbe(
      calls,
      requestHeaderOptions
    );

    const capabilities = ProviderCapabilitiesSchema.parse({
      provider: "volcengine-ark",
      modelIdHash: createHash("sha256")
        .update(this.provider.config.modelId)
        .digest("hex"),
      live: this.options.live === true,
      supportsText: textStatus === "supported",
      supportsImageUrl: imageUrlStatus === "supported",
      imageUrlStatus,
      supportsJsonObject: jsonObjectStatus === "supported",
      jsonObjectStatus,
      supportsJsonSchema: jsonSchemaStatus === "supported",
      jsonSchemaStatus,
      supportsFunctionCalling:
        functionCallingStatus === "supported",
      functionCallingStatus,
      supportsStreaming: streamingStatus === "supported",
      streamingStatus,
      reportsUsage:
        (textCall?.inputTokens ?? 0) > 0 &&
        (textCall?.outputTokens ?? 0) > 0,
      reportsRequestId: Boolean(
        textCall?.providerRequestIdMasked
      ),
      reportedModelMatches:
        textCall?.status === "succeeded" &&
        this.lastReportedModel === this.provider.config.modelId,
      checkedAt: this.clock().toISOString()
    });
    this.lastReportedModel = undefined;
    return { capabilities, calls };
  }

  private lastReportedModel: string | undefined;

  private async runCompletionProbe(input: {
    probe: ProviderCapabilityProbeName;
    calls: SafeProviderCapabilityProbeCall[];
    invoke: () => Promise<ProbeCompletion>;
    validate: (result: ProbeCompletion) => boolean;
  }): Promise<ProviderCapabilitySupportStatus> {
    const startedAt = Date.now();
    try {
      const result = await input.invoke();
      const schemaPassed = safelyValidate(() => input.validate(result));
      if (input.probe === "text") {
        this.lastReportedModel = result.model;
      }
      const capabilityStatus = schemaPassed
        ? "supported"
        : "partially_supported";
      input.calls.push(
        safeCompletionCall(
          input.probe,
          result,
          Math.max(1, Date.now() - startedAt),
          capabilityStatus,
          schemaPassed
        )
      );
      return capabilityStatus;
    } catch (error) {
      const failedCall = safeFailedCall(
        input.probe,
        Math.max(1, Date.now() - startedAt),
        error
      );
      input.calls.push(failedCall);
      return failedCall.capabilityStatus;
    }
  }

  private async runStreamingProbe(
    calls: SafeProviderCapabilityProbeCall[],
    requestHeaderOptions: {
      requestHeaders?: Readonly<Record<string, string>>;
    }
  ): Promise<ProviderCapabilitySupportStatus> {
    const startedAt = Date.now();
    try {
      const stream = await this.provider.createProbeStream({
        messages: [
          {
            role: "user",
            content: "Streaming Probe：请只回复一个汉字。"
          }
        ],
        ...requestHeaderOptions
      });
      let receivedChunk = false;
      for await (const chunk of stream) {
        if (chunk.choices.length > 0) {
          receivedChunk = true;
          break;
        }
      }
      const capabilityStatus = receivedChunk
        ? "supported"
        : "partially_supported";
      calls.push({
        probe: "streaming",
        status: "succeeded",
        capabilityStatus,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        latencyMs: Math.max(1, Date.now() - startedAt),
        providerRequestIdMasked: null,
        finishReason: null,
        safeErrorCategory: null,
        schemaPassed: receivedChunk,
        policyPassed: null
      });
      return capabilityStatus;
    } catch (error) {
      const failedCall = safeFailedCall(
        "streaming",
        Math.max(1, Date.now() - startedAt),
        error
      );
      calls.push(failedCall);
      return failedCall.capabilityStatus;
    }
  }
}

function safeCompletionCall(
  probe: ProviderCapabilityProbeName,
  result: ProbeCompletion,
  latencyMs: number,
  capabilityStatus: ProviderCapabilitySupportStatus,
  schemaPassed: boolean
): SafeProviderCapabilityProbeCall {
  const inputTokens = result.usage?.prompt_tokens ?? 0;
  const outputTokens = result.usage?.completion_tokens ?? 0;
  return {
    probe,
    status: "succeeded",
    capabilityStatus,
    inputTokens,
    outputTokens,
    totalTokens:
      result.usage?.total_tokens ?? inputTokens + outputTokens,
    latencyMs,
    providerRequestIdMasked: maskProviderRequestId(
      result._request_id ?? result.id
    ),
    finishReason:
      result.choices[0]?.finish_reason ?? null,
    safeErrorCategory: null,
    schemaPassed,
    policyPassed: null
  };
}

function safeFailedCall(
  probe: ProviderCapabilityProbeName,
  latencyMs: number,
  error: unknown
): SafeProviderCapabilityProbeCall {
  const classified = classifyArkError(error);
  const capabilityStatus = [
    "AUTHENTICATION_FAILED",
    "AUTHORIZATION_FAILED",
    "MODEL_NOT_FOUND",
    "RATE_LIMITED",
    "PROVIDER_UNAVAILABLE",
    "REQUEST_TIMED_OUT",
    "REQUEST_CANCELLED"
  ].includes(classified.category)
    ? "not_tested"
    : "unsupported";
  return {
    probe,
    status: "failed",
    capabilityStatus,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    latencyMs,
    providerRequestIdMasked:
      "providerRequestId" in classified
        ? maskProviderRequestId(
            classified.providerRequestId
          )
        : null,
    finishReason: null,
    safeErrorCategory: classified.category,
    schemaPassed: false,
    policyPassed: null
  };
}

function safelyValidate(validate: () => boolean): boolean {
  try {
    return validate();
  } catch {
    return false;
  }
}

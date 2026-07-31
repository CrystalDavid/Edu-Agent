import { createHash } from "node:crypto";

import {
  ProviderCapabilitiesSchema,
  type ProviderCapabilities
} from "@edu-agent/contracts";
import { z } from "zod";

import {
  VolcengineArkProvider
} from "../infrastructure/volcengine-ark-provider.js";

export const SYNTHETIC_PUBLIC_TEST_IMAGE_URL =
  "https://ark-project.tos-cn-beijing.volces.com/images/view.jpeg";

const ImageUrlProbeOutputSchema = z.object({
  description: z.string().min(1).max(500)
});

export class ProviderCapabilityProbe {
  constructor(
    private readonly provider: VolcengineArkProvider,
    private readonly clock: () => Date = () => new Date(),
    private readonly requestHeaders?: Readonly<
      Record<string, string>
    >
  ) {}

  async run(): Promise<ProviderCapabilities> {
    const requestHeaderOptions = this.requestHeaders
      ? { requestHeaders: this.requestHeaders }
      : {};
    let supportsText = false;
    let supportsImageUrl = false;
    let supportsJsonObject = false;
    let supportsJsonSchema = false;
    let supportsFunctionCalling = false;
    let supportsStreaming = false;
    let reportsUsage = false;
    let reportsRequestId = false;
    let reportedModelMatches = false;

    try {
      const text = await this.provider.createProbeCompletion({
        messages: [
          {
            role: "user",
            content:
              "Capability Probe：请只回复“中文文本能力正常”。"
          }
        ],
        ...requestHeaderOptions
      });
      const content = text.choices[0]?.message.content ?? "";
      supportsText =
        typeof content === "string" &&
        /中文|能力|正常/u.test(content);
      reportsUsage =
        typeof text.usage?.prompt_tokens === "number" &&
        typeof text.usage?.completion_tokens === "number";
      reportsRequestId = Boolean(
        text._request_id ?? text.id
      );
      reportedModelMatches =
        text.model === this.provider.config.modelId;
    } catch {
      // A failed text probe means authentication/base URL/model access is
      // not yet verified. The summary remains fail-closed.
    }

    try {
      const result = await this.provider.createProbeCompletion({
        messages: [
          {
            role: "user",
            content:
              'JSON Object Probe：只返回 {"ok":true}。'
          }
        ],
        responseFormat: { type: "json_object" },
        ...requestHeaderOptions
      });
      supportsJsonObject =
        JSON.parse(result.choices[0]?.message.content ?? "")
          .ok === true;
    } catch {
      supportsJsonObject = false;
    }

    try {
      const result = await this.provider.createProbeCompletion({
        messages: [
          {
            role: "user",
            content:
              'JSON Schema Probe：只返回 {"ok":true}。'
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
      });
      supportsJsonSchema =
        JSON.parse(result.choices[0]?.message.content ?? "")
          .ok === true;
    } catch {
      supportsJsonSchema = false;
    }

    try {
      const result = await this.provider.createProbeCompletion({
        messages: [
          {
            role: "user",
            content:
              "Function Calling Probe：调用 report_probe。"
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_probe",
              description: "Report a synthetic capability probe.",
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
      });
      supportsFunctionCalling = Boolean(
        result.choices[0]?.message.tool_calls?.length
      );
    } catch {
      supportsFunctionCalling = false;
    }

    try {
      const result = await this.provider.createProbeCompletion({
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
                text:
                  'Image URL Probe：请只返回 {"description":"可确认内容"}，不要添加其他字段或说明。'
              }
            ]
          }
        ],
        responseFormat: { type: "json_object" },
        ...requestHeaderOptions
      });
      ImageUrlProbeOutputSchema.parse(
        JSON.parse(
          result.choices[0]?.message.content ?? ""
        )
      );
      supportsImageUrl = true;
    } catch {
      supportsImageUrl = false;
    }

    try {
      const stream = await this.provider.createProbeStream({
        messages: [
          {
            role: "user",
            content: "Streaming Probe：回复一个字。"
          }
        ],
        ...requestHeaderOptions
      });
      for await (const chunk of stream) {
        if (chunk.choices.length > 0) {
          supportsStreaming = true;
          break;
        }
      }
    } catch {
      supportsStreaming = false;
    }

    return ProviderCapabilitiesSchema.parse({
      provider: "volcengine-ark",
      modelIdHash: createHash("sha256")
        .update(this.provider.config.modelId)
        .digest("hex"),
      supportsText,
      supportsImageUrl,
      supportsJsonObject,
      supportsJsonSchema,
      supportsFunctionCalling,
      supportsStreaming,
      reportsUsage,
      reportsRequestId,
      reportedModelMatches,
      checkedAt: this.clock().toISOString()
    });
  }
}

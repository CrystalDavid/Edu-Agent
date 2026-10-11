import {
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { resolve } from "node:path";

export function maskProviderRequestId(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function safeProviderErrorMessage(
  category: string
): string {
  const messages: Record<string, string> = {
    AUTHENTICATION_FAILED: "模型服务鉴权失败，请联系管理员。",
    AUTHORIZATION_FAILED: "模型服务拒绝了当前调用权限。",
    MODEL_NOT_FOUND: "配置的模型当前不可用。",
    RATE_LIMITED: "模型服务当前限流，请稍后重试。",
    PROVIDER_UNAVAILABLE: "模型服务暂时不可用，请稍后重试。",
    REQUEST_TIMED_OUT: "模型生成超时，可以人工重试。",
    REQUEST_CANCELLED: "本次模型生成已取消。",
    INVALID_PROVIDER_RESPONSE: "模型返回内容无法安全读取。",
    OUTPUT_VALIDATION_FAILED: "模型输出未通过结构与证据校验。",
    POLICY_BLOCKED: "本次请求被数据或教学安全策略阻止。",
    BUDGET_EXCEEDED: "当前模型预算不足，未发起调用。",
    CONFIGURATION_ERROR: "模型服务端配置不完整。",
    UNKNOWN_PROVIDER_ERROR: "模型服务发生未分类错误。"
  };
  return (
    messages[category] ??
    "模型服务发生安全错误，请稍后重试。"
  );
}

const redactedModelLogKeys =
  /api[_-]?key|authorization|prompt|messages|output(?:Text)?|response|evidence(?:Text)?|requestText|connectionString/i;

export function redactModelLogValue(
  value: unknown
): unknown {
  if (Array.isArray(value)) {
    return value.map(redactModelLogValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactedModelLogKeys.test(key)
          ? "[REDACTED]"
          : redactModelLogValue(item)
      ])
    );
  }
  return value;
}

export class LocalSyntheticModelDebugSink {
  private readonly directory: string;

  constructor(
    private readonly enabled: boolean,
    private readonly appEnvironment: string,
    directory = resolve(".local-data", "model-debug"),
    private readonly retentionMilliseconds = 60 * 60 * 1000
  ) {
    this.directory = directory;
    if (
      enabled &&
      !["local", "demo"].includes(appEnvironment)
    ) {
      throw new Error(
        "Model debug content is forbidden outside local/demo."
      );
    }
  }

  async write(input: {
    executionRef: string;
    syntheticData: true;
    promptMessages: readonly unknown[];
    outputText?: string;
  }): Promise<void> {
    if (!this.enabled) return;
    await mkdir(this.directory, { recursive: true });
    await this.removeExpired();
    const expiresAt = new Date(
      Date.now() + this.retentionMilliseconds
    ).toISOString();
    const safeName = input.executionRef.replace(
      /[^A-Za-z0-9._-]/g,
      "_"
    );
    await writeFile(
      resolve(this.directory, `${safeName}.json`),
      JSON.stringify(
        {
          syntheticData: input.syntheticData,
          expiresAt,
          promptMessages: input.promptMessages,
          outputText: input.outputText
        },
        null,
        2
      ),
      {
        encoding: "utf8",
        flag: "w"
      }
    );
  }

  private async removeExpired(): Promise<void> {
    const entries = await readdir(this.directory, {
      withFileTypes: true
    });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const path = resolve(this.directory, entry.name);
      try {
        const parsed = JSON.parse(
          await readFile(path, "utf8")
        ) as { expiresAt?: string };
        if (
          !parsed.expiresAt ||
          new Date(parsed.expiresAt).getTime() <= Date.now()
        ) {
          await rm(path, { force: true });
        }
      } catch {
        await rm(path, { force: true });
      }
    }
  }
}

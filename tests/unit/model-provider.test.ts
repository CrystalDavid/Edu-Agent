import {
  afterEach,
  describe,
  expect,
  it
} from "vitest";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assembleLessonPreparationModelRequest
} from "../../apps/api/src/modules/capability-integration/application/lesson-preparation-prompt-bundle.js";
import {
  ModelBudgetPolicy,
  estimateInputTokens
} from "../../apps/api/src/modules/capability-integration/application/model-budget-policy.js";
import {
  createModelDataManifest,
  detectProhibitedModelInput
} from "../../apps/api/src/modules/capability-integration/application/model-data-manifest.js";
import {
  validateModelOutput
} from "../../apps/api/src/modules/capability-integration/application/model-output-validation.js";
import {
  ProviderCapabilityProbe
} from "../../apps/api/src/modules/capability-integration/application/provider-capability-probe.js";
import {
  LocalSyntheticModelDebugSink,
  maskProviderRequestId,
  redactModelLogValue
} from "../../apps/api/src/modules/capability-integration/application/safe-model-logging.js";
import {
  computeBackoffMilliseconds
} from "../../apps/api/src/composition/postgres-model-invocation-service.js";
import {
  MockModelProvider
} from "../../apps/api/src/modules/capability-integration/infrastructure/mock-model-provider.js";
import {
  readModelProviderSettings,
  type VolcengineArkConfig
} from "../../apps/api/src/modules/capability-integration/infrastructure/model-provider-config.js";
import {
  VolcengineArkProvider
} from "../../apps/api/src/modules/capability-integration/infrastructure/volcengine-ark-provider.js";
import {
  startFakeArkServer,
  type FakeArkServer
} from "../support/fake-ark-server.js";

let fake: FakeArkServer | undefined;

afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

describe("Gate 2.6A provider configuration", () => {
  it("defaults to Mock and safely reports an incomplete Ark fallback", () => {
    expect(
      readModelProviderSettings({
        APP_ENV: "test"
      }).activeProvider
    ).toBe("mock");
    const fallback = readModelProviderSettings({
      APP_ENV: "local",
      MODEL_PROVIDER_MODE: "ark",
      ARK_BASE_URL:
        "https://ark.cn-beijing.volces.com/api/v3",
      ARK_MODEL_ID: "synthetic-model",
      ARK_MODEL_DISPLAY_NAME: "Synthetic Model"
    });
    expect(fallback.activeProvider).toBe("mock");
    expect(fallback.availability).toMatchObject({
      requestedMode: "ark",
      configured: false,
      fallbackToMock: true
    });
    expect(
      JSON.stringify(fallback.availability)
    ).not.toContain("sensitive");

    const explicitMock = readModelProviderSettings({
      APP_ENV: "test",
      MODEL_PROVIDER_MODE: "mock",
      ARK_BASE_URL:
        "https://ark.cn-beijing.volces.com/api/v3",
      ARK_API_KEY: "placeholder-for-unused-provider",
      ARK_MODEL_ID: "synthetic-unused-model",
      ARK_MODEL_DISPLAY_NAME: "Synthetic Unused Model"
    });
    expect(explicitMock.activeProvider).toBe("mock");
    expect(explicitMock.budget.allowedModelIds).toEqual([
      "mock"
    ]);
  });

  it("fails closed for production Mock or debug-content mode", () => {
    expect(() =>
      readModelProviderSettings({
        APP_ENV: "production",
        MODEL_PROVIDER_MODE: "mock"
      })
    ).toThrow(/Production requires/u);
    expect(() =>
      readModelProviderSettings({
        APP_ENV: "test",
        MODEL_DEBUG_CONTENT: "true"
      })
    ).toThrow(/MODEL_DEBUG_CONTENT/u);
  });

  it("requires a complete Ark-only configuration in strict Live mode", () => {
    expect(() =>
      readModelProviderSettings({
        APP_ENV: "local",
        MODEL_PROVIDER_MODE: "ark",
        ARK_LIVE_STRICT: "true"
      })
    ).toThrow(/ENABLE_LIVE_MODEL_TESTS/u);
    expect(() =>
      readModelProviderSettings({
        APP_ENV: "local",
        MODEL_PROVIDER_MODE: "mock",
        ENABLE_LIVE_MODEL_TESTS: "true",
        ARK_LIVE_STRICT: "true"
      })
    ).toThrow(/MODEL_PROVIDER_MODE=ark/u);
    expect(() =>
      readModelProviderSettings({
        APP_ENV: "local",
        MODEL_PROVIDER_MODE: "ark",
        ENABLE_LIVE_MODEL_TESTS: "true",
        ARK_LIVE_STRICT: "true",
        ARK_BASE_URL:
          "https://ark.cn-beijing.volces.com/api/v3",
        ARK_API_KEY: "synthetic-test-credential",
        ARK_MODEL_ID: "doubao-seed-2-1-turbo-260628",
        ARK_MODEL_DISPLAY_NAME:
          "Doubao-Seed-2.1-turbo-260628"
      })
    ).not.toThrow();
    const strict = readModelProviderSettings({
      APP_ENV: "local",
      MODEL_PROVIDER_MODE: "ark",
      ENABLE_LIVE_MODEL_TESTS: "true",
      ARK_LIVE_STRICT: "true",
      ARK_BASE_URL:
        "https://ark.cn-beijing.volces.com/api/v3",
      ARK_API_KEY: "synthetic-test-credential",
      ARK_MODEL_ID: "doubao-seed-2-1-turbo-260628",
      ARK_MODEL_DISPLAY_NAME:
        "Doubao-Seed-2.1-turbo-260628"
    });
    expect(strict).toMatchObject({
      activeProvider: "volcengine-ark",
      liveTestsEnabled: true,
      liveStrict: true
    });
    expect(strict.availability.fallbackToMock).toBe(false);
    expect(() =>
      readModelProviderSettings({
        APP_ENV: "local",
        MODEL_PROVIDER_MODE: "ark",
        ENABLE_LIVE_MODEL_TESTS: "true",
        ARK_LIVE_STRICT: "true",
        ARK_BASE_URL: "http://127.0.0.1:39123/api/v3",
        ARK_API_KEY: "synthetic-test-credential",
        ARK_MODEL_ID: "doubao-seed-2-1-turbo-260628",
        ARK_MODEL_DISPLAY_NAME:
          "Doubao-Seed-2.1-turbo-260628"
      })
    ).toThrow(/forbids Fake/u);
  });
});

describe("VolcengineArkProvider OpenAI-compatible transport", () => {
  it("calls Chat Completions without streaming and returns safe usage metadata", async () => {
    fake = await startFakeArkServer();
    const provider = new VolcengineArkProvider(
      arkConfig(fake.baseUrl)
    );
    const request = modelRequest();
    const result = await provider.invoke(request);
    expect(result).toMatchObject({
      status: "succeeded",
      provider: "volcengine-ark",
      modelId: "synthetic-ark-model",
      inputTokens: 120,
      outputTokens: 240,
      finishReason: "stop"
    });
    if (result.status !== "succeeded") {
      throw new Error("Expected success.");
    }
    expect(result.providerRequestId).toBe(
      "req_fake_safe_1234567890"
    );
    expect(
      validateModelOutput({
        outputText: result.outputText,
        request
      }).valid
    ).toBe(true);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.path).toBe(
      "/api/v3/chat/completions"
    );
    expect(fake.requests[0]?.body).toMatchObject({
      model: "synthetic-ark-model",
      stream: false,
      max_tokens: 512,
      thinking: {
        type: "disabled"
      }
    });
  });

  it("classifies 429, 5xx, timeout, connection loss and AbortSignal safely", async () => {
    fake = await startFakeArkServer({
      scenario: "rate-limit-once"
    });
    const provider = new VolcengineArkProvider(
      arkConfig(fake.baseUrl, 100)
    );
    await expect(
      provider.invoke(modelRequest(50))
    ).resolves.toMatchObject({
      status: "failed",
      category: "RATE_LIMITED",
      retryable: true
    });

    fake.setScenario("server-error");
    await expect(provider.invoke(modelRequest())).resolves.toMatchObject({
      status: "failed",
      category: "PROVIDER_UNAVAILABLE",
      retryable: true
    });

    fake.setScenario("disconnect");
    await expect(provider.invoke(modelRequest())).resolves.toMatchObject({
      status: "failed",
      category: "PROVIDER_UNAVAILABLE",
      retryable: true
    });

    fake.setScenario("non-json");
    await expect(provider.invoke(modelRequest())).resolves.toMatchObject({
      status: "failed",
      category: "INVALID_PROVIDER_RESPONSE",
      retryable: false
    });

    fake.setScenario("timeout");
    await expect(
      provider.invoke(modelRequest(50))
    ).resolves.toMatchObject({
      status: "failed",
      category: "REQUEST_TIMED_OUT",
      retryable: true
    });

    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.invoke(modelRequest(), {
        signal: controller.signal
      })
    ).resolves.toMatchObject({
      status: "failed",
      category: "REQUEST_CANCELLED",
      retryable: false
    });
  });

  it("probes text, JSON, function, image URL, streaming, usage and request id", async () => {
    fake = await startFakeArkServer();
    const provider = new VolcengineArkProvider(
      arkConfig(fake.baseUrl)
    );
    const summary = await new ProviderCapabilityProbe(
      provider,
      () => new Date("2026-07-31T10:00:00.000Z")
    ).run();
    expect(summary).toMatchObject({
      provider: "volcengine-ark",
      live: false,
      supportsText: true,
      supportsImageUrl: true,
      imageUrlStatus: "supported",
      supportsJsonObject: true,
      jsonObjectStatus: "supported",
      supportsJsonSchema: true,
      jsonSchemaStatus: "supported",
      supportsFunctionCalling: true,
      functionCallingStatus: "supported",
      supportsStreaming: true,
      streamingStatus: "supported",
      reportsUsage: true,
      reportsRequestId: true,
      reportedModelMatches: true,
      checkedAt: "2026-07-31T10:00:00.000Z"
    });
    expect(summary.modelIdHash).toHaveLength(64);
  });

  it("keeps Mock and Ark behind the same validated ModelProvider contract", async () => {
    fake = await startFakeArkServer();
    const request = modelRequest();
    const providers = [
      new MockModelProvider(),
      new VolcengineArkProvider(arkConfig(fake.baseUrl))
    ];
    for (const provider of providers) {
      const result = await provider.invoke(request);
      expect(result.status).toBe("succeeded");
      if (result.status !== "succeeded") continue;
      const validation = validateModelOutput({
        outputText: result.outputText,
        request
      });
      expect(validation.valid).toBe(true);
      if (validation.valid) {
        expect(validation.strategies.length).toBeGreaterThan(0);
        expect(
          validation.strategies[0]?.evidenceRefs
        ).toEqual(request.scope.evidenceRefs);
      }
    }
  });
});

describe("Gate 2.6A policy helpers", () => {
  it("rejects unauthorized evidence and contaminated output", async () => {
    fake = await startFakeArkServer();
    const request = modelRequest();
    const provider = new VolcengineArkProvider(
      arkConfig(fake.baseUrl)
    );
    const result = await provider.invoke(request);
    if (result.status !== "succeeded") {
      throw new Error("Expected Fake Ark success.");
    }
    const parsed = JSON.parse(result.outputText) as {
      suggestions: {
        evidenceRefs: string[];
      }[];
    };
    parsed.suggestions[0]!.evidenceRefs = [
      "evidence:outside-authorization"
    ];
    expect(
      validateModelOutput({
        outputText: JSON.stringify(parsed),
        request
      })
    ).toMatchObject({
      valid: false,
      category: "evidence"
    });
    expect(
      validateModelOutput({
        outputText: `说明\n${result.outputText}`,
        request
      })
    ).toMatchObject({
      valid: false,
      category: "schema"
    });
  });

  it("enforces budget, synthetic data, bounded backoff and redaction", () => {
    const config = readModelProviderSettings({
      APP_ENV: "test",
      MODEL_MAX_INPUT_TOKENS: "1",
      MODEL_MAX_OUTPUT_TOKENS: "100",
      MODEL_MAX_SINGLE_COST: "1",
      MODEL_DAILY_BUDGET: "1",
      MODEL_TEACHER_DAILY_BUDGET: "1",
      MODEL_MAX_CONCURRENCY: "1",
      MODEL_MAX_QUEUE_WAIT_MS: "1000"
    });
    const decision = new ModelBudgetPolicy(
      config.budget,
      () => new Date("2026-07-31T10:00:00.000Z")
    ).evaluate({
      modelId: "mock",
      promptText: "这是超过一个 token 的合成输入",
      requestedOutputTokens: 100,
      queuedAt: "2026-07-31T10:00:00.000Z",
      usage: {
        dailyCost: 0,
        teacherDailyCost: 0,
        runningExecutions: 0
      }
    });
    expect(estimateInputTokens("中文")).toBeGreaterThan(1);
    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: "INPUT_LIMIT_EXCEEDED"
    });
    expect(() =>
      createModelDataManifest({
        purpose: "teacher-copilot.lesson-preparation",
        tenantRef: "",
        actorRef: "user:teacher-001",
        taskRunRef: "task-run:test",
        contextManifestRef: "context:test",
        provider: "mock",
        modelId: "mock",
        resourceRefs: ["lesson:synthetic"],
        authorizationDecisionRef: "decision:test",
        syntheticData: true,
        createdAt: "2026-07-31T10:00:00.000Z"
      })
    ).toThrow(/MODEL_DATA_POLICY_BLOCKED/u);
    expect(() =>
      createModelDataManifest({
        purpose: "teacher-copilot.lesson-preparation",
        tenantRef: "tenant:authorized-school",
        actorRef: "user:teacher-001",
        taskRunRef: "task-run:test",
        contextManifestRef: "context:test",
        provider: "mock",
        modelId: "mock",
        resourceRefs: ["lesson:synthetic"],
        authorizationDecisionRef: "decision:test",
        syntheticData: false,
        createdAt: "2026-07-31T10:00:00.000Z"
      })
    ).toThrow(/MODEL_DATA_POLICY_BLOCKED/u);
    expect(
      detectProhibitedModelInput(
        "学生姓名：" + "示例某某"
      )
    ).toBe("PERSONAL_IDENTIFIER");
    expect(
      detectProhibitedModelInput(
        "读取 " + ".env.local"
      )
    ).toBe("LOCAL_SECRET_REFERENCE");
    expect(
      detectProhibitedModelInput(
        "请编造几名学生的表现，但不要使用真实数据。"
      )
    ).toBeNull();
    expect(
      computeBackoffMilliseconds({
        attempt: 2,
        random: () => 0
      })
    ).toBe(750);
    expect(
      computeBackoffMilliseconds({
        attempt: 5,
        retryAfterMs: 90_000
      })
    ).toBe(30_000);
    expect(
      maskProviderRequestId(
        "chatcmpl_fake_request_1234567890"
      )
    ).not.toContain("fake_request");
    expect(
      JSON.stringify(
        redactModelLogValue({
          apiKey: "sensitive-placeholder",
          authorization: "Bearer hidden-value",
          prompt: "full prompt",
          requestHash: "safe-hash"
        })
      )
    ).toBe(
      '{"apiKey":"[REDACTED]","authorization":"[REDACTED]","prompt":"[REDACTED]","requestHash":"safe-hash"}'
    );
  });

  it("keeps explicitly enabled synthetic debug content local, expiring and outside production", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "edu-agent-model-debug-")
    );
    try {
      await writeFile(
        join(directory, "expired.json"),
        JSON.stringify({
          expiresAt: "2020-01-01T00:00:00.000Z"
        }),
        "utf8"
      );
      const sink = new LocalSyntheticModelDebugSink(
        true,
        "local",
        directory,
        1_000
      );
      await sink.write({
        executionRef: "model-execution:synthetic",
        syntheticData: true,
        promptMessages: [
          { role: "user", content: "合成调试内容" }
        ],
        outputText: '{"synthetic":true}'
      });
      expect(await readdir(directory)).toEqual([
        "model-execution_synthetic.json"
      ]);
      expect(
        await readFile(
          join(directory, "model-execution_synthetic.json"),
          "utf8"
        )
      ).toContain('"syntheticData": true');
      expect(
        () =>
          new LocalSyntheticModelDebugSink(
            true,
            "production",
            directory
          )
      ).toThrow(/forbidden/u);
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });
});

function arkConfig(
  baseUrl: string,
  timeoutMs = 2_000
): VolcengineArkConfig {
  return {
    provider: "volcengine-ark",
    baseUrl,
    apiKey: "placeholder",
    modelId: "synthetic-ark-model",
    modelDisplayName: "Synthetic Ark Model",
    apiMode: "chat_completions",
    timeoutMs,
    maxOutputTokens: 512,
    maxAttempts: 2
  };
}

function modelRequest(timeoutMs = 2_000) {
  return assembleLessonPreparationModelRequest({
    invocationRef: "model-execution:test",
    taskRunRef: "task-run:test",
    agentRunRef: "agent-run:test",
    contextManifestRef: "context-manifest:test",
    timeoutMs,
    maxOutputTokens: 512,
    responseFormat: "json_schema",
    request: {
      requestText: "请强化斜率与图像变化的联系。",
      actorRef: "user:teacher-001",
      purpose: "teacher-copilot.adjust-next-lesson",
      courseRunRef: "course-run:synthetic",
      learningObjectiveRefs: ["objective:synthetic"],
      selectedEvidenceRefs: ["evidence:synthetic"],
      curriculumUnitRef: "unit:synthetic",
      lessonRef: "lesson:synthetic",
      preparationTaskRef: "task:synthetic",
      workingSetVersion: 1,
      createdAt: "2026-07-31T10:00:00.000Z",
      requestVersion: 1
    },
    courseRun: {
      courseRunRef: "course-run:synthetic",
      subject: "数学",
      gradeLevel: "八年级",
      className: "合成班级",
      academicTerm: "合成学期"
    },
    curriculumUnit: {
      unitRef: "unit:synthetic",
      title: "一次函数",
      description: "合成单元"
    },
    lesson: {
      lessonRef: "lesson:synthetic",
      title: "斜率与图像变化",
      sequence: 3,
      durationMinutes: 45
    },
    learningObjectives: [
      {
        objectiveRef: "objective:synthetic",
        title: "解释斜率",
        description: "解释斜率与图像变化"
      }
    ],
    currentApprovedTeachingPlan: {
      objective: "识别斜率方向",
      lessonFocus: "方向",
      openingActivity: "观察直线",
      teacherQuestions: ["图像如何变化？"],
      studentActivity: "比较图像",
      supportStrategy: "提供句式支架",
      independentCheck: "独立解释",
      followUp: "收集解释",
      evidenceRefs: ["evidence:synthetic"]
    },
    authorizedEvidence: [
      {
        evidenceRef: "evidence:synthetic",
        kind: "observation",
        summary: "合成观察",
        unknowns: ["迁移表现未知"]
      }
    ],
    evidenceGaps: ["迁移表现未知"],
    interactionContract: {
      contractRef: "contract:synthetic",
      profileRef: "profile:synthetic",
      policyVersionRef: "policy:synthetic",
      evidenceRuleVersionRef: "evidence-rule:synthetic",
      supportLimit: 2,
      answerReleaseBoundary: "教师审批后释放"
    },
    taskWorkingSet: {
      version: 1,
      purpose: "lesson-preparation",
      requestedFieldMask: ["lesson", "evidence"]
    }
  });
}

import { randomUUID } from "node:crypto";

import { apiRoutes } from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/demo-fixtures";
import request from "supertest";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import {
  gate25DemoRefs
} from "../../apps/api/src/composition/gate2-5-demo-fixture.js";
import {
  createProductContainer,
  type ProductContainer
} from "../../apps/api/src/composition/product-container.js";
import {
  readModelProviderSettings
} from "../../apps/api/src/modules/capability-integration/infrastructure/model-provider-config.js";
import {
  VolcengineArkProvider
} from "../../apps/api/src/modules/capability-integration/infrastructure/volcengine-ark-provider.js";
import {
  PostgresOutboxWorker
} from "../../apps/api/src/platform/postgres/outbox-worker.js";
import {
  startFakeArkServer,
  type FakeArkScenario,
  type FakeArkServer
} from "../support/fake-ark-server.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const workerPool = poolFor("worker");
const product = createProductContainer(postgresEnvironment);
const app = createApp({ product });
const demoHeaders = {
  "x-demo-tenant": gate2DemoRefs.tenantRef,
  "x-demo-actor": gate2DemoRefs.teacherRef
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await product.services.seed.seed({ includeGate25: true });
});

afterAll(async () => {
  await Promise.all([
    product.close(),
    adminPool.end(),
    workerPool.end()
  ]);
});

describe("Gate 2.6A durable ModelExecution", () => {
  it("queues outside the request transaction, runs Mock through the Worker, and creates one Proposal", async () => {
    const task = await createStartedTask(app);
    const command = invocationCommand(task);
    const queued = await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(demoHeaders)
      .send(command)
      .expect(202);
    expect(queued.body.execution).toMatchObject({
      status: "queued",
      provider: "mock",
      attemptCount: 0,
      proposalRevisionRef: null
    });

    await request(app)
      .get(
        apiRoutes.teacher.modelInvocation(
          queued.body.execution.modelExecutionRef
        )
      )
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("queued");
      });

    await expect(
      product.workers.copilotOutbox.processAvailable(25)
    ).resolves.toBeGreaterThan(0);

    const completed = await request(app)
      .get(
        apiRoutes.teacher.modelInvocation(
          queued.body.execution.modelExecutionRef
        )
      )
      .set(demoHeaders)
      .expect(200);
    expect(completed.body).toMatchObject({
      status: "succeeded",
      provider: "mock",
      attemptCount: 1,
      safeErrorCategory: null
    });
    expect(completed.body.proposalRevisionRef).toMatch(
      /^artifact-revision:/u
    );
    expect(completed.body.inputTokens).toBeGreaterThan(0);
    expect(completed.body.outputTokens).toBeGreaterThan(0);

    const proposals = await request(app)
      .get(apiRoutes.demo.pendingProposals)
      .set(demoHeaders)
      .expect(200);
    expect(proposals.body.items).toHaveLength(1);
    expect(proposals.body.items[0]).toMatchObject({
      taskRef: task.taskRef,
      requestText: command.requestText
    });
    const taskAfter = await request(app)
      .get(apiRoutes.teacher.preparationTask(task.taskRef))
      .set(demoHeaders)
      .expect(200);
    expect(taskAfter.body.status).toBe(
      "awaiting_plan_review"
    );

    const modelRow = await adminPool.query<{
      input_summary: Record<string, unknown>;
      output: Record<string, unknown>;
      raw_request: string;
      results: string;
    }>(
      `SELECT input_summary, output,
              input_summary::text AS raw_request,
              count(*) OVER ()::text AS results
         FROM capability.model_execution
        WHERE execution_ref = $1`,
      [queued.body.execution.modelExecutionRef]
    );
    expect(modelRow.rows[0]?.raw_request).not.toContain(
      command.requestText
    );
    expect(modelRow.rows[0]?.output["schemaVersion"]).toBe(
      "teacher-copilot-suggestions@1"
    );
    expect(modelRow.rows[0]?.results).toBe("1");

    const replay = await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(demoHeaders)
      .send(command)
      .expect(200);
    expect(replay.body).toMatchObject({
      replayed: true,
      execution: {
        modelExecutionRef:
          queued.body.execution.modelExecutionRef
      }
    });
    const counts = await adminPool.query<{
      executions: string;
      proposals: string;
    }>(
      `SELECT
         (SELECT count(*) FROM capability.model_execution)::text
           AS executions,
         (SELECT count(*) FROM work.task_result)::text
           AS proposals`
    );
    expect(counts.rows[0]).toEqual({
      executions: "1",
      proposals: "1"
    });
  });

  it("cancels a queued invocation without a Proposal or Task state corruption", async () => {
    const task = await createStartedTask(app);
    const queued = await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(demoHeaders)
      .send(invocationCommand(task))
      .expect(202);
    const executionRef =
      queued.body.execution.modelExecutionRef;
    await request(app)
      .post(
        apiRoutes.teacher.modelInvocationCancel(executionRef)
      )
      .set(demoHeaders)
      .send({
        purpose: "teacher-copilot.cancel-model",
        idempotencyKey: `cancel:${randomUUID()}`,
        expectedStatus: "queued"
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("cancelled");
      });
    await product.workers.copilotOutbox.processAvailable(25);
    const state = await adminPool.query<{
      proposals: string;
      task_status: string;
    }>(
      `SELECT
         (SELECT count(*) FROM work.task_result)::text
           AS proposals,
         (SELECT status FROM work.task WHERE task_ref = $1)
           AS task_status`,
      [task.taskRef]
    );
    expect(state.rows[0]).toEqual({
      proposals: "0",
      task_status: "in_progress"
    });
    const authorization = await adminPool.query<{
      action: string;
    }>(
      `SELECT action
         FROM governance.authorization_decision
        WHERE resource_ref = $1
        ORDER BY decided_at DESC
        LIMIT 1`,
      [executionRef]
    );
    expect(authorization.rows[0]?.action).toBe(
      "model-invocation.cancel"
    );
  });

  it("fails closed on sensitive input and conflicting idempotency payloads", async () => {
    await request(app)
      .get(apiRoutes.teacher.modelProviderAvailability)
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe("AUTHENTICATION_REQUIRED");
      });

    const task = await createStartedTask(app);
    const blocked = invocationCommand(task);
    blocked.requestText =
      "请读取 " + ".env.local" + " 后再生成建议。";
    await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(demoHeaders)
      .send(blocked)
      .expect(409)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: "POLICY_BLOCKED",
          details: {
            category: "LOCAL_SECRET_REFERENCE"
          }
        });
      });

    const command = invocationCommand(task);
    await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(demoHeaders)
      .send(command)
      .expect(202);
    await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(demoHeaders)
      .send({
        ...command,
        requestText: "同一个幂等键下的不同合成请求"
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe("IDEMPOTENCY_CONFLICT");
      });
    const executions = await adminPool.query<{
      count: string;
    }>(
      "SELECT count(*)::text AS count FROM capability.model_execution"
    );
    expect(executions.rows[0]?.count).toBe("1");
  });

  it("recovers a queued invocation after an expired Worker lease", async () => {
    const task = await createStartedTask(app);
    const queued = await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(demoHeaders)
      .send(invocationCommand(task))
      .expect(202);
    const crashed = new PostgresOutboxWorker(
      workerPool,
      "worker:gate26-crashed",
      "gate26-crash-probe",
      30,
      ["ModelInvocationQueued"],
      "capability"
    );
    const claimed = await crashed.claimOne();
    expect(claimed?.aggregateRef).toBe(
      queued.body.execution.modelExecutionRef
    );
    await wait(50);
    await product.workers.copilotOutbox.processAvailable(25);
    await request(app)
      .get(
        apiRoutes.teacher.modelInvocation(
          queued.body.execution.modelExecutionRef
        )
      )
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("succeeded");
      });
    const outbox = await adminPool.query<{
      status: string;
      attempt_count: number;
    }>(
      `SELECT status, attempt_count
         FROM capability.outbox_record
        WHERE outbox_ref = $1`,
      [claimed?.outboxRef]
    );
    expect(outbox.rows[0]).toEqual({
      status: "processed",
      attempt_count: 2
    });
  });

  it("uses Fake Ark for 429 retry, controlled repair, validation failure and budget fail-closed", async () => {
    await exerciseFakeArkScenario("rate-limit-once", {
      expectedStatus: "succeeded",
      expectedAttempts: 2,
      expectedProposals: 1
    });
    await exerciseFakeArkScenario("repair-success", {
      expectedStatus: "succeeded",
      expectedAttempts: 2,
      expectedProposals: 1
    });
    await exerciseFakeArkScenario("repair-fail", {
      expectedStatus: "validation_failed",
      expectedAttempts: 2,
      expectedProposals: 0
    });

    await resetGate1BData(adminPool);
    const budgetSettings = readModelProviderSettings({
      APP_ENV: "test",
      MODEL_PROVIDER_MODE: "mock",
      MODEL_MAX_INPUT_TOKENS: "1",
      MODEL_MAX_OUTPUT_TOKENS: "8192",
      MODEL_MAX_SINGLE_COST: "10",
      MODEL_DAILY_BUDGET: "100",
      MODEL_TEACHER_DAILY_BUDGET: "20",
      MODEL_MAX_CONCURRENCY: "2",
      MODEL_MAX_QUEUE_WAIT_MS: "300000"
    });
    const budgetProduct = createProductContainer(
      postgresEnvironment,
      { modelSettings: budgetSettings }
    );
    try {
      await budgetProduct.services.seed.seed({
        includeGate25: true
      });
      const budgetApp = createApp({
        product: budgetProduct
      });
      const task = await createStartedTask(budgetApp);
      const queued = await request(budgetApp)
        .post(apiRoutes.teacher.modelInvocations)
        .set(demoHeaders)
        .send(invocationCommand(task))
        .expect(202);
      await budgetProduct.workers.copilotOutbox.processAvailable(
        25
      );
      await request(budgetApp)
        .get(
          apiRoutes.teacher.modelInvocation(
            queued.body.execution.modelExecutionRef
          )
        )
        .set(demoHeaders)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            status: "budget_exceeded",
            safeErrorCategory: "BUDGET_EXCEEDED",
            proposalRevisionRef: null
          });
        });
      const proposals = await adminPool.query<{
        count: string;
      }>("SELECT count(*)::text AS count FROM work.task_result");
      expect(proposals.rows[0]?.count).toBe("0");
    } finally {
      await budgetProduct.close();
    }
  });

  it("supports timeout, running cancellation and an audited manual retry", async () => {
    await resetGate1BData(adminPool);
    let fake: FakeArkServer | undefined;
    let arkProduct: ProductContainer | undefined;
    try {
      fake = await startFakeArkServer({
        scenario: "timeout",
        timeoutMilliseconds: 250
      });
      const settings = arkSettings(fake.baseUrl, {
        timeoutMs: 30
      });
      arkProduct = createProductContainer(
        postgresEnvironment,
        {
          modelSettings: settings,
          modelProvider: new VolcengineArkProvider(
            settings.ark!
          )
        }
      );
      await arkProduct.services.seed.seed({
        includeGate25: true
      });
      const arkApp = createApp({ product: arkProduct });
      const task = await createStartedTask(arkApp);
      const queued = await request(arkApp)
        .post(apiRoutes.teacher.modelInvocations)
        .set(demoHeaders)
        .send(invocationCommand(task))
        .expect(202);
      await arkProduct.workers.copilotOutbox.processAvailable(
        25
      );
      await request(arkApp)
        .get(
          apiRoutes.teacher.modelInvocation(
            queued.body.execution.modelExecutionRef
          )
        )
        .set(demoHeaders)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            status: "timed_out",
            attemptCount: 2,
            safeErrorCategory: "REQUEST_TIMED_OUT",
            proposalRevisionRef: null
          });
        });

      fake.setScenario("repair-fail");
      const retryRequest = {
        purpose: "teacher-copilot.retry-model",
        idempotencyKey: `gate26:retry:${randomUUID()}`,
        expectedStatus: "timed_out"
      };
      const retry = await request(arkApp)
        .post(
          apiRoutes.teacher.modelInvocationRetry(
            queued.body.execution.modelExecutionRef
          )
        )
        .set(demoHeaders)
        .send(retryRequest)
        .expect(202);
      expect(
        retry.body.execution.retryOfModelExecutionRef
      ).toBe(queued.body.execution.modelExecutionRef);
      const retryRef =
        retry.body.execution.modelExecutionRef;
      fake.setScenario("success");
      await arkProduct.workers.copilotOutbox.processAvailable(
        25
      );
      await request(arkApp)
        .get(apiRoutes.teacher.modelInvocation(retryRef))
        .set(demoHeaders)
        .expect(200)
        .expect(({ body }) => {
          expect(body.status).toBe("succeeded");
        });
      await request(arkApp)
        .post(
          apiRoutes.teacher.modelInvocationRetry(
            queued.body.execution.modelExecutionRef
          )
        )
        .set(demoHeaders)
        .send(retryRequest)
        .expect(200)
        .expect(({ body }) => {
          expect(body.replayed).toBe(true);
          expect(
            body.execution.modelExecutionRef
          ).toBe(retryRef);
        });
      const retryDecision = await adminPool.query<{
        count: string;
      }>(
        `SELECT count(*)::text AS count
           FROM governance.authorization_decision
          WHERE action = 'model-invocation.retry'
            AND resource_ref = $1`,
        [queued.body.execution.modelExecutionRef]
      );
      expect(retryDecision.rows[0]?.count).toBe("1");
    } finally {
      await arkProduct?.close();
      await fake?.close();
    }

    await resetGate1BData(adminPool);
    fake = await startFakeArkServer({
      scenario: "timeout",
      timeoutMilliseconds: 1_000
    });
    const runningSettings = arkSettings(fake.baseUrl, {
      timeoutMs: 2_000
    });
    arkProduct = createProductContainer(
      postgresEnvironment,
      {
        modelSettings: runningSettings,
        modelProvider: new VolcengineArkProvider(
          runningSettings.ark!
        )
      }
    );
    try {
      await arkProduct.services.seed.seed({
        includeGate25: true
      });
      const runningApp = createApp({
        product: arkProduct
      });
      const task = await createStartedTask(runningApp);
      const queued = await request(runningApp)
        .post(apiRoutes.teacher.modelInvocations)
        .set(demoHeaders)
        .send(invocationCommand(task))
        .expect(202);
      const processing =
        arkProduct.workers.copilotOutbox.processAvailable(25);
      await waitForModelStatus(
        runningApp,
        queued.body.execution.modelExecutionRef,
        "running"
      );
      await request(runningApp)
        .post(
          apiRoutes.teacher.modelInvocationCancel(
            queued.body.execution.modelExecutionRef
          )
        )
        .set(demoHeaders)
        .send({
          purpose: "teacher-copilot.cancel-model",
          idempotencyKey: `gate26:cancel-running:${randomUUID()}`,
          expectedStatus: "running"
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body.status).toBe("cancel_requested");
        });
      await processing;
      await request(runningApp)
        .get(
          apiRoutes.teacher.modelInvocation(
            queued.body.execution.modelExecutionRef
          )
        )
        .set(demoHeaders)
        .expect(200)
        .expect(({ body }) => {
          expect(body.status).toBe("cancelled");
          expect(body.proposalRevisionRef).toBeNull();
        });
    } finally {
      await arkProduct.close();
      await fake.close();
    }
  });

  it("exposes provider availability and usage without configuration secrets", async () => {
    const availability = await request(app)
      .get(apiRoutes.teacher.modelProviderAvailability)
      .set(demoHeaders)
      .expect(200);
    expect(availability.body).toMatchObject({
      activeProvider: "mock",
      configured: true,
      fallbackToMock: false
    });
    expect(JSON.stringify(availability.body)).not.toMatch(
      /apiKey|baseUrl|authorization/iu
    );
    await request(app)
      .get(apiRoutes.teacher.modelProviderCapabilities)
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toBeNull();
      });
    await request(app)
      .get(apiRoutes.teacher.modelUsageSummary)
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          provider: "mock",
          executionCount: 0,
          estimatedCost: 0
        });
      });
  });

  it("does not reuse a capability snapshot after the configured model ID changes", async () => {
    const fake = await startFakeArkServer();
    let firstProduct: ProductContainer | undefined;
    let secondProduct: ProductContainer | undefined;
    try {
      const firstSettings = arkSettings(
        fake.baseUrl,
        { modelId: "synthetic-ark-model-a" }
      );
      firstProduct = createProductContainer(
        postgresEnvironment,
        {
          modelSettings: firstSettings,
          modelProvider: new VolcengineArkProvider(
            firstSettings.ark!
          )
        }
      );
      const probed =
        await firstProduct.services.modelInvocations.runCapabilityProbe();
      expect(probed.supportsText).toBe(true);
      expect(probed).toMatchObject({
        live: false,
        imageUrlStatus: "supported",
        jsonObjectStatus: "supported",
        jsonSchemaStatus: "supported",
        functionCallingStatus: "supported",
        streamingStatus: "supported"
      });
      expect(
        await firstProduct.services.modelInvocations.getCapabilities()
      ).toEqual(probed);
      await firstProduct.close();
      firstProduct = undefined;

      const secondSettings = arkSettings(
        fake.baseUrl,
        { modelId: "synthetic-ark-model-b" }
      );
      secondProduct = createProductContainer(
        postgresEnvironment,
        {
          modelSettings: secondSettings,
          modelProvider: new VolcengineArkProvider(
            secondSettings.ark!
          )
        }
      );
      await expect(
        secondProduct.services.modelInvocations.getCapabilities()
      ).resolves.toBeNull();
    } finally {
      await firstProduct?.close();
      await secondProduct?.close();
      await fake.close();
    }
  });
});

async function exerciseFakeArkScenario(
  scenario: FakeArkScenario,
  expected: {
    expectedStatus: string;
    expectedAttempts: number;
    expectedProposals: number;
  }
) {
  await resetGate1BData(adminPool);
  let fake: FakeArkServer | undefined;
  let arkProduct: ProductContainer | undefined;
  try {
    fake = await startFakeArkServer({ scenario });
    const settings = readModelProviderSettings({
      APP_ENV: "test",
      MODEL_PROVIDER_MODE: "ark",
      ARK_BASE_URL: fake.baseUrl,
      ARK_API_KEY: "placeholder-for-local-fake",
      ARK_MODEL_ID: "synthetic-ark-model",
      ARK_MODEL_DISPLAY_NAME: "Synthetic Ark Model",
      ARK_API_MODE: "chat_completions",
      MODEL_REQUEST_TIMEOUT_MS: "2000",
      MODEL_MAX_OUTPUT_TOKENS: "512",
      MODEL_MAX_RETRIES: "2",
      MODEL_DEBUG_CONTENT: "false"
    });
    const provider = new VolcengineArkProvider(settings.ark!);
    arkProduct = createProductContainer(
      postgresEnvironment,
      {
        modelSettings: settings,
        modelProvider: provider
      }
    );
    await arkProduct.services.seed.seed({
      includeGate25: true
    });
    const arkApp = createApp({ product: arkProduct });
    const task = await createStartedTask(arkApp);
    const queued = await request(arkApp)
      .post(apiRoutes.teacher.modelInvocations)
      .set(demoHeaders)
      .send(invocationCommand(task))
      .expect(202);
    await arkProduct.workers.copilotOutbox.processAvailable(25);
    await request(arkApp)
      .get(
        apiRoutes.teacher.modelInvocation(
          queued.body.execution.modelExecutionRef
        )
      )
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe(expected.expectedStatus);
        expect(body.attemptCount).toBe(
          expected.expectedAttempts
        );
        expect(body.provider).toBe("volcengine-ark");
        expect(body.inputTokens).toBe(
          scenario.startsWith("repair") ? 240 : 120
        );
        expect(body.outputTokens).toBe(
          scenario.startsWith("repair") ? 480 : 240
        );
        expect(JSON.stringify(body)).not.toContain(
          "placeholder-for-local-fake"
        );
      });
    const proposals = await adminPool.query<{
      count: string;
    }>("SELECT count(*)::text AS count FROM work.task_result");
    expect(Number(proposals.rows[0]?.count ?? 0)).toBe(
      expected.expectedProposals
    );
  } finally {
    await arkProduct?.close();
    await fake?.close();
  }
}

function arkSettings(
  baseUrl: string,
  input: {
    timeoutMs?: number;
    modelId?: string;
  } = {}
) {
  return readModelProviderSettings({
    APP_ENV: "test",
    MODEL_PROVIDER_MODE: "ark",
    ARK_BASE_URL: baseUrl,
    ARK_API_KEY: "placeholder-for-local-fake",
    ARK_MODEL_ID: input.modelId ?? "synthetic-ark-model",
    ARK_MODEL_DISPLAY_NAME: "Synthetic Ark Model",
    ARK_API_MODE: "chat_completions",
    MODEL_REQUEST_TIMEOUT_MS: String(
      input.timeoutMs ?? 2_000
    ),
    MODEL_MAX_OUTPUT_TOKENS: "512",
    MODEL_MAX_RETRIES: "2",
    MODEL_DEBUG_CONTENT: "false"
  });
}

async function waitForModelStatus(
  targetApp: ReturnType<typeof createApp>,
  executionRef: string,
  expectedStatus: string
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await request(targetApp)
      .get(apiRoutes.teacher.modelInvocation(executionRef))
      .set(demoHeaders);
    if (response.body.status === expectedStatus) return;
    await wait(10);
  }
  throw new Error(
    `ModelExecution ${executionRef} did not reach ${expectedStatus}.`
  );
}

async function createStartedTask(
  targetApp: ReturnType<typeof createApp>
) {
  const created = await request(targetApp)
    .post(apiRoutes.teacher.preparationTasks)
    .set(demoHeaders)
    .send({
      lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
      dueAt: null,
      priority: "high",
      purpose: "lesson-preparation.create",
      idempotencyKey: `gate26:create:${randomUUID()}`
    })
    .expect(201);
  const started = await request(targetApp)
    .post(
      apiRoutes.teacher.preparationTaskStart(
        created.body.task.taskRef
      )
    )
    .set(demoHeaders)
    .send({
      expectedVersion: created.body.task.version,
      purpose: "lesson-preparation.start",
      idempotencyKey: `gate26:start:${randomUUID()}`
    })
    .expect(201);
  return started.body.task;
}

function invocationCommand(task: {
  taskRef: string;
  version: number;
  courseRunRef: string;
  curriculumUnitRef: string;
  lessonRef: string;
  workingSet: {
    version: number;
    learningObjectiveRefs: string[];
    evidenceRefs: string[];
  };
}) {
  return {
    requestText:
      "请强化斜率变化与图像陡峭程度的联系，并保留独立检查。",
    courseRunRef: task.courseRunRef,
    goalRef: gate2DemoRefs.goalRef,
    learningObjectiveRefs:
      task.workingSet.learningObjectiveRefs,
    selectedEvidenceRefs: task.workingSet.evidenceRefs,
    requestVersion: 1,
    purpose: "teacher-copilot.adjust-next-lesson",
    idempotencyKey: `gate26:invoke:${randomUUID()}`,
    preparationTaskRef: task.taskRef,
    curriculumUnitRef: task.curriculumUnitRef,
    lessonRef: task.lessonRef,
    workingSetVersion: task.workingSet.version,
    expectedPreparationTaskVersion: task.version
  };
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

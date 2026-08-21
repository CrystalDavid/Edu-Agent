import { randomUUID } from "node:crypto";

import { apiRoutes } from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/sample-data";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import {
  createProductContainer
} from "../../apps/api/src/composition/product-container.js";
import { seedSampleData } from "../../scripts/sample/seed-sample-data.js";
import {
  gate25DemoRefs
} from "../../scripts/sample/gate2-5-demo-fixture.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const product = createProductContainer(postgresEnvironment, {
  memoryTemporaryOverridesSettings: {
    enabled: true,
    policyVersion: "temporary-preference-override-policy@1"
  }
});
const app = createApp({ product, allowTestIdentityHeaders: true });
const headers = {
  "x-demo-tenant": gate2DemoRefs.tenantRef,
  "x-demo-actor": gate2DemoRefs.teacherRef
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await seedSampleData(postgresEnvironment, { includeGate25: true });
});

afterAll(async () => {
  await Promise.all([product.close(), adminPool.end()]);
});

describe("formal temporary preference overrides in PostgreSQL", () => {
  it("persists V2 replace/supersession/clear append-only without durable writes", async () => {
    const { conversation } = await createTaskConversation(app);
    const appliedKey = `temporary:apply:${randomUUID()}`;
    const applied = await dispatch(
      app,
      conversation,
      "这次教案写详细一点，但别改我平时的习惯。",
      appliedKey
    );
    expect(applied.body).toMatchObject({
      kind: "model_instruction",
      temporaryOverrideReceipt: {
        status: "applied",
        longTermPreferenceChanged: false,
        teacherMemoryEpochBefore: 0,
        teacherMemoryEpochAfter: 0
      },
      workingMemory: {
        builderVersion: "working-memory-builder@2",
        temporaryOverrides: [{
          canonicalKey: "lesson_plan_detail",
          effect: "replace_value",
          canonicalValue: "详细",
          eligibleForConsolidation: false
        }]
      }
    });
    expect(applied.body.turn).toMatchObject({
      actorKind: "teacher",
      contentKind: "teacher_text"
    });
    const firstSnapshotRef = applied.body.workingMemory.snapshotRef as string;

    await request(app)
      .post(apiRoutes.teacher.conversationDispatchTurn(
        conversation.conversationRef
      ))
      .set(headers)
      .send(command(
        conversation,
        "这次教案写详细一点，但别改我平时的习惯。",
        appliedKey
      ))
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
        expect(body.workingMemory.snapshotRef).toBe(firstSnapshotRef);
      });

    const rowsBeforeFailedTurn = await conversationRuntimeRowCounts(
      conversation.conversationRef
    );
    await request(app)
      .post(apiRoutes.teacher.conversationDispatchTurn(
        conversation.conversationRef
      ))
      .set(headers)
      .send(command(
        conversation,
        "这次教案保持简洁。",
        `temporary:stale:${randomUUID()}`
      ))
      .expect(409);
    expect(await conversationRuntimeRowCounts(conversation.conversationRef))
      .toEqual(rowsBeforeFailedTurn);

    const inherited = await dispatch(
      app,
      applied.body.conversation,
      "再加一个互动活动。"
    );
    expect(inherited.body.workingMemory.temporaryOverrides).toMatchObject([{
      overrideRef: applied.body.workingMemory.temporaryOverrides[0].overrideRef,
      canonicalKey: "lesson_plan_detail",
      canonicalValue: "详细"
    }]);

    const cleared = await dispatch(
      app,
      inherited.body.conversation,
      "恢复平时的习惯。"
    );
    expect(cleared.body).toMatchObject({
      temporaryOverrideReceipt: {
        status: "cleared",
        longTermPreferenceChanged: false,
        teacherMemoryEpochBefore: 0,
        teacherMemoryEpochAfter: 0
      },
      workingMemory: {
        builderVersion: "working-memory-builder@2",
        temporaryOverrides: []
      }
    });

    const persisted = await adminPool.query<{
      snapshot_ref: string;
      status: string;
      builder_version: string;
      temporary_overrides: Array<Record<string, unknown>>;
    }>(
      `SELECT snapshot_ref, status, builder_version, temporary_overrides
         FROM runtime.working_memory_snapshot
        WHERE conversation_ref = $1
        ORDER BY version`,
      [conversation.conversationRef]
    );
    expect(persisted.rows).toHaveLength(3);
    expect(persisted.rows.filter((row) => row.status === "active"))
      .toHaveLength(1);
    expect(persisted.rows.at(-1)).toMatchObject({
      status: "active",
      builder_version: "working-memory-builder@2",
      temporary_overrides: []
    });
    expect(JSON.stringify(persisted.rows[0]?.temporary_overrides))
      .not.toContain("这次教案写详细一点");
    await expect(adminPool.query(
      `UPDATE runtime.working_memory_snapshot
          SET rolling_summary = 'synthetic mutation'
        WHERE snapshot_ref = $1`,
      [firstSnapshotRef]
    )).rejects.toThrow();

    const durableCounts = await durableMemoryCounts();
    expect(durableCounts).toEqual({
      candidates: "0",
      preferences: "0",
      epoch: "0"
    });
    const restarted = createProductContainer(postgresEnvironment, {
      memoryTemporaryOverridesSettings: {
        enabled: true,
        policyVersion: "temporary-preference-override-policy@1"
      }
    });
    try {
      const restartedApp = createApp({
        product: restarted,
        allowTestIdentityHeaders: true
      });
      await request(restartedApp)
        .get(apiRoutes.teacher.conversation(conversation.conversationRef))
        .set(headers)
        .expect(200)
        .expect(({ body }) => {
          expect(body.workingMemory).toMatchObject({
            builderVersion: "working-memory-builder@2",
            temporaryOverrides: []
          });
        });
    } finally {
      await restarted.close();
    }
  });

  it("seals Pack V3, overrides durable application, and preserves queued state after clear", async () => {
    const { task, conversation } = await createTaskConversation(app);
    const remembered = await dispatch(app, conversation, "以后教案尽量简洁");
    expect(remembered.body.kind).toBe("memory_command");
    expect(await memoryEpoch()).toBe(1);
    const preferenceRef = remembered.body.receipt.items[0]
      .preferenceRef as string;
    const preferenceVersion = remembered.body.receipt.items[0]
      .preferenceVersion as number;

    const temporaryText =
      "这次是公开课，教案写详细一点，但别改我平时的习惯。";
    const temporary = await dispatch(
      app,
      remembered.body.conversation,
      temporaryText
    );
    const queued = await queueInvocation({
      targetApp: app,
      task,
      dispatchBody: temporary.body,
      requestText: temporaryText
    });
    const sealedSnapshotRef = temporary.body.workingMemory.snapshotRef as string;

    const cleared = await dispatch(
      app,
      temporary.body.conversation,
      "恢复平时的习惯。"
    );
    expect(cleared.body.workingMemory.temporaryOverrides).toEqual([]);
    await product.services.modelInvocations.processExecution(
      queued.modelExecutionRef
    );
    await expectExecutionSucceeded(app, queued.modelExecutionRef);

    const persisted = await adminPool.query<{
      skill_ref: string;
      snapshot_ref: string;
      pack: Record<string, unknown>;
    }>(
      `SELECT execution.input_summary->>'skillRef' AS skill_ref,
              execution.input_summary->>'workingMemorySnapshotRef' AS snapshot_ref,
              run.output->'contextEngineering'->'memoryContextPackManifest' AS pack
         FROM capability.model_execution AS execution
         JOIN runtime.agent_run AS run
           ON run.agent_run_ref = execution.agent_run_ref
        WHERE execution.execution_ref = $1`,
      [queued.modelExecutionRef]
    );
    expect(persisted.rows[0]).toMatchObject({
      skill_ref: "lesson-preparation@7",
      snapshot_ref: sealedSnapshotRef,
      pack: {
        manifestVersion: 3,
        teacherMemoryEpoch: 1,
        injectedOverrideCount: 1,
        suppressedPreferenceCount: 0,
        overridePolicyVersion: "temporary-preference-override-policy@1"
      }
    });
    const pack = persisted.rows[0]!.pack as {
      temporaryOverrideSetHash: string;
      temporaryOverrideDecisions: Array<Record<string, unknown>>;
      preferenceDecisions: Array<Record<string, unknown>>;
    };
    expect(pack.temporaryOverrideSetHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(pack.temporaryOverrideDecisions).toMatchObject([{
      canonicalKey: "lesson_plan_detail",
      effect: "replace_value",
      decision: "injected",
      reasonCode: "temporary_override"
    }]);
    expect(pack.preferenceDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceRef: preferenceRef,
        sourceVersion: preferenceVersion,
        decision: "overridden",
        reasonCode: "current_instruction_override"
      })
    ]));
    const applications = await adminPool.query<{
      decision: string;
      reason_code: string;
    }>(
      `SELECT decision, reason_code
         FROM personalization.memory_application
        WHERE agent_run_ref = $1 AND preference_ref = $2`,
      [queued.agentRunRef, preferenceRef]
    );
    expect(applications.rows).toEqual([{
      decision: "overridden",
      reason_code: "current_instruction_override"
    }]);
    expect(await memoryEpoch()).toBe(1);
    expect(await preferenceState(preferenceRef)).toMatchObject({
      preference_status: "active",
      version: preferenceVersion,
      preference_value: "简洁"
    });

    const currentAfterQueuedRun = await loadConversation(
      app,
      conversation.conversationRef
    );
    const ordinary = await dispatch(
      app,
      currentAfterQueuedRun,
      "请继续完善教案。"
    );
    const newRun = await queueInvocation({
      targetApp: app,
      task,
      dispatchBody: ordinary.body,
      requestText: "请继续完善教案。"
    });
    await product.services.modelInvocations.processExecution(
      newRun.modelExecutionRef
    );
    await expectExecutionSucceeded(app, newRun.modelExecutionRef);
    const newPack = await packForExecution(newRun.modelExecutionRef);
    expect(newPack).toMatchObject({
      manifestVersion: 3,
      injectedOverrideCount: 0,
      teacherMemoryEpoch: 1
    });
    expect(newPack.preferenceDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceRef: preferenceRef,
        decision: "injected"
      })
    ]));
  });

  it("suppresses a durable preference and supports an override without one", async () => {
    const { task, conversation } = await createTaskConversation(app);
    const remembered = await dispatch(
      app,
      conversation,
      "以后案例尽量贴近日常生活"
    );
    const preferenceRef = remembered.body.receipt.items[0]
      .preferenceRef as string;
    const epoch = await memoryEpoch();
    const suppressed = await dispatch(
      app,
      remembered.body.conversation,
      "这次不要使用生活化案例。"
    );
    const firstRun = await queueInvocation({
      targetApp: app,
      task,
      dispatchBody: suppressed.body,
      requestText: "这次不要使用生活化案例。"
    });
    await product.services.modelInvocations.processExecution(
      firstRun.modelExecutionRef
    );
    await expectExecutionSucceeded(app, firstRun.modelExecutionRef);
    const firstPack = await packForExecution(firstRun.modelExecutionRef);
    expect(firstPack).toMatchObject({
      manifestVersion: 3,
      suppressedPreferenceCount: 1
    });
    expect(firstPack.preferenceDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceRef: preferenceRef,
        decision: "overridden",
        reasonCode: "current_instruction_override"
      })
    ]));
    expect(await memoryEpoch()).toBe(epoch);
    expect((await preferenceState(preferenceRef)).preference_status)
      .toBe("active");

    const currentAfterSuppressedRun = await loadConversation(
      app,
      conversation.conversationRef
    );
    const detailedResponse = await dispatch(
      app,
      currentAfterSuppressedRun,
      "本次建议写详细一些。"
    );
    const secondRun = await queueInvocation({
      targetApp: app,
      task,
      dispatchBody: detailedResponse.body,
      requestText: "本次建议写详细一些。"
    });
    await product.services.modelInvocations.processExecution(
      secondRun.modelExecutionRef
    );
    await expectExecutionSucceeded(app, secondRun.modelExecutionRef);
    const secondPack = await packForExecution(secondRun.modelExecutionRef);
    expect(secondPack.temporaryOverrideDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalKey: "response_length",
          effect: "replace_value"
        })
      ])
    );
    expect(secondPack.preferenceDecisions.some((entry) =>
      entry.canonicalKey === "response_length" &&
      entry.reasonCode === "current_instruction_override"
    )).toBe(false);
  });

  it("isolates Conversations and fails open to V1/@6 when the flag is disabled", async () => {
    const first = await createTaskConversation(app);
    const temporary = await dispatch(
      app,
      first.conversation,
      "这次教案写详细一点"
    );
    expect(temporary.body.workingMemory.temporaryOverrides).toHaveLength(1);

    await request(app)
      .post(apiRoutes.teacher.conversationClose(
        first.conversation.conversationRef
      ))
      .set(headers)
      .send({
        expectedConversationVersion: temporary.body.conversation.version,
        purpose: "teacher-copilot.conversation.close",
        idempotencyKey: `temporary-close:${randomUUID()}`
      })
      .expect(201);
    const secondConversation = await createConversation(app, first.task);
    const ordinary = await dispatch(
      app,
      secondConversation,
      "请生成一份教案。"
    );
    expect(ordinary.body.workingMemory).toMatchObject({
      builderVersion: "working-memory-builder@2",
      temporaryOverrides: []
    });
    await request(app)
      .get(apiRoutes.teacher.conversation(first.conversation.conversationRef))
      .set({
        "x-demo-tenant": gate2DemoRefs.tenantRef,
        "x-demo-actor": "user:foreign-teacher"
      })
      .expect(403);

    await request(app)
      .post(apiRoutes.teacher.conversationClose(
        secondConversation.conversationRef
      ))
      .set(headers)
      .send({
        expectedConversationVersion: ordinary.body.conversation.version,
        purpose: "teacher-copilot.conversation.close",
        idempotencyKey: `temporary-close-second:${randomUUID()}`
      })
      .expect(201);

    const disabledProduct = createProductContainer(postgresEnvironment, {
      memoryTemporaryOverridesSettings: {
        enabled: false,
        policyVersion: "temporary-preference-override-policy@1"
      }
    });
    try {
      const disabledApp = createApp({
        product: disabledProduct,
        allowTestIdentityHeaders: true
      });
      const disabledConversation = await createConversation(
        disabledApp,
        first.task
      );
      const dispatched = await dispatch(
        disabledApp,
        disabledConversation,
        "这次教案写详细一点"
      );
      expect(dispatched.body.kind).toBe("model_instruction");
      expect(dispatched.body.temporaryOverrideReceipt).toBeUndefined();
      expect(dispatched.body.workingMemory).toMatchObject({
        builderVersion: "working-memory-builder@1"
      });
      const queued = await queueInvocation({
        targetApp: disabledApp,
        task: first.task,
        dispatchBody: dispatched.body,
        requestText: "这次教案写详细一点"
      });
      await disabledProduct.services.modelInvocations.processExecution(
        queued.modelExecutionRef
      );
      await expectExecutionSucceeded(disabledApp, queued.modelExecutionRef);
      expect(await packForExecution(queued.modelExecutionRef)).toMatchObject({
        manifestVersion: 2,
        skillRef: "lesson-preparation@6"
      });
    } finally {
      await disabledProduct.close();
    }
  });

  it("stops applying an active override after the owning Task becomes terminal", async () => {
    const { task, conversation } = await createTaskConversation(app);
    const applied = await dispatch(
      app,
      conversation,
      "这次教案写详细一点。"
    );
    const cancelled = await request(app)
      .post(apiRoutes.teacher.preparationTaskCancel(task.taskRef))
      .set(headers)
      .send({
        expectedVersion: task.version,
        purpose: "lesson-preparation.cancel",
        idempotencyKey: `temporary-task-cancel:${randomUUID()}`
      })
      .expect(201);
    await request(app)
      .post(apiRoutes.teacher.conversationDispatchTurn(
        conversation.conversationRef
      ))
      .set(headers)
      .send(command(
        applied.body.conversation,
        "请继续完善教案。"
      ))
      .expect(404);
    const reopened = await request(app)
      .post(apiRoutes.teacher.preparationTaskReopen(task.taskRef))
      .set(headers)
      .send({
        expectedVersion: cancelled.body.task.version,
        purpose: "lesson-preparation.reopen",
        idempotencyKey: `temporary-task-reopen:${randomUUID()}`
      })
      .expect(201);
    await request(app)
      .post(apiRoutes.teacher.conversationDispatchTurn(
        conversation.conversationRef
      ))
      .set(headers)
      .send(command(
        applied.body.conversation,
        "请继续完善教案。"
      ))
      .expect(404);
    const reopenedTask = reopened.body.task;
    await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(headers)
      .send({
        courseRunRef: reopenedTask.courseRunRef,
        goalRef: gate2DemoRefs.goalRef,
        learningObjectiveRefs:
          reopenedTask.workingSet.learningObjectiveRefs,
        selectedEvidenceRefs: reopenedTask.workingSet.evidenceRefs,
        purpose: "teacher-copilot.adjust-next-lesson",
        idempotencyKey: `temporary-terminal-invocation:${randomUUID()}`,
        preparationTaskRef: reopenedTask.taskRef,
        curriculumUnitRef: reopenedTask.curriculumUnitRef,
        lessonRef: reopenedTask.lessonRef,
        workingSetVersion: reopenedTask.workingSet.version,
        expectedPreparationTaskVersion: reopenedTask.version,
        requestText: "这次教案写详细一点。",
        requestVersion: 2,
        conversationRef: applied.body.conversation.conversationRef,
        turnRef: applied.body.turn.turnRef,
        parentTurnRef: applied.body.turn.parentTurnRef,
        conversationVersion: applied.body.conversation.version
      })
      .expect(409);
    const freshConversation = await createConversation(app, reopened.body.task);
    const fresh = await dispatch(app, freshConversation, "请重新开始备课。");
    expect(fresh.body.workingMemory).toMatchObject({
      builderVersion: "working-memory-builder@2",
      temporaryOverrides: []
    });
  });

  it("expires active V2 overrides while keeping the sealed historical Pack explainable", async () => {
    const expiringProduct = createProductContainer(postgresEnvironment, {
      conversationRetentionSettings: {
        durationMilliseconds: 2_000,
        policyVersion: "conversation-retention@1"
      },
      memoryTemporaryOverridesSettings: {
        enabled: true,
        policyVersion: "temporary-preference-override-policy@1"
      }
    });
    try {
      const expiringApp = createApp({
        product: expiringProduct,
        allowTestIdentityHeaders: true
      });
      const { task, conversation } = await createTaskConversation(expiringApp);
      const teacherText = "这次教案写详细一点。";
      const dispatched = await dispatch(
        expiringApp,
        conversation,
        teacherText
      );
      const queued = await queueInvocation({
        targetApp: expiringApp,
        task,
        dispatchBody: dispatched.body,
        requestText: teacherText
      });
      await expiringProduct.services.modelInvocations.processExecution(
        queued.modelExecutionRef
      );
      const execution = await expectExecutionSucceeded(
        expiringApp,
        queued.modelExecutionRef
      );
      const proposalRevisionRef = execution.body.proposalRevisionRef as string;
      await new Promise((resolve) => setTimeout(resolve, 2_100));

      await request(expiringApp)
        .get(apiRoutes.teacher.conversation(conversation.conversationRef))
        .set(headers)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            status: "expired",
            turns: [],
            workingMemory: null
          });
        });
      await request(expiringApp)
        .get(apiRoutes.demo.proposalDetail(proposalRevisionRef))
        .set(headers)
        .expect(200)
        .expect(({ body }) => {
          expect(body.memoryContext).toMatchObject({
            manifestVersion: 3,
            currentTurn: null,
            workingMemory: [],
            temporaryOverrides: [expect.objectContaining({
              canonicalKey: "lesson_plan_detail",
              displayValue: "内容已按对话保留策略过期"
            })]
          });
        });
    } finally {
      await expiringProduct.close();
    }
  });
});

async function createTaskConversation(
  targetApp: ReturnType<typeof createApp>
) {
  const created = await request(targetApp)
    .post(apiRoutes.teacher.preparationTasks)
    .set(headers)
    .send({
      lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
      dueAt: null,
      priority: "high",
      purpose: "lesson-preparation.create",
      idempotencyKey: `temporary-task:${randomUUID()}`
    })
    .expect(201);
  const started = await request(targetApp)
    .post(apiRoutes.teacher.preparationTaskStart(created.body.task.taskRef))
    .set(headers)
    .send({
      expectedVersion: created.body.task.version,
      purpose: "lesson-preparation.start",
      idempotencyKey: `temporary-task-start:${randomUUID()}`
    })
    .expect(201);
  const conversation = await createConversation(targetApp, started.body.task);
  return {
    task: started.body.task,
    conversation
  };
}

async function createConversation(
  targetApp: ReturnType<typeof createApp>,
  task: {
    taskRef: string;
    courseRunRef: string;
    lessonRef: string;
  }
) {
  const conversation = await request(targetApp)
    .post(apiRoutes.teacher.conversations)
    .set(headers)
    .send({
      taskRef: task.taskRef,
      purposeFamily: "lesson_preparation",
      courseRunRef: task.courseRunRef,
      lessonRef: task.lessonRef,
      purpose: "teacher-copilot.conversation.create",
      idempotencyKey: `temporary-conversation:${randomUUID()}`
    })
    .expect(201);
  return conversation.body.conversation;
}

function command(
  conversation: { lastTurnRef: string | null; version: number },
  teacherText: string,
  idempotencyKey = `temporary-dispatch:${randomUUID()}`
) {
  return {
    teacherText,
    parentTurnRef: conversation.lastTurnRef,
    expectedConversationVersion: conversation.version,
    purpose: "teacher-copilot.conversation.dispatch-turn" as const,
    idempotencyKey
  };
}

async function dispatch(
  targetApp: ReturnType<typeof createApp>,
  conversation: {
    conversationRef: string;
    lastTurnRef: string | null;
    version: number;
  },
  teacherText: string,
  idempotencyKey?: string
) {
  return request(targetApp)
    .post(apiRoutes.teacher.conversationDispatchTurn(
      conversation.conversationRef
    ))
    .set(headers)
    .send(command(conversation, teacherText, idempotencyKey))
    .expect((response) => {
      if (![200, 201].includes(response.status)) {
        throw new Error(
          `Dispatch failed with ${response.status}: ${JSON.stringify(response.body)}`
        );
      }
    });
}

async function loadConversation(
  targetApp: ReturnType<typeof createApp>,
  conversationRef: string
) {
  const response = await request(targetApp)
    .get(apiRoutes.teacher.conversation(conversationRef))
    .set(headers)
    .expect(200);
  return response.body.conversation ?? response.body;
}

async function queueInvocation(input: {
  targetApp: ReturnType<typeof createApp>;
  task: {
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
  };
  dispatchBody: {
    turn: { turnRef: string; parentTurnRef: string | null };
    conversation: { conversationRef: string; version: number };
  };
  requestText: string;
}) {
  const refreshedTask = await request(input.targetApp)
    .get(apiRoutes.teacher.preparationTask(input.task.taskRef))
    .set(headers)
    .expect(200);
  const task = refreshedTask.body as typeof input.task;
  const response = await request(input.targetApp)
    .post(apiRoutes.teacher.modelInvocations)
    .set(headers)
    .send({
      courseRunRef: task.courseRunRef,
      goalRef: gate2DemoRefs.goalRef,
      learningObjectiveRefs: task.workingSet.learningObjectiveRefs,
      selectedEvidenceRefs: task.workingSet.evidenceRefs,
      purpose: "teacher-copilot.adjust-next-lesson",
      idempotencyKey: `temporary-invocation:${randomUUID()}`,
      preparationTaskRef: task.taskRef,
      curriculumUnitRef: task.curriculumUnitRef,
      lessonRef: task.lessonRef,
      workingSetVersion: task.workingSet.version,
      expectedPreparationTaskVersion: task.version,
      requestText: input.requestText,
      requestVersion: 2,
      conversationRef: input.dispatchBody.conversation.conversationRef,
      turnRef: input.dispatchBody.turn.turnRef,
      parentTurnRef: input.dispatchBody.turn.parentTurnRef,
      conversationVersion: input.dispatchBody.conversation.version
    })
    .expect(202);
  return {
    modelExecutionRef: response.body.execution.modelExecutionRef as string,
    agentRunRef: response.body.execution.agentRunRef as string
  };
}

async function expectExecutionSucceeded(
  targetApp: ReturnType<typeof createApp>,
  executionRef: string
) {
  return request(targetApp)
    .get(apiRoutes.teacher.modelInvocation(executionRef))
    .set(headers)
    .expect(200)
    .expect(({ body }) => expect(body.status).toBe("succeeded"));
}

async function packForExecution(executionRef: string): Promise<{
  manifestVersion: number;
  skillRef: string;
  teacherMemoryEpoch: number;
  injectedOverrideCount: number;
  suppressedPreferenceCount: number;
  preferenceDecisions: Array<Record<string, unknown>>;
  temporaryOverrideDecisions: Array<Record<string, unknown>>;
}> {
  const result = await adminPool.query<{ pack: Record<string, unknown> }>(
    `SELECT run.output->'contextEngineering'->'memoryContextPackManifest' AS pack
       FROM capability.model_execution AS execution
       JOIN runtime.agent_run AS run
         ON run.agent_run_ref = execution.agent_run_ref
      WHERE execution.execution_ref = $1`,
    [executionRef]
  );
  return result.rows[0]!.pack as Awaited<ReturnType<typeof packForExecution>>;
}

async function memoryEpoch(): Promise<number> {
  const result = await adminPool.query<{ memory_epoch: string | number }>(
    `SELECT memory_epoch FROM personalization.teacher_memory_state
      WHERE tenant_ref = $1 AND teacher_ref = $2`,
    [gate2DemoRefs.tenantRef, gate2DemoRefs.teacherRef]
  );
  return Number(result.rows[0]?.memory_epoch ?? 0);
}

async function durableMemoryCounts() {
  const result = await adminPool.query<{
    candidates: string;
    preferences: string;
    epoch: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM personalization.memory_candidate
         WHERE tenant_ref = $1 AND teacher_ref = $2) AS candidates,
       (SELECT count(*)::text FROM personalization.teacher_preference
         WHERE tenant_ref = $1 AND teacher_ref = $2) AS preferences,
       COALESCE((SELECT memory_epoch::text
         FROM personalization.teacher_memory_state
         WHERE tenant_ref = $1 AND teacher_ref = $2), '0') AS epoch`,
    [gate2DemoRefs.tenantRef, gate2DemoRefs.teacherRef]
  );
  return result.rows[0];
}

async function conversationRuntimeRowCounts(conversationRef: string) {
  const result = await adminPool.query<{
    turns: string;
    snapshots: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM work.conversation_turn
         WHERE conversation_ref = $1) AS turns,
       (SELECT count(*)::text FROM runtime.working_memory_snapshot
         WHERE conversation_ref = $1) AS snapshots`,
    [conversationRef]
  );
  return result.rows[0];
}

async function preferenceState(preferenceRef: string) {
  const result = await adminPool.query<{
    preference_status: string;
    version: number;
    preference_value: string;
  }>(
    `SELECT preference_status, current_version AS version, preference_value
       FROM personalization.teacher_preference
      WHERE preference_ref = $1`,
    [preferenceRef]
  );
  return result.rows[0]!;
}

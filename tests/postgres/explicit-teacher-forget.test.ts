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
const product = createProductContainer(postgresEnvironment);
const app = createApp({ product, allowTestIdentityHeaders: true });
const headers = {
  "x-demo-tenant": gate2DemoRefs.tenantRef,
  "x-demo-actor": gate2DemoRefs.teacherRef
};
const foreignHeaders = {
  "x-demo-tenant": "tenant:demo-school-b",
  "x-demo-actor": "user:teacher-b-001"
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await seedSampleData(postgresEnvironment, { includeGate25: true });
});

afterAll(async () => {
  await Promise.all([product.close(), adminPool.end()]);
});

describe("explicit teacher forget PostgreSQL", () => {
  it("revokes one active preference, preserves history, and excludes it from every later run", async () => {
    const { task, conversation } = await createTaskConversation(app);
    const remembered = await dispatch(
      app,
      conversation,
      "记住：以后案例尽量贴近日常生活"
    );
    const preferenceRef = remembered.body.receipt.items[0].preferenceRef as string;
    expect(await memoryEpoch()).toBe(1);

    const historical = await runModelInstruction({
      targetApp: app,
      targetProduct: product,
      task,
      conversation: remembered.body.conversation,
      teacherText: "请生成一版贴近日常生活的斜率教案"
    });
    expect(historical.proposal.memoryContext).toMatchObject({
      manifestVersion: 3,
      durablePreferences: [
        expect.objectContaining({
          preferenceRef,
          decision: "injected",
          currentStatus: "active"
        })
      ]
    });

    const beforeForgetCounts = await generationCounts(task.taskRef);
    const current = await loadConversation(app, conversation.conversationRef);
    const teacherText = "忘掉我之前关于案例类型的偏好。";
    const forgotten = await dispatch(app, current, teacherText);
    expect(forgotten.body).toMatchObject({
      kind: "memory_command",
      receipt: {
        status: "revoked",
        memoryEpochBefore: 1,
        memoryEpochAfter: 2,
        targets: [
          expect.objectContaining({
            canonicalKey: "example_preference",
            status: "revoked",
            options: [expect.objectContaining({ preferenceRef })]
          })
        ]
      },
      conversation: {
        workingMemory: {
          activeGoal: {
            text: "请生成一版贴近日常生活的斜率教案"
          }
        }
      }
    });
    expect(forgotten.body.receipt.safeMessage).toContain("已忘掉 1 条偏好");
    expect(await generationCounts(task.taskRef)).toEqual(beforeForgetCounts);

    const stored = await adminPool.query<{
      status: string;
      version: number;
      revisions: string;
      raw_command_copies: string;
      authorization_count: string;
      audit_count: string;
    }>(
      `SELECT
         p.preference_status AS status,
         p.current_version AS version,
         (SELECT count(*)::text
            FROM personalization.teacher_preference_revision r
           WHERE r.preference_ref = p.preference_ref) AS revisions,
         (SELECT count(*)::text
            FROM personalization.teacher_preference candidate
           WHERE position($2 in to_jsonb(candidate)::text) > 0) AS raw_command_copies,
         (SELECT count(*)::text
            FROM governance.authorization_decision
           WHERE tenant_ref = $3 AND actor_ref = $4
             AND action = 'personalization.explicit-forget.apply')
           AS authorization_count,
         (SELECT count(*)::text
            FROM governance.audit_record
           WHERE actor_ref = $4
             AND record_type = 'ExplicitTeacherForgetCommandEvaluated')
           AS audit_count
       FROM personalization.teacher_preference p
      WHERE p.preference_ref = $1`,
      [
        preferenceRef,
        teacherText,
        gate2DemoRefs.tenantRef,
        gate2DemoRefs.teacherRef
      ]
    );
    expect(stored.rows[0]).toEqual({
      status: "revoked",
      version: 2,
      revisions: "2",
      raw_command_copies: "0",
      authorization_count: "1",
      audit_count: "1"
    });
    await expect(
      adminPool.query(
        `UPDATE personalization.teacher_preference_revision
            SET preference_value = 'synthetic-mutated'
          WHERE preference_ref = $1 AND version = 1`,
        [preferenceRef]
      )
    ).rejects.toThrow(/immutable/u);
    await expect(
      adminPool.query(
        `DELETE FROM personalization.teacher_preference_revision
          WHERE preference_ref = $1 AND version = 1`,
        [preferenceRef]
      )
    ).rejects.toThrow(/immutable/u);
    await expect(
      adminPool.query(
        "DELETE FROM personalization.teacher_preference WHERE preference_ref = $1",
        [preferenceRef]
      )
    ).rejects.toThrow(/physical deletion is forbidden/u);

    const resolved = await product.services.personalization
      .resolveConfirmedPreferences(preferenceQuery(task));
    expect(resolved.selected).toEqual([]);
    expect(resolved.excluded).toEqual([]);

    await request(app)
      .get(apiRoutes.demo.proposalDetail(historical.proposalRevisionRef))
      .set(headers)
      .expect(200)
      .expect(({ body }) => {
        expect(body.memoryContext.durablePreferences).toEqual([
          expect.objectContaining({
            preferenceRef,
            preferenceValue: "优先使用贴近日常生活的案例",
            decision: "injected",
            currentStatus: "revoked"
          })
        ]);
      });

    const afterForget = await loadConversation(
      app,
      conversation.conversationRef
    );
    const later = await runModelInstruction({
      targetApp: app,
      targetProduct: product,
      task,
      conversation: afterForget,
      teacherText: "请再生成一版新的斜率教案"
    });
    expect(JSON.stringify(later.proposal.memoryContext.durablePreferences))
      .not.toContain(preferenceRef);
    const laterApplications = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM personalization.memory_application
        WHERE agent_run_ref = $1 AND preference_ref = $2`,
      [later.agentRunRef, preferenceRef]
    );
    expect(laterApplications.rows[0]?.count).toBe("0");

    const restarted = createProductContainer(postgresEnvironment);
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
          expect(body.memoryCommands).toEqual(expect.arrayContaining([
            expect.objectContaining({
              commandTurnRef: forgotten.body.teacherTurn.turnRef,
              status: "revoked",
              preferenceRefs: [preferenceRef]
            })
          ]));
        });
    } finally {
      await restarted.close();
    }
  });

  it("requires persisted multi-scope selection and confirms only an authorized subset", async () => {
    const { task, conversation } = await createTaskConversation(app);
    const global = await dispatch(
      app,
      conversation,
      "记住：以后案例尽量贴近日常生活"
    );
    const globalRef = global.body.receipt.items[0].preferenceRef as string;
    const course = await dispatch(
      app,
      global.body.conversation,
      "记住：这门课以后案例尽量贴近日常生活"
    );
    const courseRef = course.body.receipt.items[0].preferenceRef as string;
    expect(await memoryEpoch()).toBe(2);

    const selection = await dispatch(
      app,
      course.body.conversation,
      "忘掉案例偏好"
    );
    expect(selection.body).toMatchObject({
      kind: "memory_command",
      receipt: {
        status: "selection_required",
        memoryEpochBefore: 2,
        memoryEpochAfter: 2
      }
    });
    const options = selection.body.receipt.targets[0].options as Array<{
      preferenceRef: string;
      preferenceVersion: number;
      scope: { kind: string };
    }>;
    expect(options.map((option) => option.preferenceRef).sort())
      .toEqual([courseRef, globalRef].sort());
    expect(selection.body.receiptTurn.resultRefs.preferenceRefs.sort())
      .toEqual([courseRef, globalRef].sort());
    expect(await activePreferenceRefs()).toEqual([courseRef, globalRef].sort());

    const courseOption = options.find((option) =>
      option.scope.kind === "course_run"
    )!;
    const invalidPayload = forgetConfirmationPayload({
      conversationVersion: selection.body.conversation.version,
      preferenceRef: courseRef,
      expectedVersion: courseOption.preferenceVersion + 1
    });
    await request(app)
      .post(apiRoutes.teacher.conversationForgetConfirm(
        conversation.conversationRef,
        selection.body.teacherTurn.turnRef
      ))
      .set(headers)
      .send(invalidPayload)
      .expect(409);
    expect(await memoryEpoch()).toBe(2);
    expect(await activePreferenceRefs()).toEqual([courseRef, globalRef].sort());

    const foreignRef = "preference:synthetic-foreign";
    await request(app)
      .post(apiRoutes.teacher.conversationForgetConfirm(
        conversation.conversationRef,
        selection.body.teacherTurn.turnRef
      ))
      .set(headers)
      .send(forgetConfirmationPayload({
        conversationVersion: selection.body.conversation.version,
        preferenceRef: foreignRef,
        expectedVersion: 1
      }))
      .expect(403)
      .expect(({ body }) => {
        expect(JSON.stringify(body)).not.toContain(foreignRef);
      });
    await request(app)
      .post(apiRoutes.teacher.conversationForgetConfirm(
        conversation.conversationRef,
        selection.body.teacherTurn.turnRef
      ))
      .set(foreignHeaders)
      .send(forgetConfirmationPayload({
        conversationVersion: selection.body.conversation.version,
        preferenceRef: courseRef,
        expectedVersion: courseOption.preferenceVersion
      }))
      .expect((response) => {
        expect([403, 404]).toContain(response.status);
        expect(JSON.stringify(response.body)).not.toContain(courseRef);
        expect(JSON.stringify(response.body)).not.toContain(
          gate2DemoRefs.courseRunRef
        );
      });
    await expect(product.services.conversationDispatch.dispatch({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      conversationRef: conversation.conversationRef,
      allowedCourseRunRefs: [],
      request: command(
        selection.body.conversation,
        "这门课忘掉案例偏好"
      )
    })).rejects.toThrow(/not found/u);

    const idempotencyKey = `forget-confirm:${randomUUID()}`;
    const confirmationPayload = forgetConfirmationPayload({
      conversationVersion: selection.body.conversation.version,
      preferenceRef: courseRef,
      expectedVersion: courseOption.preferenceVersion,
      idempotencyKey
    });
    const confirmed = await request(app)
      .post(apiRoutes.teacher.conversationForgetConfirm(
        conversation.conversationRef,
        selection.body.teacherTurn.turnRef
      ))
      .set(headers)
      .send(confirmationPayload)
      .expect(201);
    expect(confirmed.body).toMatchObject({
      replayed: false,
      receipt: {
        status: "revoked",
        memoryEpochBefore: 2,
        memoryEpochAfter: 3
      },
      conversation: {
        memoryCommands: expect.arrayContaining([
          expect.objectContaining({
            commandTurnRef: selection.body.teacherTurn.turnRef,
            status: "resolved"
          }),
          expect.objectContaining({
            commandTurnRef: selection.body.teacherTurn.turnRef,
            status: "revoked",
            preferenceRefs: [courseRef]
          })
        ])
      }
    });
    await request(app)
      .post(apiRoutes.teacher.conversationForgetConfirm(
        conversation.conversationRef,
        selection.body.teacherTurn.turnRef
      ))
      .set(headers)
      .send(confirmationPayload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
      });
    expect(await memoryEpoch()).toBe(3);
    expect(await preferenceStatuses()).toEqual({
      [courseRef]: "revoked",
      [globalRef]: "active"
    });

    const resolved = await product.services.personalization
      .resolveConfirmedPreferences(preferenceQuery(task));
    expect(resolved.selected).toEqual([
      expect.objectContaining({ preferenceRef: globalRef })
    ]);

    const restarted = createProductContainer(postgresEnvironment);
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
          expect(body.memoryCommands).toEqual(expect.arrayContaining([
            expect.objectContaining({ status: "resolved" }),
            expect.objectContaining({
              status: "revoked",
              preferenceRefs: [courseRef]
            })
          ]));
        });
    } finally {
      await restarted.close();
    }
  });

  it("rolls back a two-target forget, then recovers the same immutable command exactly once", async () => {
    const { conversation } = await createTaskConversation(app);
    const remembered = await dispatch(
      app,
      conversation,
      "记住：以后教案控制在一页，案例尽量贴近日常生活。"
    );
    const preferenceRefs = remembered.body.receipt.items.map(
      (item: { preferenceRef: string }) => item.preferenceRef
    ) as string[];
    expect(await memoryEpoch()).toBe(2);
    const idempotencyKey = `atomic-forget:${randomUUID()}`;
    const payload = command(
      remembered.body.conversation,
      "忘掉教案长度和案例偏好",
      idempotencyKey
    );

    await adminPool.query(`
      CREATE OR REPLACE FUNCTION personalization.reject_explicit_forget_epoch()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        RAISE EXCEPTION 'synthetic explicit forget epoch failure';
      END;
      $function$;
      CREATE TRIGGER reject_explicit_forget_epoch
      BEFORE UPDATE ON personalization.teacher_memory_state
      FOR EACH ROW EXECUTE FUNCTION personalization.reject_explicit_forget_epoch()
    `);
    try {
      await request(app)
        .post(apiRoutes.teacher.conversationDispatchTurn(
          conversation.conversationRef
        ))
        .set(headers)
        .send(payload)
        .expect(500);
    } finally {
      await adminPool.query(`
        DROP TRIGGER IF EXISTS reject_explicit_forget_epoch
          ON personalization.teacher_memory_state;
        DROP FUNCTION IF EXISTS personalization.reject_explicit_forget_epoch()
      `);
    }
    expect(await memoryEpoch()).toBe(2);
    expect(await activePreferenceRefs()).toEqual([...preferenceRefs].sort());
    expect(await commandTurnCounts(conversation.conversationRef)).toEqual({
      teacherCommands: "2",
      assistantReceipts: "1"
    });

    await request(app)
      .post(apiRoutes.teacher.conversationDispatchTurn(
        conversation.conversationRef
      ))
      .set(headers)
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
        expect(body.receipt).toMatchObject({
          status: "revoked",
          memoryEpochBefore: 2,
          memoryEpochAfter: 4
        });
      });
    expect(await memoryEpoch()).toBe(4);
    expect(await activePreferenceRefs()).toEqual([]);

    await request(app)
      .post(apiRoutes.teacher.conversationDispatchTurn(
        conversation.conversationRef
      ))
      .set(headers)
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
      });
    expect(await memoryEpoch()).toBe(4);
    expect(await commandTurnCounts(conversation.conversationRef)).toEqual({
      teacherCommands: "2",
      assistantReceipts: "2"
    });
  });

  it("recovers a missing Work receipt without repeating the committed revocation", async () => {
    const { conversation } = await createTaskConversation(app);
    const remembered = await dispatch(
      app,
      conversation,
      "记住：以后案例尽量贴近日常生活"
    );
    const preferenceRef = remembered.body.receipt.items[0].preferenceRef as string;
    const payload = command(
      remembered.body.conversation,
      "忘掉案例偏好",
      `receipt-recovery:${randomUUID()}`
    );

    await adminPool.query(`
      CREATE OR REPLACE FUNCTION work.reject_explicit_forget_receipt()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF NEW.actor_kind = 'assistant_surface'
           AND NEW.content_kind = 'command' THEN
          RAISE EXCEPTION 'synthetic explicit forget receipt failure';
        END IF;
        RETURN NEW;
      END;
      $function$;
      CREATE TRIGGER reject_explicit_forget_receipt
      BEFORE INSERT ON work.conversation_turn
      FOR EACH ROW EXECUTE FUNCTION work.reject_explicit_forget_receipt()
    `);
    try {
      await request(app)
        .post(apiRoutes.teacher.conversationDispatchTurn(
          conversation.conversationRef
        ))
        .set(headers)
        .send(payload)
        .expect(500);
    } finally {
      await adminPool.query(`
        DROP TRIGGER IF EXISTS reject_explicit_forget_receipt
          ON work.conversation_turn;
        DROP FUNCTION IF EXISTS work.reject_explicit_forget_receipt()
      `);
    }
    expect(await memoryEpoch()).toBe(2);
    expect(await preferenceStatuses()).toEqual({ [preferenceRef]: "revoked" });
    expect(await commandTurnCounts(conversation.conversationRef)).toEqual({
      teacherCommands: "2",
      assistantReceipts: "1"
    });

    await request(app)
      .post(apiRoutes.teacher.conversationDispatchTurn(
        conversation.conversationRef
      ))
      .set(headers)
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
        expect(body.receipt.status).toBe("revoked");
      });
    expect(await memoryEpoch()).toBe(2);
    expect(await commandTurnCounts(conversation.conversationRef)).toEqual({
      teacherCommands: "2",
      assistantReceipts: "2"
    });
  });

  it("keeps no-match, negative, flag and first-turn paths fail closed", async () => {
    const { conversation } = await createTaskConversation(app);
    const noMatch = await dispatch(
      app,
      conversation,
      "取消之前的建议篇幅偏好"
    );
    expect(noMatch.body).toMatchObject({
      kind: "memory_command",
      receipt: {
        status: "nothing_to_forget",
        memoryEpochBefore: 0,
        memoryEpochAfter: 0
      },
      conversation: { workingMemory: null }
    });
    expect(await generationCounts(noMatch.body.conversation.taskRef)).toEqual({
      executions: "0",
      proposals: "0"
    });

    const negative = await dispatch(
      app,
      noMatch.body.conversation,
      "不要记住这次的要求"
    );
    expect(negative.body.kind).toBe("unsupported_memory_command");
    const temporary = await dispatch(
      app,
      negative.body.conversation,
      "这次不要使用生活化案例"
    );
    expect(temporary.body).toMatchObject({
      kind: "model_instruction",
      workingMemory: {
        activeGoal: { text: "这次不要使用生活化案例" }
      }
    });
    const ordinary = await dispatch(
      app,
      temporary.body.conversation,
      "不要安排小组讨论"
    );
    expect(ordinary.body.kind).toBe("model_instruction");
    expect(await memoryEpoch()).toBe(0);

    const remembered = await dispatch(
      app,
      ordinary.body.conversation,
      "记住：以后案例尽量贴近日常生活"
    );
    const preferenceRef = remembered.body.receipt.items[0].preferenceRef as string;
    const atomicNoMatch = await dispatch(
      app,
      remembered.body.conversation,
      "忘掉教案长度和案例偏好"
    );
    expect(atomicNoMatch.body).toMatchObject({
      kind: "memory_command",
      receipt: {
        status: "nothing_to_forget",
        memoryEpochBefore: 1,
        memoryEpochAfter: 1
      },
      receiptTurn: {
        resultRefs: { preferenceRefs: [] }
      }
    });
    expect(await preferenceStatuses()).toEqual({
      [preferenceRef]: "active"
    });
    const disabled = createProductContainer(postgresEnvironment, {
      memoryExplicitForgetSettings: {
        enabled: false,
        policyVersion: "explicit-forget-command-policy@1"
      }
    });
    try {
      const disabledApp = createApp({
        product: disabled,
        allowTestIdentityHeaders: true
      });
      const disabledConversation = await loadConversation(
        disabledApp,
        conversation.conversationRef
      );
      const blocked = await dispatch(
        disabledApp,
        disabledConversation,
        "忘掉案例偏好"
      );
      expect(blocked.body).toMatchObject({
        kind: "unsupported_memory_command",
        safeReasonCode: "explicit_forget_disabled"
      });
      expect(blocked.body.safeMessage).toContain("助手偏好");
      expect(await preferenceStatuses()).toEqual({
        [preferenceRef]: "active"
      });
      await request(disabledApp)
        .post(apiRoutes.teacher.teacherPreferenceRevoke(preferenceRef))
        .set(headers)
        .send({
          expectedVersion: 1,
          purpose: "personalization.preference.revoke",
          idempotencyKey: `settings-revoke:${randomUUID()}`
        })
        .expect(200);
      expect(await preferenceStatuses()).toEqual({
        [preferenceRef]: "revoked"
      });
    } finally {
      await disabled.close();
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
      idempotencyKey: `forget-task:${randomUUID()}`
    })
    .expect(201);
  const started = await request(targetApp)
    .post(apiRoutes.teacher.preparationTaskStart(created.body.task.taskRef))
    .set(headers)
    .send({
      expectedVersion: created.body.task.version,
      purpose: "lesson-preparation.start",
      idempotencyKey: `forget-task-start:${randomUUID()}`
    })
    .expect(201);
  const conversation = await request(targetApp)
    .post(apiRoutes.teacher.conversations)
    .set(headers)
    .send({
      taskRef: started.body.task.taskRef,
      purposeFamily: "lesson_preparation",
      courseRunRef: started.body.task.courseRunRef,
      lessonRef: started.body.task.lessonRef,
      purpose: "teacher-copilot.conversation.create",
      idempotencyKey: `forget-conversation:${randomUUID()}`
    })
    .expect(201);
  return {
    task: started.body.task,
    conversation: conversation.body.conversation
  };
}

function command(
  conversation: {
    lastTurnRef: string | null;
    version: number;
  },
  teacherText: string,
  idempotencyKey = `forget-dispatch:${randomUUID()}`
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
  teacherText: string
) {
  return request(targetApp)
    .post(apiRoutes.teacher.conversationDispatchTurn(
      conversation.conversationRef
    ))
    .set(headers)
    .send(command(conversation, teacherText))
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
  const loaded = await request(targetApp)
    .get(apiRoutes.teacher.conversation(conversationRef))
    .set(headers)
    .expect(200);
  return loaded.body;
}

async function runModelInstruction(input: {
  targetApp: ReturnType<typeof createApp>;
  targetProduct: ReturnType<typeof createProductContainer>;
  task: PreparationTaskForInvocation;
  conversation: {
    conversationRef: string;
    lastTurnRef: string | null;
    version: number;
  };
  teacherText: string;
}) {
  const dispatched = await dispatch(
    input.targetApp,
    input.conversation,
    input.teacherText
  );
  expect(dispatched.body.kind).toBe("model_instruction");
  const refreshedTask = await request(input.targetApp)
    .get(apiRoutes.teacher.preparationTask(input.task.taskRef))
    .set(headers)
    .expect(200);
  const queued = await request(input.targetApp)
    .post(apiRoutes.teacher.modelInvocations)
    .set(headers)
    .send({
      ...invocationCommand(refreshedTask.body),
      requestText: input.teacherText,
      requestVersion: 2,
      ...dispatched.body.turnContext
    })
    .expect(202);
  await input.targetProduct.services.modelInvocations.processExecution(
    queued.body.execution.modelExecutionRef
  );
  const execution = await request(input.targetApp)
    .get(apiRoutes.teacher.modelInvocation(
      queued.body.execution.modelExecutionRef
    ))
    .set(headers)
    .expect(200);
  expect(execution.body.status).toBe("succeeded");
  const proposalRevisionRef = execution.body.proposalRevisionRef as string;
  const proposal = await request(input.targetApp)
    .get(apiRoutes.demo.proposalDetail(proposalRevisionRef))
    .set(headers)
    .expect(200);
  return {
    agentRunRef: queued.body.execution.agentRunRef as string,
    proposalRevisionRef,
    proposal: proposal.body
  };
}

function forgetConfirmationPayload(input: {
  conversationVersion: number;
  preferenceRef: string;
  expectedVersion: number;
  idempotencyKey?: string;
}) {
  return {
    selectedPreferenceRefs: [input.preferenceRef],
    expectedVersions: {
      [input.preferenceRef]: input.expectedVersion
    },
    expectedConversationVersion: input.conversationVersion,
    purpose: "personalization.explicit-forget.confirm",
    idempotencyKey: input.idempotencyKey ??
      `forget-confirm:${randomUUID()}`
  };
}

async function memoryEpoch(): Promise<number> {
  const result = await adminPool.query<{ memory_epoch: string | number }>(
    `SELECT memory_epoch FROM personalization.teacher_memory_state
      WHERE tenant_ref = $1 AND teacher_ref = $2`,
    [gate2DemoRefs.tenantRef, gate2DemoRefs.teacherRef]
  );
  return Number(result.rows[0]?.memory_epoch ?? 0);
}

async function activePreferenceRefs(): Promise<string[]> {
  const result = await adminPool.query<{ preference_ref: string }>(
    `SELECT preference_ref
       FROM personalization.teacher_preference
      WHERE tenant_ref = $1 AND teacher_ref = $2
        AND preference_status = 'active'
      ORDER BY preference_ref`,
    [gate2DemoRefs.tenantRef, gate2DemoRefs.teacherRef]
  );
  return result.rows.map((row) => row.preference_ref);
}

async function preferenceStatuses(): Promise<Record<string, string>> {
  const result = await adminPool.query<{
    preference_ref: string;
    status: string;
  }>(
    `SELECT preference_ref, preference_status AS status
       FROM personalization.teacher_preference
      WHERE tenant_ref = $1 AND teacher_ref = $2
      ORDER BY preference_ref`,
    [gate2DemoRefs.tenantRef, gate2DemoRefs.teacherRef]
  );
  return Object.fromEntries(result.rows.map((row) => [
    row.preference_ref,
    row.status
  ]));
}

async function generationCounts(taskRef: string) {
  const result = await adminPool.query<{
    executions: string;
    proposals: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM capability.model_execution
         WHERE actor_ref = $1) AS executions,
       (SELECT count(*)::text FROM work.task_result
         WHERE task_ref = $2) AS proposals`,
    [gate2DemoRefs.teacherRef, taskRef]
  );
  return result.rows[0];
}

async function commandTurnCounts(conversationRef: string) {
  const result = await adminPool.query<{
    teacher_commands: string;
    assistant_receipts: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM work.conversation_turn
         WHERE conversation_ref = $1 AND actor_kind = 'teacher'
           AND content_kind = 'command') AS teacher_commands,
       (SELECT count(*)::text FROM work.conversation_turn
         WHERE conversation_ref = $1 AND actor_kind = 'assistant_surface'
           AND content_kind = 'command') AS assistant_receipts`,
    [conversationRef]
  );
  return {
    teacherCommands: result.rows[0]!.teacher_commands,
    assistantReceipts: result.rows[0]!.assistant_receipts
  };
}

function preferenceQuery(task: {
  courseRunRef: string;
  lessonRef: string;
  taskRef: string;
}) {
  return {
    tenantRef: gate2DemoRefs.tenantRef,
    teacherRef: gate2DemoRefs.teacherRef,
    useCase: "lesson_preparation",
    skillId: "lesson-preparation",
    subject: "数学",
    gradeLevel: "八年级",
    courseRunRef: task.courseRunRef,
    lessonRef: task.lessonRef,
    taskRef: task.taskRef,
    at: "2026-09-20T00:00:00.000Z"
  };
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
    courseRunRef: task.courseRunRef,
    goalRef: gate2DemoRefs.goalRef,
    learningObjectiveRefs: task.workingSet.learningObjectiveRefs,
    selectedEvidenceRefs: task.workingSet.evidenceRefs,
    purpose: "teacher-copilot.adjust-next-lesson",
    idempotencyKey: `forget-invocation:${randomUUID()}`,
    preparationTaskRef: task.taskRef,
    curriculumUnitRef: task.curriculumUnitRef,
    lessonRef: task.lessonRef,
    workingSetVersion: task.workingSet.version,
    expectedPreparationTaskVersion: task.version
  };
}

type PreparationTaskForInvocation = Parameters<typeof invocationCommand>[0];

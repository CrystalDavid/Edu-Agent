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
  gate25DemoRefs,
  secondaryCourseDemoRefs
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

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await seedSampleData(postgresEnvironment, { includeGate25: true });
});

afterAll(async () => {
  await Promise.all([product.close(), adminPool.end()]);
});

describe("explicit teacher remember PostgreSQL", () => {
  it("persists command, receipt and two canonical preferences without a model run", async () => {
    const { task, conversation } = await createTaskConversation(app);
    const text = "记住：以后教案控制在一页，案例尽量贴近日常生活。";
    const dispatched = await dispatch(app, conversation, text);

    expect(dispatched.status).toBe(201);
    expect(dispatched.body).toMatchObject({
      kind: "memory_command",
      receipt: {
        status: "applied",
        memoryEpochBefore: 0,
        memoryEpochAfter: 2
      }
    });
    expect(dispatched.body.receipt.items).toHaveLength(2);
    const candidateRefs = dispatched.body.receipt.items.map(
      (item: { candidateRef: string }) => item.candidateRef
    );
    const preferenceRefs = dispatched.body.receipt.items.map(
      (item: { preferenceRef: string }) => item.preferenceRef
    );
    expect(candidateRefs).toHaveLength(2);
    expect(preferenceRefs).toHaveLength(2);
    expect(dispatched.body.conversation.workingMemory).toBeNull();
    expect(dispatched.body.teacherTurn).toMatchObject({
      actorKind: "teacher",
      contentKind: "command",
      teacherText: text
    });
    expect(dispatched.body.receiptTurn).toMatchObject({
      actorKind: "assistant_surface",
      contentKind: "command",
      teacherText: null
    });

    const persisted = await adminPool.query<{
      teacher_commands: string;
      receipts: string;
      candidates: string;
      preferences: string;
      epoch: string;
      executions: string;
      proposals: string;
      raw_command_copies: string;
      source_turn_matches: string;
      authorization_count: string;
      audit_count: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM work.conversation_turn
           WHERE conversation_ref = $1 AND actor_kind = 'teacher'
             AND content_kind = 'command') AS teacher_commands,
         (SELECT count(*)::text FROM work.conversation_turn
           WHERE conversation_ref = $1 AND actor_kind = 'assistant_surface'
             AND content_kind = 'command') AS receipts,
         (SELECT count(*)::text FROM personalization.memory_candidate
           WHERE tenant_ref = $2 AND teacher_ref = $3) AS candidates,
         (SELECT count(*)::text FROM personalization.teacher_preference
           WHERE tenant_ref = $2 AND teacher_ref = $3) AS preferences,
         (SELECT memory_epoch::text FROM personalization.teacher_memory_state
           WHERE tenant_ref = $2 AND teacher_ref = $3) AS epoch,
         (SELECT count(*)::text FROM capability.model_execution
           WHERE actor_ref = $3) AS executions,
         (SELECT count(*)::text FROM work.task_result
           WHERE task_ref = $5) AS proposals,
         (SELECT count(*)::text FROM personalization.memory_candidate
           WHERE tenant_ref = $2 AND teacher_ref = $3
             AND content::text LIKE '%' || $4 || '%') AS raw_command_copies,
         (SELECT count(*)::text FROM personalization.memory_candidate
           WHERE tenant_ref = $2 AND teacher_ref = $3
             AND sources @> jsonb_build_array(jsonb_build_object(
               'sourceRef', $6::text,
               'sourceType', 'teacher_request',
               'contentHash', $7::text,
               'provenance',
                 'work.conversation_turn.teacher_explicit_memory_command'
             ))) AS source_turn_matches,
         (SELECT count(*)::text FROM governance.authorization_decision
           WHERE tenant_ref = $2 AND actor_ref = $3
             AND action = 'personalization.explicit-remember.apply')
             AS authorization_count,
         (SELECT count(*)::text FROM governance.audit_record
           WHERE actor_ref = $3
             AND record_type = 'ExplicitTeacherMemoryCommandEvaluated')
             AS audit_count`,
      [
        conversation.conversationRef,
        gate2DemoRefs.tenantRef,
        gate2DemoRefs.teacherRef,
        text,
        task.taskRef,
        dispatched.body.teacherTurn.turnRef,
        dispatched.body.teacherTurn.contentHash
      ]
    );
    expect(persisted.rows[0]).toEqual({
      teacher_commands: "1",
      receipts: "1",
      candidates: "2",
      preferences: "2",
      epoch: "2",
      executions: "0",
      proposals: "0",
      raw_command_copies: "0",
      source_turn_matches: "2",
      authorization_count: "1",
      audit_count: "1"
    });

    const state = await request(app)
      .get(apiRoutes.teacher.personalizationState)
      .set(headers)
      .expect(200);
    expect(state.body.preferences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        preferenceKey: "lesson_plan_length",
        preferenceValue: "一页以内",
        consentBasis: "teacher_explicit_command",
        consentVersion: "consent:explicit-remember@1",
        explicitness: "teacher_declared",
        scope: expect.objectContaining({
          kind: "global",
          skillIds: ["lesson-preparation"]
        })
      }),
      expect.objectContaining({
        preferenceKey: "example_preference",
        preferenceValue: "优先使用贴近日常生活的案例"
      })
    ]));
    expect(state.body.candidates.every((candidate: { summary: string }) =>
      !candidate.summary.includes(text))).toBe(true);

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
          expect(body.turns).toHaveLength(2);
          expect(body.turns[1]).toMatchObject({
            contentKind: "command",
            surfaceSummary: expect.stringContaining("已记住 2 条偏好"),
            contentHash: dispatched.body.receiptTurn.contentHash,
            resultRefs: {
              candidateRefs,
              preferenceRefs
            }
          });
        });
    } finally {
      await restarted.close();
    }

    const normal = await dispatch(
      app,
      dispatched.body.conversation,
      "请设计一页以内的生活化案例教案"
    );
    expect(normal.body).toMatchObject({
      kind: "model_instruction",
      workingMemory: {
        activeGoal: { text: "请设计一页以内的生活化案例教案" }
      }
    });
    const queued = await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(headers)
      .send({
        ...invocationCommand(task),
        requestText: "请设计一页以内的生活化案例教案",
        requestVersion: 2,
        ...normal.body.turnContext
      })
      .expect(202);
    await product.services.modelInvocations.processExecution(
      queued.body.execution.modelExecutionRef
    );
    const execution = await request(app)
      .get(apiRoutes.teacher.modelInvocation(
        queued.body.execution.modelExecutionRef
      ))
      .set(headers)
      .expect(200);
    expect(execution.body.status).toBe("succeeded");
    const applications = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM personalization.memory_application
        WHERE tenant_ref = $1 AND teacher_ref = $2
          AND agent_run_ref = $3
          AND decision = 'injected'`,
      [
        gate2DemoRefs.tenantRef,
        gate2DemoRefs.teacherRef,
        queued.body.execution.agentRunRef
      ]
    );
    expect(Number(applications.rows[0]?.count ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it("deduplicates exact commands and requires explicit conflict resolution", async () => {
    const { conversation } = await createTaskConversation(app);
    const concise = await dispatch(app, conversation, "以后教案尽量简洁");
    expect(concise.body.receipt.status).toBe("applied");
    expect(await memoryEpoch()).toBe(1);

    const duplicateKey = `dispatch:${randomUUID()}`;
    const duplicateCommand = command(
      concise.body.conversation,
      "以后教案尽量简洁",
      duplicateKey
    );
    const duplicate = await request(app)
      .post(apiRoutes.teacher.conversationDispatchTurn(
        conversation.conversationRef
      ))
      .set(headers)
      .send(duplicateCommand)
      .expect(201);
    expect(duplicate.body.receipt.status).toBe("already_remembered");
    expect(await memoryEpoch()).toBe(1);
    await request(app)
      .post(apiRoutes.teacher.conversationDispatchTurn(
        conversation.conversationRef
      ))
      .set(headers)
      .send(duplicateCommand)
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
      });
    expect(await memoryEpoch()).toBe(1);

    const conflict = await dispatch(
      app,
      duplicate.body.conversation,
      "以后教案写详细一点"
    );
    expect(conflict.body.receipt.status).toBe("review_required");
    expect(await memoryEpoch()).toBe(1);
    const conflictItem = conflict.body.receipt.items[0];
    expect(conflictItem).toMatchObject({
      status: "review_required",
      displayValue: "详细",
      previousDisplayValue: "简洁"
    });
    await request(app)
      .post(apiRoutes.teacher.memoryCandidateConfirm(
        conflictItem.candidateRef
      ))
      .set(headers)
      .send({
        expectedVersion: 1,
        purpose: "personalization.candidate.confirm",
        idempotencyKey: `invalid-normal-confirm:${randomUUID()}`
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe("MEMORY_REPLACEMENT_CONFIRMATION_REQUIRED");
      });
    await request(app)
      .post(apiRoutes.teacher.memoryCandidateReject(
        conflictItem.candidateRef
      ))
      .set(headers)
      .send({
        expectedVersion: 1,
        purpose: "personalization.candidate.reject",
        idempotencyKey: `keep-original:${randomUUID()}`
      })
      .expect(200);
    expect(await memoryEpoch()).toBe(1);

    const secondConflict = await dispatch(
      app,
      conflict.body.conversation,
      "以后教案写详细一点"
    );
    const replacementItem = secondConflict.body.receipt.items[0];
    const replacement = await request(app)
      .post(apiRoutes.teacher.memoryCandidateConfirmReplacement(
        replacementItem.candidateRef
      ))
      .set(headers)
      .send({
        expectedCandidateVersion: 1,
        expectedPreferenceVersion:
          replacementItem.conflictPreferenceVersion,
        purpose: "personalization.candidate.confirm-replacement",
        idempotencyKey: `replace-original:${randomUUID()}`
      })
      .expect(200);
    expect(replacement.body.preference).toMatchObject({
      preferenceValue: "详细",
      version: 2,
      sourceCandidateRef: replacementItem.candidateRef,
      consentBasis: "teacher_explicit_command"
    });
    expect(await memoryEpoch()).toBe(2);
    const revisions = await adminPool.query<{
      version: number;
      preference_value: string;
      source_candidate_ref: string;
    }>(
      `SELECT version, preference_value, source_candidate_ref
         FROM personalization.teacher_preference_revision
        WHERE preference_ref = $1 ORDER BY version`,
      [replacement.body.preference.preferenceRef]
    );
    expect(revisions.rows).toEqual([
      expect.objectContaining({ version: 1, preference_value: "简洁" }),
      expect.objectContaining({
        version: 2,
        preference_value: "详细",
        source_candidate_ref: replacementItem.candidateRef
      })
    ]);
    const counts = await adminPool.query<{
      candidates: string;
      preferences: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM personalization.memory_candidate
          WHERE tenant_ref = $1 AND teacher_ref = $2) AS candidates,
        (SELECT count(*)::text FROM personalization.teacher_preference
          WHERE tenant_ref = $1 AND teacher_ref = $2) AS preferences`,
      [gate2DemoRefs.tenantRef, gate2DemoRefs.teacherRef]
    );
    expect(counts.rows[0]).toEqual({ candidates: "3", preferences: "1" });
  });

  it("recovers after a Personalization transaction failure without duplicating the command", async () => {
    const { conversation } = await createTaskConversation(app);
    const idempotencyKey = `recover:${randomUUID()}`;
    const payload = command(
      conversation,
      "记住：教案控制在一页",
      idempotencyKey
    );
    await adminPool.query(`
      CREATE OR REPLACE FUNCTION personalization.reject_explicit_memory_epoch()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        RAISE EXCEPTION 'synthetic explicit memory epoch failure';
      END;
      $function$;
      CREATE TRIGGER reject_explicit_memory_epoch
      BEFORE INSERT OR UPDATE ON personalization.teacher_memory_state
      FOR EACH ROW EXECUTE FUNCTION personalization.reject_explicit_memory_epoch()
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
        DROP TRIGGER IF EXISTS reject_explicit_memory_epoch
          ON personalization.teacher_memory_state;
        DROP FUNCTION IF EXISTS personalization.reject_explicit_memory_epoch()
      `);
    }
    const failedState = await adminPool.query<{
      commands: string;
      receipts: string;
      candidates: string;
      preferences: string;
      epoch_rows: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM work.conversation_turn
          WHERE conversation_ref = $1 AND actor_kind = 'teacher'
            AND content_kind = 'command') AS commands,
        (SELECT count(*)::text FROM work.conversation_turn
          WHERE conversation_ref = $1 AND actor_kind = 'assistant_surface'
            AND content_kind = 'command') AS receipts,
        (SELECT count(*)::text FROM personalization.memory_candidate
          WHERE tenant_ref = $2 AND teacher_ref = $3) AS candidates,
        (SELECT count(*)::text FROM personalization.teacher_preference
          WHERE tenant_ref = $2 AND teacher_ref = $3) AS preferences,
        (SELECT count(*)::text FROM personalization.teacher_memory_state
          WHERE tenant_ref = $2 AND teacher_ref = $3) AS epoch_rows`,
      [
        conversation.conversationRef,
        gate2DemoRefs.tenantRef,
        gate2DemoRefs.teacherRef
      ]
    );
    expect(failedState.rows[0]).toEqual({
      commands: "1",
      receipts: "0",
      candidates: "0",
      preferences: "0",
      epoch_rows: "0"
    });

    await request(app)
      .post(apiRoutes.teacher.conversationDispatchTurn(
        conversation.conversationRef
      ))
      .set(headers)
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.kind).toBe("memory_command");
        expect(body.replayed).toBe(true);
        expect(body.receipt.status).toBe("applied");
      });
    expect(await memoryEpoch()).toBe(1);
    const recoveredTurns = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM work.conversation_turn
        WHERE conversation_ref = $1 AND content_kind = 'command'`,
      [conversation.conversationRef]
    );
    expect(recoveredTurns.rows[0]?.count).toBe("2");
  });

  it("recovers a missing receipt after Personalization committed without repeating the preference", async () => {
    const { conversation } = await createTaskConversation(app);
    const idempotencyKey = `receipt-recovery:${randomUUID()}`;
    const payload = command(
      conversation,
      "记住：教案控制在一页",
      idempotencyKey
    );
    await adminPool.query(`
      CREATE OR REPLACE FUNCTION work.reject_explicit_memory_receipt()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF NEW.actor_kind = 'assistant_surface'
           AND NEW.content_kind = 'command' THEN
          RAISE EXCEPTION 'synthetic explicit memory receipt failure';
        END IF;
        RETURN NEW;
      END;
      $function$;
      CREATE TRIGGER reject_explicit_memory_receipt
      BEFORE INSERT ON work.conversation_turn
      FOR EACH ROW EXECUTE FUNCTION work.reject_explicit_memory_receipt()
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
        DROP TRIGGER IF EXISTS reject_explicit_memory_receipt
          ON work.conversation_turn;
        DROP FUNCTION IF EXISTS work.reject_explicit_memory_receipt()
      `);
    }

    expect(await explicitWriteCounts(conversation.conversationRef)).toEqual({
      commands: "1",
      receipts: "0",
      candidates: "1",
      preferences: "1",
      epoch: "1"
    });

    await request(app)
      .post(apiRoutes.teacher.conversationDispatchTurn(
        conversation.conversationRef
      ))
      .set(headers)
      .send(payload)
      .expect(200)
      .expect(({ body }) => {
        expect(body.kind).toBe("memory_command");
        expect(body.replayed).toBe(true);
        expect(body.receipt.status).toBe("applied");
      });
    expect(await explicitWriteCounts(conversation.conversationRef)).toEqual({
      commands: "1",
      receipts: "1",
      candidates: "1",
      preferences: "1",
      epoch: "1"
    });
  });

  it("binds current-course commands to the authorized stable CourseRun", async () => {
    const { conversation } = await createTaskConversation(app);
    const remembered = await dispatch(
      app,
      conversation,
      "记住：这门课以后教案写详细一点"
    );
    expect(remembered.body.receipt.items[0]).toMatchObject({
      status: "applied",
      displayValue: "详细",
      scope: {
        kind: "course_run",
        courseRunRef: gate2DemoRefs.courseRunRef,
        skillIds: ["lesson-preparation"]
      }
    });

    const stored = await adminPool.query<{
      scope_kind: string;
      scope_course_run_ref: string;
      scope_skill_ids: string[];
    }>(
      `SELECT scope_kind, scope_course_run_ref, scope_skill_ids
         FROM personalization.teacher_preference
        WHERE tenant_ref = $1 AND teacher_ref = $2
          AND canonical_key = 'lesson_plan_detail'`,
      [gate2DemoRefs.tenantRef, gate2DemoRefs.teacherRef]
    );
    expect(stored.rows[0]).toEqual({
      scope_kind: "course_run",
      scope_course_run_ref: gate2DemoRefs.courseRunRef,
      scope_skill_ids: ["lesson-preparation"]
    });

    const matching = await product.services.personalization
      .resolveConfirmedPreferences(preferenceQuery({
        courseRunRef: gate2DemoRefs.courseRunRef,
        lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph
      }));
    expect(matching.selected).toEqual([
      expect.objectContaining({
        canonicalKey: "lesson_plan_detail",
        preferenceValue: "详细",
        scope: expect.objectContaining({
          courseRunRef: gate2DemoRefs.courseRunRef
        })
      })
    ]);

    const nonMatching = await product.services.personalization
      .resolveConfirmedPreferences(preferenceQuery({
        courseRunRef: secondaryCourseDemoRefs.courseRunRef,
        lessonRef: secondaryCourseDemoRefs.lessonRef
      }));
    expect(nonMatching.selected).toEqual([]);
    expect(nonMatching.excluded).toEqual([
      expect.objectContaining({
        canonicalKey: "lesson_plan_detail",
        reasonCode: "scope_mismatch"
      })
    ]);
  });

  it("fails closed when disabled and does not confuse temporary or unsafe text", async () => {
    const disabledProduct = createProductContainer(postgresEnvironment, {
      memoryExplicitRememberSettings: {
        enabled: false,
        policyVersion: "explicit-memory-command-policy@1"
      }
    });
    try {
      const disabledApp = createApp({
        product: disabledProduct,
        allowTestIdentityHeaders: true
      });
      const { conversation } = await createTaskConversation(disabledApp);
      const disabled = await dispatch(
        disabledApp,
        conversation,
        "记住：教案控制在一页"
      );
      expect(disabled.body).toMatchObject({
        kind: "unsupported_memory_command",
        safeReasonCode: "explicit_remember_disabled",
        safeMessage: "长期偏好功能当前未启用，本次未保存。"
      });
      const temporary = await dispatch(
        disabledApp,
        disabled.body.conversation,
        "这次公开课写详细一点"
      );
      expect(temporary.body.kind).toBe("model_instruction");
      expect(temporary.body.workingMemory.activeGoal.text)
        .toBe("这次公开课写详细一点");
      const unsafe = await dispatch(
        disabledApp,
        temporary.body.conversation,
        "记住某班学生能力差"
      );
      expect(unsafe.body).toMatchObject({
        kind: "unsupported_memory_command",
        safeReasonCode: "unsafe_memory_content"
      });
      const forgotten = await dispatch(
        disabledApp,
        unsafe.body.conversation,
        "忘掉案例偏好"
      );
      expect(forgotten.body).toMatchObject({
        kind: "unsupported_memory_command",
        safeReasonCode: "forget_not_available"
      });
      const count = await adminPool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM personalization.teacher_preference
          WHERE tenant_ref = $1 AND teacher_ref = $2`,
        [gate2DemoRefs.tenantRef, gate2DemoRefs.teacherRef]
      );
      expect(count.rows[0]?.count).toBe("0");
      await request(disabledApp)
        .get(apiRoutes.teacher.conversation(conversation.conversationRef))
        .set({
          "x-demo-tenant": "tenant:demo-school-b",
          "x-demo-actor": "user:teacher-b-001"
        })
        .expect((response) => {
          expect([403, 404]).toContain(response.status);
          expect(JSON.stringify(response.body)).not.toContain(
            conversation.conversationRef
          );
        });
      await request(disabledApp)
        .post(apiRoutes.teacher.conversationDispatchTurn(
          conversation.conversationRef
        ))
        .set({
          "x-demo-tenant": "tenant:demo-school-b",
          "x-demo-actor": "user:teacher-b-001"
        })
        .send(command(conversation, "记住：教案控制在一页"))
        .expect((response) => {
          expect([403, 404]).toContain(response.status);
          expect(JSON.stringify(response.body)).not.toContain(
            conversation.conversationRef
          );
          expect(JSON.stringify(response.body)).not.toContain(
            gate2DemoRefs.courseRunRef
          );
        });
    } finally {
      await disabledProduct.close();
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
      idempotencyKey: `explicit-task:${randomUUID()}`
    })
    .expect(201);
  const started = await request(targetApp)
    .post(apiRoutes.teacher.preparationTaskStart(created.body.task.taskRef))
    .set(headers)
    .send({
      expectedVersion: created.body.task.version,
      purpose: "lesson-preparation.start",
      idempotencyKey: `explicit-task-start:${randomUUID()}`
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
      idempotencyKey: `explicit-conversation:${randomUUID()}`
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
  idempotencyKey = `dispatch:${randomUUID()}`
) {
  return {
    teacherText,
    parentTurnRef: conversation.lastTurnRef,
    expectedConversationVersion: conversation.version,
    purpose: "teacher-copilot.conversation.dispatch-turn",
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

async function memoryEpoch(): Promise<number> {
  const result = await adminPool.query<{ memory_epoch: string | number }>(
    `SELECT memory_epoch FROM personalization.teacher_memory_state
      WHERE tenant_ref = $1 AND teacher_ref = $2`,
    [gate2DemoRefs.tenantRef, gate2DemoRefs.teacherRef]
  );
  return Number(result.rows[0]?.memory_epoch ?? 0);
}

async function explicitWriteCounts(conversationRef: string) {
  const result = await adminPool.query<{
    commands: string;
    receipts: string;
    candidates: string;
    preferences: string;
    epoch: string;
  }>(
    `SELECT
      (SELECT count(*)::text FROM work.conversation_turn
        WHERE conversation_ref = $1 AND actor_kind = 'teacher'
          AND content_kind = 'command') AS commands,
      (SELECT count(*)::text FROM work.conversation_turn
        WHERE conversation_ref = $1 AND actor_kind = 'assistant_surface'
          AND content_kind = 'command') AS receipts,
      (SELECT count(*)::text FROM personalization.memory_candidate
        WHERE tenant_ref = $2 AND teacher_ref = $3) AS candidates,
      (SELECT count(*)::text FROM personalization.teacher_preference
        WHERE tenant_ref = $2 AND teacher_ref = $3) AS preferences,
      COALESCE((SELECT memory_epoch::text
        FROM personalization.teacher_memory_state
        WHERE tenant_ref = $2 AND teacher_ref = $3), '0') AS epoch`,
    [conversationRef, gate2DemoRefs.tenantRef, gate2DemoRefs.teacherRef]
  );
  return result.rows[0];
}

function preferenceQuery(input: {
  courseRunRef: string;
  lessonRef: string;
}) {
  return {
    tenantRef: gate2DemoRefs.tenantRef,
    teacherRef: gate2DemoRefs.teacherRef,
    useCase: "lesson_preparation",
    skillId: "lesson-preparation",
    subject: "数学",
    gradeLevel: "八年级",
    courseRunRef: input.courseRunRef,
    lessonRef: input.lessonRef,
    taskRef: null,
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
    idempotencyKey: `explicit-invocation:${randomUUID()}`,
    preparationTaskRef: task.taskRef,
    curriculumUnitRef: task.curriculumUnitRef,
    lessonRef: task.lessonRef,
    workingSetVersion: task.workingSet.version,
    expectedPreparationTaskVersion: task.version
  };
}

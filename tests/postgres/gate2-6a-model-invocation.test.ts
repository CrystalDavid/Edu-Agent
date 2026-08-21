import { randomUUID } from "node:crypto";

import { apiRoutes } from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/sample-data";
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
} from "../../scripts/sample/gate2-5-demo-fixture.js";
import { seedSampleData } from "../../scripts/sample/seed-sample-data.js";
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
  await seedSampleData(postgresEnvironment, { includeGate25: true });
});

afterAll(async () => {
  await Promise.all([
    product.close(),
    adminPool.end(),
    workerPool.end()
  ]);
});

describe("Gate 2.6A durable ModelExecution", () => {
  it("keeps same-thread lesson preparation context across refresh and service restart", async () => {
    const candidate = await request(app)
      .post(apiRoutes.teacher.memoryCandidates)
      .set(demoHeaders)
      .send({
        summary: "合成教师明确要求教案保持简洁。",
        preferenceKey: "lesson_plan_detail",
        preferenceValue: "简洁",
        purpose: "personalization.candidate.create",
        idempotencyKey: `memory-observability:create:${randomUUID()}`
      })
      .expect(201);
    const confirmedPreference = await request(app)
      .post(
        apiRoutes.teacher.memoryCandidateConfirm(
          candidate.body.candidate.candidateRef
        )
      )
      .set(demoHeaders)
      .send({
        expectedVersion: candidate.body.candidate.version,
        purpose: "personalization.candidate.confirm",
        idempotencyKey: `memory-observability:confirm:${randomUUID()}`
      })
      .expect(200);
    const courseCandidate = await request(app)
      .post(apiRoutes.teacher.memoryCandidates)
      .set(demoHeaders)
      .send({
        summary: "合成教师确认当前课程教案应保持详细。",
        preferenceKey: "lesson_plan_detail",
        preferenceValue: "详细",
        proposedScope: {
          kind: "course_run",
          subject: null,
          gradeLevel: null,
          courseRunRef: gate2DemoRefs.courseRunRef,
          lessonRef: null,
          taskRef: null,
          skillIds: ["lesson-preparation"]
        },
        purpose: "personalization.candidate.create",
        idempotencyKey: `memory-scope:create:${randomUUID()}`
      })
      .expect(201);
    const coursePreference = await request(app)
      .post(apiRoutes.teacher.memoryCandidateConfirm(
        courseCandidate.body.candidate.candidateRef
      ))
      .set(demoHeaders)
      .send({
        expectedVersion: courseCandidate.body.candidate.version,
        purpose: "personalization.candidate.confirm",
        idempotencyKey: `memory-scope:confirm:${randomUUID()}`
      })
      .expect(200);
    const task = await createStartedTask(app);
    const createdConversation = await request(app)
      .post(apiRoutes.teacher.conversations)
      .set(demoHeaders)
      .send({
        taskRef: task.taskRef,
        purposeFamily: "lesson_preparation",
        courseRunRef: task.courseRunRef,
        lessonRef: task.lessonRef,
        purpose: "teacher-copilot.conversation.create",
        idempotencyKey: `conversation:create:${randomUUID()}`
      })
      .expect(201);
    const firstText =
      "请强化斜率变化与图像陡峭程度的联系，并保留两个可比较方案。";
    const firstTurn = await request(app)
      .post(
        apiRoutes.teacher.conversationTurns(
          createdConversation.body.conversation.conversationRef
        )
      )
      .set(demoHeaders)
      .send({
        teacherText: firstText,
        parentTurnRef: null,
        expectedConversationVersion:
          createdConversation.body.conversation.version,
        purpose: "teacher-copilot.conversation.append-turn",
        idempotencyKey: `conversation:turn:${randomUUID()}`
      })
      .expect(201);
    const firstCommand = {
      ...invocationCommand(task),
      requestText: firstText,
      requestVersion: 2,
      conversationRef:
        firstTurn.body.conversation.conversationRef,
      turnRef: firstTurn.body.turn.turnRef,
      parentTurnRef: firstTurn.body.turn.parentTurnRef,
      conversationVersion:
        firstTurn.body.conversation.version
    };
    const firstQueued = await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(demoHeaders)
      .send(firstCommand)
      .expect(202);
    expect(firstQueued.body.execution).toMatchObject({
      conversationRef: firstTurn.body.conversation.conversationRef,
      turnRef: firstTurn.body.turn.turnRef,
      promptBundleVersion: 5
    });
    await product.workers.copilotOutbox.processAvailable(100);

    const afterFirst = await request(app)
      .get(
        apiRoutes.teacher.conversation(
          firstTurn.body.conversation.conversationRef
        )
      )
      .set(demoHeaders)
      .expect(200);
    expect(afterFirst.body.turns).toHaveLength(2);
    expect(afterFirst.body.turns[1]).toMatchObject({
      actorKind: "assistant_surface",
      contentKind: "result_link",
      teacherText: null
    });
    expect(afterFirst.body.workingMemory.activeGoal.text).toBe(
      firstText
    );

    const restartedProduct = createProductContainer(postgresEnvironment);
    try {
      const restartedApp = createApp({ product: restartedProduct });
      await request(restartedApp)
        .get(
          apiRoutes.teacher.conversation(
            firstTurn.body.conversation.conversationRef
          )
        )
        .set(demoHeaders)
        .expect(200)
        .expect(({ body }) => {
          expect(body.turns).toHaveLength(2);
          expect(body.workingMemory.contentHash).toHaveLength(64);
        });
    } finally {
      await restartedProduct.close();
    }

    const refreshedTask = await request(app)
      .get(apiRoutes.teacher.preparationTask(task.taskRef))
      .set(demoHeaders)
      .expect(200);
    const secondText = "再短一点，保留独立检查。";
    const secondTurn = await request(app)
      .post(
        apiRoutes.teacher.conversationTurns(
          afterFirst.body.conversationRef
        )
      )
      .set(demoHeaders)
      .send({
        teacherText: secondText,
        parentTurnRef: afterFirst.body.lastTurnRef,
        expectedConversationVersion: afterFirst.body.version,
        purpose: "teacher-copilot.conversation.append-turn",
        idempotencyKey: `conversation:turn:${randomUUID()}`
      })
      .expect(201);
    const secondCommand = {
      ...invocationCommand(refreshedTask.body),
      requestText: secondText,
      requestVersion: 2,
      conversationRef: afterFirst.body.conversationRef,
      turnRef: secondTurn.body.turn.turnRef,
      parentTurnRef: secondTurn.body.turn.parentTurnRef,
      conversationVersion: secondTurn.body.conversation.version
    };
    const secondQueued = await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(demoHeaders)
      .send(secondCommand)
      .expect(202);
    await product.workers.copilotOutbox.processAvailable(25);

    const recovered = await request(app)
      .get(
        apiRoutes.teacher.conversation(
          afterFirst.body.conversationRef
        )
      )
      .set(demoHeaders)
      .expect(200);
    expect(recovered.body.turns).toHaveLength(4);
    expect(recovered.body.workingMemory).toMatchObject({
      activeGoal: {
        text: firstText,
        sourceTurnRef: firstTurn.body.turn.turnRef
      },
      pendingIntents: [secondText]
    });
    expect(recovered.body.workingMemory).toMatchObject({
      builderVersion: "working-memory-builder@2",
      temporaryOverrides: []
    });
    expect(
      recovered.body.workingMemory.latestAssistantResult.resultRefs
        .proposalRevisionRef
    ).toBeTruthy();

    await expect(
      product.services.conversations.get({
        tenantRef: gate2DemoRefs.tenantRef,
        actorRef: "user:teacher-foreign",
        conversationRef: afterFirst.body.conversationRef
      })
    ).rejects.toMatchObject({ name: "NotFoundError" });

    const persisted = await adminPool.query<{
      skill_ref: string;
      snapshot_ref: string;
      snapshot_hash: string;
      source_sequence: number;
      active_snapshots: string;
      all_snapshots: string;
      teacher_turns: string;
      assistant_turns: string;
      context_engineering: Record<string, unknown>;
    }>(
      `SELECT execution.input_summary->>'skillRef' AS skill_ref,
              execution.input_summary->>'workingMemorySnapshotRef' AS snapshot_ref,
              execution.input_summary->>'workingMemoryContentHash' AS snapshot_hash,
              (execution.input_summary->>'workingMemorySourceTurnSequence')::integer AS source_sequence,
              (SELECT count(*)::text FROM runtime.working_memory_snapshot
                WHERE conversation_ref = $1 AND status = 'active') AS active_snapshots,
              (SELECT count(*)::text FROM runtime.working_memory_snapshot
                WHERE conversation_ref = $1) AS all_snapshots,
              (SELECT count(*)::text FROM work.conversation_turn
                WHERE conversation_ref = $1 AND actor_kind = 'teacher') AS teacher_turns,
              (SELECT count(*)::text FROM work.conversation_turn
                WHERE conversation_ref = $1 AND actor_kind = 'assistant_surface') AS assistant_turns,
              run.output->'contextEngineering' AS context_engineering
         FROM capability.model_execution AS execution
         JOIN runtime.agent_run AS run
           ON run.agent_run_ref = execution.agent_run_ref
        WHERE execution.execution_ref = $2`,
      [afterFirst.body.conversationRef, secondQueued.body.execution.modelExecutionRef]
    );
    expect(persisted.rows[0]).toMatchObject({
      skill_ref: "lesson-preparation@7",
      source_sequence: 3,
      active_snapshots: "1",
      all_snapshots: "4",
      teacher_turns: "2",
      assistant_turns: "2"
    });
    expect(persisted.rows[0]?.snapshot_ref).toMatch(
      /^working-memory:/u
    );
    expect(persisted.rows[0]?.snapshot_hash).toHaveLength(64);
    expect(
      persisted.rows[0]?.context_engineering["conversationManifest"]
    ).toMatchObject({
      schemaVersion: 5,
      conversationRef: afterFirst.body.conversationRef,
      turnRef: secondTurn.body.turn.turnRef,
      sourceTurnSequence: 3
    });
    expect(
      persisted.rows[0]?.context_engineering["memoryContextPackManifest"]
    ).toMatchObject({
      manifestVersion: 3,
      skillRef: "lesson-preparation@7",
      querySkillId: "lesson-preparation",
      queryUseCase: "lesson_preparation",
      teacherMemoryEpoch: 2,
      selectedCount: 1,
      overriddenCount: 1
    });
    const secondProposalRef = recovered.body.workingMemory
      .latestAssistantResult.resultRefs.proposalRevisionRef as string;
    const proposal = await request(app)
      .get(apiRoutes.demo.proposalDetail(secondProposalRef))
      .set(demoHeaders)
      .expect(200);
    expect(proposal.body.memoryContext).toMatchObject({
      currentTurn: {
        turnRef: secondTurn.body.turn.turnRef,
        displaySummary: secondText
      },
      workingMemory: [
        expect.objectContaining({
          sourceKind: "working_memory",
          decision: "injected",
          reasonCode: "same_task_working_memory"
        })
      ],
      durablePreferences: [
        expect.objectContaining({
          preferenceRef:
            coursePreference.body.preference.preferenceRef,
          preferenceValue: "详细",
          currentStatus: "active",
          decision: "injected",
          reasonCode: "active_confirmed_preference",
          scopeKind: "course_run",
          scopeDisplay: "当前课程"
        }),
        expect.objectContaining({
          preferenceRef:
            confirmedPreference.body.preference.preferenceRef,
          preferenceValue: "简洁",
          decision: "overridden",
          reasonCode: "more_specific_scope",
          scopeKind: "global"
        })
      ]
    });
    expect(proposal.body.memoryContext).toMatchObject({
      manifestVersion: 3,
      teacherMemoryEpoch: 2,
      selectedCount: 1,
      overriddenCount: 1
    });
    expect(proposal.body.memoryContext.packContentHash).toHaveLength(64);
    const runExplanation = await request(app)
      .get(apiRoutes.demo.runExplanation(task.taskRef))
      .set(demoHeaders)
      .expect(200);
    expect(runExplanation.body.memoryContext).toMatchObject({
      packRef: proposal.body.memoryContext.packRef,
      packContentHash: proposal.body.memoryContext.packContentHash
    });
    await product.services.modelInvocations.processExecution(
      secondQueued.body.execution.modelExecutionRef
    );
    const applicationCount = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM personalization.memory_application
        WHERE agent_run_ref = $1
          AND preference_ref = $2
          AND preference_version = $3
          AND decision = 'injected'`,
      [
        proposal.body.agentRunRef,
        coursePreference.body.preference.preferenceRef,
        coursePreference.body.preference.version
      ]
    );
    expect(applicationCount.rows[0]?.count).toBe("1");
    const overriddenApplication = await adminPool.query<{
      count: string;
      scope_hash: string;
    }>(
      `SELECT count(*)::text AS count, max(scope_hash) AS scope_hash
         FROM personalization.memory_application
        WHERE agent_run_ref = $1
          AND preference_ref = $2
          AND decision = 'overridden'
          AND reason_code = 'more_specific_scope'`,
      [
        proposal.body.agentRunRef,
        confirmedPreference.body.preference.preferenceRef
      ]
    );
    expect(overriddenApplication.rows[0]).toMatchObject({
      count: "1",
      scope_hash: proposal.body.memoryContext.queryScopeHash
    });

    const restartedObservabilityProduct = createProductContainer(
      postgresEnvironment
    );
    try {
      const restartedApp = createApp({
        product: restartedObservabilityProduct
      });
      await request(restartedApp)
        .get(apiRoutes.demo.proposalDetail(secondProposalRef))
        .set(demoHeaders)
        .expect(200)
        .expect(({ body }) => {
          expect(body.memoryContext.packRef).toBe(
            proposal.body.memoryContext.packRef
          );
          expect(body.memoryContext.packContentHash).toBe(
            proposal.body.memoryContext.packContentHash
          );
        });
    } finally {
      await restartedObservabilityProduct.close();
    }

    await request(app)
      .post(apiRoutes.demo.suggestionDisposition(secondProposalRef))
      .set(demoHeaders)
      .send({
        purpose: "teacher-copilot.review-suggestion",
        idempotencyKey: `memory-observability:reject:${randomUUID()}`,
        disposition: "rejected",
        selectedStrategyId: proposal.body.strategies[0].strategyId,
        expectedProposalRevisionNumber: proposal.body.proposalRevisionNumber,
        teacherEdits: {}
      })
      .expect(201);
    await product.workers.copilotOutbox.processAvailable(100);
    const outcomeCount = await adminPool.query<{
      count: string;
      status: string;
    }>(
      `SELECT count(*)::text AS count,
              max(outcome_status) AS status
         FROM personalization.memory_application_outcome
        WHERE agent_run_ref = $1`,
      [proposal.body.agentRunRef]
    );
    expect(outcomeCount.rows[0]).toMatchObject({
      count: "1",
      status: "rejected"
    });

    await request(app)
      .post(
        apiRoutes.teacher.teacherPreferenceRevoke(
          coursePreference.body.preference.preferenceRef
        )
      )
      .set(demoHeaders)
      .send({
        expectedVersion: coursePreference.body.preference.version,
        purpose: "personalization.preference.revoke",
        idempotencyKey: `memory-observability:revoke:${randomUUID()}`
      })
      .expect(200);
    await request(app)
      .get(apiRoutes.demo.proposalDetail(secondProposalRef))
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.memoryContext.durablePreferences[0]).toMatchObject({
          preferenceValue: "详细",
          currentStatus: "revoked",
          outcomeStatus: "rejected"
        });
        expect(body.memoryContext.outcomeStatus).toBe("rejected");
      });
    await request(app)
      .post(
        apiRoutes.teacher.teacherPreferenceRevoke(
          confirmedPreference.body.preference.preferenceRef
        )
      )
      .set(demoHeaders)
      .send({
        expectedVersion: confirmedPreference.body.preference.version,
        purpose: "personalization.preference.revoke",
        idempotencyKey: `memory-observability:revoke-global:${randomUUID()}`
      })
      .expect(200);
    expect(
      await product.services.personalization.listConfirmedPreferences({
        tenantRef: gate2DemoRefs.tenantRef,
        teacherRef: gate2DemoRefs.teacherRef
      })
    ).toEqual([]);

    await request(app)
      .get(apiRoutes.demo.proposalDetail(secondProposalRef))
      .set({
        ...demoHeaders,
        "x-demo-actor": "user:teacher-foreign"
      })
      .expect(403);
  });

  it("keeps ModelExecution successful when memory application recording is degraded", async () => {
    const candidate = await request(app)
      .post(apiRoutes.teacher.memoryCandidates)
      .set(demoHeaders)
      .send({
        summary: "合成教师确认教案应保持简洁。",
        preferenceKey: "lesson_plan_detail",
        preferenceValue: "简洁",
        purpose: "personalization.candidate.create",
        idempotencyKey: `memory-observability:degraded:create:${randomUUID()}`
      })
      .expect(201);
    await request(app)
      .post(
        apiRoutes.teacher.memoryCandidateConfirm(
          candidate.body.candidate.candidateRef
        )
      )
      .set(demoHeaders)
      .send({
        expectedVersion: candidate.body.candidate.version,
        purpose: "personalization.candidate.confirm",
        idempotencyKey: `memory-observability:degraded:confirm:${randomUUID()}`
      })
      .expect(200);
    const task = await createStartedTask(app);
    const teacherText = "请保持简洁，并保留一个独立检查。";
    const context = await createConversationTurn(app, task, teacherText);
    const queued = await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(demoHeaders)
      .send({
        ...invocationCommand(task),
        requestText: teacherText,
        requestVersion: 2,
        conversationRef: context.conversation.conversationRef,
        turnRef: context.turn.turnRef,
        parentTurnRef: context.turn.parentTurnRef,
        conversationVersion: context.conversation.version
      })
      .expect(202);

    await adminPool.query(`
      CREATE OR REPLACE FUNCTION personalization.reject_synthetic_memory_application()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        RAISE EXCEPTION 'synthetic memory application observability failure';
      END;
      $function$;
      CREATE TRIGGER reject_synthetic_memory_application
      BEFORE INSERT ON personalization.memory_application
      FOR EACH ROW
      EXECUTE FUNCTION personalization.reject_synthetic_memory_application()
    `);
    try {
      await product.workers.copilotOutbox.processAvailable(100);
    } finally {
      await adminPool.query(`
        DROP TRIGGER IF EXISTS reject_synthetic_memory_application
          ON personalization.memory_application;
        DROP FUNCTION IF EXISTS personalization.reject_synthetic_memory_application()
      `);
    }

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
        expect(body.proposalRevisionRef).toBeTruthy();
      });
    const persisted = await adminPool.query<{
      application_count: string;
      observability_status: string | null;
    }>(
      `SELECT
         (SELECT count(*)::text
            FROM personalization.memory_application
           WHERE agent_run_ref = execution.agent_run_ref) AS application_count,
         run.output->'contextEngineering'->'memoryApplicationObservability'->>'status'
           AS observability_status
         FROM capability.model_execution AS execution
         JOIN runtime.agent_run AS run
           ON run.agent_run_ref = execution.agent_run_ref
        WHERE execution.execution_ref = $1`,
      [queued.body.execution.modelExecutionRef]
    );
    expect(persisted.rows[0]).toMatchObject({
      application_count: "0",
      observability_status: "degraded"
    });
  });

  it("fails closed on owner, task, turn, snapshot reference, source sequence, and snapshot hash mismatches", async () => {
    const task = await createStartedTask(app);
    const text = "请保留独立检查。";
    const context = await createConversationTurn(app, task, text);
    const base = {
      tenantRef: gate2DemoRefs.tenantRef,
      teacherRef: gate2DemoRefs.teacherRef,
      conversationRef: context.conversation.conversationRef,
      turnRef: context.turn.turnRef,
      conversationVersion: context.conversation.version,
      requestText: text,
      taskRef: task.taskRef,
      courseRunRef: task.courseRunRef,
      lessonRef: task.lessonRef
    };

    await expect(
      product.services.conversations.requireInvocationContext(
        adminPool,
        base
      )
    ).resolves.toMatchObject({
      turn: { turnRef: context.turn.turnRef },
      workingMemory: {
        snapshotRef: context.workingMemory.snapshotRef
      }
    });
    for (const mismatch of [
      { tenantRef: "tenant:foreign" },
      { teacherRef: "user:teacher-foreign" }
    ]) {
      await expect(
        product.services.conversations.requireInvocationContext(
          adminPool,
          { ...base, ...mismatch }
        )
      ).rejects.toMatchObject({ name: "NotFoundError" });
    }
    for (const mismatch of [
      { taskRef: "preparation-task:foreign" },
      { turnRef: "turn:foreign" },
      { requestText: "不同的教师请求" },
      { conversationVersion: context.conversation.version + 1 }
    ]) {
      await expect(
        product.services.conversations.requireInvocationContext(
          adminPool,
          { ...base, ...mismatch }
        )
      ).rejects.toMatchObject({
        name: "DomainConflictError",
        code: "CONVERSATION_CONTEXT_CONFLICT"
      });
    }

    const sealed = {
      tenantRef: gate2DemoRefs.tenantRef,
      teacherRef: gate2DemoRefs.teacherRef,
      conversationRef: context.conversation.conversationRef,
      snapshotRef: context.workingMemory.snapshotRef,
      expectedVersion: 1,
      expectedContentHash: context.workingMemory.contentHash,
      expectedSourceTurnSequence:
        context.workingMemory.sourceTurnSequence
    };
    await expect(
      product.services.conversations.loadSealedWorkingMemory(
        adminPool,
        sealed
      )
    ).resolves.toMatchObject({
      contentHash: context.workingMemory.contentHash
    });
    for (const mismatch of [
      { snapshotRef: "working-memory:foreign" },
      { expectedContentHash: "0".repeat(64) },
      {
        expectedSourceTurnSequence:
          context.workingMemory.sourceTurnSequence + 1
      },
      { teacherRef: "user:teacher-foreign" }
    ]) {
      await expect(
        product.services.conversations.loadSealedWorkingMemory(
          adminPool,
          { ...sealed, ...mismatch }
        )
      ).rejects.toThrow(
        "The sealed WorkingMemorySnapshot cannot be reconstructed."
      );
    }

    await expect(
      adminPool.query(
        `UPDATE work.conversation_turn
            SET teacher_text = 'tampered'
          WHERE turn_ref = $1`,
        [context.turn.turnRef]
      )
    ).rejects.toThrow(/ConversationTurn is immutable/iu);
    await expect(
      adminPool.query(
        `UPDATE runtime.working_memory_snapshot
            SET content_hash = $2
          WHERE snapshot_ref = $1`,
        [context.workingMemory.snapshotRef, "0".repeat(64)]
      )
    ).rejects.toThrow(/payloads are immutable/iu);

    const isolated = await request(app)
      .post(apiRoutes.teacher.conversations)
      .set(demoHeaders)
      .send({
        taskRef: task.taskRef,
        purposeFamily: "lesson_preparation",
        courseRunRef: task.courseRunRef,
        lessonRef: task.lessonRef,
        purpose: "teacher-copilot.conversation.create",
        idempotencyKey: `conversation:isolated:${randomUUID()}`
      })
      .expect(201);
    expect(isolated.body.conversation).toMatchObject({
      turns: [],
      workingMemory: null,
      lastTurnSequence: 0
    });
  });

  it("closes a conversation, invalidates active memory, and recovers a Provider retry from the sealed snapshot", async () => {
    const task = await createStartedTask(app);
    const text = "请给出两个方案，并保留独立检查。";
    const context = await createConversationTurn(app, task, text);
    const queued = await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(demoHeaders)
      .send({
        ...invocationCommand(task),
        requestText: text,
        requestVersion: 2,
        conversationRef: context.conversation.conversationRef,
        turnRef: context.turn.turnRef,
        parentTurnRef: context.turn.parentTurnRef,
        conversationVersion: context.conversation.version
      })
      .expect(202);
    await request(app)
      .post(
        apiRoutes.teacher.modelInvocationCancel(
          queued.body.execution.modelExecutionRef
        )
      )
      .set(demoHeaders)
      .send({
        purpose: "teacher-copilot.cancel-model",
        idempotencyKey: `conversation:cancel:${randomUUID()}`,
        expectedStatus: "queued"
      })
      .expect(200);

    const closed = await request(app)
      .post(
        apiRoutes.teacher.conversationClose(
          context.conversation.conversationRef
        )
      )
      .set(demoHeaders)
      .send({
        expectedConversationVersion: context.conversation.version,
        purpose: "teacher-copilot.conversation.close",
        idempotencyKey: `conversation:close:${randomUUID()}`
      })
      .expect(201);
    expect(closed.body.conversation).toMatchObject({
      status: "closed",
      workingMemory: null,
      turns: [{ turnRef: context.turn.turnRef }]
    });
    await request(app)
      .post(
        apiRoutes.teacher.conversationTurns(
          context.conversation.conversationRef
        )
      )
      .set(demoHeaders)
      .send({
        teacherText: "关闭后不能追加",
        parentTurnRef: context.turn.turnRef,
        expectedConversationVersion:
          closed.body.conversation.version,
        purpose: "teacher-copilot.conversation.append-turn",
        idempotencyKey: `conversation:closed-turn:${randomUUID()}`
      })
      .expect(409);

    const retry = await request(app)
      .post(
        apiRoutes.teacher.modelInvocationRetry(
          queued.body.execution.modelExecutionRef
        )
      )
      .set(demoHeaders)
      .send({
        purpose: "teacher-copilot.retry-model",
        idempotencyKey: `conversation:retry:${randomUUID()}`,
        expectedStatus: "cancelled"
      })
      .expect(202);
    expect(retry.body.execution).toMatchObject({
      conversationRef: context.conversation.conversationRef,
      turnRef: context.turn.turnRef,
      retryOfModelExecutionRef:
        queued.body.execution.modelExecutionRef
    });
    await product.workers.copilotOutbox.processAvailable(25);
    await request(app)
      .get(
        apiRoutes.teacher.modelInvocation(
          retry.body.execution.modelExecutionRef
        )
      )
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("succeeded");
      });

    const persisted = await adminPool.query<{
      execution_ref: string;
      snapshot_ref: string;
      snapshot_hash: string;
    }>(
      `SELECT execution_ref,
              input_summary->>'workingMemorySnapshotRef' AS snapshot_ref,
              input_summary->>'workingMemoryContentHash' AS snapshot_hash
         FROM capability.model_execution
        WHERE execution_ref = ANY($1::text[])
        ORDER BY execution_ref`,
      [[
        queued.body.execution.modelExecutionRef,
        retry.body.execution.modelExecutionRef
      ]]
    );
    expect(new Set(persisted.rows.map((row) => row.snapshot_ref))).toEqual(
      new Set([context.workingMemory.snapshotRef])
    );
    expect(new Set(persisted.rows.map((row) => row.snapshot_hash))).toEqual(
      new Set([context.workingMemory.contentHash])
    );
    const snapshotStatus = await adminPool.query<{ status: string }>(
      `SELECT status
         FROM runtime.working_memory_snapshot
        WHERE snapshot_ref = $1`,
      [context.workingMemory.snapshotRef]
    );
    expect(snapshotStatus.rows[0]?.status).toBe("invalidated");
  });

  it("applies configured retention and excludes expired turns and snapshots", async () => {
    const expiringProduct = createProductContainer(postgresEnvironment, {
      conversationRetentionSettings: {
        durationMilliseconds: 1_000,
        policyVersion: "conversation-retention@1"
      }
    });
    const expiringApp = createApp({ product: expiringProduct });
    try {
      const task = await createStartedTask(expiringApp);
      const context = await createConversationTurn(
        expiringApp,
        task,
        "这条短期要求到期后不再可用。"
      );
      expect(
        Date.parse(context.workingMemory.expiresAt)
      ).toBeLessThanOrEqual(
        Date.parse(context.conversation.retentionUntil)
      );

      await wait(1_100);
      const expired = await request(expiringApp)
        .get(
          apiRoutes.teacher.conversation(
            context.conversation.conversationRef
          )
        )
        .set(demoHeaders)
        .expect(200);
      expect(expired.body).toMatchObject({
        status: "expired",
        turns: [],
        workingMemory: null
      });
      await request(expiringApp)
        .post(
          apiRoutes.teacher.conversationTurns(
            context.conversation.conversationRef
          )
        )
        .set(demoHeaders)
        .send({
          teacherText: "到期后不能追加",
          parentTurnRef: context.turn.turnRef,
          expectedConversationVersion:
            context.conversation.version,
          purpose: "teacher-copilot.conversation.append-turn",
          idempotencyKey: `conversation:expired-turn:${randomUUID()}`
        })
        .expect(409)
        .expect(({ body }) => {
          expect(body.code).toBe("CONVERSATION_EXPIRED");
        });
      await expect(
        expiringProduct.services.conversations.loadSealedWorkingMemory(
          adminPool,
          {
            tenantRef: gate2DemoRefs.tenantRef,
            teacherRef: gate2DemoRefs.teacherRef,
            conversationRef: context.conversation.conversationRef,
            snapshotRef: context.workingMemory.snapshotRef,
            expectedVersion: 1,
            expectedContentHash: context.workingMemory.contentHash,
            expectedSourceTurnSequence:
              context.workingMemory.sourceTurnSequence
          }
        )
      ).rejects.toThrow(
        "The sealed WorkingMemorySnapshot cannot be reconstructed."
      );
    } finally {
      await expiringProduct.close();
    }
  });

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

    const runtimeRow = await adminPool.query<{
      status: string;
      output: Record<string, unknown>;
      checkpoint_events: string;
    }>(
      `SELECT agent_run.status,
              agent_run.output,
              (SELECT count(*)::text
                 FROM runtime.outbox_record
                WHERE aggregate_ref = agent_run.agent_run_ref
                  AND event_name = 'AgentRunCheckpointed') AS checkpoint_events
         FROM runtime.agent_run AS agent_run
        WHERE agent_run.agent_run_ref = $1`,
      [queued.body.execution.agentRunRef]
    );
    const runtimeCheckpoint = runtimeRow.rows[0]?.output[
      "runtimeCheckpoint"
    ] as Record<string, unknown> | undefined;
    expect(runtimeRow.rows[0]?.status).toBe("completed");
    expect(runtimeRow.rows[0]?.checkpoint_events).toBe("3");
    expect(runtimeCheckpoint).toMatchObject({
      schemaVersion: 1,
      checkpointVersion: 4,
      skillId: "lesson-preparation",
      skillVersion: "3",
      skillRef: "lesson-preparation@3",
      status: "waiting_for_human",
      modelExecutionRef: queued.body.execution.modelExecutionRef,
      proposalRef: completed.body.proposalRevisionRef
    });
    expect(String(runtimeCheckpoint?.["skillContentHash"])).toHaveLength(64);
    expect(runtimeRow.rows[0]?.output["skillEvaluation"]).toMatchObject({
      policyVersion: "lesson-preparation-evaluation@1",
      passedBlockingChecks: true,
      contract: { status: "passed" },
      policy: { status: "passed" },
      operation: { status: "recorded" }
    });
    const contextEngineering = runtimeRow.rows[0]?.output[
      "contextEngineering"
    ] as Record<string, unknown> | undefined;
    expect(contextEngineering?.["evaluation"]).toMatchObject({
      policyVersion: "lesson-preparation-context-evaluation@1",
      passed: true,
      authorization: { status: "passed", unauthorizedRefs: [] },
      completeness: { status: "passed", missingResourceKinds: [] },
      budget: { status: "passed" },
      value: { status: "passed", hitRate: 1 }
    });
    expect(contextEngineering?.["manifest"]).toMatchObject({
      schemaVersion: 1,
      builderVersion: "lesson-preparation-context-builder@1",
      purpose: "lesson_preparation",
      contextManifestRef: queued.body.execution.contextManifestRef
    });
    expect(
      String(
        (contextEngineering?.["manifest"] as Record<string, unknown>)[
          "contentHash"
        ]
      )
    ).toHaveLength(64);
    expect(JSON.stringify(contextEngineering)).not.toContain(
      command.requestText
    );
    expect(
      (runtimeCheckpoint?.["steps"] as Array<Record<string, unknown>>)
        .every((step) => step["status"] === "succeeded")
    ).toBe(true);

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
      await seedSampleData(postgresEnvironment, {
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
      await seedSampleData(postgresEnvironment, {
        includeGate25: true
      });
      const arkApp = createApp({ product: arkProduct });
      const retryCandidate = await request(arkApp)
        .post(apiRoutes.teacher.memoryCandidates)
        .set(demoHeaders)
        .send({
          summary: "合成教师确认重试仍应使用已封存的简洁偏好。",
          preferenceKey: "provider_retry_preference",
          preferenceValue: "简洁",
          purpose: "personalization.candidate.create",
          idempotencyKey: `gate26:retry-preference:create:${randomUUID()}`
        })
        .expect(201);
      const retryPreference = await request(arkApp)
        .post(apiRoutes.teacher.memoryCandidateConfirm(
          retryCandidate.body.candidate.candidateRef
        ))
        .set(demoHeaders)
        .send({
          expectedVersion: retryCandidate.body.candidate.version,
          purpose: "personalization.candidate.confirm",
          idempotencyKey: `gate26:retry-preference:confirm:${randomUUID()}`
        })
        .expect(200);
      const task = await createStartedTask(arkApp);
      const retryText = "请生成简洁方案，并保留独立检查。";
      const conversation = await createConversationTurn(
        arkApp,
        task,
        retryText
      );
      const queued = await request(arkApp)
        .post(apiRoutes.teacher.modelInvocations)
        .set(demoHeaders)
        .send({
          ...invocationCommand(task),
          requestText: retryText,
          requestVersion: 2,
          conversationRef: conversation.conversation.conversationRef,
          turnRef: conversation.turn.turnRef,
          parentTurnRef: conversation.turn.parentTurnRef,
          conversationVersion: conversation.conversation.version
        })
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

      const sealedBeforeRetry = await adminPool.query<{
        pack_ref: string;
        pack_hash: string;
        memory_epoch: string;
        application_count: string;
      }>(
        `SELECT
           run.output->'contextEngineering'->'memoryContextPackManifest'
             ->>'packRef' AS pack_ref,
           run.output->'contextEngineering'->'memoryContextPackManifest'
             ->>'packContentHash' AS pack_hash,
           run.output->'contextEngineering'->'memoryContextPackManifest'
             ->>'teacherMemoryEpoch' AS memory_epoch,
           (SELECT count(*)::text
              FROM personalization.memory_application
             WHERE agent_run_ref = run.agent_run_ref
               AND preference_ref = $2) AS application_count
           FROM runtime.agent_run AS run
          WHERE run.agent_run_ref = $1`,
        [
          queued.body.execution.agentRunRef,
          retryPreference.body.preference.preferenceRef
        ]
      );
      expect(sealedBeforeRetry.rows[0]).toMatchObject({
        memory_epoch: "1",
        application_count: "1"
      });
      expect(sealedBeforeRetry.rows[0]?.pack_ref).toMatch(
        /^memory-context-pack:/u
      );
      expect(sealedBeforeRetry.rows[0]?.pack_hash).toMatch(
        /^[a-f0-9]{64}$/u
      );

      await request(arkApp)
        .post(apiRoutes.teacher.teacherPreferenceRevoke(
          retryPreference.body.preference.preferenceRef
        ))
        .set(demoHeaders)
        .send({
          expectedVersion: retryPreference.body.preference.version,
          purpose: "personalization.preference.revoke",
          idempotencyKey: `gate26:retry-preference:revoke:${randomUUID()}`
        })
        .expect(200);

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
      const sealedAfterRetry = await adminPool.query<{
        pack_ref: string;
        pack_hash: string;
        memory_epoch: string;
        application_count: string;
      }>(
        `SELECT
           run.output->'contextEngineering'->'memoryContextPackManifest'
             ->>'packRef' AS pack_ref,
           run.output->'contextEngineering'->'memoryContextPackManifest'
             ->>'packContentHash' AS pack_hash,
           run.output->'contextEngineering'->'memoryContextPackManifest'
             ->>'teacherMemoryEpoch' AS memory_epoch,
           (SELECT count(*)::text
              FROM personalization.memory_application
             WHERE agent_run_ref = run.agent_run_ref
               AND preference_ref = $2) AS application_count
           FROM runtime.agent_run AS run
          WHERE run.agent_run_ref = $1`,
        [
          retry.body.execution.agentRunRef,
          retryPreference.body.preference.preferenceRef
        ]
      );
      expect(sealedAfterRetry.rows[0]).toEqual(
        sealedBeforeRetry.rows[0]
      );
      await expect(
        arkProduct.services.personalization.resolveConfirmedPreferences({
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
        })
      ).resolves.toMatchObject({ selected: [] });
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
      await seedSampleData(postgresEnvironment, {
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
    await seedSampleData(postgresEnvironment, {
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

async function createConversationTurn(
  targetApp: ReturnType<typeof createApp>,
  task: Awaited<ReturnType<typeof createStartedTask>>,
  teacherText: string
) {
  const created = await request(targetApp)
    .post(apiRoutes.teacher.conversations)
    .set(demoHeaders)
    .send({
      taskRef: task.taskRef,
      purposeFamily: "lesson_preparation",
      courseRunRef: task.courseRunRef,
      lessonRef: task.lessonRef,
      purpose: "teacher-copilot.conversation.create",
      idempotencyKey: `conversation:create:${randomUUID()}`
    })
    .expect(201);
  const appended = await request(targetApp)
    .post(
      apiRoutes.teacher.conversationTurns(
        created.body.conversation.conversationRef
      )
    )
    .set(demoHeaders)
    .send({
      teacherText,
      parentTurnRef: null,
      expectedConversationVersion:
        created.body.conversation.version,
      purpose: "teacher-copilot.conversation.append-turn",
      idempotencyKey: `conversation:turn:${randomUUID()}`
    })
    .expect(201);
  return appended.body;
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

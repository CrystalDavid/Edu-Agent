import { createHash, randomUUID } from "node:crypto";

import {
  AppendTeacherConversationTurnResultSchema,
  CloseTeacherConversationResultSchema,
  ConversationThreadViewSchema,
  ConversationTurnViewSchema,
  CreateTeacherConversationResultSchema,
  type AppendTeacherConversationTurnRequest,
  type AppendTeacherConversationTurnResult,
  type AuthorizationDecision,
  type CloseTeacherConversationRequest,
  type CloseTeacherConversationResult,
  type ConversationThreadView,
  type ConversationTurnView,
  type CreateTeacherConversationRequest,
  type CreateTeacherConversationResult,
  type FormalWriteReceipt,
  type WorkingMemoryView
} from "@edu-agent/contracts";
import type { Pool } from "pg";

import { buildWorkingMemory } from "../modules/agent-runtime-context/domain/working-memory.js";
import {
  PostgresWorkingMemoryRepository,
  type PersistedWorkingMemorySnapshot
} from "../modules/agent-runtime-context/infrastructure/postgres-working-memory-repository.js";
import { PostgresGovernanceRepository } from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  PostgresConversationRepository,
  type ConversationThreadRecord
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-conversation-repository.js";
import { PostgresGate25WorkRepository } from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-5-work-repository.js";
import type { ConversationRetentionSettings } from "../modules/work-assistant-durable-execution/infrastructure/conversation-retention-config.js";
import {
  DomainConflictError,
  NotFoundError
} from "../platform/errors.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";
import type {
  PostgresClient,
  SqlExecutor
} from "../platform/postgres/types.js";

type Clock = () => Date;

export interface SealedConversationContext {
  thread: ConversationThreadRecord;
  turn: ConversationTurnView;
  workingMemory: PersistedWorkingMemorySnapshot;
}

export class PostgresConversationService {
  private readonly governance: PostgresGovernanceRepository;
  private readonly conversations: PostgresConversationRepository;
  private readonly workingMemory: PostgresWorkingMemoryRepository;
  private readonly preparation: PostgresGate25WorkRepository;
  private readonly clock: Clock;
  private readonly retention: ConversationRetentionSettings;

  constructor(
    private readonly pool: Pool,
    dependencies: {
      governance?: PostgresGovernanceRepository;
      conversations?: PostgresConversationRepository;
      workingMemory?: PostgresWorkingMemoryRepository;
      preparation?: PostgresGate25WorkRepository;
      clock?: Clock;
      retention?: ConversationRetentionSettings;
    } = {}
  ) {
    this.governance =
      dependencies.governance ?? new PostgresGovernanceRepository();
    this.conversations =
      dependencies.conversations ?? new PostgresConversationRepository();
    this.workingMemory =
      dependencies.workingMemory ?? new PostgresWorkingMemoryRepository();
    this.preparation =
      dependencies.preparation ?? new PostgresGate25WorkRepository();
    this.clock = dependencies.clock ?? (() => new Date());
    this.retention = dependencies.retention ?? {
      durationMilliseconds: 30 * 24 * 60 * 60 * 1000,
      policyVersion: "conversation-retention@1"
    };
  }

  async create(input: {
    tenantRef: string;
    actorRef: string;
    request: CreateTeacherConversationRequest;
  }): Promise<CreateTeacherConversationResult> {
    const now = this.clock().toISOString();
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      "conversation.create",
      input.request.idempotencyKey
    ].join("|");
    const writeContext = this.writeContext(
      input.actorRef,
      input.request.purpose,
      input.request.idempotencyKey,
      rootKey,
      now
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(client, {
        idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: hash(input.request),
        metadata: createWriteMetadata(
          writeContext,
          "governance",
          "conversation-create-idempotency"
        )
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return CreateTeacherConversationResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }
      const task = await this.preparation.getPreparationTask(
        client,
        input.tenantRef,
        input.request.taskRef,
        input.actorRef
      );
      if (!task) {
        throw new NotFoundError(
          "The Lesson Preparation Task was not found."
        );
      }
      if (
        task.courseRunRef !== input.request.courseRunRef ||
        task.lessonRef !== input.request.lessonRef
      ) {
        throw new DomainConflictError(
          "CONVERSATION_SCOPE_MISMATCH",
          "The conversation must use the Task-owned course and lesson scope."
        );
      }
      const conversationRef = `conversation:${randomUUID()}`;
      const retentionUntil = new Date(
        Date.parse(now) + this.retention.durationMilliseconds
      ).toISOString();
      const threadPayload = {
        conversationRef,
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        taskRef: task.taskRef,
        purposeFamily: input.request.purposeFamily,
        status: "active" as const,
        courseRunRef: task.courseRunRef,
        lessonRef: task.lessonRef,
        version: 1,
        lastTurnSequence: 0,
        lastTurnRef: null,
        retentionUntil,
        policyVersion: this.retention.policyVersion,
        createdAt: now,
        updatedAt: now,
        closedAt: null
      };
      const thread: ConversationThreadRecord = {
        ...threadPayload,
        contentHash: hash(threadPayload)
      };
      const decision = this.decision({
        decisionRef: writeContext.authorizationDecisionRef,
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        action: "teacher-copilot.conversation.create",
        resourceRef: task.taskRef,
        purpose: input.request.purpose,
        decidedAt: now
      });
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "conversation-create-authorization"
          )
        }),
        await this.conversations.insertThread(client, {
          thread,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "conversation-thread"
          )
        })
      ];
      const result = CreateTeacherConversationResultSchema.parse({
        replayed: false,
        conversation: this.view(thread, [], null)
      });
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: now
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async get(input: {
    tenantRef: string;
    actorRef: string;
    conversationRef: string;
  }): Promise<ConversationThreadView> {
    const now = this.clock().toISOString();
    const thread = await this.conversations.getThread(this.pool, {
      tenantRef: input.tenantRef,
      teacherRef: input.actorRef,
      conversationRef: input.conversationRef
    });
    if (!thread) {
      throw new NotFoundError("The conversation was not found.");
    }
    if (hasExpired(thread, now)) {
      return this.view(
        { ...thread, status: "expired" },
        [],
        null
      );
    }
    const [turns, snapshot] = await Promise.all([
      this.conversations.listTurns(this.pool, thread.conversationRef),
      thread.status === "active"
        ? this.workingMemory.getActive(this.pool, {
            tenantRef: input.tenantRef,
            teacherRef: input.actorRef,
            conversationRef: thread.conversationRef,
            asOf: now
          })
        : Promise.resolve(null)
    ]);
    return this.view(thread, turns, snapshot);
  }

  async appendTeacherTurn(input: {
    tenantRef: string;
    actorRef: string;
    conversationRef: string;
    request: AppendTeacherConversationTurnRequest;
  }): Promise<AppendTeacherConversationTurnResult> {
    const now = this.clock().toISOString();
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      "conversation.append-teacher-turn",
      input.request.idempotencyKey
    ].join("|");
    const writeContext = this.writeContext(
      input.actorRef,
      input.request.purpose,
      input.request.idempotencyKey,
      rootKey,
      now
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(client, {
        idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: hash({
          conversationRef: input.conversationRef,
          ...input.request
        }),
        metadata: createWriteMetadata(
          writeContext,
          "governance",
          "conversation-turn-idempotency"
        )
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return AppendTeacherConversationTurnResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }
      const thread = await this.requireActiveThread(client, input);
      if (thread.version !== input.request.expectedConversationVersion) {
        throw new DomainConflictError(
          "CONVERSATION_VERSION_CONFLICT",
          "The conversation changed before this turn was appended.",
          {
            expectedVersion: input.request.expectedConversationVersion,
            actualVersion: thread.version
          }
        );
      }
      if (thread.lastTurnRef !== input.request.parentTurnRef) {
        throw new DomainConflictError(
          "CONVERSATION_PARENT_CONFLICT",
          "The turn parent is not the latest visible conversation turn."
        );
      }
      const turn = this.teacherTurn({
        conversationRef: thread.conversationRef,
        sequence: thread.lastTurnSequence + 1,
        parentTurnRef: thread.lastTurnRef,
        teacherText: input.request.teacherText,
        createdAt: now
      });
      const decision = this.decision({
        decisionRef: writeContext.authorizationDecisionRef,
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        action: "teacher-copilot.conversation.append-turn",
        resourceRef: thread.conversationRef,
        purpose: input.request.purpose,
        decidedAt: now
      });
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "conversation-turn-authorization"
          )
        }),
        await this.conversations.insertTurn(client, {
          turn,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "conversation-teacher-turn"
          )
        })
      ];
      const updated = await this.advanceThread(
        client,
        thread,
        turn,
        now
      );
      const turns = await this.conversations.listTurns(
        client,
        thread.conversationRef
      );
      const snapshot = buildWorkingMemory({
        conversationRef: thread.conversationRef,
        turns,
        expiresAt: thread.retentionUntil
      });
      receipts.push(
        await this.workingMemory.replaceActive(client, {
          tenantRef: thread.tenantRef,
          teacherRef: thread.teacherRef,
          snapshot,
          sourceRefs: turns.map((item) => item.turnRef),
          sourceRetentionUntil: thread.retentionUntil,
          metadata: createWriteMetadata(
            writeContext,
            "runtime",
            "conversation-working-memory"
          )
        })
      );
      const result = AppendTeacherConversationTurnResultSchema.parse({
        replayed: false,
        conversation: this.view(updated, turns, snapshot),
        turn,
        workingMemory: snapshot
      });
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: now
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(input: {
    tenantRef: string;
    actorRef: string;
    conversationRef: string;
    request: CloseTeacherConversationRequest;
  }): Promise<CloseTeacherConversationResult> {
    const now = this.clock().toISOString();
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      "conversation.close",
      input.request.idempotencyKey
    ].join("|");
    const writeContext = this.writeContext(
      input.actorRef,
      input.request.purpose,
      input.request.idempotencyKey,
      rootKey,
      now
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(client, {
        idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: hash({
          conversationRef: input.conversationRef,
          ...input.request
        }),
        metadata: createWriteMetadata(
          writeContext,
          "governance",
          "conversation-close-idempotency"
        )
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return CloseTeacherConversationResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }
      const thread = await this.conversations.getThread(
        client,
        {
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          conversationRef: input.conversationRef
        },
        true
      );
      if (!thread) {
        throw new NotFoundError("The conversation was not found.");
      }
      if (hasExpired(thread, now)) {
        throw new DomainConflictError(
          "CONVERSATION_EXPIRED",
          "The conversation retention period has expired."
        );
      }
      if (thread.status !== "active") {
        throw new DomainConflictError(
          "CONVERSATION_NOT_ACTIVE",
          "Only an active conversation can be closed."
        );
      }
      if (thread.version !== input.request.expectedConversationVersion) {
        throw new DomainConflictError(
          "CONVERSATION_VERSION_CONFLICT",
          "The conversation changed before it was closed."
        );
      }
      const decision = this.decision({
        decisionRef: writeContext.authorizationDecisionRef,
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        action: "teacher-copilot.conversation.close",
        resourceRef: thread.conversationRef,
        purpose: input.request.purpose,
        decidedAt: now
      });
      const closed = await this.conversations.closeThread(client, {
        current: thread,
        contentHash: hash({
          previousContentHash: thread.contentHash,
          status: "closed",
          version: thread.version + 1,
          closedAt: now
        }),
        closedAt: now,
        metadata: createWriteMetadata(
          writeContext,
          "work",
          "conversation-close"
        )
      });
      if (!closed.thread) {
        throw new DomainConflictError(
          "CONVERSATION_VERSION_CONFLICT",
          "The conversation changed before it was closed."
        );
      }
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "conversation-close-authorization"
          )
        }),
        closed.receipt
      ];
      const invalidated = await this.workingMemory.deactivateActive(client, {
        tenantRef: thread.tenantRef,
        teacherRef: thread.teacherRef,
        conversationRef: thread.conversationRef,
        status: "invalidated",
        metadata: createWriteMetadata(
          writeContext,
          "runtime",
          "conversation-close-working-memory"
        )
      });
      if (invalidated) receipts.push(invalidated);
      const turns = await this.conversations.listTurns(
        client,
        thread.conversationRef
      );
      const result = CloseTeacherConversationResultSchema.parse({
        replayed: false,
        conversation: this.view(closed.thread, turns, null)
      });
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: now
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async requireInvocationContext(
    executor: SqlExecutor,
    input: {
      tenantRef: string;
      teacherRef: string;
      conversationRef: string;
      turnRef: string;
      conversationVersion: number;
      requestText: string;
      taskRef: string;
      courseRunRef: string;
      lessonRef: string;
    }
  ): Promise<SealedConversationContext> {
    const now = this.clock().toISOString();
    const thread = await this.conversations.getThread(executor, {
      tenantRef: input.tenantRef,
      teacherRef: input.teacherRef,
      conversationRef: input.conversationRef
    });
    if (!thread) {
      throw new NotFoundError("The conversation was not found.");
    }
    const turn = await this.conversations.getTurn(
      executor,
      thread.conversationRef,
      input.turnRef
    );
    const snapshot = await this.workingMemory.getActive(executor, {
      tenantRef: input.tenantRef,
      teacherRef: input.teacherRef,
      conversationRef: thread.conversationRef,
      asOf: now
    });
    if (
      thread.status !== "active" ||
      hasExpired(thread, now) ||
      thread.version !== input.conversationVersion ||
      thread.lastTurnRef !== input.turnRef ||
      thread.taskRef !== input.taskRef ||
      thread.courseRunRef !== input.courseRunRef ||
      thread.lessonRef !== input.lessonRef ||
      !turn ||
      turn.actorKind !== "teacher" ||
      turn.teacherText !== input.requestText.trim() ||
      !snapshot ||
      snapshot.sourceTurnSequence !== turn.sequence
    ) {
      throw new DomainConflictError(
        "CONVERSATION_CONTEXT_CONFLICT",
        "The selected conversation turn is no longer the current authorized context."
      );
    }
    return { thread, turn, workingMemory: snapshot };
  }

  async loadSealedWorkingMemory(
    executor: SqlExecutor,
    input: {
      tenantRef: string;
      teacherRef: string;
      conversationRef: string;
      snapshotRef: string;
      expectedVersion: number;
      expectedContentHash: string;
      expectedSourceTurnSequence: number;
    }
  ): Promise<PersistedWorkingMemorySnapshot> {
    const snapshot = await this.workingMemory.getByRef(executor, {
      ...input,
      asOf: this.clock().toISOString()
    });
    if (
      !snapshot ||
      snapshot.version !== input.expectedVersion ||
      snapshot.contentHash !== input.expectedContentHash ||
      snapshot.sourceTurnSequence !== input.expectedSourceTurnSequence
    ) {
      throw new Error(
        "The sealed WorkingMemorySnapshot cannot be reconstructed."
      );
    }
    return snapshot;
  }

  async resolveMemoryContextDisplay(
    executor: SqlExecutor,
    input: {
      readonly tenantRef: string;
      readonly teacherRef: string;
      readonly taskRef: string;
      readonly conversationRef: string;
      readonly turnRef: string;
      readonly turnSequence: number;
      readonly turnContentHash: string;
      readonly snapshotRef: string;
      readonly snapshotVersion: number;
      readonly snapshotContentHash: string;
    }
  ): Promise<{
    readonly currentTurn: {
      readonly turnRef: string;
      readonly sequence: number;
      readonly displaySummary: string;
    } | null;
    readonly workingMemory: {
      readonly sourceRef: string;
      readonly displaySummary: string;
    } | null;
  }> {
    const asOf = this.clock().toISOString();
    const thread = await this.conversations.getThread(executor, {
      tenantRef: input.tenantRef,
      teacherRef: input.teacherRef,
      conversationRef: input.conversationRef
    });
    if (!thread || thread.taskRef !== input.taskRef) {
      throw new NotFoundError("The memory context is not available.");
    }
    if (hasExpired(thread, asOf)) {
      return { currentTurn: null, workingMemory: null };
    }
    const [turn, snapshot] = await Promise.all([
      this.conversations.getTurn(
        executor,
        input.conversationRef,
        input.turnRef
      ),
      this.workingMemory.getByRef(executor, {
        tenantRef: input.tenantRef,
        teacherRef: input.teacherRef,
        conversationRef: input.conversationRef,
        snapshotRef: input.snapshotRef,
        asOf
      })
    ]);
    if (
      !turn ||
      turn.actorKind !== "teacher" ||
      turn.teacherText === null ||
      turn.sequence !== input.turnSequence ||
      turn.contentHash !== input.turnContentHash ||
      !snapshot ||
      snapshot.version !== input.snapshotVersion ||
      snapshot.contentHash !== input.snapshotContentHash ||
      snapshot.sourceTurnSequence !== input.turnSequence
    ) {
      throw new NotFoundError("The memory context is not available.");
    }
    const details = [
      `当前目标：${snapshot.activeGoal.text}`,
      snapshot.selectedOptions.length > 0
        ? `本轮选择：${snapshot.selectedOptions.join("、")}`
        : null,
      snapshot.temporaryOverrides.length > 0
        ? `临时要求：${snapshot.temporaryOverrides.join("、")}`
        : null,
      snapshot.latestAssistantResult
        ? `上一轮结果：${snapshot.latestAssistantResult.surfaceSummary}`
        : null
    ].filter((item): item is string => item !== null);
    return {
      currentTurn: {
        turnRef: turn.turnRef,
        sequence: turn.sequence,
        displaySummary: turn.teacherText
      },
      workingMemory: {
        sourceRef: snapshot.snapshotRef,
        displaySummary: details.join("；")
      }
    };
  }

  async appendAssistantResult(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      conversationRef: string;
      taskRunRef: string;
      agentRunRef: string;
      modelExecutionRef: string;
      proposalRevisionRef: string;
      writeContext: WriteContext;
      createdAt: string;
    }
  ): Promise<FormalWriteReceipt[]> {
    const thread = await this.conversations.getThread(
      client,
      {
        tenantRef: input.tenantRef,
        teacherRef: input.teacherRef,
        conversationRef: input.conversationRef
      },
      true
    );
    if (!thread) {
      throw new Error(
        "The conversation bound to the ModelExecution is unavailable."
      );
    }
    if (thread.status !== "active" || hasExpired(thread, input.createdAt)) {
      return [];
    }
    const existing = await this.conversations.findAssistantResult(
      client,
      thread.conversationRef,
      input.proposalRevisionRef
    );
    if (existing) return [];
    const turnPayload = {
      turnRef: `turn:${randomUUID()}`,
      conversationRef: thread.conversationRef,
      sequence: thread.lastTurnSequence + 1,
      parentTurnRef: thread.lastTurnRef,
      actorKind: "assistant_surface" as const,
      contentKind: "result_link" as const,
      teacherText: null,
      surfaceSummary:
        "已生成一版新的备课建议。你可以继续说“再短一点”“更具体一些”或补充新的要求。",
      taskRunRef: input.taskRunRef,
      agentRunRef: input.agentRunRef,
      resultRefs: {
        modelExecutionRef: input.modelExecutionRef,
        proposalRevisionRef: input.proposalRevisionRef
      },
      createdAt: input.createdAt
    };
    const turn = ConversationTurnViewSchema.parse({
      ...turnPayload,
      contentHash: hash(turnPayload)
    });
    const receipts: FormalWriteReceipt[] = [
      await this.conversations.insertTurn(client, {
        turn,
        metadata: createWriteMetadata(
          input.writeContext,
          "work",
          `conversation-assistant-turn:${input.modelExecutionRef}`
        )
      })
    ];
    await this.advanceThread(client, thread, turn, input.createdAt);
    const turns = await this.conversations.listTurns(
      client,
      thread.conversationRef
    );
    const snapshot = buildWorkingMemory({
      conversationRef: thread.conversationRef,
      turns,
      expiresAt: thread.retentionUntil
    });
    receipts.push(
      await this.workingMemory.replaceActive(client, {
        tenantRef: thread.tenantRef,
        teacherRef: thread.teacherRef,
        snapshot,
        sourceRefs: turns.map((item) => item.turnRef),
        sourceRetentionUntil: thread.retentionUntil,
        metadata: createWriteMetadata(
          input.writeContext,
          "runtime",
          `conversation-result-memory:${input.modelExecutionRef}`
        )
      })
    );
    return receipts;
  }

  private async requireActiveThread(
    client: PostgresClient,
    input: {
      tenantRef: string;
      actorRef: string;
      conversationRef: string;
    }
  ): Promise<ConversationThreadRecord> {
    const thread = await this.conversations.getThread(
      client,
      {
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        conversationRef: input.conversationRef
      },
      true
    );
    if (!thread) {
      throw new NotFoundError("The conversation was not found.");
    }
    if (thread.status !== "active") {
      throw new DomainConflictError(
        "CONVERSATION_NOT_ACTIVE",
        "Only an active conversation accepts new turns."
      );
    }
    if (hasExpired(thread, this.clock().toISOString())) {
      throw new DomainConflictError(
        "CONVERSATION_EXPIRED",
        "The conversation retention period has expired."
      );
    }
    return thread;
  }

  private async advanceThread(
    client: PostgresClient,
    thread: ConversationThreadRecord,
    turn: ConversationTurnView,
    updatedAt: string
  ): Promise<ConversationThreadRecord> {
    const updated = await this.conversations.advanceThread(client, {
      current: thread,
      turnRef: turn.turnRef,
      sequence: turn.sequence,
      contentHash: hash({
        previousContentHash: thread.contentHash,
        turnContentHash: turn.contentHash,
        version: thread.version + 1
      }),
      updatedAt
    });
    if (!updated) {
      throw new DomainConflictError(
        "CONVERSATION_VERSION_CONFLICT",
        "The conversation changed while the turn was being appended."
      );
    }
    return updated;
  }

  private teacherTurn(input: {
    conversationRef: string;
    sequence: number;
    parentTurnRef: string | null;
    teacherText: string;
    createdAt: string;
  }): ConversationTurnView {
    const payload = {
      turnRef: `turn:${randomUUID()}`,
      conversationRef: input.conversationRef,
      sequence: input.sequence,
      parentTurnRef: input.parentTurnRef,
      actorKind: "teacher" as const,
      contentKind: "teacher_text" as const,
      teacherText: input.teacherText.trim(),
      surfaceSummary: null,
      taskRunRef: null,
      agentRunRef: null,
      resultRefs: {},
      createdAt: input.createdAt
    };
    return ConversationTurnViewSchema.parse({
      ...payload,
      contentHash: hash(payload)
    });
  }

  private view(
    thread: ConversationThreadRecord,
    turns: readonly ConversationTurnView[],
    workingMemory: WorkingMemoryView | null
  ): ConversationThreadView {
    return ConversationThreadViewSchema.parse({
      conversationRef: thread.conversationRef,
      taskRef: thread.taskRef,
      purposeFamily: thread.purposeFamily,
      status: thread.status,
      courseRunRef: thread.courseRunRef,
      lessonRef: thread.lessonRef,
      version: thread.version,
      lastTurnSequence: thread.lastTurnSequence,
      lastTurnRef: thread.lastTurnRef,
      retentionUntil: thread.retentionUntil,
      policyVersion: thread.policyVersion,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      turns,
      workingMemory
    });
  }

  private writeContext(
    actorRef: string,
    purpose: string,
    idempotencyKey: string,
    rootKey: string,
    createdAt: string
  ): WriteContext {
    return {
      actorRef,
      purpose,
      rootIdempotencyKey: idempotencyKey,
      authorizationDecisionRef: `decision:${hash(rootKey).slice(0, 32)}`,
      createdAt
    };
  }

  private decision(input: {
    decisionRef: string;
    tenantRef: string;
    actorRef: string;
    action: string;
    resourceRef: string;
    purpose: string;
    decidedAt: string;
  }): AuthorizationDecision {
    return {
      decisionRef: input.decisionRef,
      actorRef: input.actorRef,
      tenantRef: input.tenantRef,
      purpose: input.purpose,
      action: input.action,
      resourceRef: input.resourceRef,
      requestedFieldMask: [
        "teacher_text",
        "safe_surface_summary",
        "working_memory"
      ],
      effect: "allow",
      reasonCodes: [
        "authenticated-teacher",
        "owner-scoped-conversation",
        "lesson-preparation-scope"
      ],
      policyVersion: "policy:teacher-conversation@1",
      decidedAt: input.decidedAt
    };
  }
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function hasExpired(
  thread: Pick<ConversationThreadRecord, "retentionUntil">,
  asOf: string
): boolean {
  return Date.parse(thread.retentionUntil) <= Date.parse(asOf);
}

import { createHash } from "node:crypto";

import {
  DispatchTeacherConversationTurnResultSchema,
  type DispatchTeacherConversationTurnRequest,
  type DispatchTeacherConversationTurnResult
} from "@edu-agent/contracts";

import type {
  ExplicitTeacherMemoryCommandService
} from "../modules/personalization-memory-analytics/application/index.js";
import {
  detectTeacherMemoryCommandIntent,
  interpretExplicitTeacherMemoryCommand
} from "../modules/personalization-memory-analytics/domain/index.js";
import type { PostgresConversationService } from "./postgres-conversation-service.js";

export class PostgresConversationDispatchService {
  constructor(
    private readonly conversations: PostgresConversationService,
    private readonly personalization: ExplicitTeacherMemoryCommandService,
    private readonly flags: {
      readonly explicitRememberEnabled: boolean;
      readonly scopedPreferencesEnabled: boolean;
    }
  ) {}

  async dispatch(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly conversationRef: string;
    readonly allowedCourseRunRefs: readonly string[];
    readonly request: DispatchTeacherConversationTurnRequest;
  }): Promise<DispatchTeacherConversationTurnResult> {
    const context = await this.conversations.requireDispatchContext({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      conversationRef: input.conversationRef,
      allowedCourseRunRefs: input.allowedCourseRunRefs
    });
    const detected = detectTeacherMemoryCommandIntent(
      input.request.teacherText
    );
    if (detected.intent === "none") {
      const appended = await this.conversations.appendTeacherTurn({
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        conversationRef: input.conversationRef,
        request: {
          teacherText: input.request.teacherText,
          parentTurnRef: input.request.parentTurnRef,
          expectedConversationVersion:
            input.request.expectedConversationVersion,
          purpose: "teacher-copilot.conversation.append-turn",
          idempotencyKey: stableKey(
            "model-instruction",
            input.request.idempotencyKey
          )
        }
      });
      return DispatchTeacherConversationTurnResultSchema.parse({
        kind: "model_instruction",
        replayed: appended.replayed,
        conversation: appended.conversation,
        turn: appended.turn,
        workingMemory: appended.workingMemory,
        turnContext: {
          conversationRef: appended.conversation.conversationRef,
          turnRef: appended.turn.turnRef,
          parentTurnRef: appended.turn.parentTurnRef,
          conversationVersion: appended.conversation.version
        }
      });
    }

    const commandTurn = await this.conversations.appendTeacherCommandTurn({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      conversationRef: input.conversationRef,
      teacherText: input.request.teacherText,
      parentTurnRef: input.request.parentTurnRef,
      expectedConversationVersion: input.request.expectedConversationVersion,
      idempotencyKey: stableKey("command-turn", input.request.idempotencyKey)
    });
    const interpretation = interpretExplicitTeacherMemoryCommand({
      teacherText: input.request.teacherText,
      sourceTurnRef: commandTurn.turn.turnRef,
      sourceTurnSequence: commandTurn.turn.sequence,
      sourceTurnContentHash: commandTurn.turn.contentHash,
      tenantRef: input.tenantRef,
      teacherRef: input.actorRef,
      taskRef: context.taskRef,
      courseRunRef: context.courseRunRef,
      lessonRef: context.lessonRef,
      skillId: "lesson-preparation",
      flags: this.flags,
      at: commandTurn.turn.createdAt
    });

    if (interpretation.intent === "remember") {
      const applied = await this.personalization.applyExplicitRemember({
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        allowedCourseRunRefs: input.allowedCourseRunRefs,
        command: interpretation,
        purpose: "personalization.explicit-remember.apply",
        idempotencyKey: stableKey(
          "personalization",
          commandTurn.turn.turnRef,
          commandTurn.turn.contentHash
        )
      });
      const receipt = applied.receipt;
      const receiptTurn = await this.conversations.appendAssistantCommandReceipt({
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        conversationRef: input.conversationRef,
        commandTurnRef: commandTurn.turn.turnRef,
        expectedConversationVersion: commandTurn.conversation.version,
        commandRef: receipt.commandRef,
        safeSummary: receipt.safeMessage,
        candidateRefs: receipt.items.flatMap((item) =>
          item.candidateRef ? [item.candidateRef] : []
        ),
        preferenceRefs: receipt.items.flatMap((item) =>
          item.preferenceRef ? [item.preferenceRef] : []
        ),
        idempotencyKey: stableKey(
          "receipt-turn",
          commandTurn.turn.turnRef,
          receipt.commandRef
        )
      });
      return DispatchTeacherConversationTurnResultSchema.parse({
        kind: "memory_command",
        replayed:
          commandTurn.replayed || applied.replayed || receiptTurn.replayed,
        conversation: receiptTurn.conversation,
        teacherTurn: commandTurn.turn,
        receiptTurn: receiptTurn.turn,
        receipt
      });
    }

    const safe = unsupportedReceipt(interpretation.intent, interpretation.issues);
    const commandRef =
      `memory-command:${interpretation.commandContentHash.slice(0, 32)}`;
    const receiptTurn = await this.conversations.appendAssistantCommandReceipt({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      conversationRef: input.conversationRef,
      commandTurnRef: commandTurn.turn.turnRef,
      expectedConversationVersion: commandTurn.conversation.version,
      commandRef,
      safeSummary: safe.safeMessage,
      candidateRefs: [],
      preferenceRefs: [],
      idempotencyKey: stableKey(
        "unsupported-receipt",
        commandTurn.turn.turnRef,
        commandRef
      )
    });
    return DispatchTeacherConversationTurnResultSchema.parse({
      kind: "unsupported_memory_command",
      replayed: commandTurn.replayed || receiptTurn.replayed,
      conversation: receiptTurn.conversation,
      teacherTurn: commandTurn.turn,
      receiptTurn: receiptTurn.turn,
      ...safe
    });
  }
}

function unsupportedReceipt(
  intent: "forget_requested" | "temporary_override" | "unsupported" | "rejected" | "none",
  issues: readonly string[]
): { safeReasonCode: string; safeMessage: string } {
  if (intent === "forget_requested") {
    return {
      safeReasonCode: "forget_not_available",
      safeMessage:
        "对话式忘记将在下一阶段处理。当前可以在助手偏好中撤销这条记录。"
    };
  }
  if (intent === "temporary_override") {
    return {
      safeReasonCode: "temporary_override_not_saved",
      safeMessage:
        "这条要求同时包含长期与临时语义，本次未保存为长期偏好。"
    };
  }
  if (intent === "rejected") {
    return {
      safeReasonCode: issues[0] ?? "unsafe_memory_content",
      safeMessage:
        "这条内容不属于可安全保存的教师表达偏好，未保存为长期偏好。"
    };
  }
  if (issues.includes("explicit_remember_disabled") ||
      issues.includes("scoped_preferences_disabled")) {
    return {
      safeReasonCode: issues[0] ?? "memory_feature_disabled",
      safeMessage: "长期偏好功能当前未启用，本次未保存。"
    };
  }
  return {
    safeReasonCode: issues[0] ?? "memory_command_not_supported",
    safeMessage:
      "这条内容无法完整、安全地解析为受支持的长期偏好，本次未保存。"
  };
}

function stableKey(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}:${createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")}`;
}

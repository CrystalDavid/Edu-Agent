import { createHash } from "node:crypto";

import {
  ConfirmExplicitForgetSelectionResultSchema,
  ConversationThreadViewSchema,
  DispatchTeacherConversationTurnResultSchema,
  type ConfirmExplicitForgetSelectionRequest,
  type ConfirmExplicitForgetSelectionResult,
  type ConversationMemoryCommandView,
  type ConversationThreadView,
  type DispatchTeacherConversationTurnRequest,
  type DispatchTeacherConversationTurnResult
} from "@edu-agent/contracts";

import type {
  ExplicitTeacherForgetCommandService,
  ExplicitTeacherMemoryCommandService
} from "../modules/personalization-memory-analytics/application/index.js";
import {
  detectExplicitTeacherForgetIntent,
  detectTeacherMemoryCommandIntent,
  interpretExplicitTeacherForgetCommand,
  interpretExplicitTeacherMemoryCommand
} from "../modules/personalization-memory-analytics/domain/index.js";
import {
  AuthorizationDeniedError,
  NotFoundError
} from "../platform/errors.js";
import type { PostgresConversationService } from "./postgres-conversation-service.js";

export class PostgresConversationDispatchService {
  constructor(
    private readonly conversations: PostgresConversationService,
    private readonly personalization:
      ExplicitTeacherMemoryCommandService & ExplicitTeacherForgetCommandService,
    private readonly flags: {
      readonly explicitRememberEnabled: boolean;
      readonly scopedPreferencesEnabled: boolean;
      readonly explicitForgetEnabled: boolean;
    }
  ) {}

  async loadConversation(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly conversationRef: string;
    readonly allowedCourseRunRefs: readonly string[];
  }): Promise<ConversationThreadView> {
    const conversation = await this.conversations.get(input);
    if (!input.allowedCourseRunRefs.includes(conversation.courseRunRef)) {
      throw new NotFoundError("The conversation was not found.");
    }
    return this.decorateForgetCommands({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      conversation
    });
  }

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
    const detectedForget = detectExplicitTeacherForgetIntent(
      input.request.teacherText
    );
    const routesToForget = detectedForget.intent === "forget" ||
      detectedForget.intent === "rejected";
    if (detected.intent === "none" && !routesToForget) {
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
    if (detected.intent === "forget_requested" || routesToForget) {
      const forget = interpretExplicitTeacherForgetCommand({
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
        flags: {
          explicitForgetEnabled: this.flags.explicitForgetEnabled
        },
        at: commandTurn.turn.createdAt
      });
      if (forget.intent === "forget") {
        const applied = await this.personalization.applyExplicitForget({
          tenantRef: input.tenantRef,
          actorRef: input.actorRef,
          allowedCourseRunRefs: input.allowedCourseRunRefs,
          courseRunRef: context.courseRunRef,
          command: forget,
          purpose: "personalization.explicit-forget.apply",
          idempotencyKey: stableKey(
            "personalization-forget",
            commandTurn.turn.turnRef,
            commandTurn.turn.contentHash
          )
        });
        const receipt = applied.receipt;
        const preferenceRefs = uniqueText(receipt.targets.flatMap((target) =>
          target.options.map((option) => option.preferenceRef)
        ));
        const appendedReceipt =
          await this.conversations.appendAssistantCommandReceipt({
            tenantRef: input.tenantRef,
            actorRef: input.actorRef,
            conversationRef: input.conversationRef,
            commandTurnRef: commandTurn.turn.turnRef,
            expectedConversationVersion: commandTurn.conversation.version,
            commandRef: receipt.commandRef,
            safeSummary: receipt.safeMessage,
            candidateRefs: [],
            preferenceRefs,
            idempotencyKey: stableKey(
              "forget-receipt-turn",
              commandTurn.turn.turnRef,
              receipt.commandRef
            )
          });
        const conversation = await this.decorateForgetCommands({
          tenantRef: input.tenantRef,
          actorRef: input.actorRef,
          conversation: appendedReceipt.conversation
        });
        return DispatchTeacherConversationTurnResultSchema.parse({
          kind: "memory_command",
          replayed:
            commandTurn.replayed || applied.replayed || appendedReceipt.replayed,
          conversation,
          teacherTurn: commandTurn.turn,
          receiptTurn: appendedReceipt.turn,
          receipt
        });
      }
      const safe = unsupportedForgetReceipt(forget.intent, forget.issues);
      const commandRef =
        `memory-forget-command:${forget.commandContentHash.slice(0, 32)}`;
      const appendedReceipt =
        await this.conversations.appendAssistantCommandReceipt({
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
            "unsupported-forget-receipt",
            commandTurn.turn.turnRef,
            commandRef
          )
        });
      const conversation = await this.decorateForgetCommands({
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        conversation: appendedReceipt.conversation
      });
      return DispatchTeacherConversationTurnResultSchema.parse({
        kind: "unsupported_memory_command",
        replayed: commandTurn.replayed || appendedReceipt.replayed,
        conversation,
        teacherTurn: commandTurn.turn,
        receiptTurn: appendedReceipt.turn,
        ...safe
      });
    }
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

  async confirmForget(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly conversationRef: string;
    readonly commandTurnRef: string;
    readonly allowedCourseRunRefs: readonly string[];
    readonly request: ConfirmExplicitForgetSelectionRequest;
  }): Promise<ConfirmExplicitForgetSelectionResult> {
    const context = await this.conversations.requireForgetSelectionContext({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      conversationRef: input.conversationRef,
      commandTurnRef: input.commandTurnRef,
      allowedCourseRunRefs: input.allowedCourseRunRefs,
      expectedConversationVersion: input.request.expectedConversationVersion
    });
    const command = interpretExplicitTeacherForgetCommand({
      teacherText: context.commandTurn.teacherText!,
      sourceTurnRef: context.commandTurn.turnRef,
      sourceTurnSequence: context.commandTurn.sequence,
      sourceTurnContentHash: context.commandTurn.contentHash,
      tenantRef: input.tenantRef,
      teacherRef: input.actorRef,
      taskRef: context.conversation.taskRef,
      courseRunRef: context.conversation.courseRunRef,
      lessonRef: context.conversation.lessonRef,
      skillId: "lesson-preparation",
      flags: {
        explicitForgetEnabled: this.flags.explicitForgetEnabled
      },
      at: context.commandTurn.createdAt
    });
    if (command.intent !== "forget") {
      throw new NotFoundError("The forget command selection was not found.");
    }
    const allowedPreferenceRefs =
      context.selectionReceiptTurn.resultRefs.preferenceRefs ?? [];
    const selectedPreferenceRefs = uniqueText(
      input.request.selectedPreferenceRefs
    );
    if (
      selectedPreferenceRefs.length !==
        input.request.selectedPreferenceRefs.length ||
      Object.keys(input.request.expectedVersions).some((preferenceRef) =>
        !selectedPreferenceRefs.includes(preferenceRef)
      )
    ) {
      throw new AuthorizationDeniedError(
        "所选偏好版本与忘记确认请求不一致。"
      );
    }
    const selections = selectedPreferenceRefs.map((preferenceRef) => {
      const expectedVersion = input.request.expectedVersions[preferenceRef];
      if (!expectedVersion) {
        throw new AuthorizationDeniedError(
          "所选偏好版本与忘记确认请求不一致。"
        );
      }
      return { preferenceRef, expectedVersion };
    });
    const applied = await this.personalization.confirmExplicitForget({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      allowedCourseRunRefs: input.allowedCourseRunRefs,
      courseRunRef: context.conversation.courseRunRef,
      command,
      allowedPreferenceRefs,
      selections,
      purpose: "personalization.explicit-forget.confirm",
      idempotencyKey: stableKey(
        "confirm-forget-personalization",
        context.commandTurn.turnRef,
        input.request.idempotencyKey
      )
    });
    const receipt = applied.receipt;
    const appended =
      await this.conversations.appendAssistantCommandFollowupReceipt({
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        conversationRef: input.conversationRef,
        commandTurnRef: context.commandTurn.turnRef,
        selectionReceiptTurnRef: context.selectionReceiptTurn.turnRef,
        expectedConversationVersion:
          input.request.expectedConversationVersion,
        commandRef: receipt.commandRef,
        safeSummary: receipt.safeMessage,
        preferenceRefs: selectedPreferenceRefs,
        idempotencyKey: stableKey(
          "confirm-forget-receipt",
          context.commandTurn.turnRef,
          input.request.idempotencyKey
        )
      });
    const conversation = await this.decorateForgetCommands({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      conversation: appended.conversation
    });
    return ConfirmExplicitForgetSelectionResultSchema.parse({
      replayed: applied.replayed || appended.replayed,
      conversation,
      commandTurn: context.commandTurn,
      receiptTurn: appended.turn,
      receipt
    });
  }

  private async decorateForgetCommands(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly conversation: ConversationThreadView;
  }): Promise<ConversationThreadView> {
    const views: ConversationMemoryCommandView[] = [];
    for (const commandTurn of input.conversation.turns) {
      if (
        commandTurn.actorKind !== "teacher" ||
        commandTurn.contentKind !== "command" ||
        !commandTurn.teacherText ||
        detectExplicitTeacherForgetIntent(commandTurn.teacherText).intent ===
          "none"
      ) {
        continue;
      }
      const receiptTurn = input.conversation.turns.find((turn) =>
        turn.actorKind === "assistant_surface" &&
        turn.contentKind === "command" &&
        turn.parentTurnRef === commandTurn.turnRef
      );
      if (!receiptTurn) continue;
      const preferenceRefs = receiptTurn.resultRefs.preferenceRefs ?? [];
      const followup = input.conversation.turns.find((turn) =>
        turn.actorKind === "assistant_surface" &&
        turn.contentKind === "command" &&
        turn.parentTurnRef === receiptTurn.turnRef
      ) ?? null;
      const options = await this.personalization.resolveExplicitForgetOptions({
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        preferenceRefs
      });
      views.push({
        commandTurnRef: commandTurn.turnRef,
        receiptTurnRef: receiptTurn.turnRef,
        kind: "forget",
        status: followup
          ? "resolved"
          : preferenceRefs.length === 0
            ? "informational"
            : options.every((option) => option.currentStatus === "revoked")
              ? "revoked"
              : "selection_required",
        preferenceRefs,
        resolvedByReceiptTurnRef: followup?.turnRef ?? null
      });
      if (followup) {
        views.push({
          commandTurnRef: commandTurn.turnRef,
          receiptTurnRef: followup.turnRef,
          kind: "forget",
          status: "revoked",
          preferenceRefs: followup.resultRefs.preferenceRefs ?? [],
          resolvedByReceiptTurnRef: null
        });
      }
    }
    return ConversationThreadViewSchema.parse({
      ...input.conversation,
      memoryCommands: views
    });
  }
}

function unsupportedForgetReceipt(
  intent: "none" | "temporary_override" | "unsupported" | "rejected",
  issues: readonly string[]
): { safeReasonCode: string; safeMessage: string } {
  if (issues.includes("explicit_forget_disabled")) {
    return {
      safeReasonCode: "explicit_forget_disabled",
      safeMessage:
        "对话式忘记当前未启用，本次没有修改长期偏好。你仍可在“助手偏好”中撤销记录。"
    };
  }
  if (intent === "temporary_override") {
    return {
      safeReasonCode: "temporary_override_not_implemented",
      safeMessage:
        "这是一条仅针对本次的要求，不会撤销长期偏好；正式临时覆盖仍未启用。"
    };
  }
  if (intent === "rejected") {
    return {
      safeReasonCode: issues[0] ?? "unsafe_forget_target",
      safeMessage:
        "这条内容不属于可安全撤销的教师表达偏好，本次未修改长期偏好。"
    };
  }
  return {
    safeReasonCode: issues[0] ?? "forget_command_not_supported",
    safeMessage:
      "这条内容无法完整、安全地解析为受支持的偏好撤销命令，本次未修改长期偏好。"
  };
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

function uniqueText(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort();
}

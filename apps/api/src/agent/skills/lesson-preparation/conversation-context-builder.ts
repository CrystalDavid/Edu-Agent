import { createHash } from "node:crypto";

import type { ConfirmedTeacherPreferenceSnapshot } from "../../../modules/personalization-memory-analytics/application/personalization-context-provider.js";
import {
  estimateContextTokens,
  type LessonPreparationContextPlan,
  type LessonPreparationSealedContext
} from "./context-builder.js";
import {
  LessonPreparationSkillInputSchemaV4,
  type LessonPreparationSkillInput,
  type LessonPreparationSkillInputV4
} from "./input-schema.js";
import {
  buildLessonBriefPreparationContext,
  type LessonBriefPreparationContextBuildResult
} from "./lesson-brief-context-builder.js";
import {
  buildPersonalizedLessonPreparationContext,
  type PersonalizedLessonPreparationContextBuildResult
} from "./personalized-context-builder.js";

export const conversationPreparationContextBuilderVersion =
  "lesson-preparation-context-builder@4" as const;

export interface ConversationPreparationManifest {
  readonly schemaVersion: 4;
  readonly builderVersion: typeof conversationPreparationContextBuilderVersion;
  readonly conversationRef: string;
  readonly turnRef: string;
  readonly snapshotRef: string;
  readonly snapshotContentHash: string;
  readonly sourceTurnSequence: number;
  readonly estimatedTokens: number;
  readonly totalEstimatedInputTokens: number;
  readonly contentHash: string;
}

export type ConversationPreparationContextBuildResult = (
  | Omit<LessonBriefPreparationContextBuildResult, "input">
  | Omit<PersonalizedLessonPreparationContextBuildResult, "input">
) & {
  readonly input: LessonPreparationSkillInputV4;
  readonly conversationManifest: ConversationPreparationManifest;
};

export function buildConversationPreparationContext(input: {
  readonly contextPlan: LessonPreparationContextPlan;
  readonly sealedContext: LessonPreparationSealedContext;
  readonly skillInput: LessonPreparationSkillInput;
  readonly baselineRevisionRef: string;
  readonly confirmedPreferences: readonly ConfirmedTeacherPreferenceSnapshot[];
}): ConversationPreparationContextBuildResult {
  const parsed = LessonPreparationSkillInputSchemaV4.parse(input.skillInput);
  const base = parsed.confirmedLessonBrief
    ? buildLessonBriefPreparationContext({
        ...input,
        skillInput: parsed
      })
    : buildPersonalizedLessonPreparationContext({
        ...input,
        skillInput: parsed
      });
  const context = parsed.conversationContext;
  const requiredRefs = [
    context.conversationRef,
    context.turnRef,
    context.workingMemorySnapshotRef
  ];
  const planned = new Set(input.contextPlan.authorizedResourceRefs);
  const sealed = new Set(input.sealedContext.resourceRefs);
  const unauthorized = requiredRefs.filter(
    (reference) => !planned.has(reference) || !sealed.has(reference)
  );
  if (unauthorized.length > 0) {
    throw new Error(
      `Conversation context is not authorized and sealed: ${unauthorized.join(", ")}`
    );
  }
  if (
    parsed.request.requestVersion !== 2 ||
    parsed.request.conversationRef !== context.conversationRef ||
    parsed.request.turnRef !== context.turnRef
  ) {
    throw new Error(
      "Conversation context does not match the sealed teacher request."
    );
  }
  const currentTurn = context.recentTeacherRequests.at(-1);
  if (
    !currentTurn ||
    currentTurn.turnRef !== context.turnRef ||
    currentTurn.sequence !== context.sourceTurnSequence ||
    currentTurn.text !== parsed.request.requestText
  ) {
    throw new Error(
      "Working memory does not end at the current teacher turn."
    );
  }
  const estimatedTokens = estimateContextTokens(context);
  const baseEstimatedTokens = parsed.confirmedLessonBrief
    ? (base as LessonBriefPreparationContextBuildResult)
        .lessonBriefManifest.totalEstimatedInputTokens
    : (base as PersonalizedLessonPreparationContextBuildResult)
        .personalizationManifest.totalEstimatedInputTokens;
  const totalEstimatedInputTokens = baseEstimatedTokens + estimatedTokens;
  if (totalEstimatedInputTokens > input.contextPlan.tokenBudget) {
    throw new Error(
      "Conversation working context exceeds the authorized context token budget."
    );
  }
  const manifestPayload = {
    schemaVersion: 4 as const,
    builderVersion: conversationPreparationContextBuilderVersion,
    conversationRef: context.conversationRef,
    turnRef: context.turnRef,
    snapshotRef: context.workingMemorySnapshotRef,
    snapshotContentHash: context.snapshotContentHash,
    sourceTurnSequence: context.sourceTurnSequence,
    estimatedTokens,
    totalEstimatedInputTokens
  };
  return Object.freeze({
    ...base,
    input: LessonPreparationSkillInputSchemaV4.parse({
      ...base.input,
      taskWorkingSet: parsed.taskWorkingSet,
      ...(parsed.confirmedLessonBrief
        ? { confirmedLessonBrief: parsed.confirmedLessonBrief }
        : {}),
      conversationContext: context
    }),
    conversationManifest: Object.freeze({
      ...manifestPayload,
      contentHash: hash(manifestPayload)
    })
  });
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

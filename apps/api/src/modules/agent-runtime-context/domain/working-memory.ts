import { createHash, randomUUID } from "node:crypto";

import {
  WorkingMemoryViewSchema,
  type ConversationTurnView,
  type TemporaryPreferenceOverride,
  type TemporaryPreferenceOverrideInterpretation,
  type WorkingMemoryView,
  type WorkingMemoryViewV2
} from "@edu-agent/contracts";

export const workingMemoryBuilderVersion =
  "working-memory-builder@1" as const;
export const workingMemoryBuilderVersionV2 =
  "working-memory-builder@2" as const;

const continuationPattern =
  /^(再|更|继续|还是|就按|按刚才|按上次|上一轮|刚才|这个|那个|它|第二种|第一种|第三种)|短一点|长一点|详细一点|简单一点|精简一点/u;
const temporaryOverridePattern =
  /短一点|长一点|详细一点|简单一点|精简一点|更简洁|更具体|不要.{0,12}|改成.{0,20}/gu;
const selectedOptionPattern =
  /(?:第[一二三四五六七八九十\d]+(?:种|个)?|方案[一二三四五六七八九十\d]+)/gu;

export function buildWorkingMemory(input: {
  conversationRef: string;
  turns: readonly ConversationTurnView[];
  expiresAt: string;
  snapshotRef?: string;
}): WorkingMemoryView {
  const ordered = [...input.turns].sort(
    (left, right) => left.sequence - right.sequence
  );
  const teacherTurns = ordered.filter(
    (turn): turn is ConversationTurnView & { teacherText: string } =>
      turn.actorKind === "teacher" &&
      turn.contentKind === "teacher_text" &&
      turn.teacherText !== null
  );
  const current = teacherTurns.at(-1);
  const source = ordered.at(-1);
  if (!current || !source) {
    throw new Error(
      "Working memory requires at least one authorized teacher turn."
    );
  }
  const recentTeacherTurns = teacherTurns.slice(-6);
  const continuation = isContinuation(current.teacherText);
  const previousSubstantive = teacherTurns
    .slice(0, -1)
    .reverse()
    .find((turn) => !isContinuation(turn.teacherText));
  const activeGoalTurn =
    continuation && previousSubstantive
      ? previousSubstantive
      : current;
  const latestAssistant = [...ordered]
    .reverse()
    .find(
      (turn) =>
        turn.actorKind === "assistant_surface" &&
        turn.contentKind !== "command" &&
        turn.surfaceSummary !== null
    );
  const priorAssistant = [...ordered]
    .reverse()
    .find(
      (turn) =>
        turn.sequence < current.sequence &&
        turn.actorKind === "assistant_surface" &&
        turn.contentKind !== "command" &&
        turn.surfaceSummary !== null
    );
  const referentTarget = priorAssistant
    ? priorAssistant.resultRefs.proposalRevisionRef ??
      priorAssistant.resultRefs.modelExecutionRef ??
      priorAssistant.turnRef
    : previousSubstantive?.turnRef;
  const payload = {
    conversationRef: input.conversationRef,
    sourceTurnSequence: source.sequence,
    activeGoal: {
      text: activeGoalTurn.teacherText,
      sourceTurnRef: activeGoalTurn.turnRef
    },
    recentTeacherRequests: recentTeacherTurns.map((turn) => ({
      turnRef: turn.turnRef,
      sequence: turn.sequence,
      text: turn.teacherText
    })),
    referents:
      continuation && referentTarget
        ? [
            {
              label: "当前所指对象",
              targetRef: referentTarget,
              sourceTurnRef: current.turnRef
            }
          ]
        : [],
    pendingIntents: [current.teacherText],
    selectedOptions: unique(
      current.teacherText.match(selectedOptionPattern) ?? []
    ),
    temporaryOverrides: continuation
      ? unique(current.teacherText.match(temporaryOverridePattern) ?? [])
      : [],
    latestAssistantResult: latestAssistant
      ? {
          turnRef: latestAssistant.turnRef,
          surfaceSummary: latestAssistant.surfaceSummary!,
          resultRefs: latestAssistant.resultRefs
        }
      : null,
    rollingSummary: createRollingSummary(
      recentTeacherTurns,
      latestAssistant
    ),
    builderVersion: workingMemoryBuilderVersion,
    expiresAt: input.expiresAt
  };
  return WorkingMemoryViewSchema.parse({
    snapshotRef:
      input.snapshotRef ?? `working-memory:${randomUUID()}`,
    ...payload,
    contentHash: hash(payload)
  });
}

export function isContinuation(text: string): boolean {
  return continuationPattern.test(normalize(text));
}

export function buildWorkingMemoryV2(input: {
  conversationRef: string;
  taskRef: string;
  courseRunRef: string;
  lessonRef: string;
  owner: { tenantRef: string; teacherRef: string };
  turns: readonly ConversationTurnView[];
  expiresAt: string;
  at: string;
  previousWorkingMemory?: WorkingMemoryView | null;
  interpretation?: TemporaryPreferenceOverrideInterpretation | null;
  snapshotRef?: string;
}): WorkingMemoryViewV2 {
  const legacy = buildWorkingMemory({
    conversationRef: input.conversationRef,
    turns: input.turns,
    expiresAt: input.expiresAt,
    ...(input.snapshotRef ? { snapshotRef: input.snapshotRef } : {})
  });
  const inherited = input.previousWorkingMemory?.builderVersion ===
    workingMemoryBuilderVersionV2
    ? input.previousWorkingMemory.temporaryOverrides.filter((override) =>
        override.owner.tenantRef === input.owner.tenantRef &&
        override.owner.teacherRef === input.owner.teacherRef &&
        override.conversationRef === input.conversationRef &&
        override.taskRef === input.taskRef &&
        override.courseRunRef === input.courseRunRef &&
        override.lessonRef === input.lessonRef &&
        override.skillId === "lesson-preparation" &&
        Date.parse(override.expiresAt) > Date.parse(input.at)
      )
    : [];
  const byCanonicalKey = new Map(
    inherited.map((override) => [override.canonicalKey, override])
  );
  if (input.interpretation?.status === "apply") {
    for (const override of input.interpretation.overrideItems) {
      byCanonicalKey.set(override.canonicalKey, override);
    }
  } else if (input.interpretation?.status === "clear") {
    if (input.interpretation.clearAll) {
      byCanonicalKey.clear();
    } else {
      for (const canonicalKey of input.interpretation.clearCanonicalKeys) {
        byCanonicalKey.delete(canonicalKey);
      }
    }
  }
  const temporaryOverrides = [...byCanonicalKey.values()]
    .sort(compareCanonicalKey);
  assertTemporaryOverrideSet(input, temporaryOverrides);
  const payload = {
    conversationRef: legacy.conversationRef,
    sourceTurnSequence: legacy.sourceTurnSequence,
    activeGoal: legacy.activeGoal,
    recentTeacherRequests: legacy.recentTeacherRequests,
    referents: legacy.referents,
    pendingIntents: legacy.pendingIntents,
    selectedOptions: legacy.selectedOptions,
    temporaryOverrides,
    latestAssistantResult: legacy.latestAssistantResult,
    rollingSummary: legacy.rollingSummary,
    builderVersion: workingMemoryBuilderVersionV2,
    expiresAt: legacy.expiresAt
  };
  return WorkingMemoryViewSchema.parse({
    snapshotRef: input.snapshotRef ?? legacy.snapshotRef,
    ...payload,
    contentHash: hash(payload)
  }) as WorkingMemoryViewV2;
}

export function hashTemporaryOverrideSet(
  overrides: readonly TemporaryPreferenceOverride[]
): string {
  return hash(
    [...overrides]
      .sort(compareCanonicalKey)
      .map((override) => ({
        overrideRef: override.overrideRef,
        canonicalKey: override.canonicalKey,
        effect: override.effect,
        canonicalValue: override.canonicalValue,
        sourceTurnRef: override.sourceTurnRef,
        sourceTurnSequence: override.sourceTurnSequence,
        sourceTurnContentHash: override.sourceTurnContentHash,
        contentHash: override.contentHash
      }))
  );
}

function compareCanonicalKey(
  left: TemporaryPreferenceOverride,
  right: TemporaryPreferenceOverride
): number {
  if (left.canonicalKey === right.canonicalKey) return 0;
  return left.canonicalKey < right.canonicalKey ? -1 : 1;
}

function assertTemporaryOverrideSet(
  input: {
    conversationRef: string;
    taskRef: string;
    courseRunRef: string;
    lessonRef: string;
    owner: { tenantRef: string; teacherRef: string };
    expiresAt: string;
  },
  overrides: readonly TemporaryPreferenceOverride[]
): void {
  if (overrides.length > 10) {
    throw new Error("WorkingMemory supports at most ten temporary overrides.");
  }
  for (const override of overrides) {
    if (
      override.owner.tenantRef !== input.owner.tenantRef ||
      override.owner.teacherRef !== input.owner.teacherRef ||
      override.conversationRef !== input.conversationRef ||
      override.taskRef !== input.taskRef ||
      override.courseRunRef !== input.courseRunRef ||
      override.lessonRef !== input.lessonRef ||
      override.skillId !== "lesson-preparation" ||
      override.eligibleForConsolidation !== false ||
      Date.parse(override.expiresAt) > Date.parse(input.expiresAt)
    ) {
      throw new Error("Temporary override binding is outside this Conversation.");
    }
  }
}

function createRollingSummary(
  teacherTurns: readonly (ConversationTurnView & {
    teacherText: string;
  })[],
  latestAssistant: ConversationTurnView | undefined
): string {
  const lines = teacherTurns.map(
    (turn) => `教师第${turn.sequence}轮：${normalize(turn.teacherText)}`
  );
  if (latestAssistant?.surfaceSummary) {
    lines.push(
      `最近一次助手结果：${normalize(latestAssistant.surfaceSummary)}`
    );
  }
  const summary = lines.join("\n");
  return summary.length <= 4000
    ? summary
    : summary.slice(summary.length - 4000);
}

function normalize(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(normalize).filter(Boolean))];
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

import { createHash, randomUUID } from "node:crypto";

import {
  WorkingMemoryViewSchema,
  type ConversationTurnView,
  type WorkingMemoryView
} from "@edu-agent/contracts";

export const workingMemoryBuilderVersion =
  "working-memory-builder@1" as const;

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

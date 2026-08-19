import { createHash } from "node:crypto";

import {
  ConversationTurnViewSchema,
  type ConversationTurnView
} from "@edu-agent/contracts";
import { describe, expect, it } from "vitest";

import {
  buildWorkingMemory,
  isContinuation
} from "../../apps/api/src/modules/agent-runtime-context/domain/working-memory.js";

const expiresAt = "2026-09-17T00:00:00.000Z";

describe("conversation working memory", () => {
  it("keeps the original goal and resolves a same-thread follow-up", () => {
    const turns = [
      teacherTurn(1, "请设计一节分数加法课，保留两个可比较方案"),
      assistantTurn(2, "proposal:first"),
      teacherTurn(3, "再短一点", "turn:2")
    ];

    const memory = buildWorkingMemory({
      conversationRef: "conversation:one",
      turns,
      expiresAt,
      snapshotRef: "working-memory:one"
    });

    expect(memory.activeGoal).toEqual({
      text: "请设计一节分数加法课，保留两个可比较方案",
      sourceTurnRef: "turn:1"
    });
    expect(memory.pendingIntents).toEqual(["再短一点"]);
    expect(memory.temporaryOverrides).toContain("短一点");
    expect(memory.referents).toEqual([
      {
        label: "当前所指对象",
        targetRef: "proposal:first",
        sourceTurnRef: "turn:3"
      }
    ]);
    expect(memory.latestAssistantResult?.resultRefs).toEqual({
      modelExecutionRef: "execution:2",
      proposalRevisionRef: "proposal:first"
    });
  });

  it("does not leak a prior thread into a new conversation", () => {
    const memory = buildWorkingMemory({
      conversationRef: "conversation:new",
      turns: [teacherTurn(1, "再短一点")],
      expiresAt,
      snapshotRef: "working-memory:new"
    });

    expect(memory.activeGoal.text).toBe("再短一点");
    expect(memory.referents).toEqual([]);
    expect(memory.latestAssistantResult).toBeNull();
  });

  it("is deterministic, bounded, and recognizes common continuations", () => {
    const turns = Array.from({ length: 8 }, (_, index) =>
      teacherTurn(index + 1, `第 ${index + 1} 个要求`)
    );
    const first = buildWorkingMemory({
      conversationRef: "conversation:bounded",
      turns,
      expiresAt,
      snapshotRef: "working-memory:first"
    });
    const second = buildWorkingMemory({
      conversationRef: "conversation:bounded",
      turns,
      expiresAt,
      snapshotRef: "working-memory:second"
    });

    expect(first.recentTeacherRequests).toHaveLength(6);
    expect(first.recentTeacherRequests[0]?.sequence).toBe(3);
    expect(first.contentHash).toBe(second.contentHash);
    expect(isContinuation("按刚才的第二种继续")).toBe(true);
    expect(isContinuation("重新设计一节完整的复习课")).toBe(false);
  });
});

function teacherTurn(
  sequence: number,
  text: string,
  parentTurnRef: string | null = sequence === 1
    ? null
    : `turn:${sequence - 1}`
): ConversationTurnView {
  return turn({
    turnRef: `turn:${sequence}`,
    sequence,
    parentTurnRef,
    actorKind: "teacher",
    contentKind: "teacher_text",
    teacherText: text,
    surfaceSummary: null,
    resultRefs: {}
  });
}
function assistantTurn(
  sequence: number,
  proposalRevisionRef: string
): ConversationTurnView {
  return turn({
    turnRef: `turn:${sequence}`,
    sequence,
    parentTurnRef: `turn:${sequence - 1}`,
    actorKind: "assistant_surface",
    contentKind: "result_link",
    teacherText: null,
    surfaceSummary: "已生成一版新的备课建议。",
    resultRefs: {
      modelExecutionRef: `execution:${sequence}`,
      proposalRevisionRef
    }
  });
}

function turn(input: {
  turnRef: string;
  sequence: number;
  parentTurnRef: string | null;
  actorKind: "teacher" | "assistant_surface";
  contentKind: "teacher_text" | "result_link";
  teacherText: string | null;
  surfaceSummary: string | null;
  resultRefs: Record<string, string>;
}): ConversationTurnView {
  const payload = {
    ...input,
    conversationRef: "conversation:one",
    taskRunRef: null,
    agentRunRef: null,
    createdAt: new Date(
      Date.parse("2026-08-18T00:00:00.000Z") +
        input.sequence * 1000
    ).toISOString()
  };
  return ConversationTurnViewSchema.parse({
    ...payload,
    contentHash: createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex")
  });
}

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

  it("does not let command turns or receipts replace teaching memory", () => {
    const turns = [
      teacherTurn(1, "请设计一节分数加法课"),
      assistantTurn(2, "proposal:first"),
      commandTurn(3, "记住：以后教案控制在一页"),
      commandReceiptTurn(4, "已记住 1 条偏好。"),
      commandTurn(5, "忘掉案例偏好"),
      commandReceiptTurn(6, "已忘掉 1 条偏好。")
    ];

    const memory = buildWorkingMemory({
      conversationRef: "conversation:one",
      turns,
      expiresAt,
      snapshotRef: "working-memory:command-safe"
    });

    expect(memory.sourceTurnSequence).toBe(6);
    expect(memory.activeGoal.text).toBe("请设计一节分数加法课");
    expect(memory.recentTeacherRequests.map((item) => item.text))
      .toEqual(["请设计一节分数加法课"]);
    expect(memory.pendingIntents).toEqual(["请设计一节分数加法课"]);
    expect(memory.latestAssistantResult?.turnRef).toBe("turn:2");
    expect(memory.rollingSummary).not.toContain("记住");
    expect(memory.rollingSummary).not.toContain("忘掉");
  });

  it("refuses to invent an active teaching goal from a command-only thread", () => {
    expect(() => buildWorkingMemory({
      conversationRef: "conversation:command-only",
      turns: [commandTurn(1, "记住：以后教案控制在一页")],
      expiresAt,
      snapshotRef: "working-memory:none"
    })).toThrow(/authorized teacher turn/u);

    expect(() => buildWorkingMemory({
      conversationRef: "conversation:forget-only",
      turns: [commandTurn(1, "忘掉案例偏好")],
      expiresAt,
      snapshotRef: "working-memory:forget-none"
    })).toThrow(/authorized teacher turn/u);
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

function commandTurn(sequence: number, text: string): ConversationTurnView {
  return turn({
    turnRef: `turn:${sequence}`,
    sequence,
    parentTurnRef: sequence === 1 ? null : `turn:${sequence - 1}`,
    actorKind: "teacher",
    contentKind: "command",
    teacherText: text,
    surfaceSummary: null,
    resultRefs: {}
  });
}

function commandReceiptTurn(
  sequence: number,
  summary: string
): ConversationTurnView {
  return turn({
    turnRef: `turn:${sequence}`,
    sequence,
    parentTurnRef: `turn:${sequence - 1}`,
    actorKind: "assistant_surface",
    contentKind: "command",
    teacherText: null,
    surfaceSummary: summary,
    resultRefs: {
      memoryCommandRef: "memory-command:synthetic"
    }
  });
}

function turn(input: {
  turnRef: string;
  sequence: number;
  parentTurnRef: string | null;
  actorKind: "teacher" | "assistant_surface";
  contentKind: "teacher_text" | "command" | "result_link";
  teacherText: string | null;
  surfaceSummary: string | null;
  resultRefs: Record<string, string | string[]>;
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

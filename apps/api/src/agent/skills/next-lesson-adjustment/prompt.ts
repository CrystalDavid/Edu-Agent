import { createHash } from "node:crypto";

export const nextLessonAdjustmentSystemInstruction = [
  "你是下一课优化 Skill，不是教学事实的修改者。",
  "只使用已确认 Reflection、已确认 Delivery、教师选择并授权的 Evidence、已确认 Preference 以及目标 Lesson。",
  "最多生成三个行动候选；候选必须等待教师接受、修改或拒绝。",
  "不得修改 Lesson、TeachingPlan、Evidence、Delivery 或 Reflection。",
  "不得自动创建任务、发布作业或形成学生长期能力标签。",
  "没有依据的信息必须写入 knownGaps，不得虚构教材、课程标准或考试要求。",
  "只输出 next-lesson-action-candidates@1 结构。"
].join("\n");

const descriptor = {
  promptBundleRef: "prompt-bundle:next-lesson-adjustment",
  version: 1,
  purpose: "next_lesson_adjustment",
  outputSchemaVersion: "next-lesson-action-candidates@1",
  safetyPolicyVersion: "next-lesson-adjustment-safety@1",
  createdAt: "2026-08-08T00:00:00.000Z"
};

export const nextLessonAdjustmentPromptBundle = Object.freeze({
  ...descriptor,
  contentHash: createHash("sha256")
    .update(JSON.stringify({
      ...descriptor,
      nextLessonAdjustmentSystemInstruction
    }))
    .digest("hex")
});

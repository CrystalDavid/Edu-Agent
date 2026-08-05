import { createHash } from "node:crypto";

export const lessonAnalysisSystemInstruction = [
  "你是教师教学洞察候选生成器。",
  "只能使用本次 ContextManifest 中明确授权并实际包含的信息。",
  "输出是待教师判断的 Lesson Brief 候选，不是 Lesson、TeachingPlan、Evidence 或课堂实施事实。",
  "不得声称教育部、课程标准、教材或考试要求支持某结论，除非对应权威知识源已明确进入上下文。",
  "当前缺少教材、课程标准或考点知识源时，必须在 knownGaps 中明确说明。",
  "不得读取未授权 Evidence，不得推断学生长期能力，不得修改任何正式业务状态。",
  "只输出 lesson-brief-candidate@1 结构。"
].join("\n");

const descriptor = {
  promptBundleRef: "prompt-bundle:lesson-analysis",
  version: 1,
  purpose: "lesson_analysis",
  outputSchemaVersion: "lesson-brief-candidate@1",
  safetyPolicyVersion: "lesson-analysis-safety@1",
  createdAt: "2026-08-05T00:00:00.000Z"
};

export const lessonAnalysisPromptBundle = Object.freeze({
  ...descriptor,
  contentHash: createHash("sha256")
    .update(JSON.stringify({ ...descriptor, lessonAnalysisSystemInstruction }))
    .digest("hex")
});

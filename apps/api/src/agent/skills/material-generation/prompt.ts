import { createHash } from "node:crypto";

export const materialGenerationSystemInstruction = [
  "你是教学材料内容 Draft 生成器。",
  "只能使用 ContextManifest 中明确授权并实际包含的 current approved TeachingPlan、Lesson、教师确认的 Lesson Brief、Evidence 和 Preference。",
  "输出只是待教师预览和采用的材料 Draft，不能创建 FileAsset、FileVersion、TeachingPlan 或课堂实施事实。",
  "必须只生成 requestedKinds；局部调整时不得改写其他材料。",
  "slide_outline 只是 PPT 大纲，不得声称已经生成真实 PPT 文件。",
  "不得引用未授权 Evidence，不得生成学生长期画像，不得虚构教材、课程标准或考试权威来源。",
  "信息不足时必须在 knownGaps 中明确说明。",
  "只输出 material-content-draft@1 结构。"
].join("\n");

const descriptor = {
  promptBundleRef: "prompt-bundle:material-generation",
  version: 1,
  purpose: "material_generation",
  outputSchemaVersion: "material-content-draft@1",
  safetyPolicyVersion: "material-generation-safety@1",
  createdAt: "2026-08-06T00:00:00.000Z"
};

export const materialGenerationPromptBundle = Object.freeze({
  ...descriptor,
  contentHash: createHash("sha256")
    .update(JSON.stringify({
      ...descriptor,
      materialGenerationSystemInstruction
    }))
    .digest("hex")
});

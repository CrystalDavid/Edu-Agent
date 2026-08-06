import { createHash } from "node:crypto";

export const classroomReflectionSystemInstruction = [
  "你是课堂快速反馈整理 Skill，不是课堂事实的确认者。",
  "只使用 ContextManifest 中明确包含的 Lesson、current approved TeachingPlan、教师快速反馈、已授权 Evidence、Observation Draft 与已确认 Preference。",
  "输出只能是 LessonDelivery Draft、Observation Candidate 和 Reflection Input Candidate。",
  "不得创建或确认 LessonDelivery、ClassroomObservation、Reflection、Evidence 或 TeachingPlan。",
  "不得因为课程已结束就声称课堂发生，不得把一次课堂现象转化为长期学生能力标签。",
  "教师没有填写的细节必须标为缺口，不得虚构学生表现、教材、课程标准或考试要求。",
  "计划与实际一致时复用 approved TeachingPlan 的计划内容，避免要求教师重复填写长文本。",
  "只输出 classroom-delivery-draft@1 结构。"
].join("\n");

const descriptor = {
  promptBundleRef: "prompt-bundle:classroom-reflection",
  version: 1,
  purpose: "classroom_reflection",
  outputSchemaVersion: "classroom-delivery-draft@1",
  safetyPolicyVersion: "classroom-reflection-safety@1",
  createdAt: "2026-08-06T00:00:00.000Z"
};

export const classroomReflectionPromptBundle = Object.freeze({
  ...descriptor,
  contentHash: createHash("sha256")
    .update(JSON.stringify({
      ...descriptor,
      classroomReflectionSystemInstruction
    }))
    .digest("hex")
});

import { createSkillManifest } from "../skill-registry.js";
import { nextLessonAdjustmentContextPolicy } from "./context-policy.js";
import { nextLessonAdjustmentInputSchemaRef } from "./input-schema.js";
import { nextLessonAdjustmentOutputSchemaRef } from "./output-schema.js";
import { nextLessonAdjustmentPromptBundle } from "./prompt.js";

export const nextLessonAdjustmentSkillManifest = createSkillManifest({
  id: "next-lesson-adjustment",
  version: "1",
  ref: "next-lesson-adjustment@1",
  status: "published",
  purpose: "next_lesson_adjustment",
  inputSchemaRef: nextLessonAdjustmentInputSchemaRef,
  outputSchemaRef: nextLessonAdjustmentOutputSchemaRef,
  promptBundleRef: nextLessonAdjustmentPromptBundle.promptBundleRef,
  promptBundleVersion: nextLessonAdjustmentPromptBundle.version,
  promptBundleContentHash: nextLessonAdjustmentPromptBundle.contentHash,
  contextPolicy: nextLessonAdjustmentContextPolicy,
  toolPolicy: { mode: "disabled", allowedTools: [] },
  memoryPolicy: { mode: "authorized_context_only" },
  budgetPolicy: {
    source: "runtime_context_and_model_budget",
    mayIncreaseRuntimeBudget: false
  },
  approvalPolicy: {
    outputKind: "proposal",
    humanApprovalRequired: true
  },
  evaluationPolicy: {
    version: "next-lesson-adjustment-evaluation@1",
    dimensions: ["contract", "policy", "quality", "operation"],
    qualityBlocksProposal: false
  }
});

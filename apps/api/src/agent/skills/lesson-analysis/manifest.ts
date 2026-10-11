import { createSkillManifest } from "../skill-registry.js";
import { lessonAnalysisContextPolicy } from "./context-policy.js";
import { lessonAnalysisInputSchemaRef } from "./input-schema.js";
import { lessonAnalysisOutputSchemaRef } from "./output-schema.js";
import { lessonAnalysisPromptBundle } from "./prompt.js";

export const lessonAnalysisSkillManifest = createSkillManifest({
  id: "lesson-analysis",
  version: "1",
  ref: "lesson-analysis@1",
  status: "published",
  purpose: "lesson_analysis",
  inputSchemaRef: lessonAnalysisInputSchemaRef,
  outputSchemaRef: lessonAnalysisOutputSchemaRef,
  promptBundleRef: lessonAnalysisPromptBundle.promptBundleRef,
  promptBundleVersion: lessonAnalysisPromptBundle.version,
  promptBundleContentHash: lessonAnalysisPromptBundle.contentHash,
  contextPolicy: lessonAnalysisContextPolicy,
  toolPolicy: { mode: "disabled", allowedTools: [] },
  memoryPolicy: { mode: "authorized_context_only" },
  budgetPolicy: {
    source: "runtime_context_and_model_budget",
    mayIncreaseRuntimeBudget: false
  },
  approvalPolicy: {
    outputKind: "draft",
    humanApprovalRequired: true
  },
  evaluationPolicy: {
    version: "lesson-analysis-evaluation@1",
    dimensions: ["contract", "policy", "quality", "operation"],
    qualityBlocksProposal: false
  }
});

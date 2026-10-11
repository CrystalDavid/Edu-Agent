import { createSkillManifest } from "../skill-registry.js";
import { reflectionAnalysisContextPolicy } from "./context-policy.js";
import { reflectionAnalysisInputSchemaRef } from "./input-schema.js";
import { reflectionAnalysisOutputSchemaRef } from "./output-schema.js";
import { reflectionAnalysisPromptBundle } from "./prompt.js";

export const reflectionAnalysisSkillManifest = createSkillManifest({
  id: "reflection-analysis",
  version: "1",
  ref: "reflection-analysis@1",
  status: "published",
  purpose: "reflection_analysis",
  inputSchemaRef: reflectionAnalysisInputSchemaRef,
  outputSchemaRef: reflectionAnalysisOutputSchemaRef,
  promptBundleRef: reflectionAnalysisPromptBundle.promptBundleRef,
  promptBundleVersion: reflectionAnalysisPromptBundle.version,
  promptBundleContentHash: reflectionAnalysisPromptBundle.contentHash,
  contextPolicy: reflectionAnalysisContextPolicy,
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
    version: "reflection-analysis-evaluation@1",
    dimensions: ["contract", "policy", "quality", "operation"],
    qualityBlocksProposal: false
  }
});

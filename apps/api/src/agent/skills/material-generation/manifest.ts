import { createSkillManifest } from "../skill-registry.js";
import { materialGenerationContextPolicy } from "./context-policy.js";
import { materialGenerationInputSchemaRef } from "./input-schema.js";
import { materialGenerationOutputSchemaRef } from "./output-schema.js";
import { materialGenerationPromptBundle } from "./prompt.js";

export const materialGenerationSkillManifest = createSkillManifest({
  id: "material-generation",
  version: "1",
  ref: "material-generation@1",
  status: "published",
  purpose: "material_generation",
  inputSchemaRef: materialGenerationInputSchemaRef,
  outputSchemaRef: materialGenerationOutputSchemaRef,
  promptBundleRef: materialGenerationPromptBundle.promptBundleRef,
  promptBundleVersion: materialGenerationPromptBundle.version,
  promptBundleContentHash: materialGenerationPromptBundle.contentHash,
  contextPolicy: materialGenerationContextPolicy,
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
    version: "material-generation-evaluation@1",
    dimensions: ["contract", "policy", "quality", "operation"],
    qualityBlocksProposal: false
  }
});

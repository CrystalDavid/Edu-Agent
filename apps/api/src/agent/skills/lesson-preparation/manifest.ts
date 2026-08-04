import { createSkillManifest } from "../skill-registry.js";
import { lessonPreparationContextPolicy } from "./context-policy.js";
import { lessonPreparationInputSchemaRef } from "./input-schema.js";
import { lessonPreparationOutputSchemaRef } from "./output-schema.js";
import { lessonPreparationPromptBundle } from "./prompt.js";

export const lessonPreparationSkillManifest = createSkillManifest({
  id: "lesson-preparation",
  version: "1",
  ref: "lesson-preparation@1",
  status: "published",
  purpose: "lesson_preparation",
  inputSchemaRef: lessonPreparationInputSchemaRef,
  outputSchemaRef: lessonPreparationOutputSchemaRef,
  promptBundleRef: lessonPreparationPromptBundle.promptBundleRef,
  promptBundleVersion: lessonPreparationPromptBundle.version,
  promptBundleContentHash: lessonPreparationPromptBundle.contentHash,
  contextPolicy: lessonPreparationContextPolicy,
  toolPolicy: {
    mode: "disabled",
    allowedTools: []
  },
  memoryPolicy: {
    mode: "disabled"
  },
  budgetPolicy: {
    source: "runtime_context_and_model_budget",
    mayIncreaseRuntimeBudget: false
  },
  approvalPolicy: {
    outputKind: "proposal",
    humanApprovalRequired: true
  },
  evaluationPolicy: {
    version: "lesson-preparation-evaluation@1",
    dimensions: ["contract", "policy", "quality", "operation"],
    qualityBlocksProposal: false
  }
});

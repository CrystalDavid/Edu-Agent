import { createSkillManifest } from "../skill-registry.js";
import { classroomReflectionContextPolicy } from "./context-policy.js";
import { classroomReflectionInputSchemaRef } from "./input-schema.js";
import { classroomReflectionOutputSchemaRef } from "./output-schema.js";
import { classroomReflectionPromptBundle } from "./prompt.js";

export const classroomReflectionSkillManifest = createSkillManifest({
  id: "classroom-reflection",
  version: "1",
  ref: "classroom-reflection@1",
  status: "published",
  purpose: "classroom_reflection",
  inputSchemaRef: classroomReflectionInputSchemaRef,
  outputSchemaRef: classroomReflectionOutputSchemaRef,
  promptBundleRef: classroomReflectionPromptBundle.promptBundleRef,
  promptBundleVersion: classroomReflectionPromptBundle.version,
  promptBundleContentHash: classroomReflectionPromptBundle.contentHash,
  contextPolicy: classroomReflectionContextPolicy,
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
    version: "classroom-reflection-evaluation@1",
    dimensions: ["contract", "policy", "quality", "operation"],
    qualityBlocksProposal: false
  }
});

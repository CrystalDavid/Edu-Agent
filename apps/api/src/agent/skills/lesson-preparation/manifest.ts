import { createSkillManifest } from "../skill-registry.js";
import {
  lessonPreparationContextPolicy,
  lessonPreparationContextPolicyV2,
  lessonPreparationContextPolicyV3,
  lessonPreparationContextPolicyV4,
  lessonPreparationContextPolicyV5,
  lessonPreparationContextPolicyV6
} from "./context-policy.js";
import {
  lessonPreparationInputSchemaRef,
  lessonPreparationInputSchemaRefV2,
  lessonPreparationInputSchemaRefV3,
  lessonPreparationInputSchemaRefV4,
  lessonPreparationInputSchemaRefV5
} from "./input-schema.js";
import { lessonPreparationOutputSchemaRef } from "./output-schema.js";
import {
  lessonPreparationPromptBundle,
  lessonBriefPreparationPromptBundle,
  conversationLessonPreparationPromptBundle,
  personalizedLessonPreparationPromptBundle
} from "./prompt.js";

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

export const lessonPreparationSkillManifestV2 = createSkillManifest({
  id: "lesson-preparation",
  version: "2",
  ref: "lesson-preparation@2",
  status: "published",
  purpose: "lesson_preparation",
  inputSchemaRef: lessonPreparationInputSchemaRef,
  outputSchemaRef: lessonPreparationOutputSchemaRef,
  promptBundleRef: lessonPreparationPromptBundle.promptBundleRef,
  promptBundleVersion: lessonPreparationPromptBundle.version,
  promptBundleContentHash: lessonPreparationPromptBundle.contentHash,
  contextPolicy: lessonPreparationContextPolicyV2,
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

export const lessonPreparationSkillManifestV3 = createSkillManifest({
  id: "lesson-preparation",
  version: "3",
  ref: "lesson-preparation@3",
  status: "published",
  purpose: "lesson_preparation",
  inputSchemaRef: lessonPreparationInputSchemaRefV2,
  outputSchemaRef: lessonPreparationOutputSchemaRef,
  promptBundleRef: personalizedLessonPreparationPromptBundle.promptBundleRef,
  promptBundleVersion: personalizedLessonPreparationPromptBundle.version,
  promptBundleContentHash: personalizedLessonPreparationPromptBundle.contentHash,
  contextPolicy: lessonPreparationContextPolicyV3,
  toolPolicy: {
    mode: "disabled",
    allowedTools: []
  },
  memoryPolicy: {
    mode: "authorized_context_only"
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

export const lessonPreparationSkillManifestV4 = createSkillManifest({
  id: "lesson-preparation",
  version: "4",
  ref: "lesson-preparation@4",
  status: "published",
  purpose: "lesson_preparation",
  inputSchemaRef: lessonPreparationInputSchemaRefV3,
  outputSchemaRef: lessonPreparationOutputSchemaRef,
  promptBundleRef: lessonBriefPreparationPromptBundle.promptBundleRef,
  promptBundleVersion: lessonBriefPreparationPromptBundle.version,
  promptBundleContentHash: lessonBriefPreparationPromptBundle.contentHash,
  contextPolicy: lessonPreparationContextPolicyV4,
  toolPolicy: {
    mode: "disabled",
    allowedTools: []
  },
  memoryPolicy: {
    mode: "authorized_context_only"
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

export const lessonPreparationSkillManifestV5 = createSkillManifest({
  id: "lesson-preparation",
  version: "5",
  ref: "lesson-preparation@5",
  status: "published",
  purpose: "lesson_preparation",
  inputSchemaRef: lessonPreparationInputSchemaRefV4,
  outputSchemaRef: lessonPreparationOutputSchemaRef,
  promptBundleRef: conversationLessonPreparationPromptBundle.promptBundleRef,
  promptBundleVersion: conversationLessonPreparationPromptBundle.version,
  promptBundleContentHash: conversationLessonPreparationPromptBundle.contentHash,
  contextPolicy: lessonPreparationContextPolicyV5,
  toolPolicy: {
    mode: "disabled",
    allowedTools: []
  },
  memoryPolicy: {
    mode: "authorized_context_only"
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

export const lessonPreparationSkillManifestV6 = createSkillManifest({
  id: "lesson-preparation",
  version: "6",
  ref: "lesson-preparation@6",
  status: "published",
  purpose: "lesson_preparation",
  inputSchemaRef: lessonPreparationInputSchemaRefV5,
  outputSchemaRef: lessonPreparationOutputSchemaRef,
  promptBundleRef: conversationLessonPreparationPromptBundle.promptBundleRef,
  promptBundleVersion: conversationLessonPreparationPromptBundle.version,
  promptBundleContentHash: conversationLessonPreparationPromptBundle.contentHash,
  contextPolicy: lessonPreparationContextPolicyV6,
  toolPolicy: {
    mode: "disabled",
    allowedTools: []
  },
  memoryPolicy: {
    mode: "authorized_context_only"
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

import { createHash } from "node:crypto";

const instruction = [
  "Separate confirmed classroom facts from Agent interpretation.",
  "Every fact and interpretation must cite only the sealed source refs.",
  "Return no more than three unexecuted action candidates.",
  "Never confirm a Reflection or create a follow-up action.",
  "Unknown information must remain explicit."
].join("\n");

const descriptor = {
  promptBundleRef: "prompt-bundle:reflection-analysis",
  version: 1,
  outputSchemaVersion: "reflection-analysis-draft@1",
  safetyPolicyVersion: "reflection-analysis-safety@1"
};

export const reflectionAnalysisPromptBundle = Object.freeze({
  ...descriptor,
  contentHash: createHash("sha256")
    .update(JSON.stringify({ ...descriptor, instruction }))
    .digest("hex")
});

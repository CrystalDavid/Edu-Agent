import type { SkillVersionBase } from "../types.js";
import {
  buildClassroomReflectionContext,
  type ClassroomReflectionContextBuildResult
} from "./context-builder.js";
import {
  evaluateClassroomReflection,
  type ClassroomReflectionEvaluation
} from "./evaluation.js";
import { generateClassroomReflectionDraft } from "./generator.js";
import {
  ClassroomReflectionSkillInputSchema,
  type ClassroomReflectionSkillInput
} from "./input-schema.js";
import { classroomReflectionSkillManifest } from "./manifest.js";
import {
  ClassroomReflectionSkillOutputSchema,
  type ClassroomReflectionSkillOutput
} from "./output-schema.js";
import { classroomReflectionPromptBundle } from "./prompt.js";
import {
  validateClassroomReflectionOutput,
  type ClassroomReflectionValidationResult
} from "./validator.js";

export interface ClassroomReflectionSkillVersion extends SkillVersionBase {
  readonly inputSchema: typeof ClassroomReflectionSkillInputSchema;
  readonly outputSchema: typeof ClassroomReflectionSkillOutputSchema;
  readonly promptBundle: typeof classroomReflectionPromptBundle;
  buildContext(value: unknown): ClassroomReflectionContextBuildResult;
  generate(input: ClassroomReflectionSkillInput): ClassroomReflectionSkillOutput;
  validate(input: {
    output: unknown;
    sources: ClassroomReflectionContextBuildResult["manifest"]["sourceRefs"];
    expectedTeachingPlanRevisionRef: string;
  }): ClassroomReflectionValidationResult;
  evaluate(input: {
    context: ClassroomReflectionContextBuildResult;
    validation: ClassroomReflectionValidationResult;
  }): ClassroomReflectionEvaluation;
}

export const classroomReflectionSkillV1: ClassroomReflectionSkillVersion =
  Object.freeze({
    manifest: classroomReflectionSkillManifest,
    inputSchema: ClassroomReflectionSkillInputSchema,
    outputSchema: ClassroomReflectionSkillOutputSchema,
    promptBundle: classroomReflectionPromptBundle,
    buildContext: buildClassroomReflectionContext,
    generate: generateClassroomReflectionDraft,
    validate: validateClassroomReflectionOutput,
    evaluate: evaluateClassroomReflection
  });

export type {
  ClassroomReflectionContextBuildResult,
  ClassroomReflectionEvaluation,
  ClassroomReflectionSkillInput,
  ClassroomReflectionSkillOutput,
  ClassroomReflectionValidationResult
};

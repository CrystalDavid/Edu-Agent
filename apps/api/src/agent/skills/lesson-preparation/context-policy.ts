import type { SkillContextPolicy } from "../types.js";
import type { LessonPreparationSkillInput } from "./input-schema.js";

export const lessonPreparationContextPolicy: SkillContextPolicy =
  Object.freeze({
    version: "lesson-preparation-context-policy@1",
    purpose: "lesson_preparation",
    requiredResourceKinds: [
      "course_run",
      "curriculum_unit",
      "lesson",
      "learning_objective",
      "teaching_plan",
      "authorized_evidence"
    ],
    allowedFieldGroups: [
      "teacher_request",
      "course_scope",
      "lesson_scope",
      "learning_objectives",
      "approved_plan_summary",
      "authorized_evidence_summary",
      "evidence_gaps",
      "interaction_contract",
      "task_working_set",
      "context_manifest_ref"
    ],
    evidencePolicy: "authorized_refs_only",
    missingInformationPolicy: "explicit"
  });

export const lessonPreparationContextPolicyV2: SkillContextPolicy =
  Object.freeze({
    ...lessonPreparationContextPolicy,
    version: "lesson-preparation-context-policy@2"
  });

export function validateLessonPreparationContext(
  input: LessonPreparationSkillInput
): readonly string[] {
  const issues: string[] = [];
  if (input.request.courseRunRef !== input.courseRun.courseRunRef) {
    issues.push("Teacher request CourseRun does not match the sealed context.");
  }
  if (
    input.request.lessonRef !== undefined &&
    input.request.lessonRef !== input.lesson.lessonRef
  ) {
    issues.push("Teacher request Lesson does not match the sealed context.");
  }
  const expectedObjectives = normalized(
    input.learningObjectives.map((objective) => objective.objectiveRef)
  );
  if (
    JSON.stringify(normalized(input.request.learningObjectiveRefs)) !==
    JSON.stringify(expectedObjectives)
  ) {
    issues.push(
      "Teacher request LearningObjectives do not match the sealed context."
    );
  }
  const authorizedEvidence = new Set(
    input.authorizedEvidence.map((evidence) => evidence.evidenceRef)
  );
  for (const evidenceRef of input.request.selectedEvidenceRefs) {
    if (!authorizedEvidence.has(evidenceRef)) {
      issues.push(
        `Teacher request selected unauthorized EvidenceRef ${evidenceRef}.`
      );
    }
  }
  return issues;
}

function normalized(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

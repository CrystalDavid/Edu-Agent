import type { SkillContextPolicy } from "../types.js";

export const lessonAnalysisContextPolicy: SkillContextPolicy = Object.freeze({
  version: "lesson-analysis-context@1",
  purpose: "lesson_analysis",
  requiredResourceKinds: ["lesson", "learning_objective"],
  allowedFieldGroups: [
    "lesson.summary",
    "learningObjective.summary",
    "evidence.authorizedSummary",
    "teachingPlan.approvedSummary",
    "teacherPreference.confirmed",
    "teacherAdjustment.explicit"
  ],
  evidencePolicy: "authorized_refs_only",
  missingInformationPolicy: "explicit"
});

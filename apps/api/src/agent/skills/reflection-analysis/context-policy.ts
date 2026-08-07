import type { SkillContextPolicy } from "../types.js";

export const reflectionAnalysisContextPolicy: SkillContextPolicy = Object.freeze({
  version: "reflection-analysis-context@1",
  purpose: "reflection_analysis",
  requiredResourceKinds: [
    "lesson",
    "approved_teaching_plan",
    "confirmed_delivery"
  ],
  allowedFieldGroups: [
    "lesson.objectives",
    "teachingPlan.approvedContent",
    "delivery.confirmedImplementation",
    "observation.confirmedSelection",
    "evidence.authorizedSelection",
    "lessonBrief.adoptedSelection",
    "reflection.currentDraft",
    "teacherAdjustment.explicit"
  ],
  evidencePolicy: "authorized_refs_only",
  missingInformationPolicy: "explicit"
});

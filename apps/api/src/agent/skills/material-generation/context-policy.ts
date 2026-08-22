import type { SkillContextPolicy } from "../types.js";

export const materialGenerationContextPolicy: SkillContextPolicy = Object.freeze({
  version: "material-generation-context@1",
  purpose: "material_generation",
  requiredResourceKinds: ["lesson", "approved_teaching_plan"],
  allowedFieldGroups: [
    "lesson.summary",
    "teachingPlan.currentApproved",
    "lessonBrief.teacherConfirmedSelection",
    "evidence.authorizedSummary",
    "teacherPreference.confirmed",
    "materialRequirement.explicit",
    "teacherAdjustment.explicit"
  ],
  evidencePolicy: "authorized_refs_only",
  missingInformationPolicy: "explicit"
});

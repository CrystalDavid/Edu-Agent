import type { SkillContextPolicy } from "../types.js";

export const classroomReflectionContextPolicy: SkillContextPolicy = Object.freeze({
  version: "classroom-reflection-context@1",
  purpose: "classroom_reflection",
  requiredResourceKinds: ["lesson", "approved_teaching_plan", "teacher_feedback"],
  allowedFieldGroups: [
    "lesson.summary",
    "teachingPlan.currentApproved",
    "teacherFeedback.explicit",
    "evidence.authorizedConfirmedSummary",
    "classroomObservation.draftAuthorized",
    "teacherPreference.confirmed"
  ],
  evidencePolicy: "authorized_refs_only",
  missingInformationPolicy: "explicit"
});

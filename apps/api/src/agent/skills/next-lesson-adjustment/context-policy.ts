import type { SkillContextPolicy } from "../types.js";

export const nextLessonAdjustmentContextPolicy: SkillContextPolicy =
  Object.freeze({
    version: "next-lesson-adjustment-context@1",
    purpose: "next_lesson_adjustment",
    requiredResourceKinds: [
      "confirmed_reflection",
      "confirmed_delivery",
      "source_lesson",
      "target_lesson"
    ],
    allowedFieldGroups: [
      "reflection.confirmedContent",
      "delivery.confirmedSummary",
      "lesson.summary",
      "evidence.authorizedSummary",
      "teacherPreference.confirmed",
      "teacherAdjustment.explicit"
    ],
    evidencePolicy: "authorized_refs_only",
    missingInformationPolicy: "explicit"
  });

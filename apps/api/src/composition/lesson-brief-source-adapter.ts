import { createHash } from "node:crypto";

import type {
  LessonBriefContext,
  LessonBriefSourceReader
} from "../modules/agent-runtime-context/application/lesson-brief-service.js";
import type { PostgresGate2ReadService } from "./postgres-gate2-read-service.js";
import type { PostgresLessonPreparationService } from "./postgres-lesson-preparation-service.js";
import type { PostgresPersonalizationService } from "./postgres-personalization-service.js";

export class LessonBriefSourceAdapter implements LessonBriefSourceReader {
  constructor(
    private readonly lessons: PostgresLessonPreparationService,
    private readonly read: PostgresGate2ReadService,
    private readonly personalization: PostgresPersonalizationService
  ) {}

  async load(context: LessonBriefContext) {
    const lesson = await this.lessons.getLesson(context);
    const [plans, evidenceResult, preferences] = await Promise.all([
      this.lessons.getLessonTeachingPlans(context),
      this.read.getAuthorizedLessonEvidence({
        tenantRef: context.tenantRef,
        actorRef: context.actorRef,
        courseRunRef: lesson.courseRunRef,
        requestedEvidenceRefs: lesson.currentEvidenceRefs
      }),
      this.personalization.listConfirmedPreferences({
        tenantRef: context.tenantRef,
        teacherRef: context.actorRef
      })
    ]);
    const objectiveRefs = lesson.learningObjectives.map(
      (objective) => objective.objectiveRef
    );
    return {
      tenantRef: context.tenantRef,
      actorRef: context.actorRef,
      lesson: {
        lessonRef: lesson.lessonRef,
        courseRunRef: lesson.courseRunRef,
        unitRef: lesson.unitRef,
        title: lesson.title,
        durationMinutes: lesson.durationMinutes,
        plannedAt: lesson.plannedAt,
        source: source(
          lesson.lessonRef,
          hash({
            title: lesson.title,
            plannedAt: lesson.plannedAt,
            durationMinutes: lesson.durationMinutes,
            preparationState: lesson.preparationState
          }),
          "lesson_read_facade"
        )
      },
      objectives: lesson.learningObjectives.map((objective) => ({
        ...objective,
        source: source(
          objective.objectiveRef,
          hash(objective),
          "lesson_learning_objective"
        )
      })),
      evidence: evidenceResult.items.map((item) => ({
        ...item,
        objectiveRefs,
        source: source(
          item.evidenceRef,
          hash(item),
          "authorized_lesson_evidence"
        )
      })),
      approvedTeachingPlan: plans.currentApproved
        ? {
            revisionRef: plans.currentApproved.revisionRef,
            revisionNumber: plans.currentApproved.revisionNumber,
            objective: plans.currentApproved.content.objective,
            lessonFocus: plans.currentApproved.content.lessonFocus,
            supportStrategy: plans.currentApproved.content.supportStrategy,
            source: source(
              plans.currentApproved.revisionRef,
              String(plans.currentApproved.revisionNumber),
              "current_approved_teaching_plan"
            )
          }
        : null,
      confirmedPreferences: preferences.map((preference) => ({
        preferenceRef: preference.preferenceRef,
        preferenceKey: preference.preferenceKey,
        preferenceValue: preference.preferenceValue,
        version: preference.version,
        source: source(
          preference.preferenceRef,
          String(preference.version),
          "confirmed_teacher_preference"
        )
      })),
      authorizedEvidenceRefs: evidenceResult.items.map(
        (item) => item.evidenceRef
      ),
      excludedEvidenceRefs: evidenceResult.excludedRefs
    };
  }
}

function source(ref: string, version: string, provenance: string) {
  return {
    ref,
    version,
    contentHash: hash({ ref, version, provenance }),
    provenance
  };
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

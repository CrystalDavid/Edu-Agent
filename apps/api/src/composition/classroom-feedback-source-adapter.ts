import { createHash } from "node:crypto";

import type {
  ClassroomFeedbackContext,
  ClassroomFeedbackSourceReader
} from "../modules/agent-runtime-context/application/classroom-feedback-service.js";
import { DomainConflictError } from "../platform/errors.js";
import type { PostgresClassroomReflectionService } from "./postgres-classroom-reflection-service.js";
import type { PostgresGate2ReadService } from "./postgres-gate2-read-service.js";
import type { PostgresLessonPreparationService } from "./postgres-lesson-preparation-service.js";
import type { PostgresPersonalizationService } from "./postgres-personalization-service.js";

export class ClassroomFeedbackSourceAdapter
  implements ClassroomFeedbackSourceReader
{
  constructor(
    private readonly lessons: PostgresLessonPreparationService,
    private readonly read: PostgresGate2ReadService,
    private readonly personalization: PostgresPersonalizationService,
    private readonly classroom: PostgresClassroomReflectionService
  ) {}

  async load(
    context: ClassroomFeedbackContext,
    expectedApprovedTeachingPlanRevisionRef: string
  ) {
    const lesson = await this.lessons.getLesson(context);
    const plans = await this.lessons.getLessonTeachingPlans(context);
    const approved = plans.currentApproved;
    if (!approved) {
      throw new DomainConflictError(
        "CLASSROOM_FEEDBACK_APPROVED_PLAN_REQUIRED",
        "请先批准教学方案，再整理本节课的实际实施情况。"
      );
    }
    if (approved.revisionRef !== expectedApprovedTeachingPlanRevisionRef) {
      throw new DomainConflictError(
        "CLASSROOM_FEEDBACK_PLAN_VERSION_CONFLICT",
        "已批准教学计划已经更新，请刷新后基于最新版本记录课堂。"
      );
    }
    const [evidenceResult, preferences, observations] = await Promise.all([
      this.read.getAuthorizedLessonEvidence({
        tenantRef: context.tenantRef,
        actorRef: context.actorRef,
        courseRunRef: lesson.courseRunRef,
        requestedEvidenceRefs: approved.content.evidenceRefs
      }),
      this.personalization.listConfirmedPreferences({
        tenantRef: context.tenantRef,
        teacherRef: context.actorRef
      }),
      this.classroom.listObservations({
        tenantRef: context.tenantRef,
        actorRef: context.actorRef,
        query: { lessonRef: context.lessonRef }
      })
    ]);
    const confirmedEvidence = evidenceResult.items.filter((item) =>
      item.evidenceType === "observation" || item.status === "confirmed"
    );
    const unconfirmedEvidenceRefs = evidenceResult.items
      .filter((item) =>
        item.evidenceType === "claim" && item.status !== "confirmed"
      )
      .map((item) => item.evidenceRef);

    return {
      tenantRef: context.tenantRef,
      actorRef: context.actorRef,
      lesson: {
        lessonRef: lesson.lessonRef,
        courseRunRef: lesson.courseRunRef,
        unitRef: lesson.unitRef,
        title: lesson.title,
        plannedAt: lesson.plannedAt,
        durationMinutes: lesson.durationMinutes,
        learningObjectiveRefs: lesson.learningObjectives.map(
          (objective) => objective.objectiveRef
        ),
        source: snapshot(
          lesson.lessonRef,
          hash({
            lessonRef: lesson.lessonRef,
            plannedAt: lesson.plannedAt,
            durationMinutes: lesson.durationMinutes,
            title: lesson.title
          }),
          "lesson_read_facade"
        )
      },
      approvedTeachingPlan: {
        artifactRef: approved.artifactRef,
        revisionRef: approved.revisionRef,
        revisionNumber: approved.revisionNumber,
        title: approved.title,
        content: approved.content,
        source: snapshot(
          approved.revisionRef,
          String(approved.revisionNumber),
          "current_approved_teaching_plan"
        )
      },
      evidence: confirmedEvidence.map((item) => ({
        evidenceRef: item.evidenceRef,
        evidenceType: item.evidenceType,
        summary: item.summary,
        status: item.status,
        sourceRefs: item.sourceRefs,
        source: snapshot(
          item.evidenceRef,
          hash({
            summary: item.summary,
            status: item.status,
            observedAt: item.observedAt
          }),
          "authorized_confirmed_lesson_evidence"
        )
      })),
      observationDrafts: observations.items
        .filter((item) => item.status === "draft")
        .map((item) => ({
          observationRevisionRef: item.observationRevisionRef,
          scope: item.scope,
          scopeRef: item.scopeRef,
          observationType: item.observationType,
          content: item.content,
          source: snapshot(
            item.observationRevisionRef,
            String(item.revisionVersion),
            "authorized_classroom_observation_draft"
          )
        })),
      confirmedPreferences: preferences.map((preference) => ({
        preferenceRef: preference.preferenceRef,
        preferenceKey: preference.preferenceKey,
        preferenceValue: preference.preferenceValue,
        version: preference.version,
        source: {
          ref: preference.preferenceRef,
          version: String(preference.version),
          contentHash: preference.contentHash,
          provenance: "confirmed_teacher_preference"
        }
      })),
      authorizedEvidenceRefs: confirmedEvidence.map((item) => item.evidenceRef),
      excludedEvidenceRefs: [
        ...new Set([
          ...evidenceResult.excludedRefs,
          ...unconfirmedEvidenceRefs
        ])
      ]
    };
  }
}

function snapshot(ref: string, version: string, provenance: string) {
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

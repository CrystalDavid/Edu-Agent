import { createHash } from "node:crypto";

import type {
  NextLessonOptimizationContext,
  NextLessonOptimizationSourceReader
} from "../modules/agent-runtime-context/application/next-lesson-optimization-service.js";
import { DomainConflictError } from "../platform/errors.js";
import type { PostgresClassroomReflectionService } from "./postgres-classroom-reflection-service.js";
import type { PostgresGate2ReadService } from "./postgres-gate2-read-service.js";
import type { PostgresLessonPreparationService } from "./postgres-lesson-preparation-service.js";
import type { PostgresPersonalizationService } from "./postgres-personalization-service.js";

export class NextLessonOptimizationSourceAdapter
  implements NextLessonOptimizationSourceReader
{
  constructor(
    private readonly classroom: PostgresClassroomReflectionService,
    private readonly lessons: PostgresLessonPreparationService,
    private readonly read: PostgresGate2ReadService,
    private readonly personalization: PostgresPersonalizationService
  ) {}

  async load(
    context: NextLessonOptimizationContext,
    reflectionRevisionRef: string,
    targetLessonRef: string
  ) {
    const reflection = await this.classroom.getReflection({
      tenantRef: context.tenantRef,
      actorRef: context.actorRef,
      reflectionRef: context.reflectionRef
    });
    const confirmed = reflection.currentConfirmed;
    if (!confirmed) {
      throw new DomainConflictError(
        "CONFIRMED_REFLECTION_REQUIRED",
        "请先由教师确认课后反思，再生成下一课优化建议。"
      );
    }
    if (confirmed.reflectionRevisionRef !== reflectionRevisionRef) {
      throw new DomainConflictError(
        "REFLECTION_VERSION_CONFLICT",
        "已确认 Reflection 已更新，请刷新后基于最新版本生成建议。"
      );
    }
    const [sourceLesson, targetLesson, delivery, preferences] =
      await Promise.all([
        this.lessons.getLesson({
          tenantRef: context.tenantRef,
          actorRef: context.actorRef,
          lessonRef: confirmed.lessonRef
        }),
        this.lessons.getLesson({
          tenantRef: context.tenantRef,
          actorRef: context.actorRef,
          lessonRef: targetLessonRef
        }),
        this.classroom.getDeliveryRevision({
          tenantRef: context.tenantRef,
          actorRef: context.actorRef,
          deliveryRevisionRef: confirmed.deliveryRevisionRef
        }),
        this.personalization.listConfirmedPreferences({
          tenantRef: context.tenantRef,
          teacherRef: context.actorRef
        })
      ]);
    if (sourceLesson.lessonRef === targetLesson.lessonRef) {
      throw new DomainConflictError(
        "NEXT_LESSON_TARGET_REQUIRED",
        "请选择当前课时之后的目标课时。"
      );
    }
    if (
      sourceLesson.courseRunRef !== confirmed.courseRunRef ||
      targetLesson.courseRunRef !== confirmed.courseRunRef ||
      delivery.status !== "confirmed" ||
      delivery.deliveryRevisionRef !== confirmed.deliveryRevisionRef ||
      delivery.lessonRef !== confirmed.lessonRef
    ) {
      throw new DomainConflictError(
        "NEXT_LESSON_SCOPE_CONFLICT",
        "Reflection、课堂实施和目标课时不属于同一授权课程范围。"
      );
    }
    const evidenceResult = await this.read.getAuthorizedLessonEvidence({
      tenantRef: context.tenantRef,
      actorRef: context.actorRef,
      courseRunRef: confirmed.courseRunRef,
      requestedEvidenceRefs: confirmed.assignmentEvidenceRefs
    });
    const confirmedEvidence = evidenceResult.items.filter((item) =>
      item.evidenceType === "observation" || item.status === "confirmed"
    );
    const unconfirmedRefs = evidenceResult.items
      .filter((item) =>
        item.evidenceType === "claim" && item.status !== "confirmed"
      )
      .map((item) => item.evidenceRef);
    return {
      tenantRef: context.tenantRef,
      actorRef: context.actorRef,
      sourceLesson: lessonSnapshot(sourceLesson),
      targetLesson: lessonSnapshot(targetLesson),
      confirmedReflection: {
        reflectionRef: reflection.reflectionRef,
        reflectionRevisionRef: confirmed.reflectionRevisionRef,
        content: confirmed.content,
        source: snapshot(
          confirmed.reflectionRevisionRef,
          String(confirmed.revisionNumber),
          "teacher_confirmed_reflection_revision"
        )
      },
      confirmedDelivery: {
        deliveryRevisionRef: delivery.deliveryRevisionRef,
        actualStartAt: delivery.actualStartAt,
        actualEndAt: delivery.actualEndAt,
        unresolvedQuestions: delivery.unresolvedQuestions,
        followUpNotes: delivery.followUpNotes,
        source: snapshot(
          delivery.deliveryRevisionRef,
          String(delivery.revisionVersion),
          "teacher_confirmed_delivery_revision"
        )
      },
      selectedEvidence: confirmedEvidence.map((item) => ({
        evidenceRef: item.evidenceRef,
        objectiveRef:
          sourceLesson.learningObjectives[0]?.objectiveRef ?? sourceLesson.lessonRef,
        summary: item.summary,
        source: snapshot(
          item.evidenceRef,
          hash({
            summary: item.summary,
            status: item.status,
            observedAt: item.observedAt
          }),
          "reflection_selected_authorized_evidence"
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
      excludedEvidenceRefs: [...new Set([
        ...evidenceResult.excludedRefs,
        ...unconfirmedRefs
      ])]
    };
  }
}

function lessonSnapshot(lesson: {
  lessonRef: string;
  courseRunRef: string;
  title: string;
  sequence: number;
  learningObjectives: Array<{ objectiveRef: string }>;
}) {
  return {
    lessonRef: lesson.lessonRef,
    courseRunRef: lesson.courseRunRef,
    title: lesson.title,
    sequence: lesson.sequence,
    learningObjectiveRefs: lesson.learningObjectives.map(
      (objective) => objective.objectiveRef
    ),
    source: snapshot(
      lesson.lessonRef,
      hash({
        title: lesson.title,
        sequence: lesson.sequence,
        learningObjectiveRefs: lesson.learningObjectives.map(
          (objective) => objective.objectiveRef
        )
      }),
      "authorized_lesson_read_facade"
    )
  };
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

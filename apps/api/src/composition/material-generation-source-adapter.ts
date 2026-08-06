import { createHash } from "node:crypto";

import type {
  MaterialGenerationContext,
  MaterialGenerationSourceReader
} from "../modules/agent-runtime-context/application/material-generation-service.js";
import { DomainConflictError } from "../platform/errors.js";
import type { PostgresGate2ReadService } from "./postgres-gate2-read-service.js";
import type { PostgresLessonBriefStore } from "./postgres-lesson-brief-store.js";
import type { PostgresLessonPreparationService } from "./postgres-lesson-preparation-service.js";
import type { PostgresPersonalizationService } from "./postgres-personalization-service.js";

export class MaterialGenerationSourceAdapter
  implements MaterialGenerationSourceReader
{
  constructor(
    private readonly lessons: PostgresLessonPreparationService,
    private readonly read: PostgresGate2ReadService,
    private readonly personalization: PostgresPersonalizationService,
    private readonly lessonBriefs: PostgresLessonBriefStore
  ) {}

  async load(
    context: MaterialGenerationContext,
    expectedApprovedTeachingPlanRevisionRef: string
  ) {
    const lesson = await this.lessons.getLesson(context);
    const plans = await this.lessons.getLessonTeachingPlans(context);
    const approved = plans.currentApproved;
    if (!approved) {
      throw new DomainConflictError(
        "MATERIAL_APPROVED_PLAN_REQUIRED",
        "教学材料必须基于教师已批准的教学计划生成。"
      );
    }
    if (approved.revisionRef !== expectedApprovedTeachingPlanRevisionRef) {
      throw new DomainConflictError(
        "MATERIAL_PLAN_VERSION_CONFLICT",
        "已批准教学计划已更新，请刷新后再生成材料。"
      );
    }
    const preparationTask = plans.preparationTaskRef
      ? await this.lessons.getTask({
          tenantRef: context.tenantRef,
          actorRef: context.actorRef,
          taskRef: plans.preparationTaskRef
        })
      : null;
    const briefRef = preparationTask?.workingSet.sourceResourceRefs?.find(
      (reference) => reference.startsWith("lesson-brief-run:")
    ) ?? null;
    const [brief, evidenceResult, preferences] = await Promise.all([
      briefRef
        ? this.lessonBriefs.loadAdopted({
            tenantRef: context.tenantRef,
            teacherRef: context.actorRef,
            lessonRef: context.lessonRef,
            briefRef
          })
        : Promise.resolve(null),
      this.read.getAuthorizedLessonEvidence({
        tenantRef: context.tenantRef,
        actorRef: context.actorRef,
        courseRunRef: lesson.courseRunRef,
        requestedEvidenceRefs: approved.content.evidenceRefs
      }),
      this.personalization.listConfirmedPreferences({
        tenantRef: context.tenantRef,
        teacherRef: context.actorRef
      })
    ]);
    const selectedCandidateIds = new Set(
      brief?.disposition?.selectedCandidateIds ?? []
    );
    const selected = <T extends { candidateId: string }>(items: readonly T[]) =>
      items.filter((item) => selectedCandidateIds.has(item.candidateId));

    return {
      tenantRef: context.tenantRef,
      actorRef: context.actorRef,
      lesson: {
        lessonRef: lesson.lessonRef,
        courseRunRef: lesson.courseRunRef,
        unitRef: lesson.unitRef,
        title: lesson.title,
        durationMinutes: lesson.durationMinutes,
        learningObjectiveRefs: lesson.learningObjectives.map(
          (objective) => objective.objectiveRef
        ),
        source: source(
          lesson.lessonRef,
          hash({
            title: lesson.title,
            durationMinutes: lesson.durationMinutes,
            plannedAt: lesson.plannedAt
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
        source: source(
          approved.revisionRef,
          String(approved.revisionNumber),
          "current_approved_teaching_plan"
        )
      },
      lessonBrief: brief
        ? {
            agentRunRef: brief.agentRunRef,
            contentHash: brief.contentHash,
            selectedCandidateIds: [...selectedCandidateIds],
            teachingFocus: selected(brief.teachingFocusCandidates),
            difficultyFocus: selected(brief.difficultyCandidates),
            attentionPoints: selected(brief.suggestedAttentionPoints),
            knownGaps: brief.knownGaps,
            source: source(
              `lesson-brief-run:${brief.agentRunRef}`,
              brief.contentHash,
              "teacher_adopted_lesson_brief"
            )
          }
        : null,
      evidence: evidenceResult.items.map((item) => ({
        evidenceRef: item.evidenceRef,
        evidenceType: item.evidenceType,
        summary: item.summary,
        status: item.status,
        sourceRefs: item.sourceRefs,
        source: source(
          item.evidenceRef,
          hash({
            summary: item.summary,
            status: item.status,
            observedAt: item.observedAt
          }),
          "authorized_teaching_plan_evidence"
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

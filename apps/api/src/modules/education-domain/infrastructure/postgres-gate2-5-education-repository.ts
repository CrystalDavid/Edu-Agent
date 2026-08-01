import type {
  CourseRunView,
  CurriculumUnitView,
  FormalWriteMetadata,
  FormalWriteReceipt,
  LessonPreparationStatus,
  LessonView
} from "@edu-agent/contracts";

import type {
  PostgresClient,
  SqlExecutor
} from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues
} from "../../../platform/postgres/write-context.js";

type EducationMetadata = FormalWriteMetadata & {
  owner: "education";
};

export interface LessonEducationContext {
  lesson: LessonView;
  teachingPlanArtifactRef: string | null;
}

export class PostgresGate25EducationRepository {
  async insertLessonEvidenceSeed(
    client: PostgresClient,
    input: {
      lessonRef: string;
      evidenceRef: string;
      evidenceKind: "observation" | "claim";
      metadata: EducationMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO education.lesson_evidence_link (
         lesson_ref, evidence_ref, evidence_kind, is_current,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (lesson_ref, evidence_ref) DO NOTHING`,
      [
        input.lessonRef,
        input.evidenceRef,
        input.evidenceKind,
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: `${input.lessonRef}|${input.evidenceRef}`,
      recordType: "LessonEvidenceLink",
      metadata: input.metadata
    });
  }

  async insertCurriculumSeed(
    client: PostgresClient,
    input: {
      courseRunRef: string;
      courseRunPresentation: {
        className: string;
        academicTerm: string;
      };
      unit: {
        unitRef: string;
        sequence: number;
        title: string;
        description: string;
        status: "planned" | "active" | "completed";
        metadata: EducationMetadata;
      };
      lessons: ReadonlyArray<{
        lessonRef: string;
        sequence: number;
        title: string;
        plannedAt: string | null;
        durationMinutes: number;
        preparationState:
          | "not_started"
          | LessonPreparationStatus;
        currentApprovedPlanRef?: string;
        activePreparationTaskRef?: string;
        metadata: EducationMetadata;
      }>;
      additionalObjective: {
        objectiveRef: string;
        title: string;
        description: string;
        knowledgeConceptRefs: readonly string[];
        competencyRefs: readonly string[];
        metadata: EducationMetadata;
      };
      objectiveLinks: ReadonlyArray<{
        lessonRef: string;
        objectiveRef: string;
        metadata: EducationMetadata;
      }>;
      evidenceLinks: ReadonlyArray<{
        lessonRef: string;
        evidenceRef: string;
        evidenceKind: "observation" | "claim";
        metadata: EducationMetadata;
      }>;
      currentPlanBinding: {
        bindingRef: string;
        lessonRef: string;
        teachingPlanArtifactRef: string;
        teachingPlanRevisionRef: string;
        metadata: EducationMetadata;
      };
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    const receipts: FormalWriteReceipt[] = [];
    await client.query(
      `UPDATE education.course_run
          SET class_name = $2,
              academic_term = $3
        WHERE course_run_ref = $1`,
      [
        input.courseRunRef,
        input.courseRunPresentation.className,
        input.courseRunPresentation.academicTerm
      ]
    );
    await client.query(
      `INSERT INTO education.curriculum_unit (
         unit_ref, course_run_ref, sequence, title, description,
         status, actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13, $13
       )
       ON CONFLICT (unit_ref) DO NOTHING`,
      [
        input.unit.unitRef,
        input.courseRunRef,
        input.unit.sequence,
        input.unit.title,
        input.unit.description,
        input.unit.status,
        ...formalMetadataValues(input.unit.metadata)
      ]
    );
    receipts.push(
      createReceipt({
        writeRef: input.unit.unitRef,
        recordType: "CurriculumUnit",
        metadata: input.unit.metadata
      })
    );

    for (const lesson of input.lessons) {
      await client.query(
        `INSERT INTO education.lesson (
           lesson_ref, unit_ref, sequence, title, planned_at,
           duration_minutes, preparation_state,
           current_approved_plan_ref, active_preparation_task_ref,
           actor_ref, purpose, owner_module, idempotency_key,
           authorization_decision_ref, audit_ref, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9,
           $10, $11, $12, $13, $14, $15, $16, $16
         )
         ON CONFLICT (lesson_ref) DO NOTHING`,
        [
          lesson.lessonRef,
          input.unit.unitRef,
          lesson.sequence,
          lesson.title,
          lesson.plannedAt,
          lesson.durationMinutes,
          lesson.preparationState,
          lesson.currentApprovedPlanRef ?? null,
          lesson.activePreparationTaskRef ?? null,
          ...formalMetadataValues(lesson.metadata)
        ]
      );
      receipts.push(
        createReceipt({
          writeRef: lesson.lessonRef,
          recordType: "Lesson",
          metadata: lesson.metadata
        })
      );
    }

    await client.query(
      `INSERT INTO education.learning_objective (
         objective_ref, course_run_ref, title, description,
         knowledge_concept_refs, competency_refs,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13
       )
       ON CONFLICT (objective_ref) DO NOTHING`,
      [
        input.additionalObjective.objectiveRef,
        input.courseRunRef,
        input.additionalObjective.title,
        input.additionalObjective.description,
        JSON.stringify(
          input.additionalObjective.knowledgeConceptRefs
        ),
        JSON.stringify(input.additionalObjective.competencyRefs),
        ...formalMetadataValues(
          input.additionalObjective.metadata
        )
      ]
    );
    receipts.push(
      createReceipt({
        writeRef: input.additionalObjective.objectiveRef,
        recordType: "LearningObjective",
        metadata: input.additionalObjective.metadata
      })
    );

    for (const link of input.objectiveLinks) {
      await client.query(
        `INSERT INTO education.lesson_learning_objective_link (
           lesson_ref, objective_ref,
           actor_ref, purpose, owner_module, idempotency_key,
           authorization_decision_ref, audit_ref, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9
         )
         ON CONFLICT (lesson_ref, objective_ref) DO NOTHING`,
        [
          link.lessonRef,
          link.objectiveRef,
          ...formalMetadataValues(link.metadata)
        ]
      );
      receipts.push(
        createReceipt({
          writeRef: `${link.lessonRef}|${link.objectiveRef}`,
          recordType: "LessonLearningObjectiveLink",
          metadata: link.metadata
        })
      );
    }

    for (const link of input.evidenceLinks) {
      await client.query(
        `INSERT INTO education.lesson_evidence_link (
           lesson_ref, evidence_ref, evidence_kind, is_current,
           actor_ref, purpose, owner_module, idempotency_key,
           authorization_decision_ref, audit_ref, created_at
         ) VALUES (
           $1, $2, $3, true,
           $4, $5, $6, $7, $8, $9, $10
         )
         ON CONFLICT (lesson_ref, evidence_ref) DO NOTHING`,
        [
          link.lessonRef,
          link.evidenceRef,
          link.evidenceKind,
          ...formalMetadataValues(link.metadata)
        ]
      );
      receipts.push(
        createReceipt({
          writeRef: `${link.lessonRef}|${link.evidenceRef}`,
          recordType: "LessonEvidenceLink",
          metadata: link.metadata
        })
      );
    }

    await client.query(
      `INSERT INTO education.lesson_teaching_plan_binding (
         binding_ref, lesson_ref, preparation_task_ref,
         teaching_plan_artifact_ref, teaching_plan_revision_ref,
         binding_kind, superseded_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, NULL, $3, $4, 'current_approved', NULL,
         $5, $6, $7, $8, $9, $10, $11
       )
       ON CONFLICT (binding_ref) DO NOTHING`,
      [
        input.currentPlanBinding.bindingRef,
        input.currentPlanBinding.lessonRef,
        input.currentPlanBinding.teachingPlanArtifactRef,
        input.currentPlanBinding.teachingPlanRevisionRef,
        ...formalMetadataValues(
          input.currentPlanBinding.metadata
        )
      ]
    );
    receipts.push(
      createReceipt({
        writeRef: input.currentPlanBinding.bindingRef,
        recordType: "LessonTeachingPlanBinding",
        metadata: input.currentPlanBinding.metadata
      })
    );
    return receipts;
  }

  async listCourseRuns(
    executor: SqlExecutor,
    tenantRef: string
  ): Promise<CourseRunView[]> {
    const result = await executor.query<CourseRunRow>(
      `SELECT course_run_ref, subject, grade_level,
              class_name, academic_term
         FROM education.course_run
        WHERE tenant_ref = $1
        ORDER BY academic_term DESC, subject, class_name`,
      [tenantRef]
    );
    return result.rows.map(toCourseRun);
  }

  async getCourseRun(
    executor: SqlExecutor,
    tenantRef: string,
    courseRunRef: string
  ): Promise<CourseRunView | undefined> {
    const result = await executor.query<CourseRunRow>(
      `SELECT course_run_ref, subject, grade_level,
              class_name, academic_term
         FROM education.course_run
        WHERE tenant_ref = $1
          AND course_run_ref = $2`,
      [tenantRef, courseRunRef]
    );
    return result.rows[0] ? toCourseRun(result.rows[0]) : undefined;
  }

  async listUnits(
    executor: SqlExecutor,
    tenantRef: string,
    courseRunRef: string
  ): Promise<CurriculumUnitView[]> {
    const result = await executor.query<UnitRow>(
      `SELECT unit.unit_ref, unit.course_run_ref, unit.sequence,
              unit.title, unit.description, unit.status
         FROM education.curriculum_unit AS unit
         JOIN education.course_run AS course
           ON course.course_run_ref = unit.course_run_ref
        WHERE course.tenant_ref = $1
          AND unit.course_run_ref = $2
        ORDER BY unit.sequence`,
      [tenantRef, courseRunRef]
    );
    return result.rows.map(toUnit);
  }

  async getUnit(
    executor: SqlExecutor,
    tenantRef: string,
    unitRef: string
  ): Promise<CurriculumUnitView | undefined> {
    const result = await executor.query<UnitRow>(
      `SELECT unit.unit_ref, unit.course_run_ref, unit.sequence,
              unit.title, unit.description, unit.status
         FROM education.curriculum_unit AS unit
         JOIN education.course_run AS course
           ON course.course_run_ref = unit.course_run_ref
        WHERE course.tenant_ref = $1
          AND unit.unit_ref = $2`,
      [tenantRef, unitRef]
    );
    return result.rows[0] ? toUnit(result.rows[0]) : undefined;
  }

  async listLessons(
    executor: SqlExecutor,
    tenantRef: string,
    unitRef: string
  ): Promise<LessonView[]> {
    const result = await executor.query<LessonRow>(
      `${lessonSelect}
        WHERE course.tenant_ref = $1
          AND lesson.unit_ref = $2
        GROUP BY lesson.lesson_ref, unit.course_run_ref
        ORDER BY lesson.sequence`,
      [tenantRef, unitRef]
    );
    return result.rows.map(toLesson);
  }

  async getLesson(
    executor: SqlExecutor,
    tenantRef: string,
    lessonRef: string
  ): Promise<LessonView | undefined> {
    const result = await executor.query<LessonRow>(
      `${lessonSelect}
        WHERE course.tenant_ref = $1
          AND lesson.lesson_ref = $2
        GROUP BY lesson.lesson_ref, unit.course_run_ref`,
      [tenantRef, lessonRef]
    );
    return result.rows[0] ? toLesson(result.rows[0]) : undefined;
  }

  async getLessonContext(
    executor: SqlExecutor,
    tenantRef: string,
    lessonRef: string
  ): Promise<LessonEducationContext | undefined> {
    const lesson = await this.getLesson(
      executor,
      tenantRef,
      lessonRef
    );
    if (!lesson) return undefined;
    const binding = await executor.query<{
      teaching_plan_artifact_ref: string;
    }>(
      `SELECT teaching_plan_artifact_ref
         FROM education.lesson_teaching_plan_binding
        WHERE lesson_ref = $1
          AND binding_kind = 'current_approved'
          AND superseded_at IS NULL`,
      [lessonRef]
    );
    return {
      lesson,
      teachingPlanArtifactRef:
        binding.rows[0]?.teaching_plan_artifact_ref ?? null
    };
  }

  async updatePreparationProjection(
    client: PostgresClient,
    input: {
      lessonRef: string;
      state: "not_started" | LessonPreparationStatus;
      activePreparationTaskRef: string | null;
      metadata: EducationMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `UPDATE education.lesson
          SET preparation_state = $2,
              active_preparation_task_ref = $3,
              updated_at = $4
        WHERE lesson_ref = $1`,
      [
        input.lessonRef,
        input.state,
        input.activePreparationTaskRef,
        input.metadata.createdAt
      ]
    );
    return createReceipt({
      writeRef: input.lessonRef,
      recordType: "LessonPreparationProjection",
      metadata: input.metadata
    });
  }

  async bindCurrentApprovedPlan(
    client: PostgresClient,
    input: {
      bindingRef: string;
      lessonRef: string;
      preparationTaskRef: string;
      teachingPlanArtifactRef: string;
      teachingPlanRevisionRef: string;
      metadata: EducationMetadata;
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    await client.query(
      `UPDATE education.lesson_teaching_plan_binding
          SET superseded_at = $2
        WHERE lesson_ref = $1
          AND binding_kind = 'current_approved'
          AND superseded_at IS NULL`,
      [input.lessonRef, input.metadata.createdAt]
    );
    await client.query(
      `INSERT INTO education.lesson_teaching_plan_binding (
         binding_ref, lesson_ref, preparation_task_ref,
         teaching_plan_artifact_ref, teaching_plan_revision_ref,
         binding_kind, superseded_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'current_approved', NULL,
         $6, $7, $8, $9, $10, $11, $12
       )`,
      [
        input.bindingRef,
        input.lessonRef,
        input.preparationTaskRef,
        input.teachingPlanArtifactRef,
        input.teachingPlanRevisionRef,
        ...formalMetadataValues(input.metadata)
      ]
    );
    await client.query(
      `UPDATE education.lesson
          SET current_approved_plan_ref = $2,
              preparation_state = 'ready_for_use',
              active_preparation_task_ref = $3,
              updated_at = $4
        WHERE lesson_ref = $1`,
      [
        input.lessonRef,
        input.teachingPlanRevisionRef,
        input.preparationTaskRef,
        input.metadata.createdAt
      ]
    );
    return [
      createReceipt({
        writeRef: input.bindingRef,
        recordType: "LessonTeachingPlanBinding",
        metadata: input.metadata
      }),
      createReceipt({
        writeRef: input.lessonRef,
        recordType: "LessonApprovedPlanProjection",
        metadata: input.metadata
      })
    ];
  }
}

const lessonSelect = `
  SELECT lesson.lesson_ref, lesson.unit_ref, unit.course_run_ref,
         lesson.sequence, lesson.title, lesson.planned_at,
         lesson.duration_minutes, lesson.preparation_state,
         lesson.current_approved_plan_ref,
         lesson.active_preparation_task_ref,
         coalesce(
           (
             SELECT jsonb_agg(
                      evidence.evidence_ref
                      ORDER BY evidence.evidence_ref
                    )
               FROM education.lesson_evidence_link AS evidence
              WHERE evidence.lesson_ref = lesson.lesson_ref
                AND evidence.is_current = true
           ),
           '[]'::jsonb
         ) AS current_evidence_refs,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'objectiveRef', objective.objective_ref,
               'title', objective.title,
               'description', objective.description
             )
             ORDER BY objective.objective_ref
           ) FILTER (WHERE objective.objective_ref IS NOT NULL),
           '[]'::jsonb
         ) AS learning_objectives
    FROM education.lesson AS lesson
    JOIN education.curriculum_unit AS unit
      ON unit.unit_ref = lesson.unit_ref
    JOIN education.course_run AS course
      ON course.course_run_ref = unit.course_run_ref
    LEFT JOIN education.lesson_learning_objective_link AS link
      ON link.lesson_ref = lesson.lesson_ref
    LEFT JOIN education.learning_objective AS objective
      ON objective.objective_ref = link.objective_ref`;

interface CourseRunRow {
  course_run_ref: string;
  subject: string;
  grade_level: string;
  class_name: string;
  academic_term: string;
}

interface UnitRow {
  unit_ref: string;
  course_run_ref: string;
  sequence: number;
  title: string;
  description: string;
  status: "planned" | "active" | "completed";
}

interface LessonRow {
  lesson_ref: string;
  unit_ref: string;
  course_run_ref: string;
  sequence: number;
  title: string;
  planned_at: Date | null;
  duration_minutes: number;
  preparation_state: LessonView["preparationState"];
  current_approved_plan_ref: string | null;
  active_preparation_task_ref: string | null;
  current_evidence_refs: string[];
  learning_objectives: LessonView["learningObjectives"];
}

function toCourseRun(row: CourseRunRow): CourseRunView {
  return {
    courseRunRef: row.course_run_ref,
    subject: row.subject,
    gradeLevel: row.grade_level,
    className: row.class_name,
    academicTerm: row.academic_term,
    title: `${row.class_name}${row.subject} · ${row.academic_term}`
  };
}

function toUnit(row: UnitRow): CurriculumUnitView {
  return {
    unitRef: row.unit_ref,
    courseRunRef: row.course_run_ref,
    sequence: row.sequence,
    title: row.title,
    description: row.description,
    status: row.status
  };
}

function toLesson(row: LessonRow): LessonView {
  return {
    lessonRef: row.lesson_ref,
    unitRef: row.unit_ref,
    courseRunRef: row.course_run_ref,
    sequence: row.sequence,
    title: row.title,
    plannedAt: row.planned_at?.toISOString() ?? null,
    durationMinutes: row.duration_minutes,
    preparationState: row.preparation_state,
    learningObjectives: row.learning_objectives,
    currentEvidenceRefs: row.current_evidence_refs,
    currentApprovedPlanRef: row.current_approved_plan_ref,
    activePreparationTaskRef: row.active_preparation_task_ref
  };
}

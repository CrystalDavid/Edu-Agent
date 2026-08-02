import type {
  AssignmentDetail,
  AssignmentItemInput,
  AssignmentItemView,
  AssignmentSummary,
  AssignmentVersionView,
  CourseRunEnrollment,
  EvidenceObservationSource,
  FormalWriteMetadata,
  FormalWriteReceipt,
  SubmissionDetail,
  SubmissionSummary,
  TeacherGradeDecisionView,
  TeacherItemGradeInput
} from "@edu-agent/contracts";

import type {
  PostgresClient,
  SqlExecutor
} from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues,
  toPostgresJson
} from "../../../platform/postgres/write-context.js";

type EducationMetadata = FormalWriteMetadata & { owner: "education" };

export interface AssignmentVersionWrite {
  assignmentVersionRef: string;
  assignmentRef: string;
  versionNumber: number;
  title: string;
  instructions: string;
  dueAt: string | null;
  createdBy: string;
  items: ReadonlyArray<
    AssignmentItemInput & { itemRef: string }
  >;
}

export interface SyntheticAttemptWrite {
  submissionRef: string;
  enrollmentRef: string;
  learnerRef: string;
  attemptRef: string;
  assignmentRef: string;
  assignmentVersionRef: string;
  attemptNumber: number;
  courseRunRef: string;
  primaryObjectiveRef: string;
  submittedAt: string;
  durationSeconds: number;
  responses: ReadonlyArray<{
    responseRef: string;
    itemRef: string;
    responseValue: Record<string, unknown>;
  }>;
}

export class PostgresGate27EducationRepository {
  async insertFoundation(
    client: PostgresClient,
    input: {
      courseRunRef: string;
      objective: {
        objectiveRef: string;
        title: string;
        description: string;
        knowledgeConceptRefs: readonly string[];
        competencyRefs: readonly string[];
        lessonRef: string;
      };
      enrollments: ReadonlyArray<{
        enrollmentRef: string;
        learnerRef: string;
        displayName: string;
        enrolledAt: string;
      }>;
      metadata: (suffix: string) => EducationMetadata;
    }
  ): Promise<FormalWriteReceipt[]> {
    const receipts: FormalWriteReceipt[] = [];
    const objectiveMetadata = input.metadata("next-lesson-objective");
    await client.query(
      `INSERT INTO education.learning_objective (
         objective_ref, course_run_ref, title, description,
         knowledge_concept_refs, competency_refs,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13
       ) ON CONFLICT (objective_ref) DO NOTHING`,
      [
        input.objective.objectiveRef,
        input.courseRunRef,
        input.objective.title,
        input.objective.description,
        toPostgresJson(input.objective.knowledgeConceptRefs),
        toPostgresJson(input.objective.competencyRefs),
        ...formalMetadataValues(objectiveMetadata)
      ]
    );
    receipts.push(
      createReceipt({
        writeRef: input.objective.objectiveRef,
        recordType: "LearningObjective",
        metadata: objectiveMetadata
      })
    );
    const linkMetadata = input.metadata("next-lesson-objective-link");
    await client.query(
      `INSERT INTO education.lesson_learning_objective_link (
         lesson_ref, objective_ref,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (lesson_ref, objective_ref) DO NOTHING`,
      [
        input.objective.lessonRef,
        input.objective.objectiveRef,
        ...formalMetadataValues(linkMetadata)
      ]
    );
    receipts.push(
      createReceipt({
        writeRef: `${input.objective.lessonRef}|${input.objective.objectiveRef}`,
        recordType: "LessonLearningObjectiveLink",
        metadata: linkMetadata
      })
    );
    for (const [index, enrollment] of input.enrollments.entries()) {
      const metadata = input.metadata(`enrollment-${index + 1}`);
      await client.query(
        `INSERT INTO education.course_run_enrollment (
           enrollment_ref, course_run_ref, learner_ref, display_name,
           enrollment_status, synthetic, enrolled_at,
           actor_ref, purpose, owner_module, idempotency_key,
           authorization_decision_ref, audit_ref, created_at
         ) VALUES (
           $1, $2, $3, $4, 'active', true, $5,
           $6, $7, $8, $9, $10, $11, $12
         ) ON CONFLICT (course_run_ref, learner_ref) DO NOTHING`,
        [
          enrollment.enrollmentRef,
          input.courseRunRef,
          enrollment.learnerRef,
          enrollment.displayName,
          enrollment.enrolledAt,
          ...formalMetadataValues(metadata)
        ]
      );
      receipts.push(
        createReceipt({
          writeRef: enrollment.enrollmentRef,
          recordType: "CourseRunEnrollment",
          metadata
        })
      );
    }
    return receipts;
  }

  async listEnrollments(
    executor: SqlExecutor,
    tenantRef: string,
    courseRunRef: string
  ): Promise<CourseRunEnrollment[]> {
    const result = await executor.query<EnrollmentRow>(
      `SELECT enrollment.enrollment_ref, enrollment.course_run_ref,
              enrollment.learner_ref, enrollment.display_name,
              enrollment.enrollment_status, enrollment.synthetic,
              enrollment.enrolled_at
         FROM education.course_run_enrollment AS enrollment
         JOIN education.course_run AS course
           ON course.course_run_ref = enrollment.course_run_ref
        WHERE course.tenant_ref = $1
          AND enrollment.course_run_ref = $2
        ORDER BY enrollment.display_name`,
      [tenantRef, courseRunRef]
    );
    return result.rows.map(toEnrollment);
  }

  async insertAssignment(
    client: PostgresClient,
    input: {
      assignmentRef: string;
      tenantRef: string;
      courseRunRef: string;
      curriculumUnitRef: string;
      lessonRef: string;
      createdBy: string;
      version: AssignmentVersionWrite;
      assignmentMetadata: EducationMetadata;
      versionMetadata: EducationMetadata;
      itemMetadata: (index: number) => EducationMetadata;
      objectiveMetadata: (objectiveRef: string) => EducationMetadata;
    }
  ): Promise<FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO education.assignment (
         assignment_ref, tenant_ref, course_run_ref,
         curriculum_unit_ref, lesson_ref, assignment_status,
         current_version_number, aggregate_version, created_by,
         updated_at, actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'draft', 1, 1, $6, $7,
         $8, $9, $10, $11, $12, $13, $14
       )`,
      [
        input.assignmentRef,
        input.tenantRef,
        input.courseRunRef,
        input.curriculumUnitRef,
        input.lessonRef,
        input.createdBy,
        input.assignmentMetadata.createdAt,
        ...formalMetadataValues(input.assignmentMetadata)
      ]
    );
    const receipts = [
      createReceipt({
        writeRef: input.assignmentRef,
        recordType: "Assignment",
        metadata: input.assignmentMetadata
      })
    ];
    receipts.push(
      ...(await this.insertAssignmentVersion(client, {
        version: input.version,
        versionMetadata: input.versionMetadata,
        itemMetadata: input.itemMetadata,
        objectiveMetadata: input.objectiveMetadata
      }))
    );
    return receipts;
  }

  async insertAssignmentVersion(
    client: PostgresClient,
    input: {
      version: AssignmentVersionWrite;
      versionMetadata: EducationMetadata;
      itemMetadata: (index: number) => EducationMetadata;
      objectiveMetadata: (objectiveRef: string) => EducationMetadata;
    }
  ): Promise<FormalWriteReceipt[]> {
    const version = input.version;
    await client.query(
      `INSERT INTO education.assignment_version (
         assignment_version_ref, assignment_ref, version_number,
         title, instructions, due_at, created_by,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14
       )`,
      [
        version.assignmentVersionRef,
        version.assignmentRef,
        version.versionNumber,
        version.title,
        version.instructions,
        version.dueAt,
        version.createdBy,
        ...formalMetadataValues(input.versionMetadata)
      ]
    );
    const receipts = [
      createReceipt({
        writeRef: version.assignmentVersionRef,
        recordType: "AssignmentVersion",
        metadata: input.versionMetadata
      })
    ];
    const objectiveRefs = new Set<string>();
    for (const [index, item] of version.items.entries()) {
      const metadata = input.itemMetadata(index);
      await client.query(
        `INSERT INTO education.assignment_item (
           item_ref, assignment_version_ref, sequence, item_type,
           prompt, max_score, options, answer_key, grading_criteria,
           objective_ref,
           actor_ref, purpose, owner_module, idempotency_key,
           authorization_decision_ref, audit_ref, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17
         )`,
        [
          item.itemRef,
          version.assignmentVersionRef,
          item.sequence,
          item.itemType,
          item.prompt,
          item.maxScore,
          toPostgresJson(item.options),
          toPostgresJson(item.answerKey),
          item.gradingCriteria,
          item.objectiveRef,
          ...formalMetadataValues(metadata)
        ]
      );
      receipts.push(
        createReceipt({
          writeRef: item.itemRef,
          recordType: "AssignmentItem",
          metadata
        })
      );
      objectiveRefs.add(item.objectiveRef);
    }
    for (const objectiveRef of objectiveRefs) {
      const metadata = input.objectiveMetadata(objectiveRef);
      await client.query(
        `INSERT INTO education.assignment_objective_link (
           assignment_version_ref, objective_ref,
           actor_ref, purpose, owner_module, idempotency_key,
           authorization_decision_ref, audit_ref, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          version.assignmentVersionRef,
          objectiveRef,
          ...formalMetadataValues(metadata)
        ]
      );
      receipts.push(
        createReceipt({
          writeRef: `${version.assignmentVersionRef}|${objectiveRef}`,
          recordType: "AssignmentObjectiveLink",
          metadata
        })
      );
    }
    return receipts;
  }

  async updateDraftPointer(
    client: PostgresClient,
    input: {
      tenantRef: string;
      assignmentRef: string;
      expectedVersion: number;
      nextVersionNumber: number;
      updatedAt: string;
      metadata: EducationMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    const updated = await client.query(
      `UPDATE education.assignment
          SET current_version_number = $4,
              aggregate_version = aggregate_version + 1,
              updated_at = $5
        WHERE tenant_ref = $1
          AND assignment_ref = $2
          AND aggregate_version = $3
          AND assignment_status = 'draft'`,
      [
        input.tenantRef,
        input.assignmentRef,
        input.expectedVersion,
        input.nextVersionNumber,
        input.updatedAt
      ]
    );
    if (updated.rowCount !== 1) {
      throw new Error("ASSIGNMENT_VERSION_OR_STATE_CONFLICT");
    }
    return createReceipt({
      writeRef: input.assignmentRef,
      recordType: "AssignmentDraftPointer",
      metadata: input.metadata
    });
  }

  async transitionAssignment(
    client: PostgresClient,
    input: {
      tenantRef: string;
      assignmentRef: string;
      expectedVersion: number;
      fromStatus: "draft" | "published" | "closed";
      toStatus: "published" | "closed" | "archived";
      occurredAt: string;
      metadata: EducationMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    const timestampColumn =
      input.toStatus === "published"
        ? "published_at"
        : input.toStatus === "closed"
          ? "closed_at"
          : "archived_at";
    const updated = await client.query(
      `UPDATE education.assignment
          SET assignment_status = $5,
              aggregate_version = aggregate_version + 1,
              updated_at = $6,
              ${timestampColumn} = $6
        WHERE tenant_ref = $1
          AND assignment_ref = $2
          AND aggregate_version = $3
          AND assignment_status = $4`,
      [
        input.tenantRef,
        input.assignmentRef,
        input.expectedVersion,
        input.fromStatus,
        input.toStatus,
        input.occurredAt
      ]
    );
    if (updated.rowCount !== 1) {
      throw new Error("ASSIGNMENT_VERSION_OR_STATE_CONFLICT");
    }
    return createReceipt({
      writeRef: input.assignmentRef,
      recordType: "AssignmentLifecycleTransition",
      metadata: input.metadata
    });
  }

  async listAssignments(
    executor: SqlExecutor,
    tenantRef: string,
    lessonRef?: string,
    allowedCourseRunRefs?: readonly string[]
  ): Promise<AssignmentSummary[]> {
    const result = await executor.query<AssignmentSummaryRow>(
      `${assignmentSummarySelect}
        WHERE assignment.tenant_ref = $1
          AND ($2::text IS NULL OR assignment.lesson_ref = $2)
          AND ($3::text[] IS NULL OR assignment.course_run_ref = ANY($3::text[]))
        ORDER BY assignment.updated_at DESC, assignment.assignment_ref`,
      [
        tenantRef,
        lessonRef ?? null,
        allowedCourseRunRefs ? [...allowedCourseRunRefs] : null
      ]
    );
    return result.rows.map(toAssignmentSummary);
  }

  async getAssignment(
    executor: SqlExecutor,
    tenantRef: string,
    assignmentRef: string
  ): Promise<AssignmentDetail | undefined> {
    const summary = await executor.query<AssignmentSummaryRow>(
      `${assignmentSummarySelect}
        WHERE assignment.tenant_ref = $1
          AND assignment.assignment_ref = $2`,
      [tenantRef, assignmentRef]
    );
    const row = summary.rows[0];
    if (!row) return undefined;
    const versions = await this.listVersions(executor, assignmentRef);
    const currentVersion = versions.find(
      (version) => version.versionNumber === row.current_version_number
    );
    if (!currentVersion) {
      throw new Error("Assignment current version is missing.");
    }
    return {
      ...toAssignmentSummary(row),
      currentVersion,
      versionHistory: versions
    };
  }

  async listVersions(
    executor: SqlExecutor,
    assignmentRef: string
  ): Promise<AssignmentVersionView[]> {
    const versions = await executor.query<AssignmentVersionRow>(
      `SELECT assignment_version_ref, assignment_ref, version_number,
              title, instructions, due_at, created_by, created_at
         FROM education.assignment_version
        WHERE assignment_ref = $1
        ORDER BY version_number DESC`,
      [assignmentRef]
    );
    const result: AssignmentVersionView[] = [];
    for (const version of versions.rows) {
      const items = await executor.query<AssignmentItemRow>(
        `SELECT item_ref, assignment_version_ref, sequence, item_type,
                prompt, max_score, options, answer_key,
                grading_criteria, objective_ref
           FROM education.assignment_item
          WHERE assignment_version_ref = $1
          ORDER BY sequence`,
        [version.assignment_version_ref]
      );
      const mappedItems = items.rows.map(toAssignmentItem);
      result.push({
        assignmentVersionRef: version.assignment_version_ref,
        assignmentRef: version.assignment_ref,
        versionNumber: version.version_number,
        title: version.title,
        instructions: version.instructions,
        dueAt: version.due_at?.toISOString() ?? null,
        items: mappedItems,
        objectiveRefs: [
          ...new Set(mappedItems.map((item) => item.objectiveRef))
        ],
        createdBy: version.created_by,
        createdAt: version.created_at.toISOString()
      });
    }
    return result;
  }

  async getAssignmentByVersion(
    executor: SqlExecutor,
    tenantRef: string,
    assignmentVersionRef: string
  ): Promise<AssignmentDetail | undefined> {
    const result = await executor.query<{ assignment_ref: string }>(
      `SELECT version.assignment_ref
         FROM education.assignment_version AS version
         JOIN education.assignment AS assignment
           ON assignment.assignment_ref = version.assignment_ref
        WHERE assignment.tenant_ref = $1
          AND version.assignment_version_ref = $2`,
      [tenantRef, assignmentVersionRef]
    );
    const assignmentRef = result.rows[0]?.assignment_ref;
    return assignmentRef
      ? this.getAssignment(executor, tenantRef, assignmentRef)
      : undefined;
  }

  async insertSyntheticAttempt(
    client: PostgresClient,
    input: SyntheticAttemptWrite & {
      submissionMetadata: EducationMetadata;
      attemptMetadata: EducationMetadata;
      detailMetadata: EducationMetadata;
      responseMetadata: (index: number) => EducationMetadata;
    }
  ): Promise<FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO education.submission (
         submission_ref, assignment_ref, enrollment_ref, learner_ref,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (assignment_ref, learner_ref) DO NOTHING`,
      [
        input.submissionRef,
        input.assignmentRef,
        input.enrollmentRef,
        input.learnerRef,
        ...formalMetadataValues(input.submissionMetadata)
      ]
    );
    await client.query(
      `INSERT INTO education.attempt (
         attempt_ref, course_run_ref, objective_ref, learner_ref,
         submitted_at, response_summary,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13
       )`,
      [
        input.attemptRef,
        input.courseRunRef,
        input.primaryObjectiveRef,
        input.learnerRef,
        input.submittedAt,
        toPostgresJson({
          assignmentRef: input.assignmentRef,
          itemCount: input.responses.length,
          synthetic: true
        }),
        ...formalMetadataValues(input.attemptMetadata)
      ]
    );
    await client.query(
      `INSERT INTO education.submission_attempt_details (
         attempt_ref, submission_ref, assignment_version_ref,
         attempt_number, duration_seconds,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11, $12
       )`,
      [
        input.attemptRef,
        input.submissionRef,
        input.assignmentVersionRef,
        input.attemptNumber,
        input.durationSeconds,
        ...formalMetadataValues(input.detailMetadata)
      ]
    );
    const receipts = [
      createReceipt({
        writeRef: input.submissionRef,
        recordType: "Submission",
        metadata: input.submissionMetadata
      }),
      createReceipt({
        writeRef: input.attemptRef,
        recordType: "SubmissionAttempt",
        metadata: input.attemptMetadata
      })
    ];
    for (const [index, response] of input.responses.entries()) {
      const metadata = input.responseMetadata(index);
      await client.query(
        `INSERT INTO education.item_response (
           response_ref, attempt_ref, item_ref, response_value,
           submitted_at,
           actor_ref, purpose, owner_module, idempotency_key,
           authorization_decision_ref, audit_ref, created_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10, $11, $12
         )`,
        [
          response.responseRef,
          input.attemptRef,
          response.itemRef,
          toPostgresJson(response.responseValue),
          input.submittedAt,
          ...formalMetadataValues(metadata)
        ]
      );
      receipts.push(
        createReceipt({
          writeRef: response.responseRef,
          recordType: "ItemResponse",
          metadata
        })
      );
    }
    return receipts;
  }

  async listSubmissions(
    executor: SqlExecutor,
    tenantRef: string,
    assignmentRef: string
  ): Promise<SubmissionSummary[]> {
    const result = await executor.query<SubmissionSummaryRow>(
      submissionSummarySelect,
      [tenantRef, assignmentRef]
    );
    return result.rows.map(toSubmissionSummary);
  }

  async getSubmission(
    executor: SqlExecutor,
    tenantRef: string,
    submissionRef: string
  ): Promise<SubmissionDetail | undefined> {
    const identity = await executor.query<{
      assignment_ref: string;
    }>(
      `SELECT submission.assignment_ref
         FROM education.submission AS submission
         JOIN education.assignment AS assignment
           ON assignment.assignment_ref = submission.assignment_ref
        WHERE assignment.tenant_ref = $1
          AND submission.submission_ref = $2`,
      [tenantRef, submissionRef]
    );
    const assignmentRef = identity.rows[0]?.assignment_ref;
    if (!assignmentRef) return undefined;
    const summaries = await this.listSubmissions(
      executor,
      tenantRef,
      assignmentRef
    );
    const summary = summaries.find(
      (item) => item.submissionRef === submissionRef
    );
    if (!summary) return undefined;
    const attempts = await executor.query<AttemptRow>(
      `SELECT detail.attempt_ref, detail.submission_ref,
              detail.assignment_version_ref, detail.attempt_number,
              attempt.submitted_at,
              detail.attempt_number = max(detail.attempt_number)
                OVER (PARTITION BY detail.submission_ref) AS is_current
         FROM education.submission_attempt_details AS detail
         JOIN education.attempt AS attempt
           ON attempt.attempt_ref = detail.attempt_ref
        WHERE detail.submission_ref = $1
        ORDER BY detail.attempt_number DESC`,
      [submissionRef]
    );
    const mappedAttempts = [];
    for (const attempt of attempts.rows) {
      const responses = await executor.query<ItemResponseRow>(
        `SELECT response.response_ref, response.attempt_ref,
                response.item_ref, response.response_value,
                response.submitted_at
           FROM education.item_response AS response
           JOIN education.assignment_item AS item
             ON item.item_ref = response.item_ref
          WHERE response.attempt_ref = $1
          ORDER BY item.sequence`,
        [attempt.attempt_ref]
      );
      mappedAttempts.push({
        attemptRef: attempt.attempt_ref,
        submissionRef: attempt.submission_ref,
        assignmentVersionRef: attempt.assignment_version_ref,
        attemptNumber: attempt.attempt_number,
        submittedAt: attempt.submitted_at.toISOString(),
        isCurrent: attempt.is_current,
        itemResponses: responses.rows.map((row) => ({
          responseRef: row.response_ref,
          attemptRef: row.attempt_ref,
          itemRef: row.item_ref,
          responseValue: row.response_value,
          submittedAt: row.submitted_at.toISOString()
        }))
      });
    }
    return { ...summary, attempts: mappedAttempts };
  }

  async getGradeDecision(
    executor: SqlExecutor,
    gradeDecisionRef: string
  ): Promise<TeacherGradeDecisionView | undefined> {
    const decision = await executor.query<GradeDecisionRow>(
      `SELECT grade_decision_ref, attempt_ref, decision_version,
              decision_status, total_score, max_score,
              teacher_feedback, previous_decision_ref,
              created_by, confirmed_at, created_at, updated_at
         FROM education.teacher_grade_decision
        WHERE grade_decision_ref = $1`,
      [gradeDecisionRef]
    );
    const row = decision.rows[0];
    if (!row) return undefined;
    const grades = await executor.query<ItemGradeRow>(
      `SELECT item_grade_ref, grade_decision_ref, response_ref,
              outcome, awarded_score, feedback, suggestion_source
         FROM education.teacher_item_grade
        WHERE grade_decision_ref = $1
        ORDER BY response_ref`,
      [gradeDecisionRef]
    );
    return toGradeDecision(row, grades.rows);
  }

  async listGradeHistory(
    executor: SqlExecutor,
    submissionRef: string
  ): Promise<TeacherGradeDecisionView[]> {
    const rows = await executor.query<{ grade_decision_ref: string }>(
      `SELECT decision.grade_decision_ref
         FROM education.teacher_grade_decision AS decision
         JOIN education.submission_attempt_details AS detail
           ON detail.attempt_ref = decision.attempt_ref
        WHERE detail.submission_ref = $1
        ORDER BY decision.decision_version DESC`,
      [submissionRef]
    );
    const result: TeacherGradeDecisionView[] = [];
    for (const row of rows.rows) {
      const decision = await this.getGradeDecision(
        executor,
        row.grade_decision_ref
      );
      if (decision) result.push(decision);
    }
    return result;
  }

  async getActiveDecisionForAttempt(
    executor: SqlExecutor,
    attemptRef: string
  ): Promise<TeacherGradeDecisionView | undefined> {
    const result = await executor.query<{ grade_decision_ref: string }>(
      `SELECT grade_decision_ref
         FROM education.teacher_grade_decision
        WHERE attempt_ref = $1
          AND decision_status IN ('draft', 'confirmed')
        ORDER BY CASE decision_status WHEN 'draft' THEN 0 ELSE 1 END,
                 decision_version DESC
        LIMIT 1`,
      [attemptRef]
    );
    const ref = result.rows[0]?.grade_decision_ref;
    return ref
      ? this.getGradeDecision(executor, ref)
      : undefined;
  }

  async insertGradeDraft(
    client: PostgresClient,
    input: {
      gradeDecisionRef: string;
      attemptRef: string;
      version: number;
      totalScore: number;
      maxScore: number;
      feedback: string;
      previousDecisionRef: string | null;
      previousDecisionStatus: "draft" | "confirmed" | null;
      createdBy: string;
      itemGrades: ReadonlyArray<
        TeacherItemGradeInput & {
          itemGradeRef: string;
          suggestionSource: "deterministic" | "teacher";
        }
      >;
      decisionMetadata: EducationMetadata;
      itemMetadata: (index: number) => EducationMetadata;
    }
  ): Promise<FormalWriteReceipt[]> {
    if (
      input.previousDecisionRef &&
      input.previousDecisionStatus === "draft"
    ) {
      await client.query(
        `UPDATE education.teacher_grade_decision
            SET decision_status = 'superseded',
                updated_at = $2
          WHERE grade_decision_ref = $1
            AND decision_status IN ('draft', 'confirmed')`,
        [input.previousDecisionRef, input.decisionMetadata.createdAt]
      );
    }
    await client.query(
      `INSERT INTO education.teacher_grade_decision (
         grade_decision_ref, attempt_ref, decision_version,
         decision_status, total_score, max_score, teacher_feedback,
         previous_decision_ref, created_by, confirmed_at, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, 'draft', $4, $5, $6,
         $7, $8, NULL, $9,
         $10, $11, $12, $13, $14, $15, $16
       )`,
      [
        input.gradeDecisionRef,
        input.attemptRef,
        input.version,
        input.totalScore,
        input.maxScore,
        input.feedback,
        input.previousDecisionRef,
        input.createdBy,
        input.decisionMetadata.createdAt,
        ...formalMetadataValues(input.decisionMetadata)
      ]
    );
    const receipts = [
      createReceipt({
        writeRef: input.gradeDecisionRef,
        recordType: "TeacherGradeDecision",
        metadata: input.decisionMetadata
      })
    ];
    for (const [index, grade] of input.itemGrades.entries()) {
      const metadata = input.itemMetadata(index);
      await client.query(
        `INSERT INTO education.teacher_item_grade (
           item_grade_ref, grade_decision_ref, response_ref,
           outcome, awarded_score, feedback, suggestion_source,
           actor_ref, purpose, owner_module, idempotency_key,
           authorization_decision_ref, audit_ref, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13, $14
         )`,
        [
          grade.itemGradeRef,
          input.gradeDecisionRef,
          grade.responseRef,
          grade.outcome,
          grade.awardedScore,
          grade.feedback,
          grade.suggestionSource,
          ...formalMetadataValues(metadata)
        ]
      );
      receipts.push(
        createReceipt({
          writeRef: grade.itemGradeRef,
          recordType: "TeacherItemGrade",
          metadata
        })
      );
    }
    return receipts;
  }

  async confirmGrade(
    client: PostgresClient,
    input: {
      gradeDecisionRef: string;
      expectedVersion: number;
      confirmedAt: string;
      metadata: EducationMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `UPDATE education.teacher_grade_decision AS previous
          SET decision_status = 'superseded',
              updated_at = $3
         FROM education.teacher_grade_decision AS current
        WHERE current.grade_decision_ref = $1
          AND current.decision_version = $2
          AND previous.attempt_ref = current.attempt_ref
          AND previous.grade_decision_ref <> current.grade_decision_ref
          AND previous.decision_status = 'confirmed'`,
      [input.gradeDecisionRef, input.expectedVersion, input.confirmedAt]
    );
    const result = await client.query(
      `UPDATE education.teacher_grade_decision
          SET decision_status = 'confirmed',
              confirmed_at = $3,
              updated_at = $3
        WHERE grade_decision_ref = $1
          AND decision_version = $2
          AND decision_status = 'draft'`,
      [input.gradeDecisionRef, input.expectedVersion, input.confirmedAt]
    );
    if (result.rowCount !== 1) {
      throw new Error("GRADE_DECISION_VERSION_OR_STATE_CONFLICT");
    }
    return createReceipt({
      writeRef: input.gradeDecisionRef,
      recordType: "TeacherGradeDecisionConfirmed",
      metadata: input.metadata
    });
  }

  async insertEvidenceForDecision(
    client: PostgresClient,
    input: {
      decision: TeacherGradeDecisionView;
      assignment: AssignmentDetail;
      learnerRef: string;
      observations: ReadonlyArray<{
        observationRef: string;
        itemRef: string;
        responseRef: string;
        objectiveRef: string;
        outcome: "correct" | "partial" | "incorrect";
        awardedScore: number;
        maxScore: number;
        supersedesObservationRef: string | null;
        metadata: EducationMetadata;
        sourceMetadata: EducationMetadata;
      }>;
    }
  ): Promise<FormalWriteReceipt[]> {
    const receipts: FormalWriteReceipt[] = [];
    for (const observation of input.observations) {
      await client.query(
        `INSERT INTO education.evidence_observation (
           observation_ref, attempt_ref, objective_ref, observer_type,
           observation_type, observation_value, observed_at, source_ref,
           actor_ref, purpose, owner_module, idempotency_key,
           authorization_decision_ref, audit_ref, created_at
         ) VALUES (
           $1, $2, $3, 'teacher', 'assignment_item_grade',
           $4, $5, $6,
           $7, $8, $9, $10, $11, $12, $13
         )`,
        [
          observation.observationRef,
          input.decision.attemptRef,
          observation.objectiveRef,
          toPostgresJson({
            outcome: observation.outcome,
            awardedScore: observation.awardedScore,
            maxScore: observation.maxScore,
            confirmationStatus: "teacher_confirmed",
            statement:
              observation.outcome === "correct"
                ? "本次作业该题经教师确认正确"
                : observation.outcome === "partial"
                  ? "本次作业该题经教师确认部分正确"
                  : "本次作业该题经教师确认错误",
            summary:
              observation.outcome === "correct"
                ? "匿名 learner 本次该题经教师确认正确"
                : observation.outcome === "partial"
                  ? "匿名 learner 本次该题经教师确认部分正确"
                  : "匿名 learner 本次该题经教师确认错误",
            unknowns: [
              "该观察仅代表本次合成作业，不构成长期能力判断"
            ]
          }),
          input.decision.confirmedAt,
          input.decision.gradeDecisionRef,
          ...formalMetadataValues(observation.metadata)
        ]
      );
      await client.query(
        `INSERT INTO education.assignment_evidence_source (
           observation_ref, assignment_ref, assignment_version_ref,
           item_ref, response_ref, grade_decision_ref, lesson_ref,
           learner_ref, source_version, supersedes_observation_ref,
           actor_ref, purpose, owner_module, idempotency_key,
           authorization_decision_ref, audit_ref, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17
         )`,
        [
          observation.observationRef,
          input.assignment.assignmentRef,
          input.assignment.currentVersion.assignmentVersionRef,
          observation.itemRef,
          observation.responseRef,
          input.decision.gradeDecisionRef,
          input.assignment.lessonRef,
          input.learnerRef,
          input.decision.version,
          observation.supersedesObservationRef,
          ...formalMetadataValues(observation.sourceMetadata)
        ]
      );
      receipts.push(
        createReceipt({
          writeRef: observation.observationRef,
          recordType: "EvidenceObservation",
          metadata: observation.metadata
        }),
        createReceipt({
          writeRef: observation.observationRef,
          recordType: "AssignmentEvidenceSource",
          metadata: observation.sourceMetadata
        })
      );
    }
    return receipts;
  }

  async findCurrentEvidenceForItemLearner(
    executor: SqlExecutor,
    assignmentRef: string,
    itemRef: string,
    learnerRef: string
  ): Promise<string | null> {
    const result = await executor.query<{ observation_ref: string }>(
      `SELECT source.observation_ref
         FROM education.assignment_evidence_source AS source
        WHERE source.assignment_ref = $1
          AND source.item_ref = $2
          AND source.learner_ref = $3
          AND NOT EXISTS (
            SELECT 1
              FROM education.assignment_evidence_source AS newer
             WHERE newer.supersedes_observation_ref = source.observation_ref
          )
        ORDER BY source.created_at DESC
        LIMIT 1`,
      [assignmentRef, itemRef, learnerRef]
    );
    return result.rows[0]?.observation_ref ?? null;
  }

  async listAssignmentEvidence(
    executor: SqlExecutor,
    tenantRef: string,
    assignmentRef: string
  ): Promise<EvidenceObservationSource[]> {
    const result = await executor.query<EvidenceSourceRow>(
      `${evidenceSourceSelect}
        WHERE assignment.tenant_ref = $1
          AND source.assignment_ref = $2
        ORDER BY source.created_at DESC`,
      [tenantRef, assignmentRef]
    );
    return result.rows.map(toEvidenceSource);
  }

  async getSubmissionByAttempt(
    executor: SqlExecutor,
    tenantRef: string,
    attemptRef: string
  ): Promise<SubmissionDetail | undefined> {
    const result = await executor.query<{ submission_ref: string }>(
      `SELECT detail.submission_ref
         FROM education.submission_attempt_details AS detail
         JOIN education.submission AS submission
           ON submission.submission_ref = detail.submission_ref
         JOIN education.assignment AS assignment
           ON assignment.assignment_ref = submission.assignment_ref
        WHERE assignment.tenant_ref = $1
          AND detail.attempt_ref = $2`,
      [tenantRef, attemptRef]
    );
    const submissionRef = result.rows[0]?.submission_ref;
    return submissionRef
      ? this.getSubmission(executor, tenantRef, submissionRef)
      : undefined;
  }

  async insertOutbox(
    client: PostgresClient,
    input: {
      outboxRef: string;
      eventName: string;
      aggregateRef: string;
      payload: Record<string, unknown>;
      metadata: EducationMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO education.outbox_record (
         outbox_ref, event_name, aggregate_ref, payload,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8, $9, $10, $11
       )`,
      [
        input.outboxRef,
        input.eventName,
        input.aggregateRef,
        toPostgresJson(input.payload),
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: input.outboxRef,
      recordType: "OutboxRecord",
      metadata: input.metadata
    });
  }

  async listLearnerEvidence(
    executor: SqlExecutor,
    tenantRef: string,
    courseRunRef: string,
    learnerRef: string
  ): Promise<EvidenceObservationSource[]> {
    const result = await executor.query<EvidenceSourceRow>(
      `${evidenceSourceSelect}
        WHERE assignment.tenant_ref = $1
          AND assignment.course_run_ref = $2
          AND source.learner_ref = $3
        ORDER BY source.created_at DESC`,
      [tenantRef, courseRunRef, learnerRef]
    );
    return result.rows.map(toEvidenceSource);
  }

  async validateSelectedEvidence(
    executor: SqlExecutor,
    tenantRef: string,
    assignmentRef: string,
    evidenceRefs: readonly string[],
    itemRefs: readonly string[]
  ): Promise<EvidenceObservationSource[]> {
    if (evidenceRefs.length === 0) return [];
    const result = await executor.query<EvidenceSourceRow>(
      `${evidenceSourceSelect}
        WHERE assignment.tenant_ref = $1
          AND source.assignment_ref = $2
          AND source.observation_ref = ANY($3::text[])
          AND source.item_ref = ANY($4::text[])
          AND NOT EXISTS (
            SELECT 1
              FROM education.assignment_evidence_source AS newer
             WHERE newer.supersedes_observation_ref = source.observation_ref
          )
        ORDER BY source.observation_ref`,
      [tenantRef, assignmentRef, evidenceRefs, itemRefs]
    );
    return result.rows.map(toEvidenceSource);
  }
}

const assignmentSummarySelect = `
  SELECT assignment.assignment_ref, assignment.tenant_ref,
         assignment.course_run_ref, assignment.curriculum_unit_ref,
         assignment.lesson_ref, lesson.title AS lesson_title,
         version.title, assignment.assignment_status,
         assignment.aggregate_version, assignment.current_version_number,
         version.due_at, assignment.created_by,
         assignment.created_at, assignment.updated_at,
         (SELECT count(*)::integer
            FROM education.assignment_item AS item
           WHERE item.assignment_version_ref = version.assignment_version_ref
         ) AS item_count,
         (SELECT count(*)::integer
            FROM education.course_run_enrollment AS enrollment
           WHERE enrollment.course_run_ref = assignment.course_run_ref
             AND enrollment.enrollment_status = 'active'
         ) AS enrolled_count,
         (SELECT count(DISTINCT detail.submission_ref)::integer
            FROM education.submission_attempt_details AS detail
            JOIN education.submission AS submission
              ON submission.submission_ref = detail.submission_ref
           WHERE submission.assignment_ref = assignment.assignment_ref
         ) AS submitted_count,
         (SELECT count(DISTINCT decision.attempt_ref)::integer
            FROM education.teacher_grade_decision AS decision
            JOIN education.submission_attempt_details AS detail
              ON detail.attempt_ref = decision.attempt_ref
            JOIN education.submission AS submission
              ON submission.submission_ref = detail.submission_ref
           WHERE submission.assignment_ref = assignment.assignment_ref
             AND decision.decision_status = 'confirmed'
         ) AS confirmed_grade_count
    FROM education.assignment AS assignment
    JOIN education.lesson AS lesson
      ON lesson.lesson_ref = assignment.lesson_ref
    JOIN education.assignment_version AS version
      ON version.assignment_ref = assignment.assignment_ref
     AND version.version_number = assignment.current_version_number`;

const submissionSummarySelect = `
  SELECT submission.submission_ref, $2::text AS assignment_ref,
         enrollment.learner_ref, enrollment.display_name,
         latest.attempt_ref, latest.attempt_count, latest.submitted_at,
         decision.grade_decision_ref, decision.decision_status,
         decision.total_score, decision.max_score
    FROM education.course_run_enrollment AS enrollment
    JOIN education.assignment AS assignment
      ON assignment.course_run_ref = enrollment.course_run_ref
     AND assignment.assignment_ref = $2
    LEFT JOIN education.submission AS submission
      ON submission.assignment_ref = assignment.assignment_ref
     AND submission.learner_ref = enrollment.learner_ref
    LEFT JOIN LATERAL (
      SELECT detail.attempt_ref, attempt.submitted_at,
             count(*) OVER ()::integer AS attempt_count
        FROM education.submission_attempt_details AS detail
        JOIN education.attempt AS attempt
          ON attempt.attempt_ref = detail.attempt_ref
       WHERE detail.submission_ref = submission.submission_ref
       ORDER BY detail.attempt_number DESC
       LIMIT 1
    ) AS latest ON true
    LEFT JOIN LATERAL (
      SELECT grade_decision_ref, decision_status,
             total_score, max_score
        FROM education.teacher_grade_decision
       WHERE attempt_ref = latest.attempt_ref
         AND decision_status IN ('draft', 'confirmed')
       ORDER BY CASE decision_status WHEN 'draft' THEN 0 ELSE 1 END,
                decision_version DESC
       LIMIT 1
    ) AS decision ON true
   WHERE assignment.tenant_ref = $1
     AND enrollment.enrollment_status = 'active'
   ORDER BY enrollment.display_name`;

const evidenceSourceSelect = `
  SELECT source.observation_ref, source.learner_ref,
         enrollment.display_name, assignment.course_run_ref,
         source.lesson_ref, item.objective_ref,
         source.assignment_ref, source.assignment_version_ref,
         source.item_ref, source.response_ref,
         response.attempt_ref,
         source.grade_decision_ref, grade.outcome,
         grade.awarded_score, item.max_score,
         source.supersedes_observation_ref,
         NOT EXISTS (
           SELECT 1
             FROM education.assignment_evidence_source AS newer
            WHERE newer.supersedes_observation_ref = source.observation_ref
         ) AS is_current,
         observation.observed_at
    FROM education.assignment_evidence_source AS source
    JOIN education.assignment AS assignment
      ON assignment.assignment_ref = source.assignment_ref
    JOIN education.assignment_item AS item
      ON item.item_ref = source.item_ref
    JOIN education.teacher_item_grade AS grade
      ON grade.grade_decision_ref = source.grade_decision_ref
     AND grade.response_ref = source.response_ref
    JOIN education.item_response AS response
      ON response.response_ref = source.response_ref
    JOIN education.evidence_observation AS observation
      ON observation.observation_ref = source.observation_ref
    JOIN education.course_run_enrollment AS enrollment
      ON enrollment.course_run_ref = assignment.course_run_ref
     AND enrollment.learner_ref = source.learner_ref`;

interface AssignmentSummaryRow {
  assignment_ref: string;
  tenant_ref: string;
  course_run_ref: string;
  curriculum_unit_ref: string;
  lesson_ref: string;
  lesson_title: string;
  title: string;
  assignment_status: AssignmentSummary["status"];
  aggregate_version: number;
  current_version_number: number;
  due_at: Date | null;
  item_count: number;
  enrolled_count: number;
  submitted_count: number;
  confirmed_grade_count: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface AssignmentVersionRow {
  assignment_version_ref: string;
  assignment_ref: string;
  version_number: number;
  title: string;
  instructions: string;
  due_at: Date | null;
  created_by: string;
  created_at: Date;
}

interface AssignmentItemRow {
  item_ref: string;
  assignment_version_ref: string;
  sequence: number;
  item_type: AssignmentItemView["itemType"];
  prompt: string;
  max_score: string | number;
  options: AssignmentItemView["options"];
  answer_key: AssignmentItemView["answerKey"];
  grading_criteria: string;
  objective_ref: string;
}

interface EnrollmentRow {
  enrollment_ref: string;
  course_run_ref: string;
  learner_ref: string;
  display_name: string;
  enrollment_status: CourseRunEnrollment["status"];
  synthetic: boolean;
  enrolled_at: Date;
}

interface SubmissionSummaryRow {
  submission_ref: string | null;
  assignment_ref: string;
  learner_ref: string;
  display_name: string;
  attempt_ref: string | null;
  attempt_count: number | null;
  submitted_at: Date | null;
  grade_decision_ref: string | null;
  decision_status: SubmissionSummary["gradeStatus"];
  total_score: string | number | null;
  max_score: string | number | null;
}

interface AttemptRow {
  attempt_ref: string;
  submission_ref: string;
  assignment_version_ref: string;
  attempt_number: number;
  submitted_at: Date;
  is_current: boolean;
}

interface ItemResponseRow {
  response_ref: string;
  attempt_ref: string;
  item_ref: string;
  response_value: Record<string, unknown>;
  submitted_at: Date;
}

interface GradeDecisionRow {
  grade_decision_ref: string;
  attempt_ref: string;
  decision_version: number;
  decision_status: TeacherGradeDecisionView["status"];
  total_score: string | number;
  max_score: string | number;
  teacher_feedback: string;
  previous_decision_ref: string | null;
  created_by: string;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ItemGradeRow {
  item_grade_ref: string;
  grade_decision_ref: string;
  response_ref: string;
  outcome: TeacherGradeDecisionView["itemGrades"][number]["outcome"];
  awarded_score: string | number;
  feedback: string;
  suggestion_source: TeacherGradeDecisionView["itemGrades"][number]["suggestionSource"];
}

interface EvidenceSourceRow {
  observation_ref: string;
  learner_ref: string;
  display_name: string;
  course_run_ref: string;
  lesson_ref: string;
  objective_ref: string;
  assignment_ref: string;
  assignment_version_ref: string;
  item_ref: string;
  response_ref: string;
  attempt_ref: string;
  grade_decision_ref: string;
  outcome: EvidenceObservationSource["outcome"];
  awarded_score: string | number;
  max_score: string | number;
  supersedes_observation_ref: string | null;
  is_current: boolean;
  observed_at: Date;
}

function toAssignmentSummary(row: AssignmentSummaryRow): AssignmentSummary {
  return {
    assignmentRef: row.assignment_ref,
    tenantRef: row.tenant_ref,
    courseRunRef: row.course_run_ref,
    curriculumUnitRef: row.curriculum_unit_ref,
    lessonRef: row.lesson_ref,
    lessonTitle: row.lesson_title,
    title: row.title,
    status: row.assignment_status,
    version: row.aggregate_version,
    currentVersionNumber: row.current_version_number,
    dueAt: row.due_at?.toISOString() ?? null,
    itemCount: row.item_count,
    enrolledCount: row.enrolled_count,
    submittedCount: row.submitted_count,
    confirmedGradeCount: row.confirmed_grade_count,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function toAssignmentItem(row: AssignmentItemRow): AssignmentItemView {
  return {
    itemRef: row.item_ref,
    assignmentVersionRef: row.assignment_version_ref,
    sequence: row.sequence,
    itemType: row.item_type,
    prompt: row.prompt,
    maxScore: Number(row.max_score),
    options: row.options,
    answerKey: row.answer_key,
    gradingCriteria: row.grading_criteria,
    objectiveRef: row.objective_ref
  };
}

function toEnrollment(row: EnrollmentRow): CourseRunEnrollment {
  return {
    enrollmentRef: row.enrollment_ref,
    courseRunRef: row.course_run_ref,
    learnerRef: row.learner_ref,
    displayName: row.display_name,
    status: row.enrollment_status,
    synthetic: row.synthetic,
    enrolledAt: row.enrolled_at.toISOString()
  };
}

function toSubmissionSummary(row: SubmissionSummaryRow): SubmissionSummary {
  const state = !row.attempt_ref
    ? "not_submitted"
    : row.decision_status === "confirmed"
      ? "graded"
      : "submitted";
  return {
    submissionRef: row.submission_ref,
    assignmentRef: row.assignment_ref,
    learnerRef: row.learner_ref,
    displayName: row.display_name,
    submissionState: state,
    latestAttemptRef: row.attempt_ref,
    attemptCount: row.attempt_count ?? 0,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    gradeDecisionRef: row.grade_decision_ref,
    gradeStatus: row.decision_status,
    score: row.total_score === null ? null : Number(row.total_score),
    maxScore: row.max_score === null ? null : Number(row.max_score)
  };
}

function toGradeDecision(
  row: GradeDecisionRow,
  grades: ItemGradeRow[]
): TeacherGradeDecisionView {
  return {
    gradeDecisionRef: row.grade_decision_ref,
    attemptRef: row.attempt_ref,
    version: row.decision_version,
    status: row.decision_status,
    totalScore: Number(row.total_score),
    maxScore: Number(row.max_score),
    feedback: row.teacher_feedback,
    previousDecisionRef: row.previous_decision_ref,
    itemGrades: grades.map((grade) => ({
      itemGradeRef: grade.item_grade_ref,
      gradeDecisionRef: grade.grade_decision_ref,
      responseRef: grade.response_ref,
      outcome: grade.outcome,
      awardedScore: Number(grade.awarded_score),
      feedback: grade.feedback,
      suggestionSource: grade.suggestion_source
    })),
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function toEvidenceSource(row: EvidenceSourceRow): EvidenceObservationSource {
  return {
    observationRef: row.observation_ref,
    learnerRef: row.learner_ref,
    displayName: row.display_name,
    courseRunRef: row.course_run_ref,
    lessonRef: row.lesson_ref,
    objectiveRef: row.objective_ref,
    assignmentRef: row.assignment_ref,
    assignmentVersionRef: row.assignment_version_ref,
    itemRef: row.item_ref,
    attemptRef: row.attempt_ref,
    responseRef: row.response_ref,
    gradeDecisionRef: row.grade_decision_ref,
    outcome: row.outcome,
    awardedScore: Number(row.awarded_score),
    maxScore: Number(row.max_score),
    confirmationStatus: "teacher_confirmed",
    supersedesObservationRef: row.supersedes_observation_ref,
    isCurrent: row.is_current,
    observedAt: row.observed_at.toISOString()
  };
}

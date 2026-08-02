import {
  ClassroomObservationDetailSchema,
  ClassroomObservationRevisionSchema,
  InstructionalDecisionSchema,
  LessonDeliveryDetailSchema,
  LessonDeliveryRevisionSchema,
  ObservedPedagogicalMoveSchema,
  type ClassroomObservationDetail,
  type ClassroomObservationRevision,
  type DeliveryStepInput,
  type FormalWriteMetadata,
  type FormalWriteReceipt,
  type InstructionalDecision,
  type LessonDeliveryDetail,
  type LessonDeliveryRevision,
  type ObservedPedagogicalMove
} from "@edu-agent/contracts";

import type { PostgresClient, SqlExecutor } from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues,
  toPostgresJson
} from "../../../platform/postgres/write-context.js";

type EducationMetadata = FormalWriteMetadata & { owner: "education" };

export interface DeliveryRevisionWrite {
  deliveryRevisionRef: string;
  deliveryRef: string;
  revisionNumber: number;
  teachingPlanRevisionRef: string;
  calendarEventRef: string | null;
  actualStartAt: string;
  actualEndAt: string;
  steps: DeliveryStepInput[];
  paceNotes: string;
  unresolvedQuestions: string[];
  followUpNotes: string;
  parentRevisionRef: string | null;
}

export interface ObservationRevisionWrite {
  observationRevisionRef: string;
  observationRef: string;
  revisionNumber: number;
  deliveryRevisionRef: string;
  scope: ClassroomObservationRevision["scope"];
  scopeRef: string | null;
  observationType: ClassroomObservationRevision["observationType"];
  content: string;
  observedAt: string;
  parentRevisionRef: string | null;
}

export class PostgresGate29EducationRepository {
  async findDeliveryBySession(
    executor: SqlExecutor,
    tenantRef: string,
    lessonRef: string,
    sessionKey: string
  ): Promise<string | undefined> {
    const result = await executor.query<{ delivery_ref: string }>(
      `SELECT delivery_ref
         FROM education.lesson_delivery
        WHERE tenant_ref = $1 AND lesson_ref = $2 AND session_key = $3`,
      [tenantRef, lessonRef, sessionKey]
    );
    return result.rows[0]?.delivery_ref;
  }

  async insertDelivery(
    client: PostgresClient,
    input: {
      deliveryRef: string;
      tenantRef: string;
      courseRunRef: string;
      lessonRef: string;
      sessionKey: string;
      teacherRef: string;
      revision: DeliveryRevisionWrite;
      deliveryMetadata: EducationMetadata;
      revisionMetadata: EducationMetadata;
    }
  ): Promise<FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO education.lesson_delivery (
         delivery_ref, tenant_ref, course_run_ref, lesson_ref, session_key,
         teacher_ref, aggregate_version, current_draft_revision_ref,
         current_confirmed_revision_ref,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 1, NULL, NULL,
         $7, $8, $9, $10, $11, $12, $13, $13
       )`,
      [
        input.deliveryRef,
        input.tenantRef,
        input.courseRunRef,
        input.lessonRef,
        input.sessionKey,
        input.teacherRef,
        ...formalMetadataValues(input.deliveryMetadata)
      ]
    );
    await this.insertDeliveryRevision(client, {
      ...input.revision,
      status: "draft",
      revisionVersion: 1,
      metadata: input.revisionMetadata
    });
    await client.query(
      `UPDATE education.lesson_delivery
          SET current_draft_revision_ref = $2
        WHERE delivery_ref = $1`,
      [input.deliveryRef, input.revision.deliveryRevisionRef]
    );
    return [
      createReceipt({
        writeRef: input.deliveryRef,
        recordType: "LessonDelivery",
        metadata: input.deliveryMetadata
      }),
      createReceipt({
        writeRef: input.revision.deliveryRevisionRef,
        recordType: "LessonDeliveryRevision",
        metadata: input.revisionMetadata
      })
    ];
  }

  async updateDeliveryDraft(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      deliveryRef: string;
      revisionRef: string;
      expectedRevisionVersion: number;
      content: Omit<
        DeliveryRevisionWrite,
        "deliveryRevisionRef" | "deliveryRef" | "revisionNumber" | "parentRevisionRef"
      >;
      metadata: EducationMetadata;
    }
  ): Promise<boolean> {
    const result = await client.query(
      `UPDATE education.lesson_delivery_revision AS revision
          SET teaching_plan_revision_ref = $6,
              calendar_event_ref = $7,
              actual_start_at = $8::timestamptz,
              actual_end_at = $9::timestamptz,
              steps = $10::jsonb,
              pace_notes = $11,
              unresolved_questions = $12::jsonb,
              follow_up_notes = $13,
              revision_version = revision_version + 1,
              updated_at = $14::timestamptz,
              actor_ref = $15,
              purpose = $16,
              owner_module = $17,
              idempotency_key = $18,
              authorization_decision_ref = $19,
              audit_ref = $20
         FROM education.lesson_delivery AS delivery
        WHERE revision.delivery_ref = delivery.delivery_ref
          AND delivery.delivery_ref = $1
          AND delivery.tenant_ref = $2
          AND delivery.teacher_ref = $3
          AND revision.delivery_revision_ref = $4
          AND revision.revision_status = 'draft'
          AND revision.revision_version = $5`,
      [
        input.deliveryRef,
        input.tenantRef,
        input.teacherRef,
        input.revisionRef,
        input.expectedRevisionVersion,
        input.content.teachingPlanRevisionRef,
        input.content.calendarEventRef,
        input.content.actualStartAt,
        input.content.actualEndAt,
        toPostgresJson(input.content.steps),
        input.content.paceNotes,
        toPostgresJson(input.content.unresolvedQuestions),
        input.content.followUpNotes,
        input.metadata.createdAt,
        input.metadata.actorRef,
        input.metadata.purpose,
        input.metadata.owner,
        input.metadata.idempotencyKey,
        input.metadata.authorizationDecisionRef,
        input.metadata.auditRef
      ]
    );
    if ((result.rowCount ?? 0) === 0) return false;
    await client.query(
      `UPDATE education.lesson_delivery
          SET aggregate_version = aggregate_version + 1,
              updated_at = $2::timestamptz
        WHERE delivery_ref = $1`,
      [input.deliveryRef, input.metadata.createdAt]
    );
    return true;
  }

  async insertDeliveryAmendment(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      deliveryRef: string;
      expectedAggregateVersion: number;
      revision: DeliveryRevisionWrite;
      metadata: EducationMetadata;
    }
  ): Promise<boolean> {
    const locked = await client.query<{ aggregate_version: number; current_draft_revision_ref: string | null }>(
      `SELECT aggregate_version, current_draft_revision_ref
         FROM education.lesson_delivery
        WHERE delivery_ref = $1 AND tenant_ref = $2 AND teacher_ref = $3
        FOR UPDATE`,
      [input.deliveryRef, input.tenantRef, input.teacherRef]
    );
    const row = locked.rows[0];
    if (!row || row.aggregate_version !== input.expectedAggregateVersion || row.current_draft_revision_ref) {
      return false;
    }
    await this.insertDeliveryRevision(client, {
      ...input.revision,
      status: "draft",
      revisionVersion: 1,
      metadata: input.metadata
    });
    await client.query(
      `UPDATE education.lesson_delivery
          SET current_draft_revision_ref = $2,
              aggregate_version = aggregate_version + 1,
              updated_at = $3::timestamptz
        WHERE delivery_ref = $1`,
      [input.deliveryRef, input.revision.deliveryRevisionRef, input.metadata.createdAt]
    );
    return true;
  }

  async confirmDelivery(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      deliveryRef: string;
      revisionRef: string;
      expectedRevisionVersion: number;
      moveRef: (stepKey: string) => string;
      decisionRef: (stepKey: string) => string;
      confirmationMetadata: EducationMetadata;
      moveMetadata: (stepKey: string) => EducationMetadata;
      decisionMetadata: (stepKey: string) => EducationMetadata;
    }
  ): Promise<FormalWriteReceipt[] | undefined> {
    const locked = await client.query<DeliveryRevisionRow & { current_confirmed_revision_ref: string | null }>(
      `${deliveryRevisionSelect}, delivery.current_confirmed_revision_ref
         FROM education.lesson_delivery_revision AS revision
         JOIN education.lesson_delivery AS delivery ON delivery.delivery_ref = revision.delivery_ref
         JOIN education.lesson AS lesson ON lesson.lesson_ref = delivery.lesson_ref
        WHERE delivery.delivery_ref = $1 AND delivery.tenant_ref = $2
          AND delivery.teacher_ref = $3 AND revision.delivery_revision_ref = $4
        FOR UPDATE OF delivery, revision`,
      [input.deliveryRef, input.tenantRef, input.teacherRef, input.revisionRef]
    );
    const row = locked.rows[0];
    if (!row || row.revision_status !== "draft" || row.revision_version !== input.expectedRevisionVersion) {
      return undefined;
    }
    if (row.current_confirmed_revision_ref) {
      await client.query(
        `UPDATE education.lesson_delivery_revision
            SET revision_status = 'superseded', updated_at = $2::timestamptz
          WHERE delivery_revision_ref = $1 AND revision_status = 'confirmed'`,
        [row.current_confirmed_revision_ref, input.confirmationMetadata.createdAt]
      );
    }
    await client.query(
      `UPDATE education.lesson_delivery_revision
          SET revision_status = 'confirmed', confirmed_by = $2,
              confirmed_at = $3::timestamptz, updated_at = $3::timestamptz,
              actor_ref = $4, purpose = $5, owner_module = $6,
              idempotency_key = $7, authorization_decision_ref = $8, audit_ref = $9
        WHERE delivery_revision_ref = $1`,
      [
        input.revisionRef,
        input.teacherRef,
        input.confirmationMetadata.createdAt,
        input.confirmationMetadata.actorRef,
        input.confirmationMetadata.purpose,
        input.confirmationMetadata.owner,
        input.confirmationMetadata.idempotencyKey,
        input.confirmationMetadata.authorizationDecisionRef,
        input.confirmationMetadata.auditRef
      ]
    );
    await client.query(
      `UPDATE education.lesson_delivery
          SET current_draft_revision_ref = NULL,
              current_confirmed_revision_ref = $2,
              aggregate_version = aggregate_version + 1,
              updated_at = $3::timestamptz
        WHERE delivery_ref = $1`,
      [input.deliveryRef, input.revisionRef, input.confirmationMetadata.createdAt]
    );
    const steps = row.steps;
    const receipts: FormalWriteReceipt[] = [
      createReceipt({
        writeRef: input.revisionRef,
        recordType: "LessonDeliveryRevisionConfirmed",
        metadata: input.confirmationMetadata
      })
    ];
    for (const step of steps) {
      const moveRef = input.moveRef(step.stepKey);
      const moveMetadata = input.moveMetadata(step.stepKey);
      await client.query(
        `INSERT INTO education.observed_pedagogical_move (
           move_ref, delivery_revision_ref, step_key, sequence, title,
           disposition, actual_description, observed_at, confirmed_by,
           actor_ref, purpose, owner_module, idempotency_key,
           authorization_decision_ref, audit_ref, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9,
           $10, $11, $12, $13, $14, $15, $16
         )`,
        [
          moveRef,
          input.revisionRef,
          step.stepKey,
          step.sequence,
          step.title,
          step.disposition,
          step.actualDescription,
          row.actual_end_at.toISOString(),
          input.teacherRef,
          ...formalMetadataValues(moveMetadata)
        ]
      );
      receipts.push(createReceipt({ writeRef: moveRef, recordType: "ObservedPedagogicalMove", metadata: moveMetadata }));
      if (step.disposition !== "adopted") {
        const decisionRef = input.decisionRef(step.stepKey);
        const decisionMetadata = input.decisionMetadata(step.stepKey);
        await client.query(
          `INSERT INTO education.instructional_decision (
             decision_ref, move_ref, decision_type, rationale, decided_at, decided_by,
             actor_ref, purpose, owner_module, idempotency_key,
             authorization_decision_ref, audit_ref, created_at
           ) VALUES (
             $1, $2, $3, $4, $5::timestamptz, $6,
             $7, $8, $9, $10, $11, $12, $13
           )`,
          [
            decisionRef,
            moveRef,
            step.disposition,
            step.rationale || "教师确认的课堂实施调整",
            input.confirmationMetadata.createdAt,
            input.teacherRef,
            ...formalMetadataValues(decisionMetadata)
          ]
        );
        receipts.push(createReceipt({ writeRef: decisionRef, recordType: "InstructionalDecision", metadata: decisionMetadata }));
      }
    }
    return receipts;
  }

  async getDelivery(
    executor: SqlExecutor,
    tenantRef: string,
    teacherRef: string,
    deliveryRef: string
  ): Promise<LessonDeliveryDetail | undefined> {
    const aggregate = await executor.query<{ aggregate_version: number }>(
      `SELECT aggregate_version FROM education.lesson_delivery
        WHERE delivery_ref = $1 AND tenant_ref = $2 AND teacher_ref = $3`,
      [deliveryRef, tenantRef, teacherRef]
    );
    if (!aggregate.rows[0]) return undefined;
    const revisions = await this.listDeliveryRevisions(executor, tenantRef, teacherRef, deliveryRef);
    return LessonDeliveryDetailSchema.parse({
      deliveryRef,
      aggregateVersion: aggregate.rows[0].aggregate_version,
      currentDraft: revisions.find((item) => item.status === "draft") ?? null,
      currentConfirmed: revisions.find((item) => item.status === "confirmed") ?? null,
      history: revisions
    });
  }

  async getDeliveryByRevision(
    executor: SqlExecutor,
    tenantRef: string,
    teacherRef: string,
    revisionRef: string
  ): Promise<LessonDeliveryRevision | undefined> {
    const result = await executor.query<DeliveryRevisionRow>(
      `${deliveryRevisionSelect}
         FROM education.lesson_delivery_revision AS revision
         JOIN education.lesson_delivery AS delivery ON delivery.delivery_ref = revision.delivery_ref
         JOIN education.lesson AS lesson ON lesson.lesson_ref = delivery.lesson_ref
        WHERE delivery.tenant_ref = $1 AND delivery.teacher_ref = $2
          AND revision.delivery_revision_ref = $3`,
      [tenantRef, teacherRef, revisionRef]
    );
    return result.rows[0] ? toDeliveryRevision(result.rows[0]) : undefined;
  }

  async listDeliveriesForLesson(
    executor: SqlExecutor,
    tenantRef: string,
    teacherRef: string,
    lessonRef: string
  ): Promise<LessonDeliveryDetail[]> {
    const result = await executor.query<{ delivery_ref: string }>(
      `SELECT delivery_ref FROM education.lesson_delivery
        WHERE tenant_ref = $1 AND teacher_ref = $2 AND lesson_ref = $3
        ORDER BY updated_at DESC, delivery_ref`,
      [tenantRef, teacherRef, lessonRef]
    );
    const items: LessonDeliveryDetail[] = [];
    for (const row of result.rows) {
      const detail = await this.getDelivery(executor, tenantRef, teacherRef, row.delivery_ref);
      if (detail) items.push(detail);
    }
    return items;
  }

  async insertObservation(
    client: PostgresClient,
    input: {
      observationRef: string;
      tenantRef: string;
      courseRunRef: string;
      lessonRef: string;
      deliveryRef: string;
      teacherRef: string;
      revision: ObservationRevisionWrite;
      observationMetadata: EducationMetadata;
      revisionMetadata: EducationMetadata;
    }
  ): Promise<FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO education.classroom_observation (
         observation_ref, tenant_ref, course_run_ref, lesson_ref, delivery_ref,
         teacher_ref, aggregate_version, current_draft_revision_ref,
         current_confirmed_revision_ref,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 1, NULL, NULL,
         $7, $8, $9, $10, $11, $12, $13, $13
       )`,
      [
        input.observationRef,
        input.tenantRef,
        input.courseRunRef,
        input.lessonRef,
        input.deliveryRef,
        input.teacherRef,
        ...formalMetadataValues(input.observationMetadata)
      ]
    );
    await this.insertObservationRevision(client, {
      ...input.revision,
      status: "draft",
      revisionVersion: 1,
      metadata: input.revisionMetadata
    });
    await client.query(
      `UPDATE education.classroom_observation
          SET current_draft_revision_ref = $2
        WHERE observation_ref = $1`,
      [input.observationRef, input.revision.observationRevisionRef]
    );
    return [
      createReceipt({ writeRef: input.observationRef, recordType: "ClassroomObservation", metadata: input.observationMetadata }),
      createReceipt({ writeRef: input.revision.observationRevisionRef, recordType: "ClassroomObservationRevision", metadata: input.revisionMetadata })
    ];
  }

  async updateObservationDraft(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      observationRef: string;
      revisionRef: string;
      expectedRevisionVersion: number;
      content: Omit<ObservationRevisionWrite, "observationRevisionRef" | "observationRef" | "revisionNumber" | "parentRevisionRef">;
      metadata: EducationMetadata;
    }
  ): Promise<boolean> {
    const result = await client.query(
      `UPDATE education.classroom_observation_revision AS revision
          SET delivery_revision_ref = $6,
              observation_scope = $7,
              scope_ref = $8,
              observation_type = $9,
              observation_content = $10,
              observed_at = $11::timestamptz,
              revision_version = revision_version + 1,
              updated_at = $12::timestamptz,
              actor_ref = $13, purpose = $14, owner_module = $15,
              idempotency_key = $16, authorization_decision_ref = $17, audit_ref = $18
         FROM education.classroom_observation AS observation
        WHERE observation.observation_ref = revision.observation_ref
          AND observation.observation_ref = $1 AND observation.tenant_ref = $2
          AND observation.teacher_ref = $3 AND revision.observation_revision_ref = $4
          AND revision.revision_status = 'draft' AND revision.revision_version = $5`,
      [
        input.observationRef,
        input.tenantRef,
        input.teacherRef,
        input.revisionRef,
        input.expectedRevisionVersion,
        input.content.deliveryRevisionRef,
        input.content.scope,
        input.content.scopeRef,
        input.content.observationType,
        input.content.content,
        input.content.observedAt,
        input.metadata.createdAt,
        input.metadata.actorRef,
        input.metadata.purpose,
        input.metadata.owner,
        input.metadata.idempotencyKey,
        input.metadata.authorizationDecisionRef,
        input.metadata.auditRef
      ]
    );
    if ((result.rowCount ?? 0) === 0) return false;
    await client.query(
      `UPDATE education.classroom_observation
          SET aggregate_version = aggregate_version + 1, updated_at = $2::timestamptz
        WHERE observation_ref = $1`,
      [input.observationRef, input.metadata.createdAt]
    );
    return true;
  }

  async insertObservationSupersession(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      observationRef: string;
      expectedAggregateVersion: number;
      revision: ObservationRevisionWrite;
      metadata: EducationMetadata;
    }
  ): Promise<boolean> {
    const locked = await client.query<{ aggregate_version: number; current_draft_revision_ref: string | null }>(
      `SELECT aggregate_version, current_draft_revision_ref
         FROM education.classroom_observation
        WHERE observation_ref = $1 AND tenant_ref = $2 AND teacher_ref = $3
        FOR UPDATE`,
      [input.observationRef, input.tenantRef, input.teacherRef]
    );
    const row = locked.rows[0];
    if (!row || row.aggregate_version !== input.expectedAggregateVersion || row.current_draft_revision_ref) return false;
    await this.insertObservationRevision(client, {
      ...input.revision,
      status: "draft",
      revisionVersion: 1,
      metadata: input.metadata
    });
    await client.query(
      `UPDATE education.classroom_observation
          SET current_draft_revision_ref = $2,
              aggregate_version = aggregate_version + 1,
              updated_at = $3::timestamptz
        WHERE observation_ref = $1`,
      [input.observationRef, input.revision.observationRevisionRef, input.metadata.createdAt]
    );
    return true;
  }

  async confirmObservation(
    client: PostgresClient,
    input: {
      tenantRef: string;
      teacherRef: string;
      observationRef: string;
      revisionRef: string;
      expectedRevisionVersion: number;
      metadata: EducationMetadata;
    }
  ): Promise<boolean> {
    const locked = await client.query<{
      revision_status: string;
      revision_version: number;
      current_confirmed_revision_ref: string | null;
    }>(
      `SELECT revision.revision_status, revision.revision_version,
              observation.current_confirmed_revision_ref
         FROM education.classroom_observation_revision AS revision
         JOIN education.classroom_observation AS observation
           ON observation.observation_ref = revision.observation_ref
        WHERE observation.observation_ref = $1 AND observation.tenant_ref = $2
          AND observation.teacher_ref = $3 AND revision.observation_revision_ref = $4
        FOR UPDATE OF observation, revision`,
      [input.observationRef, input.tenantRef, input.teacherRef, input.revisionRef]
    );
    const row = locked.rows[0];
    if (!row || row.revision_status !== "draft" || row.revision_version !== input.expectedRevisionVersion) return false;
    if (row.current_confirmed_revision_ref) {
      await client.query(
        `UPDATE education.classroom_observation_revision
            SET revision_status = 'superseded', updated_at = $2::timestamptz
          WHERE observation_revision_ref = $1 AND revision_status = 'confirmed'`,
        [row.current_confirmed_revision_ref, input.metadata.createdAt]
      );
    }
    await client.query(
      `UPDATE education.classroom_observation_revision
          SET revision_status = 'confirmed', confirmed_by = $2,
              confirmed_at = $3::timestamptz, updated_at = $3::timestamptz,
              actor_ref = $4, purpose = $5, owner_module = $6,
              idempotency_key = $7, authorization_decision_ref = $8, audit_ref = $9
        WHERE observation_revision_ref = $1`,
      [
        input.revisionRef,
        input.teacherRef,
        input.metadata.createdAt,
        input.metadata.actorRef,
        input.metadata.purpose,
        input.metadata.owner,
        input.metadata.idempotencyKey,
        input.metadata.authorizationDecisionRef,
        input.metadata.auditRef
      ]
    );
    await client.query(
      `UPDATE education.classroom_observation
          SET current_draft_revision_ref = NULL,
              current_confirmed_revision_ref = $2,
              aggregate_version = aggregate_version + 1,
              updated_at = $3::timestamptz
        WHERE observation_ref = $1`,
      [input.observationRef, input.revisionRef, input.metadata.createdAt]
    );
    return true;
  }

  async getObservation(
    executor: SqlExecutor,
    tenantRef: string,
    teacherRef: string,
    observationRef: string
  ): Promise<ClassroomObservationDetail | undefined> {
    const aggregate = await executor.query<{ aggregate_version: number }>(
      `SELECT aggregate_version FROM education.classroom_observation
        WHERE observation_ref = $1 AND tenant_ref = $2 AND teacher_ref = $3`,
      [observationRef, tenantRef, teacherRef]
    );
    if (!aggregate.rows[0]) return undefined;
    const revisions = await this.listObservationRevisions(executor, tenantRef, teacherRef, observationRef);
    return ClassroomObservationDetailSchema.parse({
      observationRef,
      aggregateVersion: aggregate.rows[0].aggregate_version,
      currentDraft: revisions.find((item) => item.status === "draft") ?? null,
      currentConfirmed: revisions.find((item) => item.status === "confirmed") ?? null,
      history: revisions
    });
  }

  async listObservationsForLesson(
    executor: SqlExecutor,
    tenantRef: string,
    teacherRef: string,
    lessonRef: string
  ): Promise<ClassroomObservationRevision[]> {
    const result = await executor.query<ObservationRevisionRow>(
      `${observationRevisionSelect}
         FROM education.classroom_observation_revision AS revision
         JOIN education.classroom_observation AS observation
           ON observation.observation_ref = revision.observation_ref
        WHERE observation.tenant_ref = $1 AND observation.teacher_ref = $2
          AND observation.lesson_ref = $3
        ORDER BY revision.observed_at DESC, revision.revision_number DESC`,
      [tenantRef, teacherRef, lessonRef]
    );
    return result.rows.map(toObservationRevision);
  }

  async validateConfirmedObservations(
    executor: SqlExecutor,
    tenantRef: string,
    teacherRef: string,
    lessonRef: string,
    revisionRefs: readonly string[]
  ): Promise<ClassroomObservationRevision[]> {
    if (revisionRefs.length === 0) return [];
    const result = await executor.query<ObservationRevisionRow>(
      `${observationRevisionSelect}
         FROM education.classroom_observation_revision AS revision
         JOIN education.classroom_observation AS observation
           ON observation.observation_ref = revision.observation_ref
        WHERE observation.tenant_ref = $1 AND observation.teacher_ref = $2
          AND observation.lesson_ref = $3
          AND revision.revision_status = 'confirmed'
          AND revision.observation_revision_ref = ANY($4::text[])`,
      [tenantRef, teacherRef, lessonRef, revisionRefs]
    );
    return result.rows.map(toObservationRevision);
  }

  async validateAssignmentEvidence(
    executor: SqlExecutor,
    tenantRef: string,
    lessonRef: string,
    evidenceRefs: readonly string[]
  ): Promise<string[]> {
    if (evidenceRefs.length === 0) return [];
    const result = await executor.query<{ observation_ref: string }>(
      `SELECT source.observation_ref
         FROM education.assignment_evidence_source AS source
         JOIN education.assignment AS assignment
           ON assignment.assignment_ref = source.assignment_ref
         JOIN education.teacher_grade_decision AS decision
           ON decision.grade_decision_ref = source.grade_decision_ref
        WHERE assignment.tenant_ref = $1
          AND source.lesson_ref = $2
          AND decision.decision_status = 'confirmed'
          AND source.observation_ref = ANY($3::text[])
          AND NOT EXISTS (
            SELECT 1
              FROM education.assignment_evidence_source AS newer
             WHERE newer.supersedes_observation_ref = source.observation_ref
          )`,
      [tenantRef, lessonRef, evidenceRefs]
    );
    return result.rows.map((row) => row.observation_ref);
  }

  async listMoves(
    executor: SqlExecutor,
    deliveryRevisionRef: string
  ): Promise<ObservedPedagogicalMove[]> {
    const result = await executor.query<MoveRow>(
      `SELECT move_ref, delivery_revision_ref, step_key, sequence, title,
              disposition, actual_description, observed_at, confirmed_by
         FROM education.observed_pedagogical_move
        WHERE delivery_revision_ref = $1 ORDER BY sequence, move_ref`,
      [deliveryRevisionRef]
    );
    return result.rows.map((row) => ObservedPedagogicalMoveSchema.parse({
      moveRef: row.move_ref,
      deliveryRevisionRef: row.delivery_revision_ref,
      stepKey: row.step_key,
      sequence: row.sequence,
      title: row.title,
      disposition: row.disposition,
      actualDescription: row.actual_description,
      observedAt: row.observed_at.toISOString(),
      confirmedBy: row.confirmed_by
    }));
  }

  async listDecisions(
    executor: SqlExecutor,
    deliveryRevisionRef: string
  ): Promise<InstructionalDecision[]> {
    const result = await executor.query<DecisionRow>(
      `SELECT decision.decision_ref, decision.move_ref, decision.decision_type,
              decision.rationale, decision.decided_at, decision.decided_by
         FROM education.instructional_decision AS decision
         JOIN education.observed_pedagogical_move AS move ON move.move_ref = decision.move_ref
        WHERE move.delivery_revision_ref = $1 ORDER BY move.sequence, decision.decision_ref`,
      [deliveryRevisionRef]
    );
    return result.rows.map((row) => InstructionalDecisionSchema.parse({
      decisionRef: row.decision_ref,
      moveRef: row.move_ref,
      decisionType: row.decision_type,
      rationale: row.rationale,
      decidedAt: row.decided_at.toISOString(),
      decidedBy: row.decided_by
    }));
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
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)`,
      [input.outboxRef, input.eventName, input.aggregateRef, toPostgresJson(input.payload), ...formalMetadataValues(input.metadata)]
    );
    return createReceipt({ writeRef: input.outboxRef, recordType: "OutboxRecord", metadata: input.metadata });
  }

  private async insertDeliveryRevision(
    client: PostgresClient,
    input: DeliveryRevisionWrite & {
      status: "draft";
      revisionVersion: number;
      metadata: EducationMetadata;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO education.lesson_delivery_revision (
         delivery_revision_ref, delivery_ref, revision_number, revision_version,
         revision_status, teaching_plan_revision_ref, calendar_event_ref,
         actual_start_at, actual_end_at, steps, pace_notes,
         unresolved_questions, follow_up_notes, parent_revision_ref,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz,
         $10::jsonb, $11, $12::jsonb, $13, $14,
         $15, $16, $17, $18, $19, $20, $21, $21
       )`,
      [
        input.deliveryRevisionRef,
        input.deliveryRef,
        input.revisionNumber,
        input.revisionVersion,
        input.status,
        input.teachingPlanRevisionRef,
        input.calendarEventRef,
        input.actualStartAt,
        input.actualEndAt,
        toPostgresJson(input.steps),
        input.paceNotes,
        toPostgresJson(input.unresolvedQuestions),
        input.followUpNotes,
        input.parentRevisionRef,
        ...formalMetadataValues(input.metadata)
      ]
    );
  }

  private async insertObservationRevision(
    client: PostgresClient,
    input: ObservationRevisionWrite & {
      status: "draft";
      revisionVersion: number;
      metadata: EducationMetadata;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO education.classroom_observation_revision (
         observation_revision_ref, observation_ref, revision_number,
         revision_version, revision_status, delivery_revision_ref,
         observation_scope, scope_ref, observation_type, observation_content,
         observed_at, parent_revision_ref,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11::timestamptz, $12, $13, $14, $15, $16, $17, $18, $19, $19
       )`,
      [
        input.observationRevisionRef,
        input.observationRef,
        input.revisionNumber,
        input.revisionVersion,
        input.status,
        input.deliveryRevisionRef,
        input.scope,
        input.scopeRef,
        input.observationType,
        input.content,
        input.observedAt,
        input.parentRevisionRef,
        ...formalMetadataValues(input.metadata)
      ]
    );
  }

  private async listDeliveryRevisions(
    executor: SqlExecutor,
    tenantRef: string,
    teacherRef: string,
    deliveryRef: string
  ): Promise<LessonDeliveryRevision[]> {
    const result = await executor.query<DeliveryRevisionRow>(
      `${deliveryRevisionSelect}
         FROM education.lesson_delivery_revision AS revision
         JOIN education.lesson_delivery AS delivery ON delivery.delivery_ref = revision.delivery_ref
         JOIN education.lesson AS lesson ON lesson.lesson_ref = delivery.lesson_ref
        WHERE delivery.tenant_ref = $1 AND delivery.teacher_ref = $2
          AND delivery.delivery_ref = $3
        ORDER BY revision.revision_number DESC`,
      [tenantRef, teacherRef, deliveryRef]
    );
    return result.rows.map(toDeliveryRevision);
  }

  private async listObservationRevisions(
    executor: SqlExecutor,
    tenantRef: string,
    teacherRef: string,
    observationRef: string
  ): Promise<ClassroomObservationRevision[]> {
    const result = await executor.query<ObservationRevisionRow>(
      `${observationRevisionSelect}
         FROM education.classroom_observation_revision AS revision
         JOIN education.classroom_observation AS observation
           ON observation.observation_ref = revision.observation_ref
        WHERE observation.tenant_ref = $1 AND observation.teacher_ref = $2
          AND observation.observation_ref = $3
        ORDER BY revision.revision_number DESC`,
      [tenantRef, teacherRef, observationRef]
    );
    return result.rows.map(toObservationRevision);
  }
}

const deliveryRevisionSelect = `SELECT revision.delivery_revision_ref,
  revision.delivery_ref, revision.revision_number, revision.revision_version,
  revision.revision_status, delivery.tenant_ref, delivery.course_run_ref,
  delivery.lesson_ref, lesson.title AS lesson_title, delivery.teacher_ref,
  revision.teaching_plan_revision_ref, revision.calendar_event_ref,
  revision.actual_start_at, revision.actual_end_at, revision.steps,
  revision.pace_notes, revision.unresolved_questions, revision.follow_up_notes,
  revision.parent_revision_ref, revision.confirmed_by, revision.confirmed_at,
  revision.created_at, revision.updated_at`;

interface DeliveryRevisionRow {
  delivery_revision_ref: string;
  delivery_ref: string;
  revision_number: number;
  revision_version: number;
  revision_status: LessonDeliveryRevision["status"];
  tenant_ref: string;
  course_run_ref: string;
  lesson_ref: string;
  lesson_title: string;
  teacher_ref: string;
  teaching_plan_revision_ref: string;
  calendar_event_ref: string | null;
  actual_start_at: Date;
  actual_end_at: Date;
  steps: DeliveryStepInput[];
  pace_notes: string;
  unresolved_questions: string[];
  follow_up_notes: string;
  parent_revision_ref: string | null;
  confirmed_by: string | null;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toDeliveryRevision(row: DeliveryRevisionRow): LessonDeliveryRevision {
  return LessonDeliveryRevisionSchema.parse({
    deliveryRevisionRef: row.delivery_revision_ref,
    deliveryRef: row.delivery_ref,
    revisionNumber: row.revision_number,
    revisionVersion: row.revision_version,
    status: row.revision_status,
    tenantRef: row.tenant_ref,
    courseRunRef: row.course_run_ref,
    lessonRef: row.lesson_ref,
    lessonTitle: row.lesson_title,
    teacherRef: row.teacher_ref,
    teachingPlanRevisionRef: row.teaching_plan_revision_ref,
    calendarEventRef: row.calendar_event_ref,
    actualStartAt: row.actual_start_at.toISOString(),
    actualEndAt: row.actual_end_at.toISOString(),
    steps: row.steps,
    paceNotes: row.pace_notes,
    unresolvedQuestions: row.unresolved_questions,
    followUpNotes: row.follow_up_notes,
    parentRevisionRef: row.parent_revision_ref,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  });
}

const observationRevisionSelect = `SELECT revision.observation_revision_ref,
  revision.observation_ref, revision.revision_number, revision.revision_version,
  revision.revision_status, observation.tenant_ref, observation.course_run_ref,
  observation.lesson_ref, revision.delivery_revision_ref,
  revision.observation_scope, revision.scope_ref, revision.observation_type,
  revision.observation_content, revision.observed_at, observation.teacher_ref,
  revision.parent_revision_ref, revision.confirmed_by, revision.confirmed_at,
  revision.created_at, revision.updated_at`;

interface ObservationRevisionRow {
  observation_revision_ref: string;
  observation_ref: string;
  revision_number: number;
  revision_version: number;
  revision_status: ClassroomObservationRevision["status"];
  tenant_ref: string;
  course_run_ref: string;
  lesson_ref: string;
  delivery_revision_ref: string;
  observation_scope: ClassroomObservationRevision["scope"];
  scope_ref: string | null;
  observation_type: ClassroomObservationRevision["observationType"];
  observation_content: string;
  observed_at: Date;
  teacher_ref: string;
  parent_revision_ref: string | null;
  confirmed_by: string | null;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toObservationRevision(row: ObservationRevisionRow): ClassroomObservationRevision {
  return ClassroomObservationRevisionSchema.parse({
    observationRevisionRef: row.observation_revision_ref,
    observationRef: row.observation_ref,
    revisionNumber: row.revision_number,
    revisionVersion: row.revision_version,
    status: row.revision_status,
    tenantRef: row.tenant_ref,
    courseRunRef: row.course_run_ref,
    lessonRef: row.lesson_ref,
    deliveryRevisionRef: row.delivery_revision_ref,
    scope: row.observation_scope,
    scopeRef: row.scope_ref,
    observationType: row.observation_type,
    content: row.observation_content,
    observedAt: row.observed_at.toISOString(),
    teacherRef: row.teacher_ref,
    parentRevisionRef: row.parent_revision_ref,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  });
}

interface MoveRow {
  move_ref: string;
  delivery_revision_ref: string;
  step_key: string;
  sequence: number;
  title: string;
  disposition: ObservedPedagogicalMove["disposition"];
  actual_description: string;
  observed_at: Date;
  confirmed_by: string;
}

interface DecisionRow {
  decision_ref: string;
  move_ref: string;
  decision_type: InstructionalDecision["decisionType"];
  rationale: string;
  decided_at: Date;
  decided_by: string;
}

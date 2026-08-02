import {
  TaskWorkingSetSchema,
  type FormalWriteMetadata,
  type FormalWriteReceipt,
  type TaskWorkingSet
} from "@edu-agent/contracts";

import type { PostgresClient, SqlExecutor } from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues,
  toPostgresJson
} from "../../../platform/postgres/write-context.js";

type WorkMetadata = FormalWriteMetadata & { owner: "work" };

export interface StoredReflectionTask {
  taskRef: string;
  tenantRef: string;
  reflectionRef: string;
  lessonRef: string;
  status: "draft" | "generating" | "draft_ready" | "confirmed" | "cancelled";
  version: number;
  currentModelExecutionRef: string | null;
  workingSet: TaskWorkingSet;
  actorRef: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReflectionFollowUpRecord {
  followUpRef: string;
  reflectionRevisionRef: string;
  actionType: "lesson_preparation" | "assignment_draft" | "teacher_todo";
  targetRef: string;
  targetStatus: string;
  deepLink: string;
  createdAt: string;
}

export class PostgresGate29WorkRepository {
  async attachReflectionContextToPreparationTask(
    client: PostgresClient,
    input: {
      taskRef: string;
      expectedWorkingSetVersion: number;
      reflectionRef: string;
      deliveryRevisionRef: string;
      observationRevisionRefs: string[];
      evidenceRefs: string[];
      sourceResourceRefs: string[];
      revisionRef: string;
      metadata: WorkMetadata;
    }
  ): Promise<FormalWriteReceipt | undefined> {
    const result = await client.query<{
      current_version: number;
      course_run_ref: string;
      curriculum_unit_ref: string;
      lesson_ref: string;
      learning_objective_refs: string[];
      baseline_teaching_plan_ref: string | null;
      source_lesson_ref: string | null;
      source_assignment_ref: string | null;
      source_assignment_item_refs: string[];
      source_todo_ref: string | null;
      context_purpose: string;
      requested_field_mask: string[];
    }>(
      `UPDATE work.task_working_set
          SET current_version = current_version + 1,
              evidence_refs = $3::jsonb,
              source_resource_refs = $4::jsonb,
              source_reflection_ref = $5,
              source_delivery_revision_ref = $6,
              source_observation_revision_refs = $7::jsonb,
              updated_by = $8,
              updated_at = $9::timestamptz
        WHERE task_ref = $1 AND current_version = $2
        RETURNING current_version, course_run_ref, curriculum_unit_ref,
                  lesson_ref, learning_objective_refs,
                  baseline_teaching_plan_ref, source_lesson_ref,
                  source_assignment_ref, source_assignment_item_refs,
                  source_todo_ref, context_purpose, requested_field_mask`,
      [
        input.taskRef,
        input.expectedWorkingSetVersion,
        toPostgresJson(input.evidenceRefs),
        toPostgresJson(input.sourceResourceRefs),
        input.reflectionRef,
        input.deliveryRevisionRef,
        toPostgresJson(input.observationRevisionRefs),
        input.metadata.actorRef,
        input.metadata.createdAt
      ]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    await client.query(
      `INSERT INTO work.task_working_set_revision (
         working_set_revision_ref, task_ref, working_set_version,
         course_run_ref, curriculum_unit_ref, lesson_ref,
         learning_objective_refs, evidence_refs, baseline_teaching_plan_ref,
         source_lesson_ref, source_assignment_ref, source_assignment_item_refs,
         source_todo_ref, source_resource_refs, source_reflection_ref,
         source_delivery_revision_ref, source_observation_revision_refs,
         context_purpose, requested_field_mask,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11,
         $12::jsonb, $13, $14::jsonb, $15, $16, $17::jsonb, $18, $19::jsonb,
         $20, $21, $22, $23, $24, $25, $26
       )`,
      [
        input.revisionRef,
        input.taskRef,
        row.current_version,
        row.course_run_ref,
        row.curriculum_unit_ref,
        row.lesson_ref,
        toPostgresJson(row.learning_objective_refs),
        toPostgresJson(input.evidenceRefs),
        row.baseline_teaching_plan_ref,
        row.source_lesson_ref,
        row.source_assignment_ref,
        toPostgresJson(row.source_assignment_item_refs),
        row.source_todo_ref,
        toPostgresJson(input.sourceResourceRefs),
        input.reflectionRef,
        input.deliveryRevisionRef,
        toPostgresJson(input.observationRevisionRefs),
        row.context_purpose,
        toPostgresJson(row.requested_field_mask),
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: input.revisionRef,
      recordType: "TaskWorkingSet",
      metadata: input.metadata
    });
  }

  async insertReflectionTask(
    client: PostgresClient,
    input: {
      taskRef: string;
      tenantRef: string;
      reflectionRef: string;
      lessonRef: string;
      title: string;
      actorRef: string;
      workingSet: Omit<TaskWorkingSet, "taskRef" | "version" | "updatedAt">;
      taskMetadata: WorkMetadata;
      detailsMetadata: WorkMetadata;
      workingSetMetadata: WorkMetadata;
      outboxRef: string;
      outboxMetadata: WorkMetadata;
    }
  ): Promise<FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO work.task (
         task_ref, title, status, task_kind, version, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, 'draft', 'lesson_reflection', 1, $3::timestamptz,
         $4, $5, $6, $7, $8, $9, $10
       )`,
      [input.taskRef, input.title, input.taskMetadata.createdAt, ...formalMetadataValues(input.taskMetadata)]
    );
    await client.query(
      `INSERT INTO work.lesson_reflection_task_details (
         task_ref, tenant_ref, reflection_ref, lesson_ref, reflection_status,
         current_model_execution_ref, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, 'draft', NULL, $5::timestamptz,
         $6, $7, $8, $9, $10, $11, $12
       )`,
      [
        input.taskRef,
        input.tenantRef,
        input.reflectionRef,
        input.lessonRef,
        input.detailsMetadata.createdAt,
        ...formalMetadataValues(input.detailsMetadata)
      ]
    );
    await client.query(
      `INSERT INTO work.task_working_set (
         task_ref, current_version, course_run_ref, curriculum_unit_ref,
         lesson_ref, learning_objective_refs, evidence_refs,
         baseline_teaching_plan_ref, source_lesson_ref,
         source_assignment_ref, source_assignment_item_refs,
         source_todo_ref, source_resource_refs, source_reflection_ref,
         source_delivery_revision_ref, source_observation_revision_refs,
         context_purpose, requested_field_mask, updated_by, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, 1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10::jsonb,
         $11, $12::jsonb, $13, $14, $15::jsonb, $16, $17::jsonb, $18, $19,
         $20, $21, $22, $23, $24, $25, $26
       )`,
      [
        input.taskRef,
        input.workingSet.courseRunRef,
        input.workingSet.curriculumUnitRef,
        input.workingSet.lessonRef,
        toPostgresJson(input.workingSet.learningObjectiveRefs),
        toPostgresJson(input.workingSet.evidenceRefs),
        input.workingSet.baselineTeachingPlanRef,
        input.workingSet.sourceLessonRef ?? null,
        input.workingSet.sourceAssignmentRef ?? null,
        toPostgresJson(input.workingSet.sourceAssignmentItemRefs ?? []),
        input.workingSet.sourceTodoRef ?? null,
        toPostgresJson(input.workingSet.sourceResourceRefs ?? []),
        input.workingSet.sourceReflectionRef ?? null,
        input.workingSet.sourceDeliveryRevisionRef ?? null,
        toPostgresJson(input.workingSet.sourceObservationRevisionRefs ?? []),
        input.workingSet.purpose,
        toPostgresJson(input.workingSet.requestedFieldMask),
        input.actorRef,
        input.workingSetMetadata.createdAt,
        ...formalMetadataValues(input.workingSetMetadata)
      ]
    );
    await client.query(
      `INSERT INTO work.task_working_set_revision (
         working_set_revision_ref, task_ref, working_set_version,
         course_run_ref, curriculum_unit_ref, lesson_ref,
         learning_objective_refs, evidence_refs, baseline_teaching_plan_ref,
         source_lesson_ref, source_assignment_ref, source_assignment_item_refs,
         source_todo_ref, source_resource_refs, source_reflection_ref,
         source_delivery_revision_ref, source_observation_revision_refs,
         context_purpose, requested_field_mask,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, 1, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11::jsonb,
         $12, $13::jsonb, $14, $15, $16::jsonb, $17, $18::jsonb,
         $19, $20, $21, $22, $23, $24, $25
       )`,
      [
        `working-set-revision:${input.taskRef}:1`,
        input.taskRef,
        input.workingSet.courseRunRef,
        input.workingSet.curriculumUnitRef,
        input.workingSet.lessonRef,
        toPostgresJson(input.workingSet.learningObjectiveRefs),
        toPostgresJson(input.workingSet.evidenceRefs),
        input.workingSet.baselineTeachingPlanRef,
        input.workingSet.sourceLessonRef ?? null,
        input.workingSet.sourceAssignmentRef ?? null,
        toPostgresJson(input.workingSet.sourceAssignmentItemRefs ?? []),
        input.workingSet.sourceTodoRef ?? null,
        toPostgresJson(input.workingSet.sourceResourceRefs ?? []),
        input.workingSet.sourceReflectionRef ?? null,
        input.workingSet.sourceDeliveryRevisionRef ?? null,
        toPostgresJson(input.workingSet.sourceObservationRevisionRefs ?? []),
        input.workingSet.purpose,
        toPostgresJson(input.workingSet.requestedFieldMask),
        ...formalMetadataValues(input.workingSetMetadata)
      ]
    );
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: "LessonReflectionTaskCreated",
      aggregateRef: input.taskRef,
      payload: { reflectionRef: input.reflectionRef, lessonRef: input.lessonRef },
      metadata: input.outboxMetadata
    });
    return [
      createReceipt({ writeRef: input.taskRef, recordType: "Task", metadata: input.taskMetadata }),
      createReceipt({ writeRef: input.taskRef, recordType: "LessonReflectionTaskDetails", metadata: input.detailsMetadata }),
      createReceipt({ writeRef: `working-set-revision:${input.taskRef}:1`, recordType: "TaskWorkingSet", metadata: input.workingSetMetadata }),
      createReceipt({ writeRef: input.outboxRef, recordType: "OutboxRecord", metadata: input.outboxMetadata })
    ];
  }

  async getReflectionTask(
    executor: SqlExecutor,
    tenantRef: string,
    reflectionRef: string
  ): Promise<StoredReflectionTask | undefined> {
    const result = await executor.query<ReflectionTaskRow>(
      `${reflectionTaskSelect}
        WHERE details.tenant_ref = $1 AND details.reflection_ref = $2`,
      [tenantRef, reflectionRef]
    );
    return result.rows[0] ? toReflectionTask(result.rows[0]) : undefined;
  }

  async getReflectionTaskByTaskRef(
    executor: SqlExecutor,
    tenantRef: string,
    taskRef: string
  ): Promise<StoredReflectionTask | undefined> {
    const result = await executor.query<ReflectionTaskRow>(
      `${reflectionTaskSelect}
        WHERE details.tenant_ref = $1 AND details.task_ref = $2`,
      [tenantRef, taskRef]
    );
    return result.rows[0] ? toReflectionTask(result.rows[0]) : undefined;
  }

  async setReflectionTaskStatus(
    client: PostgresClient,
    input: {
      taskRef: string;
      fromStatuses: readonly string[];
      toStatus: StoredReflectionTask["status"];
      modelExecutionRef?: string | null;
      updatedAt: string;
    }
  ): Promise<boolean> {
    const result = await client.query(
      `UPDATE work.lesson_reflection_task_details
          SET reflection_status = $3,
              current_model_execution_ref = COALESCE($4, current_model_execution_ref),
              updated_at = $5::timestamptz
        WHERE task_ref = $1 AND reflection_status = ANY($2::text[])`,
      [input.taskRef, input.fromStatuses, input.toStatus, input.modelExecutionRef ?? null, input.updatedAt]
    );
    if ((result.rowCount ?? 0) > 0) {
      await client.query(
        `UPDATE work.task
            SET status = $2, version = version + 1, updated_at = $3::timestamptz
          WHERE task_ref = $1`,
        [input.taskRef, input.toStatus, input.updatedAt]
      );
      return true;
    }
    return false;
  }

  async insertFollowUp(
    client: PostgresClient,
    input: {
      followUpRef: string;
      tenantRef: string;
      teacherRef: string;
      reflectionRevisionRef: string;
      actionType: ReflectionFollowUpRecord["actionType"];
      targetRef: string;
      targetStatus: string;
      deepLink: string;
      metadata: WorkMetadata;
      outboxRef: string;
      outboxMetadata: WorkMetadata;
    }
  ): Promise<FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO work.reflection_follow_up_link (
         follow_up_ref, tenant_ref, teacher_ref, reflection_revision_ref,
         action_type, target_ref, target_status, deep_link,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15
       )`,
      [
        input.followUpRef,
        input.tenantRef,
        input.teacherRef,
        input.reflectionRevisionRef,
        input.actionType,
        input.targetRef,
        input.targetStatus,
        input.deepLink,
        ...formalMetadataValues(input.metadata)
      ]
    );
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: "LessonReflectionFollowUpCreated",
      aggregateRef: input.reflectionRevisionRef,
      payload: {
        followUpRef: input.followUpRef,
        actionType: input.actionType,
        targetRef: input.targetRef
      },
      metadata: input.outboxMetadata
    });
    return [
      createReceipt({ writeRef: input.followUpRef, recordType: "ReflectionFollowUpLink", metadata: input.metadata }),
      createReceipt({ writeRef: input.outboxRef, recordType: "OutboxRecord", metadata: input.outboxMetadata })
    ];
  }

  async listFollowUps(
    executor: SqlExecutor,
    tenantRef: string,
    teacherRef: string,
    reflectionRevisionRefs: readonly string[]
  ): Promise<ReflectionFollowUpRecord[]> {
    if (reflectionRevisionRefs.length === 0) return [];
    const result = await executor.query<FollowUpRow>(
      `SELECT follow_up_ref, reflection_revision_ref, action_type,
              target_ref, target_status, deep_link, created_at
         FROM work.reflection_follow_up_link
        WHERE tenant_ref = $1 AND teacher_ref = $2
          AND reflection_revision_ref = ANY($3::text[])
        ORDER BY created_at, follow_up_ref`,
      [tenantRef, teacherRef, reflectionRevisionRefs]
    );
    return result.rows.map((row) => ({
      followUpRef: row.follow_up_ref,
      reflectionRevisionRef: row.reflection_revision_ref,
      actionType: row.action_type,
      targetRef: row.target_ref,
      targetStatus: row.target_status,
      deepLink: row.deep_link,
      createdAt: row.created_at.toISOString()
    }));
  }

  private async insertOutbox(
    client: PostgresClient,
    input: {
      outboxRef: string;
      eventName: string;
      aggregateRef: string;
      payload: Record<string, unknown>;
      metadata: WorkMetadata;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO work.outbox_record (
         outbox_ref, event_name, aggregate_ref, payload,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)`,
      [input.outboxRef, input.eventName, input.aggregateRef, toPostgresJson(input.payload), ...formalMetadataValues(input.metadata)]
    );
  }
}

const reflectionTaskSelect = `SELECT task.task_ref, details.tenant_ref,
  details.reflection_ref, details.lesson_ref, details.reflection_status,
  details.current_model_execution_ref, task.version, task.actor_ref,
  task.created_at, task.updated_at, working_set.current_version,
  working_set.course_run_ref, working_set.curriculum_unit_ref,
  working_set.learning_objective_refs, working_set.evidence_refs,
  working_set.baseline_teaching_plan_ref, working_set.source_lesson_ref,
  working_set.source_assignment_ref, working_set.source_assignment_item_refs,
  working_set.source_todo_ref, working_set.source_resource_refs,
  working_set.source_reflection_ref, working_set.source_delivery_revision_ref,
  working_set.source_observation_revision_refs, working_set.context_purpose,
  working_set.requested_field_mask, working_set.updated_at AS working_set_updated_at
  FROM work.lesson_reflection_task_details AS details
  JOIN work.task AS task ON task.task_ref = details.task_ref
  JOIN work.task_working_set AS working_set ON working_set.task_ref = task.task_ref`;

interface ReflectionTaskRow {
  task_ref: string;
  tenant_ref: string;
  reflection_ref: string;
  lesson_ref: string;
  reflection_status: StoredReflectionTask["status"];
  current_model_execution_ref: string | null;
  version: number;
  actor_ref: string;
  created_at: Date;
  updated_at: Date;
  current_version: number;
  course_run_ref: string;
  curriculum_unit_ref: string;
  learning_objective_refs: string[];
  evidence_refs: string[];
  baseline_teaching_plan_ref: string | null;
  source_lesson_ref: string | null;
  source_assignment_ref: string | null;
  source_assignment_item_refs: string[];
  source_todo_ref: string | null;
  source_resource_refs: string[];
  source_reflection_ref: string | null;
  source_delivery_revision_ref: string | null;
  source_observation_revision_refs: string[];
  context_purpose: string;
  requested_field_mask: string[];
  working_set_updated_at: Date;
}

function toReflectionTask(row: ReflectionTaskRow): StoredReflectionTask {
  return {
    taskRef: row.task_ref,
    tenantRef: row.tenant_ref,
    reflectionRef: row.reflection_ref,
    lessonRef: row.lesson_ref,
    status: row.reflection_status,
    version: row.version,
    currentModelExecutionRef: row.current_model_execution_ref,
    workingSet: TaskWorkingSetSchema.parse({
      taskRef: row.task_ref,
      version: row.current_version,
      courseRunRef: row.course_run_ref,
      curriculumUnitRef: row.curriculum_unit_ref,
      lessonRef: row.lesson_ref,
      learningObjectiveRefs: row.learning_objective_refs,
      evidenceRefs: row.evidence_refs,
      baselineTeachingPlanRef: row.baseline_teaching_plan_ref,
      sourceLessonRef: row.source_lesson_ref,
      sourceAssignmentRef: row.source_assignment_ref,
      sourceAssignmentItemRefs: row.source_assignment_item_refs,
      sourceTodoRef: row.source_todo_ref,
      sourceResourceRefs: row.source_resource_refs,
      sourceReflectionRef: row.source_reflection_ref,
      sourceDeliveryRevisionRef: row.source_delivery_revision_ref,
      sourceObservationRevisionRefs: row.source_observation_revision_refs,
      purpose: row.context_purpose,
      requestedFieldMask: row.requested_field_mask,
      updatedAt: row.working_set_updated_at.toISOString()
    }),
    actorRef: row.actor_ref,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

interface FollowUpRow {
  follow_up_ref: string;
  reflection_revision_ref: string;
  action_type: ReflectionFollowUpRecord["actionType"];
  target_ref: string;
  target_status: string;
  deep_link: string;
  created_at: Date;
}

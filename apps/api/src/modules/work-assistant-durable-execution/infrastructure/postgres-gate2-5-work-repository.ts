import type {
  FormalWriteMetadata,
  FormalWriteReceipt,
  LessonPreparationStatus,
  TaskWorkingSet,
  TeacherTaskRequest
} from "@edu-agent/contracts";
import {
  TaskWorkingSetSchema,
  TeacherTaskRequestSchema
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

type WorkMetadata = FormalWriteMetadata & { owner: "work" };

export interface StoredLessonPreparationTask {
  taskRef: string;
  tenantRef: string;
  title: string;
  status: LessonPreparationStatus;
  version: number;
  courseRunRef: string;
  curriculumUnitRef: string;
  lessonRef: string;
  dueAt: string | null;
  priority: "low" | "normal" | "high";
  approvedPlanRef: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  workingSet: TaskWorkingSet;
  latestProposalRevisionRef: string | null;
  latestTaskRunRef: string | null;
}

export interface StoredPreparationHistory {
  historyRef: string;
  taskRef: string;
  fromStatus: LessonPreparationStatus | null;
  toStatus: LessonPreparationStatus;
  taskVersion: number;
  reason: string;
  actorRef: string;
  occurredAt: string;
}

export class PostgresGate25WorkRepository {
  async insertLessonPreparationTask(
    client: PostgresClient,
    input: {
      taskRef: string;
      tenantRef: string;
      title: string;
      caseRef?: string;
      goalRef?: string;
      courseRunRef: string;
      curriculumUnitRef: string;
      lessonRef: string;
      dueAt: string | null;
      priority: "low" | "normal" | "high";
      createdBy: string;
      workingSet: Omit<
        TaskWorkingSet,
        "taskRef" | "version" | "updatedAt"
      >;
      metadata: {
        task: WorkMetadata;
        details: WorkMetadata;
        workingSetRevision: WorkMetadata;
        history: WorkMetadata;
        outbox: WorkMetadata;
      };
      outboxRef: string;
      historyRef: string;
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    const createdAt = input.metadata.task.createdAt;
    await client.query(
      `INSERT INTO work.task (
         task_ref, title, status, task_kind, case_ref, goal_ref,
         request_payload, request_version, version, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, 'planned', 'lesson_preparation', $3, $4,
         $5, 1, 1, $6,
         $7, $8, $9, $10, $11, $12, $13
       )`,
      [
        input.taskRef,
        input.title,
        input.caseRef ?? null,
        input.goalRef ?? null,
        toPostgresJson({
          lessonRef: input.lessonRef,
          purpose: "lesson-preparation.create"
        }),
        createdAt,
        ...formalMetadataValues(input.metadata.task)
      ]
    );
    await client.query(
      `INSERT INTO work.lesson_preparation_task_details (
         task_ref, tenant_ref, course_run_ref, curriculum_unit_ref,
         lesson_ref, due_at, priority, preparation_status,
         approved_plan_ref, created_by,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'planned',
         NULL, $8,
         $9, $10, $11, $12, $13, $14, $15, $15
       )`,
      [
        input.taskRef,
        input.tenantRef,
        input.courseRunRef,
        input.curriculumUnitRef,
        input.lessonRef,
        input.dueAt,
        input.priority,
        input.createdBy,
        ...formalMetadataValues(input.metadata.details)
      ]
    );
    await client.query(
      `INSERT INTO work.task_working_set (
         task_ref, current_version, course_run_ref,
         curriculum_unit_ref, lesson_ref, learning_objective_refs,
         evidence_refs, baseline_teaching_plan_ref,
         source_lesson_ref, source_assignment_ref,
         source_assignment_item_refs, source_todo_ref,
         source_resource_refs, source_reflection_ref,
         source_delivery_revision_ref, source_observation_revision_refs,
         context_purpose,
         requested_field_mask, updated_by, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
         $22, $23, $24, $25, $26
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
        toPostgresJson(
          input.workingSet.sourceAssignmentItemRefs ?? []
        ),
        input.workingSet.sourceTodoRef ?? null,
        toPostgresJson(input.workingSet.sourceResourceRefs ?? []),
        input.workingSet.sourceReflectionRef ?? null,
        input.workingSet.sourceDeliveryRevisionRef ?? null,
        toPostgresJson(
          input.workingSet.sourceObservationRevisionRefs ?? []
        ),
        input.workingSet.purpose,
        toPostgresJson(input.workingSet.requestedFieldMask),
        input.createdBy,
        createdAt,
        ...formalMetadataValues(
          input.metadata.workingSetRevision
        )
      ]
    );
    await this.insertWorkingSetRevision(client, {
      revisionRef: `working-set-revision:${input.taskRef}:1`,
      taskRef: input.taskRef,
      version: 1,
      workingSet: input.workingSet,
      metadata: input.metadata.workingSetRevision
    });
    await this.insertHistory(client, {
      historyRef: input.historyRef,
      taskRef: input.taskRef,
      fromStatus: null,
      toStatus: "planned",
      taskVersion: 1,
      reason: "备课任务已创建",
      metadata: input.metadata.history
    });
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: "LessonPreparationTaskCreated",
      aggregateRef: input.taskRef,
      payload: {
        taskRef: input.taskRef,
        lessonRef: input.lessonRef,
        status: "planned",
        version: 1
      },
      metadata: input.metadata.outbox
    });
    return [
      createReceipt({
        writeRef: input.taskRef,
        recordType: "Task",
        metadata: input.metadata.task
      }),
      createReceipt({
        writeRef: input.taskRef,
        recordType: "LessonPreparationTaskDetails",
        metadata: input.metadata.details
      }),
      createReceipt({
        writeRef: `working-set-revision:${input.taskRef}:1`,
        recordType: "TaskWorkingSet",
        metadata: input.metadata.workingSetRevision
      }),
      createReceipt({
        writeRef: input.historyRef,
        recordType: "PreparationStatusHistory",
        metadata: input.metadata.history
      }),
      createReceipt({
        writeRef: input.outboxRef,
        recordType: "OutboxRecord",
        metadata: input.metadata.outbox
      })
    ];
  }

  async listPreparationTasks(
    executor: SqlExecutor,
    tenantRef: string
  ): Promise<StoredLessonPreparationTask[]> {
    const result = await executor.query<PreparationTaskRow>(
      `${preparationTaskSelect}
        WHERE details.tenant_ref = $1
        ORDER BY task.updated_at DESC, task.task_ref`,
      [tenantRef]
    );
    return result.rows.map(toPreparationTask);
  }

  async getPreparationTask(
    executor: SqlExecutor,
    tenantRef: string,
    taskRef: string
  ): Promise<StoredLessonPreparationTask | undefined> {
    const result = await executor.query<PreparationTaskRow>(
      `${preparationTaskSelect}
        WHERE details.tenant_ref = $1
          AND task.task_ref = $2`,
      [tenantRef, taskRef]
    );
    return result.rows[0]
      ? toPreparationTask(result.rows[0])
      : undefined;
  }

  async lockPreparationTask(
    client: PostgresClient,
    tenantRef: string,
    taskRef: string
  ): Promise<StoredLessonPreparationTask | undefined> {
    const locked = await client.query(
      `SELECT task.task_ref
         FROM work.task AS task
         JOIN work.lesson_preparation_task_details AS details
           ON details.task_ref = task.task_ref
        WHERE details.tenant_ref = $1
          AND task.task_ref = $2
        FOR UPDATE OF task`,
      [tenantRef, taskRef]
    );
    if (!locked.rows[0]) return undefined;
    return this.getPreparationTask(client, tenantRef, taskRef);
  }

  async findOpenTaskForLesson(
    executor: SqlExecutor,
    tenantRef: string,
    lessonRef: string
  ): Promise<StoredLessonPreparationTask | undefined> {
    const result = await executor.query<PreparationTaskRow>(
      `${preparationTaskSelect}
        WHERE details.tenant_ref = $1
          AND details.lesson_ref = $2
          AND task.status NOT IN ('completed', 'cancelled')
        ORDER BY task.updated_at DESC
        LIMIT 1`,
      [tenantRef, lessonRef]
    );
    return result.rows[0]
      ? toPreparationTask(result.rows[0])
      : undefined;
  }

  async listHistory(
    executor: SqlExecutor,
    taskRef: string
  ): Promise<StoredPreparationHistory[]> {
    const result = await executor.query<PreparationHistoryRow>(
      `SELECT history_ref, task_ref, from_status, to_status,
              task_version, reason, actor_ref, created_at
         FROM work.preparation_status_history
        WHERE task_ref = $1
        ORDER BY task_version, created_at`,
      [taskRef]
    );
    return result.rows.map((row) => ({
      historyRef: row.history_ref,
      taskRef: row.task_ref,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      taskVersion: row.task_version,
      reason: row.reason,
      actorRef: row.actor_ref,
      occurredAt: row.created_at.toISOString()
    }));
  }

  async transition(
    client: PostgresClient,
    input: {
      taskRef: string;
      fromStatus: LessonPreparationStatus;
      toStatus: LessonPreparationStatus;
      expectedVersion: number;
      reason: string;
      approvedPlanRef?: string;
      historyRef: string;
      outboxRef: string;
      eventName: string;
      metadata: {
        transition: WorkMetadata;
        history: WorkMetadata;
        outbox: WorkMetadata;
      };
    }
  ): Promise<{
    version: number;
    receipts: readonly FormalWriteReceipt[];
  }> {
    const nextVersion = input.expectedVersion + 1;
    if (input.approvedPlanRef !== undefined) {
      await client.query(
        `UPDATE work.lesson_preparation_task_details
            SET approved_plan_ref = $2
          WHERE task_ref = $1`,
        [input.taskRef, input.approvedPlanRef]
      );
    }
    const updated = await client.query(
      `UPDATE work.task
          SET status = $2,
              version = $3,
              updated_at = $4
        WHERE task_ref = $1
          AND status = $5
          AND version = $6`,
      [
        input.taskRef,
        input.toStatus,
        nextVersion,
        input.metadata.transition.createdAt,
        input.fromStatus,
        input.expectedVersion
      ]
    );
    if (updated.rowCount !== 1) {
      throw new Error("LESSON_PREPARATION_TRANSITION_CONFLICT");
    }
    await this.insertHistory(client, {
      historyRef: input.historyRef,
      taskRef: input.taskRef,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      taskVersion: nextVersion,
      reason: input.reason,
      metadata: input.metadata.history
    });
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName: input.eventName,
      aggregateRef: input.taskRef,
      payload: {
        taskRef: input.taskRef,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        version: nextVersion,
        approvedPlanRef: input.approvedPlanRef ?? null
      },
      metadata: input.metadata.outbox
    });
    return {
      version: nextVersion,
      receipts: [
        createReceipt({
          writeRef: input.taskRef,
          recordType: "LessonPreparationTaskTransition",
          metadata: input.metadata.transition
        }),
        createReceipt({
          writeRef: input.historyRef,
          recordType: "PreparationStatusHistory",
          metadata: input.metadata.history
        }),
        createReceipt({
          writeRef: input.outboxRef,
          recordType: "OutboxRecord",
          metadata: input.metadata.outbox
        })
      ]
    };
  }

  async replaceWorkingSet(
    client: PostgresClient,
    input: {
      taskRef: string;
      expectedVersion: number;
      evidenceRefs: readonly string[];
      revisionRef: string;
      metadata: WorkMetadata;
    }
  ): Promise<{
    workingSet: TaskWorkingSet;
    receipt: FormalWriteReceipt;
  }> {
    const current = await client.query<WorkingSetRow>(
      `SELECT task_ref, current_version, course_run_ref,
              curriculum_unit_ref, lesson_ref,
              learning_objective_refs, evidence_refs,
              baseline_teaching_plan_ref, source_lesson_ref,
              source_assignment_ref, source_assignment_item_refs,
              source_todo_ref, source_resource_refs,
              source_reflection_ref, source_delivery_revision_ref,
              source_observation_revision_refs,
              context_purpose,
              requested_field_mask, updated_at
         FROM work.task_working_set
        WHERE task_ref = $1
        FOR UPDATE`,
      [input.taskRef]
    );
    const row = current.rows[0];
    if (!row || row.current_version !== input.expectedVersion) {
      throw new Error("TASK_WORKING_SET_VERSION_CONFLICT");
    }
    const nextVersion = input.expectedVersion + 1;
    const revisionInput = {
      courseRunRef: row.course_run_ref,
      curriculumUnitRef: row.curriculum_unit_ref,
      lessonRef: row.lesson_ref,
      learningObjectiveRefs: row.learning_objective_refs,
      evidenceRefs: [...new Set(input.evidenceRefs)],
      baselineTeachingPlanRef:
        row.baseline_teaching_plan_ref,
      sourceLessonRef: row.source_lesson_ref,
      sourceAssignmentRef: row.source_assignment_ref,
      sourceAssignmentItemRefs: row.source_assignment_item_refs,
      sourceTodoRef: row.source_todo_ref,
      sourceResourceRefs: row.source_resource_refs,
      sourceReflectionRef: row.source_reflection_ref,
      sourceDeliveryRevisionRef: row.source_delivery_revision_ref,
      sourceObservationRevisionRefs: row.source_observation_revision_refs,
      purpose: row.context_purpose,
      requestedFieldMask: row.requested_field_mask
    };
    await this.insertWorkingSetRevision(client, {
      revisionRef: input.revisionRef,
      taskRef: input.taskRef,
      version: nextVersion,
      workingSet: revisionInput,
      metadata: input.metadata
    });
    await client.query(
      `UPDATE work.task_working_set
          SET current_version = $2,
              evidence_refs = $3,
              updated_by = $4,
              updated_at = $5,
              actor_ref = $6,
              purpose = $7,
              owner_module = $8,
              idempotency_key = $9,
              authorization_decision_ref = $10,
              audit_ref = $11
        WHERE task_ref = $1`,
      [
        input.taskRef,
        nextVersion,
        toPostgresJson(revisionInput.evidenceRefs),
        input.metadata.actorRef,
        input.metadata.createdAt,
        input.metadata.actorRef,
        input.metadata.purpose,
        input.metadata.owner,
        input.metadata.idempotencyKey,
        input.metadata.authorizationDecisionRef,
        input.metadata.auditRef
      ]
    );
    return {
      workingSet: TaskWorkingSetSchema.parse({
        taskRef: input.taskRef,
        version: nextVersion,
        ...revisionInput,
        updatedAt: input.metadata.createdAt
      }),
      receipt: createReceipt({
        writeRef: input.revisionRef,
        recordType: "TaskWorkingSet",
        metadata: input.metadata
      })
    };
  }

  async replaceBaselineTeachingPlan(
    client: PostgresClient,
    input: {
      taskRef: string;
      expectedVersion: number;
      baselineTeachingPlanRef: string;
      revisionRef: string;
      metadata: WorkMetadata;
    }
  ): Promise<{
    workingSet: TaskWorkingSet;
    receipt: FormalWriteReceipt;
  }> {
    const current = await client.query<WorkingSetRow>(
      `SELECT task_ref, current_version, course_run_ref,
              curriculum_unit_ref, lesson_ref,
              learning_objective_refs, evidence_refs,
              baseline_teaching_plan_ref, source_lesson_ref,
              source_assignment_ref, source_assignment_item_refs,
              source_todo_ref, source_resource_refs,
              source_reflection_ref, source_delivery_revision_ref,
              source_observation_revision_refs,
              context_purpose,
              requested_field_mask, updated_at
         FROM work.task_working_set
        WHERE task_ref = $1
        FOR UPDATE`,
      [input.taskRef]
    );
    const row = current.rows[0];
    if (!row || row.current_version !== input.expectedVersion) {
      throw new Error("TASK_WORKING_SET_VERSION_CONFLICT");
    }
    const nextVersion = input.expectedVersion + 1;
    const revisionInput = {
      courseRunRef: row.course_run_ref,
      curriculumUnitRef: row.curriculum_unit_ref,
      lessonRef: row.lesson_ref,
      learningObjectiveRefs: row.learning_objective_refs,
      evidenceRefs: row.evidence_refs,
      baselineTeachingPlanRef: input.baselineTeachingPlanRef,
      sourceLessonRef: row.source_lesson_ref,
      sourceAssignmentRef: row.source_assignment_ref,
      sourceAssignmentItemRefs: row.source_assignment_item_refs,
      sourceTodoRef: row.source_todo_ref,
      sourceResourceRefs: row.source_resource_refs,
      sourceReflectionRef: row.source_reflection_ref,
      sourceDeliveryRevisionRef: row.source_delivery_revision_ref,
      sourceObservationRevisionRefs: row.source_observation_revision_refs,
      purpose: row.context_purpose,
      requestedFieldMask: row.requested_field_mask
    };
    await this.insertWorkingSetRevision(client, {
      revisionRef: input.revisionRef,
      taskRef: input.taskRef,
      version: nextVersion,
      workingSet: revisionInput,
      metadata: input.metadata
    });
    await client.query(
      `UPDATE work.task_working_set
          SET current_version = $2,
              baseline_teaching_plan_ref = $3,
              updated_by = $4,
              updated_at = $5,
              actor_ref = $6,
              purpose = $7,
              owner_module = $8,
              idempotency_key = $9,
              authorization_decision_ref = $10,
              audit_ref = $11
        WHERE task_ref = $1`,
      [
        input.taskRef,
        nextVersion,
        input.baselineTeachingPlanRef,
        input.metadata.actorRef,
        input.metadata.createdAt,
        input.metadata.actorRef,
        input.metadata.purpose,
        input.metadata.owner,
        input.metadata.idempotencyKey,
        input.metadata.authorizationDecisionRef,
        input.metadata.auditRef
      ]
    );
    return {
      workingSet: TaskWorkingSetSchema.parse({
        taskRef: input.taskRef,
        version: nextVersion,
        ...revisionInput,
        updatedAt: input.metadata.createdAt
      }),
      receipt: createReceipt({
        writeRef: input.revisionRef,
        recordType: "TaskWorkingSet",
        metadata: input.metadata
      })
    };
  }

  async nextTaskRunAttempt(
    executor: SqlExecutor,
    taskRef: string
  ): Promise<number> {
    const result = await executor.query<{ attempt: number }>(
      `SELECT COALESCE(max(attempt), 0)::integer + 1 AS attempt
         FROM work.task_run
        WHERE task_ref = $1`,
      [taskRef]
    );
    return result.rows[0]?.attempt ?? 1;
  }

  async insertTaskRun(
    client: PostgresClient,
    input: {
      taskRunRef: string;
      taskRef: string;
      attempt: number;
      status?: "queued" | "running" | "completed" | "failed";
      request: TeacherTaskRequest;
      metadata: WorkMetadata;
      outboxRef: string;
      outboxMetadata: WorkMetadata;
      outboxEventName?: string;
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    await client.query(
      `UPDATE work.task
          SET request_payload = $2,
              request_version = $3,
              updated_at = $4
        WHERE task_ref = $1`,
      [
        input.taskRef,
        toPostgresJson(input.request),
        input.request.requestVersion,
        input.metadata.createdAt
      ]
    );
    await client.query(
      `INSERT INTO work.task_run (
         task_run_ref, task_ref, attempt, status,
         request_payload, request_version,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13
       )`,
      [
        input.taskRunRef,
        input.taskRef,
        input.attempt,
        input.status ?? "completed",
        toPostgresJson(input.request),
        input.request.requestVersion,
        ...formalMetadataValues(input.metadata)
      ]
    );
    await client.query(
      `UPDATE work.task_run
          SET updated_at = $2::timestamptz,
              completed_at = CASE
                WHEN status = 'completed'
                  THEN $2::timestamptz
                ELSE NULL
              END
        WHERE task_run_ref = $1`,
      [input.taskRunRef, input.metadata.createdAt]
    );
    await this.insertOutbox(client, {
      outboxRef: input.outboxRef,
      eventName:
        input.outboxEventName ??
        "TeacherCopilotTaskRunCompleted",
      aggregateRef: input.taskRunRef,
      payload: {
        taskRef: input.taskRef,
        taskRunRef: input.taskRunRef,
        attempt: input.attempt
      },
      metadata: input.outboxMetadata
    });
    return [
      createReceipt({
        writeRef: input.taskRunRef,
        recordType: "TaskRun",
        metadata: input.metadata
      }),
      createReceipt({
        writeRef: input.outboxRef,
        recordType: "OutboxRecord",
        metadata: input.outboxMetadata
      })
    ];
  }

  async getTaskRun(
    executor: SqlExecutor,
    taskRunRef: string
  ): Promise<
    | {
        taskRunRef: string;
        taskRef: string;
        attempt: number;
        status: string;
        request: TeacherTaskRequest;
        createdAt: string;
      }
    | undefined
  > {
    const result = await executor.query<{
      task_run_ref: string;
      task_ref: string;
      attempt: number;
      status: string;
      request_payload: unknown;
      created_at: Date;
    }>(
      `SELECT task_run_ref, task_ref, attempt, status,
              request_payload, created_at
         FROM work.task_run
        WHERE task_run_ref = $1`,
      [taskRunRef]
    );
    const row = result.rows[0];
    return row
      ? {
          taskRunRef: row.task_run_ref,
          taskRef: row.task_ref,
          attempt: row.attempt,
          status: row.status,
          request: TeacherTaskRequestSchema.parse(
            row.request_payload
          ),
          createdAt: row.created_at.toISOString()
        }
      : undefined;
  }

  async updateTaskRunStatus(
    client: PostgresClient,
    input: {
      taskRunRef: string;
      status:
        | "queued"
        | "running"
        | "completed"
        | "failed"
        | "cancelled";
      updatedAt: string;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE work.task_run
          SET status = $2,
              updated_at = $3::timestamptz,
              completed_at = CASE
                WHEN $2 IN ('completed', 'failed', 'cancelled')
                  THEN $3::timestamptz
                ELSE NULL
              END
        WHERE task_run_ref = $1`,
      [input.taskRunRef, input.status, input.updatedAt]
    );
  }

  private async insertWorkingSetRevision(
    client: PostgresClient,
    input: {
      revisionRef: string;
      taskRef: string;
      version: number;
      workingSet: Omit<
        TaskWorkingSet,
        "taskRef" | "version" | "updatedAt"
      >;
      metadata: WorkMetadata;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO work.task_working_set_revision (
         working_set_revision_ref, task_ref, working_set_version,
         course_run_ref, curriculum_unit_ref, lesson_ref,
         learning_objective_refs, evidence_refs,
         baseline_teaching_plan_ref, source_lesson_ref,
         source_assignment_ref, source_assignment_item_refs,
         source_todo_ref, source_resource_refs,
         source_reflection_ref, source_delivery_revision_ref,
         source_observation_revision_refs,
         context_purpose,
         requested_field_mask,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
         $22, $23, $24, $25, $26
       )`,
      [
        input.revisionRef,
        input.taskRef,
        input.version,
        input.workingSet.courseRunRef,
        input.workingSet.curriculumUnitRef,
        input.workingSet.lessonRef,
        toPostgresJson(input.workingSet.learningObjectiveRefs),
        toPostgresJson(input.workingSet.evidenceRefs),
        input.workingSet.baselineTeachingPlanRef,
        input.workingSet.sourceLessonRef ?? null,
        input.workingSet.sourceAssignmentRef ?? null,
        toPostgresJson(
          input.workingSet.sourceAssignmentItemRefs ?? []
        ),
        input.workingSet.sourceTodoRef ?? null,
        toPostgresJson(input.workingSet.sourceResourceRefs ?? []),
        input.workingSet.sourceReflectionRef ?? null,
        input.workingSet.sourceDeliveryRevisionRef ?? null,
        toPostgresJson(
          input.workingSet.sourceObservationRevisionRefs ?? []
        ),
        input.workingSet.purpose,
        toPostgresJson(input.workingSet.requestedFieldMask),
        ...formalMetadataValues(input.metadata)
      ]
    );
  }

  private async insertHistory(
    client: PostgresClient,
    input: {
      historyRef: string;
      taskRef: string;
      fromStatus: LessonPreparationStatus | null;
      toStatus: LessonPreparationStatus;
      taskVersion: number;
      reason: string;
      metadata: WorkMetadata;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO work.preparation_status_history (
         history_ref, task_ref, from_status, to_status,
         task_version, reason,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13
       )`,
      [
        input.historyRef,
        input.taskRef,
        input.fromStatus,
        input.toStatus,
        input.taskVersion,
        input.reason,
        ...formalMetadataValues(input.metadata)
      ]
    );
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
  }
}

const preparationTaskSelect = `
  SELECT task.task_ref, details.tenant_ref, task.title,
         task.status, task.version, details.course_run_ref,
         details.curriculum_unit_ref, details.lesson_ref,
         details.due_at, details.priority, details.approved_plan_ref,
         details.created_by, task.created_at, task.updated_at,
         working_set.current_version,
         working_set.learning_objective_refs,
         working_set.evidence_refs,
         working_set.baseline_teaching_plan_ref,
         working_set.source_lesson_ref,
         working_set.source_assignment_ref,
         working_set.source_assignment_item_refs,
         working_set.source_todo_ref,
         working_set.source_resource_refs,
         working_set.source_reflection_ref,
         working_set.source_delivery_revision_ref,
         working_set.source_observation_revision_refs,
         working_set.context_purpose,
         working_set.requested_field_mask,
         (
           SELECT result.proposal_revision_ref
             FROM work.task_result AS result
             JOIN work.task_run AS run
               ON run.task_run_ref = result.task_run_ref
            WHERE result.task_ref = task.task_ref
            ORDER BY run.attempt DESC
            LIMIT 1
         ) AS latest_proposal_revision_ref,
         (
           SELECT run.task_run_ref
             FROM work.task_run AS run
            WHERE run.task_ref = task.task_ref
            ORDER BY run.attempt DESC
            LIMIT 1
         ) AS latest_task_run_ref
    FROM work.task AS task
    JOIN work.lesson_preparation_task_details AS details
      ON details.task_ref = task.task_ref
    JOIN work.task_working_set AS working_set
      ON working_set.task_ref = task.task_ref`;

interface PreparationTaskRow {
  task_ref: string;
  tenant_ref: string;
  title: string;
  status: LessonPreparationStatus;
  version: number;
  course_run_ref: string;
  curriculum_unit_ref: string;
  lesson_ref: string;
  due_at: Date | null;
  priority: "low" | "normal" | "high";
  approved_plan_ref: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  current_version: number;
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
  latest_proposal_revision_ref: string | null;
  latest_task_run_ref: string | null;
}

interface WorkingSetRow {
  task_ref: string;
  current_version: number;
  course_run_ref: string;
  curriculum_unit_ref: string;
  lesson_ref: string;
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
  updated_at: Date;
}

interface PreparationHistoryRow {
  history_ref: string;
  task_ref: string;
  from_status: LessonPreparationStatus | null;
  to_status: LessonPreparationStatus;
  task_version: number;
  reason: string;
  actor_ref: string;
  created_at: Date;
}

function toPreparationTask(
  row: PreparationTaskRow
): StoredLessonPreparationTask {
  return {
    taskRef: row.task_ref,
    tenantRef: row.tenant_ref,
    title: row.title,
    status: row.status,
    version: row.version,
    courseRunRef: row.course_run_ref,
    curriculumUnitRef: row.curriculum_unit_ref,
    lessonRef: row.lesson_ref,
    dueAt: row.due_at?.toISOString() ?? null,
    priority: row.priority,
    approvedPlanRef: row.approved_plan_ref,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    workingSet: TaskWorkingSetSchema.parse({
      taskRef: row.task_ref,
      version: row.current_version,
      courseRunRef: row.course_run_ref,
      curriculumUnitRef: row.curriculum_unit_ref,
      lessonRef: row.lesson_ref,
      learningObjectiveRefs: row.learning_objective_refs,
      evidenceRefs: row.evidence_refs,
      baselineTeachingPlanRef:
        row.baseline_teaching_plan_ref,
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
      updatedAt: row.updated_at.toISOString()
    }),
    latestProposalRevisionRef:
      row.latest_proposal_revision_ref,
    latestTaskRunRef: row.latest_task_run_ref
  };
}

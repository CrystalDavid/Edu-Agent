import type {
  FormalWriteMetadata,
  FormalWriteReceipt
} from "@edu-agent/contracts";

import type { PostgresClient } from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues,
  toPostgresJson
} from "../../../platform/postgres/write-context.js";

type WorkMetadata = FormalWriteMetadata & { owner: "work" };

export class PostgresGate27WorkRepository {
  async insertGradingTask(
    client: PostgresClient,
    input: {
      taskRef: string;
      tenantRef: string;
      assignmentRef: string;
      assignmentVersionRef: string;
      title: string;
      createdBy: string;
      taskMetadata: WorkMetadata;
      detailsMetadata: WorkMetadata;
      outboxMetadata: WorkMetadata;
      outboxRef: string;
    }
  ): Promise<FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO work.task (
         task_ref, title, status, task_kind, request_payload,
         request_version, version, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, 'planned', 'assignment_grading', $3,
         1, 1, $4,
         $5, $6, $7, $8, $9, $10, $11
       )`,
      [
        input.taskRef,
        input.title,
        toPostgresJson({
          assignmentRef: input.assignmentRef,
          assignmentVersionRef: input.assignmentVersionRef,
          purpose: "assignment.grading"
        }),
        input.taskMetadata.createdAt,
        ...formalMetadataValues(input.taskMetadata)
      ]
    );
    await client.query(
      `INSERT INTO work.assignment_grading_task_details (
         task_ref, tenant_ref, assignment_ref, assignment_version_ref,
         grading_status, pending_count, confirmed_count, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, 'pending', 0, 0, $5,
         $6, $7, $8, $9, $10, $11, $12
       )`,
      [
        input.taskRef,
        input.tenantRef,
        input.assignmentRef,
        input.assignmentVersionRef,
        input.detailsMetadata.createdAt,
        ...formalMetadataValues(input.detailsMetadata)
      ]
    );
    await client.query(
      `INSERT INTO work.outbox_record (
         outbox_ref, event_name, aggregate_ref, payload,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, 'AssignmentPublished', $2, $3,
         $4, $5, $6, $7, $8, $9, $10
       )`,
      [
        input.outboxRef,
        input.assignmentRef,
        toPostgresJson({
          assignmentRef: input.assignmentRef,
          assignmentVersionRef: input.assignmentVersionRef,
          gradingTaskRef: input.taskRef
        }),
        ...formalMetadataValues(input.outboxMetadata)
      ]
    );
    return [
      createReceipt({
        writeRef: input.taskRef,
        recordType: "Task",
        metadata: input.taskMetadata
      }),
      createReceipt({
        writeRef: input.taskRef,
        recordType: "AssignmentGradingTaskDetails",
        metadata: input.detailsMetadata
      }),
      createReceipt({
        writeRef: input.outboxRef,
        recordType: "OutboxRecord",
        metadata: input.outboxMetadata
      })
    ];
  }

  async syncGradingProgress(
    client: PostgresClient,
    input: {
      tenantRef: string;
      assignmentRef: string;
      pendingCount: number;
      confirmedCount: number;
      updatedAt: string;
      metadata: WorkMetadata;
    }
  ): Promise<FormalWriteReceipt | undefined> {
    const status =
      input.pendingCount === 0 && input.confirmedCount > 0
        ? "completed"
        : input.pendingCount > 0 || input.confirmedCount > 0
          ? "in_progress"
          : "pending";
    const updated = await client.query<{ task_ref: string }>(
      `UPDATE work.assignment_grading_task_details
          SET grading_status = $3,
              pending_count = $4,
              confirmed_count = $5,
              updated_at = $6
        WHERE tenant_ref = $1
          AND assignment_ref = $2
        RETURNING task_ref`,
      [
        input.tenantRef,
        input.assignmentRef,
        status,
        input.pendingCount,
        input.confirmedCount,
        input.updatedAt
      ]
    );
    const taskRef = updated.rows[0]?.task_ref;
    if (!taskRef) return undefined;
    await client.query(
      `UPDATE work.task
          SET status = $2,
              version = version + 1,
              updated_at = $3
        WHERE task_ref = $1`,
      [taskRef, status, input.updatedAt]
    );
    return createReceipt({
      writeRef: taskRef,
      recordType: "AssignmentGradingProgress",
      metadata: input.metadata
    });
  }
}

import type {
  FormalWriteMetadata,
  FormalWriteReceipt
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

export interface PostgresTaskBundle {
  task: {
    taskRef: string;
    title: string;
    status: string;
    metadata: FormalWriteMetadata & { owner: "work" };
  };
  taskRun: {
    taskRunRef: string;
    taskRef: string;
    attempt: number;
    status: string;
    metadata: FormalWriteMetadata & { owner: "work" };
  };
  outbox: {
    outboxRef: string;
    eventName: string;
    aggregateRef: string;
    payload: Record<string, unknown>;
    metadata: FormalWriteMetadata & { owner: "work" };
  };
}

export interface ResolvedLearningInteractionContractRecord {
  contractRef: string;
  boundRunKind: "QueryRun" | "TaskRun";
  boundRunRef: string;
  profileRef: string;
  profileVersion: number;
  policyVersionRef: string;
  promptVersionRef: string;
  evidenceRuleVersionRef: string;
  participationMode: string;
  supportLimit: number;
  answerReleaseBoundary: string;
  contractPayload: Record<string, unknown>;
  contentHash: string;
  metadata: FormalWriteMetadata & { owner: "work" };
}

export class PostgresWorkRepository {
  async insertTaskBundle(
    client: PostgresClient,
    bundle: PostgresTaskBundle,
    failPoint?: "after-task"
  ): Promise<readonly FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO work.task (
         task_ref,
         title,
         status,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        bundle.task.taskRef,
        bundle.task.title,
        bundle.task.status,
        ...formalMetadataValues(bundle.task.metadata)
      ]
    );
    if (failPoint === "after-task") {
      throw new Error("Intentional transaction fail point after Task.");
    }
    await client.query(
      `INSERT INTO work.task_run (
         task_run_ref,
         task_ref,
         attempt,
         status,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
       )`,
      [
        bundle.taskRun.taskRunRef,
        bundle.taskRun.taskRef,
        bundle.taskRun.attempt,
        bundle.taskRun.status,
        ...formalMetadataValues(bundle.taskRun.metadata)
      ]
    );
    await client.query(
      `INSERT INTO work.outbox_record (
         outbox_ref,
         event_name,
         aggregate_ref,
         payload,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8, $9, $10, $11
       )`,
      [
        bundle.outbox.outboxRef,
        bundle.outbox.eventName,
        bundle.outbox.aggregateRef,
        toPostgresJson(bundle.outbox.payload),
        ...formalMetadataValues(bundle.outbox.metadata)
      ]
    );

    return [
      createReceipt({
        writeRef: bundle.task.taskRef,
        recordType: "Task",
        metadata: bundle.task.metadata
      }),
      createReceipt({
        writeRef: bundle.taskRun.taskRunRef,
        recordType: "TaskRun",
        metadata: bundle.taskRun.metadata
      }),
      createReceipt({
        writeRef: bundle.outbox.outboxRef,
        recordType: "OutboxRecord",
        metadata: bundle.outbox.metadata
      })
    ];
  }

  async insertResolvedContract(
    client: PostgresClient,
    contract: ResolvedLearningInteractionContractRecord
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO work.resolved_learning_interaction_contract (
         contract_ref,
         bound_run_kind,
         bound_run_ref,
         profile_ref,
         profile_version,
         policy_version_ref,
         prompt_version_ref,
         evidence_rule_version_ref,
         participation_mode,
         support_limit,
         answer_release_boundary,
         contract_payload,
         content_hash,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
       )`,
      [
        contract.contractRef,
        contract.boundRunKind,
        contract.boundRunRef,
        contract.profileRef,
        contract.profileVersion,
        contract.policyVersionRef,
        contract.promptVersionRef,
        contract.evidenceRuleVersionRef,
        contract.participationMode,
        contract.supportLimit,
        contract.answerReleaseBoundary,
        toPostgresJson(contract.contractPayload),
        contract.contentHash,
        ...formalMetadataValues(contract.metadata)
      ]
    );
    return createReceipt({
      writeRef: contract.contractRef,
      recordType: "ResolvedLearningInteractionContract",
      metadata: contract.metadata
    });
  }

  async insertQueryRun(
    client: PostgresClient,
    input: {
      queryRunRef: string;
      queryName: string;
      status: string;
      resourceRef: string;
      requestedFieldMask: readonly string[];
      metadata: FormalWriteMetadata & { owner: "work" };
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO work.query_run (
         query_run_ref,
         query_name,
         status,
         resource_ref,
         requested_field_mask,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11, $12
       )`,
      [
        input.queryRunRef,
        input.queryName,
        input.status,
        input.resourceRef,
        toPostgresJson(input.requestedFieldMask),
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: input.queryRunRef,
      recordType: "QueryRun",
      metadata: input.metadata
    });
  }

  async runExists(
    executor: SqlExecutor,
    kind: "QueryRun" | "TaskRun",
    runRef: string
  ): Promise<boolean> {
    const table = kind === "QueryRun" ? "query_run" : "task_run";
    const referenceColumn =
      kind === "QueryRun" ? "query_run_ref" : "task_run_ref";
    const result = await executor.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM work.${table}
          WHERE ${referenceColumn} = $1
       ) AS exists`,
      [runRef]
    );
    return result.rows[0]?.exists ?? false;
  }

  async getResolvedContract(
    executor: SqlExecutor,
    contractRef: string
  ): Promise<ResolvedLearningInteractionContractRecord | undefined> {
    const result = await executor.query<{
      contract_ref: string;
      bound_run_kind: "QueryRun" | "TaskRun";
      bound_run_ref: string;
      profile_ref: string;
      profile_version: number;
      policy_version_ref: string;
      prompt_version_ref: string;
      evidence_rule_version_ref: string;
      participation_mode: string;
      support_limit: number;
      answer_release_boundary: string;
      contract_payload: Record<string, unknown>;
      content_hash: string;
      actor_ref: string;
      purpose: string;
      owner_module: "work";
      idempotency_key: string;
      authorization_decision_ref: string;
      audit_ref: string;
      created_at: Date;
    }>(
      `SELECT *
         FROM work.resolved_learning_interaction_contract
        WHERE contract_ref = $1`,
      [contractRef]
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    return {
      contractRef: row.contract_ref,
      boundRunKind: row.bound_run_kind,
      boundRunRef: row.bound_run_ref,
      profileRef: row.profile_ref,
      profileVersion: row.profile_version,
      policyVersionRef: row.policy_version_ref,
      promptVersionRef: row.prompt_version_ref,
      evidenceRuleVersionRef: row.evidence_rule_version_ref,
      participationMode: row.participation_mode,
      supportLimit: row.support_limit,
      answerReleaseBoundary: row.answer_release_boundary,
      contractPayload: row.contract_payload,
      contentHash: row.content_hash,
      metadata: {
        actorRef: row.actor_ref,
        purpose: row.purpose,
        owner: row.owner_module,
        idempotencyKey: row.idempotency_key,
        authorizationDecisionRef: row.authorization_decision_ref,
        auditRef: row.audit_ref,
        createdAt: row.created_at.toISOString()
      }
    };
  }
}

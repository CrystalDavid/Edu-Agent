import type {
  FormalWriteMetadata,
  FormalWriteReceipt,
  SuggestionDispositionKind,
  TeacherTaskRequest
} from "@edu-agent/contracts";
import {
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

export class PostgresGate2WorkRepository {
  async insertCaseAndGoal(
    client: PostgresClient,
    input: {
      caseRecord: {
        caseRef: string;
        tenantRef: string;
        caseType: "TeachingImprovementCase";
        title: string;
        status: "active" | "closed";
        metadata: WorkMetadata;
      };
      goal: {
        goalRef: string;
        tenantRef: string;
        caseRef?: string;
        title: string;
        status: "active" | "achieved" | "closed";
        successCriteria: readonly string[];
        metadata: WorkMetadata;
      };
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO work.case_record (
         case_ref,
         tenant_ref,
         case_type,
         title,
         status,
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
       )
       ON CONFLICT (case_ref) DO NOTHING`,
      [
        input.caseRecord.caseRef,
        input.caseRecord.tenantRef,
        input.caseRecord.caseType,
        input.caseRecord.title,
        input.caseRecord.status,
        ...formalMetadataValues(input.caseRecord.metadata)
      ]
    );
    await client.query(
      `INSERT INTO work.goal_record (
         goal_ref,
         tenant_ref,
         case_ref,
         title,
         status,
         success_criteria,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13
       )
       ON CONFLICT (goal_ref) DO NOTHING`,
      [
        input.goal.goalRef,
        input.goal.tenantRef,
        input.goal.caseRef ?? null,
        input.goal.title,
        input.goal.status,
        toPostgresJson(input.goal.successCriteria),
        ...formalMetadataValues(input.goal.metadata)
      ]
    );
    return [
      createReceipt({
        writeRef: input.caseRecord.caseRef,
        recordType: "TeachingImprovementCase",
        metadata: input.caseRecord.metadata
      }),
      createReceipt({
        writeRef: input.goal.goalRef,
        recordType: "Goal",
        metadata: input.goal.metadata
      })
    ];
  }

  async insertTaskResult(
    client: PostgresClient,
    input: {
      taskResultRef: string;
      taskRef: string;
      taskRunRef: string;
      goalRef?: string;
      proposalArtifactRef: string;
      proposalRevisionRef: string;
      teachingPlanArtifactRef: string;
      draftRevisionRef: string;
      metadata: WorkMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO work.task_result (
         task_result_ref,
         task_ref,
         task_run_ref,
         goal_ref,
         proposal_artifact_ref,
         proposal_revision_ref,
         teaching_plan_artifact_ref,
         draft_revision_ref,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15
       )`,
      [
        input.taskResultRef,
        input.taskRef,
        input.taskRunRef,
        input.goalRef ?? null,
        input.proposalArtifactRef,
        input.proposalRevisionRef,
        input.teachingPlanArtifactRef,
        input.draftRevisionRef,
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: input.taskResultRef,
      recordType: "TaskResult",
      metadata: input.metadata
    });
  }

  async insertSuggestionDisposition(
    client: PostgresClient,
    input: {
      dispositionRef: string;
      tenantRef: string;
      taskRef: string;
      proposalRevisionRef: string;
      dispositionKind: SuggestionDispositionKind;
      selectedStrategyId: string;
      teacherEdits: Record<string, unknown>;
      note?: string;
      resultingRevisionRef?: string;
      requestFingerprint: string;
      metadata: WorkMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO work.suggestion_disposition (
         disposition_ref,
         tenant_ref,
         task_ref,
         proposal_revision_ref,
         disposition_kind,
         selected_strategy_id,
         teacher_edits,
         note,
         resulting_revision_ref,
         request_fingerprint,
         implementation_observed,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false,
         $11, $12, $13, $14, $15, $16, $17
       )`,
      [
        input.dispositionRef,
        input.tenantRef,
        input.taskRef,
        input.proposalRevisionRef,
        input.dispositionKind,
        input.selectedStrategyId,
        toPostgresJson(input.teacherEdits),
        input.note ?? null,
        input.resultingRevisionRef ?? null,
        input.requestFingerprint,
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: input.dispositionRef,
      recordType: "SuggestionDisposition",
      metadata: input.metadata
    });
  }

  async insertOutbox(
    client: PostgresClient,
    input: {
      outboxRef: string;
      eventName: string;
      aggregateRef: string;
      payload: Record<string, unknown>;
      metadata: WorkMetadata;
    }
  ): Promise<FormalWriteReceipt> {
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

  async getDemoCaseAndGoal(
    executor: SqlExecutor,
    tenantRef: string,
    goalRef: string
  ): Promise<
    | {
        caseRef: string;
        caseTitle: string;
        caseStatus: "active";
        goalRef: string;
        goalTitle: string;
        goalStatus: "active";
        successCriteria: string[];
      }
    | undefined
  > {
    const result = await executor.query<{
      case_ref: string;
      case_title: string;
      case_status: "active";
      goal_ref: string;
      goal_title: string;
      goal_status: "active";
      success_criteria: string[];
    }>(
      `SELECT
         case_record.case_ref,
         case_record.title AS case_title,
         case_record.status AS case_status,
         goal.goal_ref,
         goal.title AS goal_title,
         goal.status AS goal_status,
         goal.success_criteria
       FROM work.goal_record AS goal
       JOIN work.case_record AS case_record
         ON case_record.case_ref = goal.case_ref
        AND case_record.tenant_ref = goal.tenant_ref
       WHERE goal.tenant_ref = $1
         AND goal.goal_ref = $2`,
      [tenantRef, goalRef]
    );
    const row = result.rows[0];
    return row
      ? {
          caseRef: row.case_ref,
          caseTitle: row.case_title,
          caseStatus: row.case_status,
          goalRef: row.goal_ref,
          goalTitle: row.goal_title,
          goalStatus: row.goal_status,
          successCriteria: row.success_criteria
        }
      : undefined;
  }

  async listSuggestionSummaries(
    executor: SqlExecutor,
    tenantRef: string
  ): Promise<
    Array<{
      proposalArtifactRef: string;
       proposalRevisionRef: string;
       taskRef: string;
       preparationTaskRef?: string;
       lessonRef?: string;
       disposed: boolean;
      requestText: string;
      createdAt: string;
    }>
  > {
    const result = await executor.query<{
      proposal_artifact_ref: string;
      proposal_revision_ref: string;
      task_ref: string;
      preparation_task_ref: string | null;
      lesson_ref: string | null;
      disposed: boolean;
      request_text: string;
      created_at: Date;
    }>(
      `SELECT
         result.proposal_artifact_ref,
         result.proposal_revision_ref,
         result.task_ref,
         task_run.request_payload ->> 'preparationTaskRef'
           AS preparation_task_ref,
         task_run.request_payload ->> 'lessonRef' AS lesson_ref,
         (disposition.disposition_ref IS NOT NULL) AS disposed,
         task_run.request_payload ->> 'requestText' AS request_text,
         result.created_at
       FROM work.task_result AS result
       JOIN work.task AS task
         ON task.task_ref = result.task_ref
       JOIN work.task_run AS task_run
         ON task_run.task_run_ref = result.task_run_ref
       JOIN work.goal_record AS goal
         ON goal.goal_ref = result.goal_ref
       LEFT JOIN work.suggestion_disposition AS disposition
         ON disposition.proposal_revision_ref =
              result.proposal_revision_ref
       WHERE goal.tenant_ref = $1
       ORDER BY result.created_at DESC`,
      [tenantRef]
    );
    return result.rows.map((row) => ({
      proposalArtifactRef: row.proposal_artifact_ref,
      proposalRevisionRef: row.proposal_revision_ref,
      taskRef: row.task_ref,
      ...(row.preparation_task_ref
        ? { preparationTaskRef: row.preparation_task_ref }
        : {}),
      ...(row.lesson_ref ? { lessonRef: row.lesson_ref } : {}),
      disposed: row.disposed,
      requestText: row.request_text,
      createdAt: row.created_at.toISOString()
    }));
  }

  async getTaskResultByProposal(
    executor: SqlExecutor,
    proposalRevisionRef: string
  ): Promise<
    | {
        taskRef: string;
        taskRunRef: string;
        goalRef: string;
        proposalArtifactRef: string;
        proposalRevisionRef: string;
        teachingPlanArtifactRef: string;
        draftRevisionRef: string;
      }
    | undefined
  > {
    const result = await executor.query<{
      task_ref: string;
      task_run_ref: string;
      goal_ref: string;
      proposal_artifact_ref: string;
      proposal_revision_ref: string;
      teaching_plan_artifact_ref: string;
      draft_revision_ref: string;
    }>(
      `SELECT task_ref, task_run_ref, goal_ref, proposal_artifact_ref,
              proposal_revision_ref, teaching_plan_artifact_ref,
              draft_revision_ref
         FROM work.task_result
        WHERE proposal_revision_ref = $1`,
      [proposalRevisionRef]
    );
    const row = result.rows[0];
    return row
      ? {
          taskRef: row.task_ref,
          taskRunRef: row.task_run_ref,
          goalRef: row.goal_ref,
          proposalArtifactRef: row.proposal_artifact_ref,
          proposalRevisionRef: row.proposal_revision_ref,
          teachingPlanArtifactRef: row.teaching_plan_artifact_ref,
          draftRevisionRef: row.draft_revision_ref
        }
      : undefined;
  }

  async getTaskResultByTaskRun(
    executor: SqlExecutor,
    taskRunRef: string
  ): Promise<
    | {
        taskResultRef: string;
        taskRef: string;
        taskRunRef: string;
        proposalArtifactRef: string;
        proposalRevisionRef: string;
        teachingPlanArtifactRef: string;
        draftRevisionRef: string;
      }
    | undefined
  > {
    const result = await executor.query<{
      task_result_ref: string;
      task_ref: string;
      task_run_ref: string;
      proposal_artifact_ref: string;
      proposal_revision_ref: string;
      teaching_plan_artifact_ref: string;
      draft_revision_ref: string;
    }>(
      `SELECT task_result_ref, task_ref, task_run_ref,
              proposal_artifact_ref, proposal_revision_ref,
              teaching_plan_artifact_ref, draft_revision_ref
         FROM work.task_result
        WHERE task_run_ref = $1`,
      [taskRunRef]
    );
    const row = result.rows[0];
    return row
      ? {
          taskResultRef: row.task_result_ref,
          taskRef: row.task_ref,
          taskRunRef: row.task_run_ref,
          proposalArtifactRef: row.proposal_artifact_ref,
          proposalRevisionRef: row.proposal_revision_ref,
          teachingPlanArtifactRef:
            row.teaching_plan_artifact_ref,
          draftRevisionRef: row.draft_revision_ref
        }
      : undefined;
  }

  async getSuggestionDisposition(
    executor: SqlExecutor,
    proposalRevisionRef: string
  ): Promise<StoredSuggestionDisposition | undefined> {
    const result =
      await executor.query<StoredSuggestionDispositionRow>(
        `SELECT disposition_ref, proposal_revision_ref,
                disposition_kind, selected_strategy_id,
                teacher_edits, note, resulting_revision_ref,
                implementation_observed, request_fingerprint,
                created_at
           FROM work.suggestion_disposition
          WHERE proposal_revision_ref = $1`,
        [proposalRevisionRef]
      );
    const row = result.rows[0];
    return row
      ? {
          dispositionRef: row.disposition_ref,
          proposalRevisionRef: row.proposal_revision_ref,
          kind: row.disposition_kind,
          selectedStrategyId: row.selected_strategy_id,
          teacherEdits: row.teacher_edits,
          note: row.note,
          resultingRevisionRef: row.resulting_revision_ref,
          implementationObserved: row.implementation_observed,
          requestFingerprint: row.request_fingerprint,
          createdAt: row.created_at.toISOString()
        }
      : undefined;
  }

  async getProposalReviewWork(
    executor: SqlExecutor,
    input: {
      tenantRef: string;
      proposalRevisionRef: string;
    }
  ): Promise<ProposalReviewWork | undefined> {
    const result = await executor.query<{
      task_ref: string;
      task_run_ref: string;
      authorization_decision_ref: string;
      request_payload: unknown;
      contract_ref: string;
      proposal_artifact_ref: string;
      proposal_revision_ref: string;
      teaching_plan_artifact_ref: string;
      draft_revision_ref: string;
    }>(
      `SELECT task.task_ref, task_run.task_run_ref,
              task.authorization_decision_ref,
              task_run.request_payload, contract.contract_ref,
              result.proposal_artifact_ref,
              result.proposal_revision_ref,
              result.teaching_plan_artifact_ref,
              result.draft_revision_ref
         FROM work.task_result AS result
         JOIN work.task AS task
           ON task.task_ref = result.task_ref
         JOIN work.task_run AS task_run
           ON task_run.task_run_ref = result.task_run_ref
         JOIN work.resolved_learning_interaction_contract AS contract
           ON contract.bound_run_kind = 'TaskRun'
          AND contract.bound_run_ref = task_run.task_run_ref
         JOIN work.goal_record AS goal
           ON goal.goal_ref = result.goal_ref
        WHERE result.proposal_revision_ref = $1
          AND goal.tenant_ref = $2`,
      [input.proposalRevisionRef, input.tenantRef]
    );
    const row = result.rows[0];
    return row
      ? {
          taskRef: row.task_ref,
          taskRunRef: row.task_run_ref,
          authorizationDecisionRef:
            row.authorization_decision_ref,
          contractRef: row.contract_ref,
          request: TeacherTaskRequestSchema.parse(
            row.request_payload
          ),
          proposalArtifactRef: row.proposal_artifact_ref,
          proposalRevisionRef: row.proposal_revision_ref,
          teachingPlanArtifactRef:
            row.teaching_plan_artifact_ref,
          draftRevisionRef: row.draft_revision_ref
        }
      : undefined;
  }

  async getRunExplanationWork(
    executor: SqlExecutor,
    taskRef: string
  ): Promise<Gate2WorkExplanation | undefined> {
    const result = await executor.query<Gate2WorkExplanationRow>(
      `SELECT
         task.task_ref,
         task.title,
         task.status AS task_status,
         task.goal_ref,
         task.authorization_decision_ref,
         task_run.request_payload,
         task_run.task_run_ref,
         task_run.status AS task_run_status,
         task_run.created_at AS task_run_created_at,
         contract.contract_ref,
         contract.profile_ref,
         contract.profile_version,
         contract.policy_version_ref,
         contract.prompt_version_ref,
         contract.evidence_rule_version_ref,
         contract.content_hash,
         result.proposal_revision_ref,
         disposition.disposition_ref,
         disposition.disposition_kind,
         disposition.authorization_decision_ref AS
           disposition_authorization_decision_ref,
         disposition.resulting_revision_ref,
         disposition.created_at AS disposition_created_at,
         approval_outbox.authorization_decision_ref AS
           approval_authorization_decision_ref
       FROM work.task AS task
       JOIN work.task_result AS result
         ON result.task_ref = task.task_ref
       JOIN work.task_run AS task_run
         ON task_run.task_run_ref = result.task_run_ref
       JOIN work.resolved_learning_interaction_contract AS contract
         ON contract.bound_run_kind = 'TaskRun'
        AND contract.bound_run_ref = task_run.task_run_ref
       LEFT JOIN work.suggestion_disposition AS disposition
         ON disposition.proposal_revision_ref =
              result.proposal_revision_ref
       LEFT JOIN work.outbox_record AS approval_outbox
         ON approval_outbox.event_name = 'TeachingPlanApproved'
        AND approval_outbox.payload ->> 'inReviewRevisionRef' =
              disposition.resulting_revision_ref
       WHERE task.task_ref = $1
       ORDER BY task_run.attempt DESC
       LIMIT 1`,
      [taskRef]
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    return {
      taskRef: row.task_ref,
      title: row.title,
      taskStatus: row.task_status,
      goalRef: row.goal_ref,
      authorizationDecisionRef: row.authorization_decision_ref,
      request: TeacherTaskRequestSchema.parse(
        row.request_payload
      ),
      taskRunRef: row.task_run_ref,
      taskRunStatus: row.task_run_status,
      taskRunCreatedAt: row.task_run_created_at.toISOString(),
      contractRef: row.contract_ref,
      profileRef: row.profile_ref,
      profileVersion: row.profile_version,
      policyVersionRef: row.policy_version_ref,
      promptVersionRef: row.prompt_version_ref,
      evidenceRuleVersionRef: row.evidence_rule_version_ref,
      contentHash: row.content_hash,
      proposalRevisionRef: row.proposal_revision_ref,
      disposition:
        row.disposition_ref &&
        row.disposition_kind &&
        row.disposition_created_at
          ? {
              dispositionRef: row.disposition_ref,
              kind: row.disposition_kind,
              authorizationDecisionRef:
                row.disposition_authorization_decision_ref,
              approvalAuthorizationDecisionRef:
                row.approval_authorization_decision_ref,
              resultingRevisionRef:
                row.resulting_revision_ref,
              createdAt: row.disposition_created_at.toISOString()
            }
          : null
    };
  }
}

interface Gate2WorkExplanationRow {
  task_ref: string;
  title: string;
  task_status: string;
  goal_ref: string;
  authorization_decision_ref: string;
  request_payload: unknown;
  task_run_ref: string;
  task_run_status: string;
  task_run_created_at: Date;
  contract_ref: string;
  profile_ref: string;
  profile_version: number;
  policy_version_ref: string;
  prompt_version_ref: string;
  evidence_rule_version_ref: string;
  content_hash: string;
  proposal_revision_ref: string;
  disposition_ref: string | null;
  disposition_kind: SuggestionDispositionKind | null;
  disposition_authorization_decision_ref: string | null;
  resulting_revision_ref: string | null;
  disposition_created_at: Date | null;
  approval_authorization_decision_ref: string | null;
}

export interface Gate2WorkExplanation {
  taskRef: string;
  title: string;
  taskStatus: string;
  goalRef: string;
  authorizationDecisionRef: string;
  request: TeacherTaskRequest;
  taskRunRef: string;
  taskRunStatus: string;
  taskRunCreatedAt: string;
  contractRef: string;
  profileRef: string;
  profileVersion: number;
  policyVersionRef: string;
  promptVersionRef: string;
  evidenceRuleVersionRef: string;
  contentHash: string;
  proposalRevisionRef: string;
  disposition: {
    dispositionRef: string;
    kind: SuggestionDispositionKind;
    authorizationDecisionRef: string | null;
    approvalAuthorizationDecisionRef: string | null;
    resultingRevisionRef: string | null;
    createdAt: string;
  } | null;
}

interface StoredSuggestionDispositionRow {
  disposition_ref: string;
  proposal_revision_ref: string;
  disposition_kind: SuggestionDispositionKind;
  selected_strategy_id: string;
  teacher_edits: Record<string, unknown>;
  note: string | null;
  resulting_revision_ref: string | null;
  implementation_observed: false;
  request_fingerprint: string;
  created_at: Date;
}

export interface StoredSuggestionDisposition {
  dispositionRef: string;
  proposalRevisionRef: string;
  kind: SuggestionDispositionKind;
  selectedStrategyId: string;
  teacherEdits: Record<string, unknown>;
  note: string | null;
  resultingRevisionRef: string | null;
  implementationObserved: false;
  requestFingerprint: string;
  createdAt: string;
}

export interface ProposalReviewWork {
  taskRef: string;
  taskRunRef: string;
  authorizationDecisionRef: string;
  contractRef: string;
  request: TeacherTaskRequest;
  proposalArtifactRef: string;
  proposalRevisionRef: string;
  teachingPlanArtifactRef: string;
  draftRevisionRef: string;
}

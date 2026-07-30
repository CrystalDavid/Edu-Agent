import type {
  FormalWriteMetadata,
  FormalWriteReceipt,
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

export class PostgresGate2RuntimeRepository {
  async insertContextManifest(
    client: PostgresClient,
    input: {
      contextManifestRef: string;
      agentRunRef: string;
      resourceRefs: readonly string[];
      evidenceRefs: readonly string[];
      unknowns: readonly string[];
      requestedFieldMask: readonly string[];
      taskRef: string;
      requestSummary: TeacherTaskRequest;
      metadata: FormalWriteMetadata & { owner: "runtime" };
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO runtime.context_manifest (
         context_manifest_ref,
         agent_run_ref,
         resource_refs,
         evidence_refs,
         unknowns,
         requested_field_mask,
         task_ref,
         request_summary,
         request_version,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16
       )`,
      [
        input.contextManifestRef,
        input.agentRunRef,
        toPostgresJson(input.resourceRefs),
        toPostgresJson(input.evidenceRefs),
        toPostgresJson(input.unknowns),
        toPostgresJson(input.requestedFieldMask),
        input.taskRef,
        toPostgresJson(input.requestSummary),
        input.requestSummary.requestVersion,
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: input.contextManifestRef,
      recordType: "ContextManifest",
      metadata: input.metadata
    });
  }

  async getRunExplanation(
    executor: SqlExecutor,
    taskRunRef: string
  ): Promise<
    | {
        agentRunRef: string;
        status: string;
        provider: "mock";
        modelProfile: string;
        manifestRef: string;
        contextManifestRef: string;
        evidenceRefs: string[];
        resourceRefs: string[];
        unknowns: string[];
        requestedFieldMask: string[];
        requestSummary: TeacherTaskRequest;
      }
    | undefined
  > {
    const result = await executor.query<{
      agent_run_ref: string;
      status: string;
      model_provider: "mock";
      model_profile: string;
      manifest_ref: string;
      context_manifest_ref: string;
      evidence_refs: string[];
      resource_refs: string[];
      unknowns: string[];
      requested_field_mask: string[];
      request_summary: unknown;
    }>(
      `SELECT
         agent_run.agent_run_ref,
         agent_run.status,
         agent_run.model_provider,
         agent_run.model_profile,
         manifest.manifest_ref,
         context.context_manifest_ref,
         context.evidence_refs,
         context.resource_refs,
         context.unknowns,
         context.requested_field_mask,
         context.request_summary
       FROM runtime.agent_run AS agent_run
       JOIN runtime.run_manifest AS manifest
         ON manifest.agent_run_ref = agent_run.agent_run_ref
       JOIN runtime.context_manifest AS context
         ON context.agent_run_ref = agent_run.agent_run_ref
       WHERE agent_run.run_kind = 'TaskRun'
         AND agent_run.bound_run_ref = $1`,
      [taskRunRef]
    );
    const row = result.rows[0];
    return row
      ? {
          agentRunRef: row.agent_run_ref,
          status: row.status,
          provider: row.model_provider,
          modelProfile: row.model_profile,
          manifestRef: row.manifest_ref,
          contextManifestRef: row.context_manifest_ref,
          evidenceRefs: row.evidence_refs,
          resourceRefs: row.resource_refs,
          unknowns: row.unknowns,
          requestedFieldMask: row.requested_field_mask,
          requestSummary: TeacherTaskRequestSchema.parse(
            row.request_summary
          )
        }
      : undefined;
  }
}

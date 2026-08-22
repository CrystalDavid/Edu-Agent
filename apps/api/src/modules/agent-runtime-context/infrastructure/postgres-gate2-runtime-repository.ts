import type {
  AuthorizedContextPlan,
  FormalWriteMetadata,
  FormalWriteReceipt,
  MemoryContextPackManifest,
  TeacherTaskRequest
} from "@edu-agent/contracts";
import {
  MemoryContextPackManifestSchema,
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
  async getMemoryContextPackManifest(
    executor: SqlExecutor,
    agentRunRef: string
  ): Promise<MemoryContextPackManifest | null> {
    const result = await executor.query<{ manifest: unknown | null }>(
      `SELECT output #> '{contextEngineering,memoryContextPackManifest}' AS manifest
         FROM runtime.agent_run
        WHERE agent_run_ref = $1`,
      [agentRunRef]
    );
    const manifest = result.rows[0]?.manifest;
    if (manifest === null || manifest === undefined) return null;
    return MemoryContextPackManifestSchema.parse(manifest);
  }

  async updateMemoryApplicationObservabilityStatus(
    executor: SqlExecutor,
    input: {
      readonly agentRunRef: string;
      readonly status: "recorded" | "degraded";
      readonly updatedAt: string;
    }
  ): Promise<void> {
    const state = input.status === "recorded"
      ? { status: "recorded" }
      : {
          status: "degraded",
          safeErrorCategory: "MEMORY_APPLICATION_RECORDING_FAILED"
        };
    const result = await executor.query(
      `UPDATE runtime.agent_run
          SET output = jsonb_set(
                output,
                '{contextEngineering}',
                COALESCE(output -> 'contextEngineering', '{}'::jsonb) ||
                  jsonb_build_object(
                    'memoryApplicationObservability', $2::jsonb
                  ),
                true
              ),
              updated_at = $3::timestamptz
        WHERE agent_run_ref = $1`,
      [input.agentRunRef, JSON.stringify(state), input.updatedAt]
    );
    if (result.rowCount !== 1) {
      throw new Error("Memory application observability AgentRun is missing.");
    }
  }

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
      authorizedContextPlanRef?: string;
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
         authorized_context_plan_ref,
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
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17
       )`,
      [
        input.contextManifestRef,
        input.agentRunRef,
        toPostgresJson(input.resourceRefs),
        toPostgresJson(input.evidenceRefs),
        toPostgresJson(input.unknowns),
        toPostgresJson(input.requestedFieldMask),
        input.taskRef,
        input.authorizedContextPlanRef ?? null,
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

  async insertAuthorizedContextPlan(
    client: PostgresClient,
    input: AuthorizedContextPlan & {
      metadata: FormalWriteMetadata & { owner: "runtime" };
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO runtime.authorized_context_plan (
         authorized_context_plan_ref, task_ref, task_run_ref,
         working_set_version, authorized_resource_refs,
         authorized_evidence_refs, denied_resource_refs,
         requested_field_mask, content_hash,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16
       )`,
      [
        input.authorizedContextPlanRef,
        input.taskRef,
        input.taskRunRef,
        input.workingSetVersion,
        toPostgresJson(input.authorizedResourceRefs),
        toPostgresJson(input.authorizedEvidenceRefs),
        toPostgresJson(input.deniedResourceRefs),
        toPostgresJson(input.requestedFieldMask),
        input.contentHash,
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({
      writeRef: input.authorizedContextPlanRef,
      recordType: "AuthorizedContextPlan",
      metadata: input.metadata
    });
  }

  async getLatestAuthorizedContextPlan(
    executor: SqlExecutor,
    taskRef: string
  ): Promise<AuthorizedContextPlan | undefined> {
    const result = await executor.query<AuthorizedContextPlanRow>(
      `SELECT authorized_context_plan_ref, task_ref, task_run_ref,
              working_set_version, authorized_resource_refs,
              authorized_evidence_refs, denied_resource_refs,
              requested_field_mask, authorization_decision_ref,
              content_hash, created_at
         FROM runtime.authorized_context_plan
        WHERE task_ref = $1
        ORDER BY created_at DESC, authorized_context_plan_ref DESC
        LIMIT 1`,
      [taskRef]
    );
    return result.rows[0]
      ? toAuthorizedContextPlan(result.rows[0])
      : undefined;
  }

  async getLatestContextManifest(
    executor: SqlExecutor,
    taskRef: string
  ): Promise<
    | {
        contextManifestRef: string;
        agentRunRef: string;
        taskRef: string;
        authorizedContextPlanRef: string;
        resourceRefs: string[];
        evidenceRefs: string[];
        unknowns: string[];
        requestedFieldMask: string[];
        requestVersion: number;
        sealedAt: string;
      }
    | undefined
  > {
    const result = await executor.query<{
      context_manifest_ref: string;
      agent_run_ref: string;
      task_ref: string;
      authorized_context_plan_ref: string | null;
      resource_refs: string[];
      evidence_refs: string[];
      unknowns: string[];
      requested_field_mask: string[];
      request_version: number;
      created_at: Date;
    }>(
      `SELECT context_manifest_ref, agent_run_ref, task_ref,
              authorized_context_plan_ref, resource_refs,
              evidence_refs, unknowns, requested_field_mask,
              request_version, created_at
         FROM runtime.context_manifest
        WHERE task_ref = $1
          AND authorized_context_plan_ref IS NOT NULL
        ORDER BY created_at DESC, context_manifest_ref DESC
        LIMIT 1`,
      [taskRef]
    );
    const row = result.rows[0];
    return row?.authorized_context_plan_ref
      ? {
          contextManifestRef: row.context_manifest_ref,
          agentRunRef: row.agent_run_ref,
          taskRef: row.task_ref,
          authorizedContextPlanRef:
            row.authorized_context_plan_ref,
          resourceRefs: row.resource_refs,
          evidenceRefs: row.evidence_refs,
          unknowns: row.unknowns,
          requestedFieldMask: row.requested_field_mask,
          requestVersion: row.request_version,
          sealedAt: row.created_at.toISOString()
        }
      : undefined;
  }

  async getContextManifestByRef(
    executor: SqlExecutor,
    contextManifestRef: string
  ): Promise<
    | {
        contextManifestRef: string;
        agentRunRef: string;
        taskRef: string;
        authorizedContextPlanRef: string;
        resourceRefs: string[];
        evidenceRefs: string[];
        unknowns: string[];
        requestedFieldMask: string[];
        requestSummary: TeacherTaskRequest;
        sealedAt: string;
      }
    | undefined
  > {
    const result = await executor.query<{
      context_manifest_ref: string;
      agent_run_ref: string;
      task_ref: string;
      authorized_context_plan_ref: string | null;
      resource_refs: string[];
      evidence_refs: string[];
      unknowns: string[];
      requested_field_mask: string[];
      request_summary: unknown;
      created_at: Date;
    }>(
      `SELECT context_manifest_ref, agent_run_ref, task_ref,
              authorized_context_plan_ref, resource_refs,
              evidence_refs, unknowns, requested_field_mask,
              request_summary, created_at
         FROM runtime.context_manifest
        WHERE context_manifest_ref = $1`,
      [contextManifestRef]
    );
    const row = result.rows[0];
    return row?.authorized_context_plan_ref
      ? {
          contextManifestRef: row.context_manifest_ref,
          agentRunRef: row.agent_run_ref,
          taskRef: row.task_ref,
          authorizedContextPlanRef:
            row.authorized_context_plan_ref,
          resourceRefs: row.resource_refs,
          evidenceRefs: row.evidence_refs,
          unknowns: row.unknowns,
          requestedFieldMask: row.requested_field_mask,
          requestSummary: TeacherTaskRequestSchema.parse(
            row.request_summary
          ),
          sealedAt: row.created_at.toISOString()
        }
      : undefined;
  }

  async getAuthorizedContextPlanByRef(
    executor: SqlExecutor,
    authorizedContextPlanRef: string
  ): Promise<AuthorizedContextPlan | undefined> {
    const result = await executor.query<AuthorizedContextPlanRow>(
      `SELECT authorized_context_plan_ref, task_ref, task_run_ref,
              working_set_version, authorized_resource_refs,
              authorized_evidence_refs, denied_resource_refs,
              requested_field_mask, authorization_decision_ref,
              content_hash, created_at
         FROM runtime.authorized_context_plan
        WHERE authorized_context_plan_ref = $1`,
      [authorizedContextPlanRef]
    );
    return result.rows[0]
      ? toAuthorizedContextPlan(result.rows[0])
      : undefined;
  }

  async getRunExplanation(
    executor: SqlExecutor,
    taskRunRef: string
  ): Promise<
    | {
        agentRunRef: string;
        status: string;
        provider: "mock" | "volcengine-ark";
        modelProfile: string;
        manifestRef: string;
        contextManifestRef: string;
        authorizedContextPlanRef: string | null;
        evidenceRefs: string[];
        resourceRefs: string[];
        unknowns: string[];
        requestedFieldMask: string[];
        requestSummary: TeacherTaskRequest;
        memoryContextPackManifest: MemoryContextPackManifest | null;
      }
    | undefined
  > {
    const result = await executor.query<{
      agent_run_ref: string;
      status: string;
      model_provider: "mock" | "volcengine-ark";
      model_profile: string;
      manifest_ref: string;
      context_manifest_ref: string;
      authorized_context_plan_ref: string | null;
      evidence_refs: string[];
      resource_refs: string[];
      unknowns: string[];
      requested_field_mask: string[];
      request_summary: unknown;
      output: unknown;
    }>(
      `SELECT
         agent_run.agent_run_ref,
         agent_run.status,
         agent_run.model_provider,
         agent_run.model_profile,
         manifest.manifest_ref,
         context.context_manifest_ref,
         context.authorized_context_plan_ref,
         context.evidence_refs,
         context.resource_refs,
         context.unknowns,
         context.requested_field_mask,
         context.request_summary,
         agent_run.output
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
          authorizedContextPlanRef:
            row.authorized_context_plan_ref,
          evidenceRefs: row.evidence_refs,
          resourceRefs: row.resource_refs,
          unknowns: row.unknowns,
          requestedFieldMask: row.requested_field_mask,
          requestSummary: TeacherTaskRequestSchema.parse(
            row.request_summary
          ),
          memoryContextPackManifest:
            memoryContextPackFromOutput(row.output)
        }
      : undefined;
  }
}

function memoryContextPackFromOutput(
  output: unknown
): MemoryContextPackManifest | null {
  if (!isRecord(output)) return null;
  const contextEngineering = output["contextEngineering"];
  if (!isRecord(contextEngineering)) return null;
  const manifest = contextEngineering["memoryContextPackManifest"];
  return manifest === undefined || manifest === null
    ? null
    : MemoryContextPackManifestSchema.parse(manifest);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface AuthorizedContextPlanRow {
  authorized_context_plan_ref: string;
  task_ref: string;
  task_run_ref: string;
  working_set_version: number;
  authorized_resource_refs: string[];
  authorized_evidence_refs: string[];
  denied_resource_refs: string[];
  requested_field_mask: string[];
  authorization_decision_ref: string;
  content_hash: string;
  created_at: Date;
}

function toAuthorizedContextPlan(
  row: AuthorizedContextPlanRow
): AuthorizedContextPlan {
  return {
    authorizedContextPlanRef:
      row.authorized_context_plan_ref,
    taskRef: row.task_ref,
    taskRunRef: row.task_run_ref,
    workingSetVersion: row.working_set_version,
    authorizedResourceRefs: row.authorized_resource_refs,
    authorizedEvidenceRefs: row.authorized_evidence_refs,
    deniedResourceRefs: row.denied_resource_refs,
    requestedFieldMask: row.requested_field_mask,
    authorizationDecisionRef: row.authorization_decision_ref,
    contentHash: row.content_hash,
    resolvedAt: row.created_at.toISOString()
  };
}

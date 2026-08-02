import { createHash } from "node:crypto";

import {
  ReflectionContentSchema,
  ReflectionRevisionViewSchema,
  type FormalWriteMetadata,
  type FormalWriteReceipt,
  type ReflectionContent,
  type ReflectionRevisionView
} from "@edu-agent/contracts";

import type { PostgresClient, SqlExecutor } from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues,
  toPostgresJson
} from "../../../platform/postgres/write-context.js";
import { PostgresArtifactRepository } from "./postgres-artifact-repository.js";

type ArtifactMetadata = FormalWriteMetadata & { owner: "artifact" };

export interface ReflectionScopeInput {
  tenantRef: string;
  courseRunRef: string;
  lessonRef: string;
  teachingPlanRevisionRef: string;
  deliveryRevisionRef: string;
  observationRevisionRefs: string[];
  assignmentEvidenceRefs: string[];
}

export class PostgresGate29ArtifactRepository {
  constructor(private readonly base = new PostgresArtifactRepository()) {}

  async insertInitialDraft(
    client: PostgresClient,
    input: {
      reflectionRef: string;
      revisionRef: string;
      title: string;
      content: ReflectionContent;
      scope: ReflectionScopeInput;
      sourceAgentRunRef: string | null;
      artifactMetadata: ArtifactMetadata;
      revisionMetadata: ArtifactMetadata;
      scopeMetadata: ArtifactMetadata;
      eventRef: string;
      eventMetadata: ArtifactMetadata;
      outboxRef: string;
      outboxMetadata: ArtifactMetadata;
      eventName: "LessonReflectionDraftCreated" | "LessonReflectionDraftGenerated";
    }
  ): Promise<FormalWriteReceipt[]> {
    const hash = reflectionHash(input.content, input.scope);
    const bundleReceipts = await this.base.insertArtifactBundle(client, {
      artifact: {
        artifactRef: input.reflectionRef,
        artifactType: "LessonReflection",
        latestRevisionRef: input.revisionRef,
        metadata: input.artifactMetadata
      },
      revision: {
        revisionRef: input.revisionRef,
        artifactRef: input.reflectionRef,
        revisionNumber: 1,
        artifactType: "LessonReflection",
        title: input.title,
        body: JSON.stringify(input.content),
        ...(input.sourceAgentRunRef ? { sourceAgentRunRef: input.sourceAgentRunRef } : {}),
        revisionState: "draft",
        contentHash: hash,
        structuredContent: input.content,
        changeReason: input.eventName === "LessonReflectionDraftGenerated"
          ? "Agent 根据教师授权的课堂事实生成反思草稿"
          : "教师创建课后反思草稿",
        evidenceRefs: input.scope.assignmentEvidenceRefs,
        teacherSelection: { teacherConfirmationRequired: true },
        metadata: input.revisionMetadata
      },
      outbox: {
        outboxRef: input.outboxRef,
        eventName: input.eventName,
        aggregateRef: input.reflectionRef,
        payload: {
          reflectionRevisionRef: input.revisionRef,
          lessonRef: input.scope.lessonRef,
          deliveryRevisionRef: input.scope.deliveryRevisionRef
        },
        metadata: input.outboxMetadata
      }
    });
    const scopeReceipt = await this.insertScope(client, {
      scopeRef: `reflection-scope:${input.revisionRef}`,
      artifactRef: input.reflectionRef,
      revisionRef: input.revisionRef,
      scope: input.scope,
      lifecycleStatus: "draft",
      sourceAgentRunRef: input.sourceAgentRunRef,
      confirmedBy: null,
      confirmedAt: null,
      contentHash: hash,
      metadata: input.scopeMetadata
    });
    const eventReceipt = await this.insertEvent(client, {
      eventRef: input.eventRef,
      artifactRef: input.reflectionRef,
      revisionRef: input.revisionRef,
      lessonRef: input.scope.lessonRef,
      deliveryRevisionRef: input.scope.deliveryRevisionRef,
      eventName: input.eventName,
      payload: { sourceAgentRunRef: input.sourceAgentRunRef },
      metadata: input.eventMetadata
    });
    return [...bundleReceipts, scopeReceipt, eventReceipt];
  }

  async insertDraftRevision(
    client: PostgresClient,
    input: {
      reflectionRef: string;
      revisionRef: string;
      parentRevisionRef: string;
      title: string;
      content: ReflectionContent;
      scope: ReflectionScopeInput;
      sourceAgentRunRef: string | null;
      revisionMetadata: ArtifactMetadata;
      scopeMetadata: ArtifactMetadata;
      eventRef: string;
      eventMetadata: ArtifactMetadata;
      outboxRef: string;
      outboxMetadata: ArtifactMetadata;
      eventName: "LessonReflectionDraftGenerated" | "LessonReflectionDraftEdited";
    }
  ): Promise<{ revisionNumber: number; receipts: FormalWriteReceipt[] }> {
    const next = await this.nextRevisionNumber(client, input.reflectionRef);
    const currentDraft = await client.query<{ revision_ref: string }>(
      `SELECT revision_ref FROM artifact.lesson_reflection_scope
        WHERE artifact_ref = $1 AND lifecycle_status = 'draft'
        FOR UPDATE`,
      [input.reflectionRef]
    );
    if (currentDraft.rows[0]) {
      await client.query(
        `UPDATE artifact.lesson_reflection_scope
            SET lifecycle_status = 'superseded', updated_at = $2::timestamptz
          WHERE artifact_ref = $1 AND lifecycle_status = 'draft'`,
        [input.reflectionRef, input.scopeMetadata.createdAt]
      );
    }
    const hash = reflectionHash(input.content, input.scope);
    await this.base.insertRevision(client, {
      revisionRef: input.revisionRef,
      artifactRef: input.reflectionRef,
      revisionNumber: next,
      artifactType: "LessonReflection",
      title: input.title,
      body: JSON.stringify(input.content),
      ...(input.sourceAgentRunRef ? { sourceAgentRunRef: input.sourceAgentRunRef } : {}),
      parentRevisionRef: input.parentRevisionRef,
      revisionState: "draft",
      contentHash: hash,
      structuredContent: input.content,
      changeReason: input.eventName === "LessonReflectionDraftGenerated"
        ? "Agent 生成新的可审阅反思草稿"
        : "教师编辑反思草稿",
      evidenceRefs: input.scope.assignmentEvidenceRefs,
      teacherSelection: { teacherConfirmationRequired: true },
      metadata: input.revisionMetadata
    });
    await client.query(
      `UPDATE artifact.artifact SET latest_revision_ref = $2 WHERE artifact_ref = $1`,
      [input.reflectionRef, input.revisionRef]
    );
    const receipts: FormalWriteReceipt[] = [
      createReceipt({ writeRef: input.revisionRef, recordType: "ArtifactRevision", metadata: input.revisionMetadata }),
      await this.insertScope(client, {
        scopeRef: `reflection-scope:${input.revisionRef}`,
        artifactRef: input.reflectionRef,
        revisionRef: input.revisionRef,
        scope: input.scope,
        lifecycleStatus: "draft",
        sourceAgentRunRef: input.sourceAgentRunRef,
        confirmedBy: null,
        confirmedAt: null,
        contentHash: hash,
        metadata: input.scopeMetadata
      }),
      await this.insertEvent(client, {
        eventRef: input.eventRef,
        artifactRef: input.reflectionRef,
        revisionRef: input.revisionRef,
        lessonRef: input.scope.lessonRef,
        deliveryRevisionRef: input.scope.deliveryRevisionRef,
        eventName: input.eventName,
        payload: { parentRevisionRef: input.parentRevisionRef, sourceAgentRunRef: input.sourceAgentRunRef },
        metadata: input.eventMetadata
      }),
      await this.insertOutbox(client, {
        outboxRef: input.outboxRef,
        eventName: input.eventName,
        aggregateRef: input.reflectionRef,
        payload: { reflectionRevisionRef: input.revisionRef },
        metadata: input.outboxMetadata
      })
    ];
    return { revisionNumber: next, receipts };
  }

  async confirmDraft(
    client: PostgresClient,
    input: {
      reflectionRef: string;
      draftRevisionRef: string;
      expectedRevisionNumber: number;
      confirmedRevisionRef: string;
      confirmedBy: string;
      revisionMetadata: ArtifactMetadata;
      scopeMetadata: ArtifactMetadata;
      eventRef: string;
      eventMetadata: ArtifactMetadata;
      outboxRef: string;
      outboxMetadata: ArtifactMetadata;
    }
  ): Promise<{ revisionNumber: number; receipts: FormalWriteReceipt[] } | undefined> {
    const draft = await client.query<ReflectionRow>(
      `${reflectionSelect}
        WHERE scope.artifact_ref = $1 AND scope.revision_ref = $2
          AND scope.lifecycle_status = 'draft'
        FOR UPDATE OF scope`,
      [input.reflectionRef, input.draftRevisionRef]
    );
    const row = draft.rows[0];
    if (!row || row.revision_number !== input.expectedRevisionNumber) return undefined;
    const next = await this.nextRevisionNumber(client, input.reflectionRef);
    await client.query(
      `UPDATE artifact.lesson_reflection_scope
          SET lifecycle_status = 'historical_confirmed', updated_at = $2::timestamptz
        WHERE delivery_revision_ref = $1 AND lifecycle_status = 'current_confirmed'`,
      [row.delivery_revision_ref, input.revisionMetadata.createdAt]
    );
    await client.query(
      `UPDATE artifact.lesson_reflection_scope
          SET lifecycle_status = 'superseded', updated_at = $2::timestamptz
        WHERE scope_ref = $1`,
      [row.scope_ref, input.revisionMetadata.createdAt]
    );
    const content = ReflectionContentSchema.parse(row.structured_content);
    await this.base.insertRevision(client, {
      revisionRef: input.confirmedRevisionRef,
      artifactRef: input.reflectionRef,
      revisionNumber: next,
      artifactType: "LessonReflection",
      title: row.title.replace(/（草稿）$/u, "（已确认）"),
      body: JSON.stringify(content),
      parentRevisionRef: input.draftRevisionRef,
      revisionState: "confirmed",
      contentHash: row.content_hash,
      structuredContent: content,
      changeReason: "教师显式确认课后反思",
      evidenceRefs: row.assignment_evidence_refs,
      teacherSelection: { confirmedBy: input.confirmedBy },
      metadata: input.revisionMetadata
    });
    await client.query(
      `UPDATE artifact.artifact SET latest_revision_ref = $2 WHERE artifact_ref = $1`,
      [input.reflectionRef, input.confirmedRevisionRef]
    );
    const scope: ReflectionScopeInput = {
      tenantRef: row.tenant_ref,
      courseRunRef: row.course_run_ref,
      lessonRef: row.lesson_ref,
      teachingPlanRevisionRef: row.teaching_plan_revision_ref,
      deliveryRevisionRef: row.delivery_revision_ref,
      observationRevisionRefs: row.observation_revision_refs,
      assignmentEvidenceRefs: row.assignment_evidence_refs
    };
    const receipts: FormalWriteReceipt[] = [
      createReceipt({ writeRef: input.confirmedRevisionRef, recordType: "ArtifactRevision", metadata: input.revisionMetadata }),
      await this.insertScope(client, {
        scopeRef: `reflection-scope:${input.confirmedRevisionRef}`,
        artifactRef: input.reflectionRef,
        revisionRef: input.confirmedRevisionRef,
        scope,
        lifecycleStatus: "current_confirmed",
        sourceAgentRunRef: row.source_agent_run_ref,
        confirmedBy: input.confirmedBy,
        confirmedAt: input.revisionMetadata.createdAt,
        contentHash: row.content_hash,
        metadata: input.scopeMetadata
      }),
      await this.insertEvent(client, {
        eventRef: input.eventRef,
        artifactRef: input.reflectionRef,
        revisionRef: input.confirmedRevisionRef,
        lessonRef: row.lesson_ref,
        deliveryRevisionRef: row.delivery_revision_ref,
        eventName: "LessonReflectionConfirmed",
        payload: { draftRevisionRef: input.draftRevisionRef },
        metadata: input.eventMetadata
      }),
      await this.insertOutbox(client, {
        outboxRef: input.outboxRef,
        eventName: "LessonReflectionConfirmed",
        aggregateRef: input.reflectionRef,
        payload: { reflectionRevisionRef: input.confirmedRevisionRef, lessonRef: row.lesson_ref },
        metadata: input.outboxMetadata
      })
    ];
    return { revisionNumber: next, receipts };
  }

  async getReflection(
    executor: SqlExecutor,
    tenantRef: string,
    reflectionRef: string
  ): Promise<{ reflectionRef: string; revisions: ReflectionRevisionView[] } | undefined> {
    const result = await executor.query<ReflectionRow>(
      `${reflectionSelect}
        WHERE scope.tenant_ref = $1 AND scope.artifact_ref = $2
        ORDER BY revision.revision_number DESC`,
      [tenantRef, reflectionRef]
    );
    if (result.rows.length === 0) return undefined;
    return {
      reflectionRef,
      revisions: result.rows.map(toReflectionRevision)
    };
  }

  async getReflectionByRevision(
    executor: SqlExecutor,
    tenantRef: string,
    revisionRef: string
  ): Promise<ReflectionRevisionView | undefined> {
    const result = await executor.query<ReflectionRow>(
      `${reflectionSelect}
        WHERE scope.tenant_ref = $1 AND scope.revision_ref = $2`,
      [tenantRef, revisionRef]
    );
    return result.rows[0] ? toReflectionRevision(result.rows[0]) : undefined;
  }

  async findReflectionForDelivery(
    executor: SqlExecutor,
    tenantRef: string,
    deliveryRevisionRef: string
  ): Promise<string | undefined> {
    const result = await executor.query<{ artifact_ref: string }>(
      `SELECT artifact_ref FROM artifact.lesson_reflection_scope
        WHERE tenant_ref = $1 AND delivery_revision_ref = $2
        ORDER BY updated_at DESC LIMIT 1`,
      [tenantRef, deliveryRevisionRef]
    );
    return result.rows[0]?.artifact_ref;
  }

  async listLessonReflections(
    executor: SqlExecutor,
    tenantRef: string,
    lessonRef: string
  ): Promise<ReflectionRevisionView[]> {
    const result = await executor.query<ReflectionRow>(
      `${reflectionSelect}
        WHERE scope.tenant_ref = $1 AND scope.lesson_ref = $2
        ORDER BY revision.revision_number DESC`,
      [tenantRef, lessonRef]
    );
    return result.rows.map(toReflectionRevision);
  }

  private async nextRevisionNumber(client: PostgresClient, artifactRef: string): Promise<number> {
    const locked = await client.query(
      `SELECT artifact_ref FROM artifact.artifact WHERE artifact_ref = $1 FOR UPDATE`,
      [artifactRef]
    );
    if (!locked.rows[0]) throw new Error("LessonReflection artifact not found.");
    const result = await client.query<{ next_revision: number }>(
      `SELECT COALESCE(max(revision_number), 0)::int + 1 AS next_revision
         FROM artifact.artifact_revision WHERE artifact_ref = $1`,
      [artifactRef]
    );
    return result.rows[0]?.next_revision ?? 1;
  }

  private async insertScope(
    client: PostgresClient,
    input: {
      scopeRef: string;
      artifactRef: string;
      revisionRef: string;
      scope: ReflectionScopeInput;
      lifecycleStatus: "draft" | "current_confirmed";
      sourceAgentRunRef: string | null;
      confirmedBy: string | null;
      confirmedAt: string | null;
      contentHash: string;
      metadata: ArtifactMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO artifact.lesson_reflection_scope (
         scope_ref, artifact_ref, revision_ref, tenant_ref, course_run_ref,
         lesson_ref, teaching_plan_revision_ref, delivery_revision_ref,
         observation_revision_refs, assignment_evidence_refs, lifecycle_status,
         source_agent_run_ref, confirmed_by, confirmed_at, content_hash,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11,
         $12, $13, $14::timestamptz, $15,
         $16, $17, $18, $19, $20, $21, $22, $22
       )`,
      [
        input.scopeRef,
        input.artifactRef,
        input.revisionRef,
        input.scope.tenantRef,
        input.scope.courseRunRef,
        input.scope.lessonRef,
        input.scope.teachingPlanRevisionRef,
        input.scope.deliveryRevisionRef,
        toPostgresJson(input.scope.observationRevisionRefs),
        toPostgresJson(input.scope.assignmentEvidenceRefs),
        input.lifecycleStatus,
        input.sourceAgentRunRef,
        input.confirmedBy,
        input.confirmedAt,
        input.contentHash,
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({ writeRef: input.scopeRef, recordType: "LessonReflectionScope", metadata: input.metadata });
  }

  private async insertEvent(
    client: PostgresClient,
    input: {
      eventRef: string;
      artifactRef: string;
      revisionRef: string;
      lessonRef: string;
      deliveryRevisionRef: string;
      eventName: "LessonReflectionDraftCreated" | "LessonReflectionDraftGenerated" | "LessonReflectionDraftEdited" | "LessonReflectionConfirmed";
      payload: Record<string, unknown>;
      metadata: ArtifactMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO artifact.lesson_reflection_event (
         event_ref, artifact_ref, revision_ref, lesson_ref, delivery_revision_ref,
         event_name, event_payload,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14)`,
      [
        input.eventRef,
        input.artifactRef,
        input.revisionRef,
        input.lessonRef,
        input.deliveryRevisionRef,
        input.eventName,
        toPostgresJson(input.payload),
        ...formalMetadataValues(input.metadata)
      ]
    );
    return createReceipt({ writeRef: input.eventRef, recordType: "LessonReflectionEvent", metadata: input.metadata });
  }

  private async insertOutbox(
    client: PostgresClient,
    input: {
      outboxRef: string;
      eventName: string;
      aggregateRef: string;
      payload: Record<string, unknown>;
      metadata: ArtifactMetadata;
    }
  ): Promise<FormalWriteReceipt> {
    await client.query(
      `INSERT INTO artifact.outbox_record (
         outbox_ref, event_name, aggregate_ref, payload,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)`,
      [input.outboxRef, input.eventName, input.aggregateRef, toPostgresJson(input.payload), ...formalMetadataValues(input.metadata)]
    );
    return createReceipt({ writeRef: input.outboxRef, recordType: "OutboxRecord", metadata: input.metadata });
  }
}

function reflectionHash(content: ReflectionContent, scope: ReflectionScopeInput): string {
  return createHash("sha256").update(JSON.stringify({ content, scope })).digest("hex");
}

const reflectionSelect = `SELECT scope.scope_ref, scope.artifact_ref,
  scope.revision_ref, revision.revision_number, revision.title,
  revision.structured_content, revision.source_agent_run_ref,
  revision.parent_revision_ref, revision.content_hash,
  scope.tenant_ref, scope.course_run_ref, scope.lesson_ref,
  scope.teaching_plan_revision_ref, scope.delivery_revision_ref,
  scope.observation_revision_refs, scope.assignment_evidence_refs,
  scope.lifecycle_status, scope.confirmed_by, scope.confirmed_at,
  revision.created_at
  FROM artifact.lesson_reflection_scope AS scope
  JOIN artifact.artifact_revision AS revision ON revision.revision_ref = scope.revision_ref`;

interface ReflectionRow {
  scope_ref: string;
  artifact_ref: string;
  revision_ref: string;
  revision_number: number;
  title: string;
  structured_content: unknown;
  source_agent_run_ref: string | null;
  parent_revision_ref: string | null;
  content_hash: string;
  tenant_ref: string;
  course_run_ref: string;
  lesson_ref: string;
  teaching_plan_revision_ref: string;
  delivery_revision_ref: string;
  observation_revision_refs: string[];
  assignment_evidence_refs: string[];
  lifecycle_status: "draft" | "current_confirmed" | "historical_confirmed" | "superseded";
  confirmed_by: string | null;
  confirmed_at: Date | null;
  created_at: Date;
}

function toReflectionRevision(row: ReflectionRow): ReflectionRevisionView {
  return ReflectionRevisionViewSchema.parse({
    reflectionRevisionRef: row.revision_ref,
    reflectionRef: row.artifact_ref,
    revisionNumber: row.revision_number,
    status: row.lifecycle_status === "draft"
      ? "draft"
      : row.lifecycle_status === "current_confirmed"
        ? "confirmed"
        : "superseded",
    tenantRef: row.tenant_ref,
    courseRunRef: row.course_run_ref,
    lessonRef: row.lesson_ref,
    teachingPlanRevisionRef: row.teaching_plan_revision_ref,
    deliveryRevisionRef: row.delivery_revision_ref,
    observationRevisionRefs: row.observation_revision_refs,
    assignmentEvidenceRefs: row.assignment_evidence_refs,
    content: ReflectionContentSchema.parse(row.structured_content),
    sourceAgentRunRef: row.source_agent_run_ref,
    parentRevisionRef: row.parent_revision_ref,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString()
  });
}


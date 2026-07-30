import { randomUUID } from "node:crypto";

import {
  PedagogicalStrategySchema,
  TeachingPlanDiffSchema,
  TeachingPlanSchema,
  type FormalWriteMetadata,
  type FormalWriteReceipt,
  type PedagogicalStrategy,
  type TeachingPlan,
  type TeachingPlanDiff
} from "@edu-agent/contracts";

import type {
  PostgresClient,
  SqlExecutor
} from "../../../platform/postgres/types.js";
import {
  createReceipt,
  createWriteMetadata,
  formalMetadataValues,
  toPostgresJson,
  type WriteContext
} from "../../../platform/postgres/write-context.js";
import {
  buildArtifactContentHash,
  PostgresArtifactRepository
} from "./postgres-artifact-repository.js";

type ArtifactMetadata = FormalWriteMetadata & { owner: "artifact" };

export interface StructuredTeachingPlanRevision {
  artifactRef: string;
  revisionRef: string;
  revisionNumber: number;
  parentRevisionRef: string | null;
  selectedStrategyId: string | null;
  teacherSelection: "accepted" | "modified" | null;
  state:
    | "draft"
    | "proposal"
    | "in_review"
    | "superseded"
    | "approved"
    | "published";
  title: string;
  content: TeachingPlan;
  createdAt: string;
}

export class PostgresGate2ArtifactRepository {
  constructor(
    private readonly base = new PostgresArtifactRepository()
  ) {}

  async insertTeachingPlanSeed(
    client: PostgresClient,
    input: {
      artifactRef: string;
      revisionRef: string;
      title: string;
      content: TeachingPlan;
      metadata: ArtifactMetadata;
      outboxMetadata: ArtifactMetadata;
      outboxRef: string;
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    return this.base.insertArtifactBundle(client, {
      artifact: {
        artifactRef: input.artifactRef,
        artifactType: "ContentArtifact",
        latestRevisionRef: input.revisionRef,
        currentApprovedRevisionRef: input.revisionRef,
        metadata: input.metadata
      },
      revision: {
        revisionRef: input.revisionRef,
        artifactRef: input.artifactRef,
        revisionNumber: 1,
        artifactType: "TeachingPlan",
        title: input.title,
        body: JSON.stringify(input.content),
        revisionState: "approved",
        contentHash: buildArtifactContentHash(
          input.title,
          JSON.stringify(input.content)
        ),
        structuredContent: input.content,
        changeReason: "合成演示的初始已批准 TeachingPlan",
        evidenceRefs: input.content.evidenceRefs,
        teacherSelection: {
          source: "synthetic-seed"
        },
        metadata: input.metadata
      },
      outbox: {
        outboxRef: input.outboxRef,
        eventName: "TeachingPlanApprovedSeeded",
        aggregateRef: input.artifactRef,
        payload: {
          revisionRef: input.revisionRef,
          dataMode: "synthetic"
        },
        metadata: input.outboxMetadata
      }
    });
  }

  async insertCopilotArtifacts(
    client: PostgresClient,
    input: {
      proposalArtifactRef: string;
      proposalRevisionRef: string;
      proposalTitle: string;
      sourceAgentRunRef: string;
      strategies: readonly PedagogicalStrategy[];
      diffsByStrategy: Record<string, TeachingPlanDiff>;
      teachingPlanArtifactRef: string;
      parentTeachingPlanRevisionRef: string;
      draftRevisionRef: string;
      draftPlan: TeachingPlan;
      lessonRef?: string;
      preparationTaskRef?: string;
      writeContext: WriteContext;
    }
  ): Promise<{
    receipts: readonly FormalWriteReceipt[];
    draftRevision: StructuredTeachingPlanRevision;
  }> {
    const now = input.writeContext.createdAt;
    const proposalMetadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      "pedagogical-suggestion"
    );
    const proposalOutboxMetadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      "pedagogical-suggestion-outbox"
    );
    const proposalReceipts = await this.base.insertArtifactBundle(
      client,
      {
        artifact: {
          artifactRef: input.proposalArtifactRef,
          artifactType: "OperationalProposal",
          latestRevisionRef: input.proposalRevisionRef,
          metadata: proposalMetadata
        },
        revision: {
          revisionRef: input.proposalRevisionRef,
          artifactRef: input.proposalArtifactRef,
          revisionNumber: 1,
          artifactType: "PedagogicalSuggestion",
          title: input.proposalTitle,
          body: JSON.stringify({
            strategies: input.strategies,
            diffsByStrategy: input.diffsByStrategy
          }),
          sourceAgentRunRef: input.sourceAgentRunRef,
          revisionState: "proposal",
          contentHash: buildArtifactContentHash(
            input.proposalTitle,
            JSON.stringify(input.strategies)
          ),
          structuredContent: {
            strategies: input.strategies,
            diffsByStrategy: input.diffsByStrategy
          },
          changeReason: "Mock Teacher Copilot 生成的可审查教学建议",
          evidenceRefs: input.strategies.flatMap(
            (strategy) => strategy.evidenceRefs
          ),
          teacherSelection: {
            status: "pending"
          },
          metadata: proposalMetadata
        },
        outbox: {
          outboxRef: `outbox:${randomUUID()}`,
          eventName: "PedagogicalSuggestionProposed",
          aggregateRef: input.proposalArtifactRef,
          payload: {
            proposalRevisionRef: input.proposalRevisionRef,
            sourceAgentRunRef: input.sourceAgentRunRef
          },
          metadata: proposalOutboxMetadata
        }
      }
    );

    const nextRevision = await this.nextRevisionNumber(
      client,
      input.teachingPlanArtifactRef
    );
    const draftMetadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      "teaching-plan-draft"
    );
    await this.base.insertRevision(client, {
      revisionRef: input.draftRevisionRef,
      artifactRef: input.teachingPlanArtifactRef,
      revisionNumber: nextRevision,
      artifactType: "TeachingPlan",
      title: "一次函数斜率与图像关系｜课堂调整草稿",
      body: JSON.stringify(input.draftPlan),
      sourceAgentRunRef: input.sourceAgentRunRef,
      parentRevisionRef: input.parentTeachingPlanRevisionRef,
      revisionState: "draft",
      contentHash: buildArtifactContentHash(
        "一次函数斜率与图像关系｜课堂调整草稿",
        JSON.stringify(input.draftPlan)
      ),
      structuredContent: input.draftPlan,
      changeReason: "根据可追溯学习证据形成课堂调整草稿",
      evidenceRefs: input.draftPlan.evidenceRefs,
      teacherSelection: {
        status: "pending",
        defaultStrategyId: input.strategies[0]?.strategyId
      },
      metadata: draftMetadata
    });
    await client.query(
      `UPDATE artifact.artifact
          SET latest_revision_ref = $2
        WHERE artifact_ref = $1`,
      [input.teachingPlanArtifactRef, input.draftRevisionRef]
    );
    const draftReceipt = createReceipt({
      writeRef: input.draftRevisionRef,
      recordType: "ArtifactRevision",
      metadata: draftMetadata
    });
    const draftOutboxReceipt = await this.insertOutbox(client, {
      outboxRef: `outbox:${randomUUID()}`,
      eventName: "TeachingPlanDraftProposed",
      aggregateRef: input.teachingPlanArtifactRef,
      payload: {
        revisionRef: input.draftRevisionRef,
        parentRevisionRef: input.parentTeachingPlanRevisionRef
      },
      metadata: createWriteMetadata(
        input.writeContext,
        "artifact",
        "teaching-plan-draft-outbox"
      )
    });
    const scopeReceipts =
      input.lessonRef && input.preparationTaskRef
        ? await this.insertTeachingPlanScope(client, {
            artifactRef: input.teachingPlanArtifactRef,
            revisionRef: input.draftRevisionRef,
            lessonRef: input.lessonRef,
            preparationTaskRef: input.preparationTaskRef,
            lifecycleStatus: "draft",
            eventName: "TeachingPlanDraftScoped",
            eventPayload: {
              parentRevisionRef:
                input.parentTeachingPlanRevisionRef
            },
            writeContext: input.writeContext
          })
        : [];

    return {
      receipts: [
        ...proposalReceipts,
        draftReceipt,
        draftOutboxReceipt,
        ...scopeReceipts
      ],
      draftRevision: {
        artifactRef: input.teachingPlanArtifactRef,
        revisionRef: input.draftRevisionRef,
        revisionNumber: nextRevision,
        parentRevisionRef: input.parentTeachingPlanRevisionRef,
        selectedStrategyId: null,
        teacherSelection: null,
        state: "draft",
        title: "一次函数斜率与图像关系｜课堂调整草稿",
        content: input.draftPlan,
        createdAt: now
      }
    };
  }

  async insertInReviewRevision(
    client: PostgresClient,
    input: {
      artifactRef: string;
      parentRevisionRef: string;
      content: TeachingPlan;
      selectedStrategyId: string;
      disposition:
        | "accepted"
        | "accepted_with_changes";
      teacherEdits: Record<string, unknown>;
      lessonRef?: string;
      preparationTaskRef?: string;
      writeContext: WriteContext;
    }
  ): Promise<{
    revision: StructuredTeachingPlanRevision;
    receipts: readonly FormalWriteReceipt[];
  }> {
    const revisionNumber = await this.nextRevisionNumber(
      client,
      input.artifactRef
    );
    const revisionRef = `artifact-revision:${randomUUID()}`;
    const metadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      "teacher-reviewed-teaching-plan"
    );
    const title = "一次函数斜率与图像关系｜教师审阅版";
    const supersededReceipts =
      input.lessonRef && input.preparationTaskRef
        ? await this.supersedeActiveReview(client, {
            artifactRef: input.artifactRef,
            lessonRef: input.lessonRef,
            preparationTaskRef: input.preparationTaskRef,
            supersededByRevisionRef: revisionRef,
            writeContext: input.writeContext
          })
        : [];
    await this.base.insertRevision(client, {
      revisionRef,
      artifactRef: input.artifactRef,
      revisionNumber,
      artifactType: "TeachingPlan",
      title,
      body: JSON.stringify(input.content),
      parentRevisionRef: input.parentRevisionRef,
      revisionState: "in_review",
      contentHash: buildArtifactContentHash(
        title,
        JSON.stringify(input.content)
      ),
      structuredContent: input.content,
      changeReason:
        input.disposition === "accepted"
          ? "教师接受建议并提交审阅"
          : "教师修改建议后提交审阅",
      evidenceRefs: input.content.evidenceRefs,
      teacherSelection: {
        disposition: input.disposition,
        selectedStrategyId: input.selectedStrategyId,
        teacherEdits: input.teacherEdits
      },
      metadata
    });
    await client.query(
      `UPDATE artifact.artifact
          SET latest_revision_ref = $2,
              current_in_review_revision_ref = $2
        WHERE artifact_ref = $1`,
      [input.artifactRef, revisionRef]
    );
    const revisionReceipt = createReceipt({
      writeRef: revisionRef,
      recordType: "ArtifactRevision",
      metadata
    });
    const outboxReceipt = await this.insertOutbox(client, {
      outboxRef: `outbox:${randomUUID()}`,
      eventName: "TeachingPlanSubmittedForReview",
      aggregateRef: input.artifactRef,
      payload: {
        revisionRef,
        parentRevisionRef: input.parentRevisionRef,
        published: false
      },
      metadata: createWriteMetadata(
        input.writeContext,
        "artifact",
        "teacher-reviewed-teaching-plan-outbox"
      )
    });
    const scopeReceipts =
      input.lessonRef && input.preparationTaskRef
        ? await this.insertTeachingPlanScope(client, {
            artifactRef: input.artifactRef,
            revisionRef,
            lessonRef: input.lessonRef,
            preparationTaskRef: input.preparationTaskRef,
            lifecycleStatus: "active_in_review",
            eventName: "TeachingPlanReviewActivated",
            eventPayload: {
              parentRevisionRef: input.parentRevisionRef
            },
            writeContext: input.writeContext
          })
        : [];
    return {
      revision: {
        artifactRef: input.artifactRef,
        revisionRef,
        revisionNumber,
        parentRevisionRef: input.parentRevisionRef,
        selectedStrategyId: input.selectedStrategyId,
        teacherSelection:
          input.disposition === "accepted"
            ? "accepted"
            : "modified",
        state: "in_review",
        title,
        content: input.content,
        createdAt: input.writeContext.createdAt
      },
      receipts: [
        revisionReceipt,
        outboxReceipt,
        ...supersededReceipts,
        ...scopeReceipts
      ]
    };
  }

  async insertTeachingPlanSeedScope(
    client: PostgresClient,
    input: {
      artifactRef: string;
      revisionRef: string;
      lessonRef: string;
      writeContext: WriteContext;
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    return this.insertTeachingPlanScope(client, {
      artifactRef: input.artifactRef,
      revisionRef: input.revisionRef,
      lessonRef: input.lessonRef,
      lifecycleStatus: "current_approved",
      eventName: "TeachingPlanApprovedForLesson",
      eventPayload: {
        source: "synthetic-seed"
      },
      writeContext: input.writeContext
    });
  }

  async getTeachingPlanRevisionScope(
    executor: SqlExecutor,
    revisionRef: string
  ): Promise<
    | {
        artifactRef: string;
        revisionRef: string;
        lessonRef: string;
        preparationTaskRef: string | null;
        lifecycleStatus:
          | "draft"
          | "active_in_review"
          | "superseded"
          | "current_approved"
          | "historical_approved";
      }
    | undefined
  > {
    const result = await executor.query<{
      artifact_ref: string;
      revision_ref: string;
      lesson_ref: string;
      preparation_task_ref: string | null;
      lifecycle_status:
        | "draft"
        | "active_in_review"
        | "superseded"
        | "current_approved"
        | "historical_approved";
    }>(
      `SELECT artifact_ref, revision_ref, lesson_ref,
              preparation_task_ref, lifecycle_status
         FROM artifact.teaching_plan_scope_lifecycle
        WHERE revision_ref = $1`,
      [revisionRef]
    );
    const row = result.rows[0];
    return row
      ? {
          artifactRef: row.artifact_ref,
          revisionRef: row.revision_ref,
          lessonRef: row.lesson_ref,
          preparationTaskRef: row.preparation_task_ref,
          lifecycleStatus: row.lifecycle_status
        }
      : undefined;
  }

  async listLessonTeachingPlanRevisions(
    executor: SqlExecutor,
    lessonRef: string
  ): Promise<
    Array<{
      revision: StructuredTeachingPlanRevision;
      lifecycleStatus:
        | "draft"
        | "active_in_review"
        | "superseded"
        | "current_approved"
        | "historical_approved";
      preparationTaskRef: string | null;
    }>
  > {
    const result = await executor.query<
      StructuredRevisionRow & {
        lifecycle_status:
          | "draft"
          | "active_in_review"
          | "superseded"
          | "current_approved"
          | "historical_approved";
        preparation_task_ref: string | null;
      }
    >(
      `SELECT revision.revision_ref, revision.artifact_ref,
              revision.revision_number,
              revision.parent_revision_ref,
              revision.revision_state, revision.title,
              revision.structured_content,
              revision.teacher_selection,
              revision.created_at,
              scope.lifecycle_status,
              scope.preparation_task_ref
         FROM artifact.teaching_plan_scope_lifecycle AS scope
         JOIN artifact.artifact_revision AS revision
           ON revision.revision_ref = scope.revision_ref
        WHERE scope.lesson_ref = $1
        ORDER BY revision.revision_number DESC`,
      [lessonRef]
    );
    return result.rows.map((row) => {
      const revision = toStructuredRevision(row);
      return {
        revision:
          row.lifecycle_status === "superseded"
            ? { ...revision, state: "superseded" }
            : revision,
        lifecycleStatus: row.lifecycle_status,
        preparationTaskRef: row.preparation_task_ref
      };
    });
  }

  async getCurrentApprovedTeachingPlan(
    executor: SqlExecutor,
    artifactRef: string
  ): Promise<StructuredTeachingPlanRevision | undefined> {
    const result = await executor.query<StructuredRevisionRow>(
      `SELECT revision.revision_ref, revision.artifact_ref,
              revision.revision_number,
              revision.parent_revision_ref,
              revision.revision_state, revision.title,
              revision.structured_content,
              revision.teacher_selection,
              revision.created_at
         FROM artifact.artifact AS artifact_record
         JOIN artifact.artifact_revision AS revision
           ON revision.revision_ref =
                artifact_record.current_approved_revision_ref
        WHERE artifact_record.artifact_ref = $1
          AND revision.artifact_type = 'TeachingPlan'
          AND revision.revision_state = 'approved'`,
      [artifactRef]
    );
    return result.rows[0]
      ? toStructuredRevision(result.rows[0])
      : undefined;
  }

  async getCurrentInReviewTeachingPlan(
    executor: SqlExecutor,
    artifactRef: string
  ): Promise<StructuredTeachingPlanRevision | undefined> {
    const result = await executor.query<StructuredRevisionRow>(
      `SELECT revision.revision_ref, revision.artifact_ref,
              revision.revision_number,
              revision.parent_revision_ref,
              revision.revision_state, revision.title,
              revision.structured_content,
              revision.teacher_selection,
              revision.created_at
         FROM artifact.artifact AS artifact_record
         JOIN artifact.artifact_revision AS revision
           ON revision.revision_ref =
                artifact_record.current_in_review_revision_ref
        WHERE artifact_record.artifact_ref = $1
          AND revision.artifact_type = 'TeachingPlan'
          AND revision.revision_state = 'in_review'`,
      [artifactRef]
    );
    return result.rows[0]
      ? toStructuredRevision(result.rows[0])
      : undefined;
  }

  async listTeachingPlanRevisions(
    executor: SqlExecutor,
    artifactRef: string,
    state?: "draft"
  ): Promise<StructuredTeachingPlanRevision[]> {
    const result = await executor.query<StructuredRevisionRow>(
      `SELECT revision_ref, artifact_ref, revision_number,
              parent_revision_ref, revision_state, title,
              structured_content, teacher_selection, created_at
         FROM artifact.artifact_revision
        WHERE artifact_ref = $1
          AND artifact_type = 'TeachingPlan'
          AND ($2::text IS NULL OR revision_state = $2)
        ORDER BY revision_number DESC`,
      [artifactRef, state ?? null]
    );
    return result.rows.map(toStructuredRevision);
  }

  async lockTeachingPlanLifecycle(
    client: PostgresClient,
    artifactRef: string
  ): Promise<
    | {
        currentApprovedRevisionRef: string;
        currentInReviewRevisionRef: string | null;
      }
    | undefined
  > {
    const result = await client.query<{
      current_approved_revision_ref: string | null;
      current_in_review_revision_ref: string | null;
    }>(
      `SELECT current_approved_revision_ref,
              current_in_review_revision_ref
         FROM artifact.artifact
        WHERE artifact_ref = $1
        FOR UPDATE`,
      [artifactRef]
    );
    const row = result.rows[0];
    return row?.current_approved_revision_ref
      ? {
          currentApprovedRevisionRef:
            row.current_approved_revision_ref,
          currentInReviewRevisionRef:
            row.current_in_review_revision_ref
        }
      : undefined;
  }

  async insertApprovedRevision(
    client: PostgresClient,
    input: {
      inReviewRevision: StructuredTeachingPlanRevision;
      previousApprovedRevisionRef: string;
      lessonRef?: string;
      preparationTaskRef?: string;
      writeContext: WriteContext;
    }
  ): Promise<{
    revision: StructuredTeachingPlanRevision;
    receipts: readonly FormalWriteReceipt[];
  }> {
    const revisionNumber = await this.nextRevisionNumber(
      client,
      input.inReviewRevision.artifactRef
    );
    const revisionRef = `artifact-revision:${randomUUID()}`;
    const title = "一次函数斜率与图像关系｜已批准教学计划";
    const metadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      "approved-teaching-plan"
    );
    await this.base.insertRevision(client, {
      revisionRef,
      artifactRef: input.inReviewRevision.artifactRef,
      revisionNumber,
      artifactType: "TeachingPlan",
      title,
      body: JSON.stringify(input.inReviewRevision.content),
      parentRevisionRef: input.inReviewRevision.revisionRef,
      revisionState: "approved",
      contentHash: buildArtifactContentHash(
        title,
        JSON.stringify(input.inReviewRevision.content)
      ),
      structuredContent: input.inReviewRevision.content,
      changeReason: "教师单独批准为当前教学计划",
      evidenceRefs: input.inReviewRevision.content.evidenceRefs,
      teacherSelection: {
        approvalFromRevisionRef:
          input.inReviewRevision.revisionRef,
        selectedStrategyId:
          input.inReviewRevision.selectedStrategyId,
        disposition:
          input.inReviewRevision.teacherSelection === "accepted"
            ? "accepted"
            : "accepted_with_changes"
      },
      metadata
    });
    await client.query(
      `UPDATE artifact.artifact
          SET latest_revision_ref = $2,
              current_approved_revision_ref = $2,
              current_in_review_revision_ref = NULL
        WHERE artifact_ref = $1`,
      [input.inReviewRevision.artifactRef, revisionRef]
    );
    const revisionReceipt = createReceipt({
      writeRef: revisionRef,
      recordType: "ArtifactRevision",
      metadata
    });
    const outboxReceipt = await this.insertOutbox(client, {
      outboxRef: `outbox:${randomUUID()}`,
      eventName: "TeachingPlanApproved",
      aggregateRef: input.inReviewRevision.artifactRef,
      payload: {
        revisionRef,
        inReviewRevisionRef:
          input.inReviewRevision.revisionRef,
        previousApprovedRevisionRef:
          input.previousApprovedRevisionRef
      },
      metadata: createWriteMetadata(
        input.writeContext,
        "artifact",
        "approved-teaching-plan-outbox"
      )
    });
    const scopeReceipts: FormalWriteReceipt[] = [];
    if (input.lessonRef && input.preparationTaskRef) {
      await client.query(
        `UPDATE artifact.teaching_plan_scope_lifecycle
            SET lifecycle_status = 'historical_approved',
                superseded_by_revision_ref = $2,
                updated_at = $3
          WHERE lesson_ref = $1
            AND lifecycle_status = 'current_approved'`,
        [
          input.lessonRef,
          revisionRef,
          input.writeContext.createdAt
        ]
      );
      await client.query(
        `UPDATE artifact.teaching_plan_scope_lifecycle
            SET lifecycle_status = 'superseded',
                superseded_by_revision_ref = $2,
                updated_at = $3
          WHERE lesson_ref = $1
            AND revision_ref = $4
            AND lifecycle_status = 'active_in_review'`,
        [
          input.lessonRef,
          revisionRef,
          input.writeContext.createdAt,
          input.inReviewRevision.revisionRef
        ]
      );
      scopeReceipts.push(
        ...(await this.insertTeachingPlanScope(client, {
          artifactRef: input.inReviewRevision.artifactRef,
          revisionRef,
          lessonRef: input.lessonRef,
          preparationTaskRef: input.preparationTaskRef,
          lifecycleStatus: "current_approved",
          eventName: "TeachingPlanApprovedForLesson",
          eventPayload: {
            inReviewRevisionRef:
              input.inReviewRevision.revisionRef,
            previousApprovedRevisionRef:
              input.previousApprovedRevisionRef
          },
          writeContext: input.writeContext
        }))
      );
    }
    return {
      revision: {
        artifactRef: input.inReviewRevision.artifactRef,
        revisionRef,
        revisionNumber,
        parentRevisionRef: input.inReviewRevision.revisionRef,
        selectedStrategyId:
          input.inReviewRevision.selectedStrategyId,
        teacherSelection:
          input.inReviewRevision.teacherSelection,
        state: "approved",
        title,
        content: input.inReviewRevision.content,
        createdAt: input.writeContext.createdAt
      },
      receipts: [
        revisionReceipt,
        outboxReceipt,
        ...scopeReceipts
      ]
    };
  }

  async getTeachingPlanRevision(
    executor: SqlExecutor,
    revisionRef: string
  ): Promise<StructuredTeachingPlanRevision | undefined> {
    const result = await executor.query<StructuredRevisionRow>(
      `SELECT revision_ref, artifact_ref, revision_number,
              parent_revision_ref, revision_state, title,
              structured_content, teacher_selection, created_at
         FROM artifact.artifact_revision
        WHERE revision_ref = $1
          AND artifact_type = 'TeachingPlan'`,
      [revisionRef]
    );
    return result.rows[0]
      ? toStructuredRevision(result.rows[0])
      : undefined;
  }

  async getProposal(
    executor: SqlExecutor,
    proposalRevisionRef: string,
    options: { forUpdate?: boolean } = {}
  ): Promise<
    | {
        revisionNumber: number;
        strategies: PedagogicalStrategy[];
        diffsByStrategy: Record<string, TeachingPlanDiff>;
      }
    | undefined
  > {
    const result = await executor.query<{
      revision_number: number;
      structured_content: {
        strategies: unknown;
        diffsByStrategy: Record<string, unknown>;
      };
    }>(
      `SELECT revision_number, structured_content
         FROM artifact.artifact_revision
        WHERE revision_ref = $1
          AND artifact_type = 'PedagogicalSuggestion'
        ${options.forUpdate ? "FOR UPDATE" : ""}`,
      [proposalRevisionRef]
    );
    const content = result.rows[0]?.structured_content;
    if (!content) {
      return undefined;
    }
    const strategies = PedagogicalStrategySchema.array()
      .length(2)
      .parse(content.strategies);
    const diffsByStrategy = Object.fromEntries(
      Object.entries(content.diffsByStrategy).map(([key, value]) => [
        key,
        TeachingPlanDiffSchema.parse(value)
      ])
    );
    return {
      revisionNumber: result.rows[0]!.revision_number,
      strategies,
      diffsByStrategy
    };
  }

  async getProposalTitles(
    executor: SqlExecutor,
    revisionRefs: readonly string[]
  ): Promise<Map<string, string[]>> {
    if (revisionRefs.length === 0) {
      return new Map();
    }
    const result = await executor.query<{
      revision_ref: string;
      structured_content: {
        strategies: unknown;
      };
    }>(
      `SELECT revision_ref, structured_content
         FROM artifact.artifact_revision
        WHERE revision_ref = ANY($1::text[])`,
      [[...revisionRefs]]
    );
    return new Map(
      result.rows.map((row) => {
        const strategies = PedagogicalStrategySchema.array().parse(
          row.structured_content.strategies
        );
        return [
          row.revision_ref,
          strategies.map((strategy) => strategy.title)
        ];
      })
    );
  }

  async listRunArtifactRevisions(
    executor: SqlExecutor,
    agentRunRef: string
  ): Promise<
    Array<{
      revisionRef: string;
      artifactType: string;
      state: string;
      revisionNumber: number;
    }>
  > {
    const result = await executor.query<{
      revision_ref: string;
      artifact_type: string;
      revision_state: string;
      revision_number: number;
    }>(
      `SELECT revision_ref, artifact_type, revision_state,
              revision_number
         FROM artifact.artifact_revision
        WHERE source_agent_run_ref = $1
        ORDER BY created_at, revision_number`,
      [agentRunRef]
    );
    return result.rows.map((row) => ({
      revisionRef: row.revision_ref,
      artifactType: row.artifact_type,
      state: row.revision_state,
      revisionNumber: row.revision_number
    }));
  }

  private async supersedeActiveReview(
    client: PostgresClient,
    input: {
      artifactRef: string;
      lessonRef: string;
      preparationTaskRef: string;
      supersededByRevisionRef: string;
      writeContext: WriteContext;
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    const result = await client.query<{ revision_ref: string }>(
      `UPDATE artifact.teaching_plan_scope_lifecycle
          SET lifecycle_status = 'superseded',
              superseded_by_revision_ref = $2,
              updated_at = $3
        WHERE lesson_ref = $1
          AND lifecycle_status = 'active_in_review'
      RETURNING revision_ref`,
      [
        input.lessonRef,
        input.supersededByRevisionRef,
        input.writeContext.createdAt
      ]
    );
    const receipts: FormalWriteReceipt[] = [];
    for (const row of result.rows) {
      receipts.push(
        ...(await this.insertScopeEvent(client, {
          artifactRef: input.artifactRef,
          revisionRef: row.revision_ref,
          lessonRef: input.lessonRef,
          preparationTaskRef: input.preparationTaskRef,
          eventName: "TeachingPlanReviewSuperseded",
          eventPayload: {
            supersededByRevisionRef:
              input.supersededByRevisionRef
          },
          writeContext: input.writeContext
        }))
      );
    }
    return receipts;
  }

  private async insertTeachingPlanScope(
    client: PostgresClient,
    input: {
      artifactRef: string;
      revisionRef: string;
      lessonRef: string;
      preparationTaskRef?: string;
      lifecycleStatus:
        | "draft"
        | "active_in_review"
        | "superseded"
        | "current_approved"
        | "historical_approved";
      eventName:
        | "TeachingPlanDraftScoped"
        | "TeachingPlanReviewActivated"
        | "TeachingPlanReviewSuperseded"
        | "TeachingPlanApprovedForLesson";
      eventPayload: Record<string, unknown>;
      writeContext: WriteContext;
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    const scopeRef = `teaching-plan-scope:${input.revisionRef}`;
    const metadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      `teaching-plan-scope:${input.revisionRef}`
    );
    await client.query(
      `INSERT INTO artifact.teaching_plan_scope_lifecycle (
         scope_ref, artifact_ref, revision_ref, lesson_ref,
         preparation_task_ref, lifecycle_status,
         superseded_by_revision_ref,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, NULL,
         $7, $8, $9, $10, $11, $12, $13, $13
       )`,
      [
        scopeRef,
        input.artifactRef,
        input.revisionRef,
        input.lessonRef,
        input.preparationTaskRef ?? null,
        input.lifecycleStatus,
        ...formalMetadataValues(metadata)
      ]
    );
    return [
      createReceipt({
        writeRef: scopeRef,
        recordType: "TeachingPlanScopeLifecycle",
        metadata
      }),
      ...(await this.insertScopeEvent(client, input))
    ];
  }

  private async insertScopeEvent(
    client: PostgresClient,
    input: {
      artifactRef: string;
      revisionRef: string;
      lessonRef: string;
      preparationTaskRef?: string;
      eventName:
        | "TeachingPlanDraftScoped"
        | "TeachingPlanReviewActivated"
        | "TeachingPlanReviewSuperseded"
        | "TeachingPlanApprovedForLesson";
      eventPayload: Record<string, unknown>;
      writeContext: WriteContext;
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    const eventRef = `teaching-plan-scope-event:${randomUUID()}`;
    const metadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      `teaching-plan-scope-event:${randomUUID()}`
    );
    await client.query(
      `INSERT INTO artifact.teaching_plan_scope_event (
         event_ref, artifact_ref, revision_ref, lesson_ref,
         preparation_task_ref, event_name, event_payload,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14
       )`,
      [
        eventRef,
        input.artifactRef,
        input.revisionRef,
        input.lessonRef,
        input.preparationTaskRef ?? null,
        input.eventName,
        toPostgresJson(input.eventPayload),
        ...formalMetadataValues(metadata)
      ]
    );
    return [
      createReceipt({
        writeRef: eventRef,
        recordType: "TeachingPlanScopeEvent",
        metadata
      })
    ];
  }

  private async nextRevisionNumber(
    client: PostgresClient,
    artifactRef: string
  ): Promise<number> {
    const artifact = await client.query(
      `SELECT artifact_ref
         FROM artifact.artifact
        WHERE artifact_ref = $1
        FOR UPDATE`,
      [artifactRef]
    );
    if (!artifact.rows[0]) {
      throw new Error(`Artifact not found: ${artifactRef}`);
    }
    const next = await client.query<{ revision_number: number }>(
      `SELECT COALESCE(max(revision_number), 0)::integer + 1
              AS revision_number
         FROM artifact.artifact_revision
        WHERE artifact_ref = $1`,
      [artifactRef]
    );
    return next.rows[0]?.revision_number ?? 1;
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
}

interface StructuredRevisionRow {
  revision_ref: string;
  artifact_ref: string;
  revision_number: number;
  parent_revision_ref: string | null;
  revision_state:
    | "draft"
    | "proposal"
    | "in_review"
    | "superseded"
    | "approved"
    | "published";
  title: string;
  structured_content: unknown;
  teacher_selection: unknown;
  created_at: Date;
}

function selectionMetadata(selection: unknown): {
  selectedStrategyId: string | null;
  teacherSelection: "accepted" | "modified" | null;
} {
  if (
    typeof selection !== "object" ||
    selection === null ||
    !("selectedStrategyId" in selection)
  ) {
    return {
      selectedStrategyId: null,
      teacherSelection: null
    };
  }
  const value = selection.selectedStrategyId;
  const disposition =
    "disposition" in selection ? selection.disposition : null;
  return {
    selectedStrategyId:
      typeof value === "string" && value.length > 0
        ? value
        : null,
    teacherSelection:
      disposition === "accepted"
        ? "accepted"
        : disposition === "accepted_with_changes"
          ? "modified"
          : null
  };
}

function toStructuredRevision(
  row: StructuredRevisionRow
): StructuredTeachingPlanRevision {
  const selection = selectionMetadata(row.teacher_selection);
  return {
    artifactRef: row.artifact_ref,
    revisionRef: row.revision_ref,
    revisionNumber: row.revision_number,
    parentRevisionRef: row.parent_revision_ref,
    selectedStrategyId: selection.selectedStrategyId,
    teacherSelection: selection.teacherSelection,
    state: row.revision_state,
    title: row.title,
    content: TeachingPlanSchema.parse(row.structured_content),
    createdAt: row.created_at.toISOString()
  };
}

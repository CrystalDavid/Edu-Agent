import { createHash, randomUUID } from "node:crypto";

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
  createWriteMetadata,
  formalMetadataValues,
  toPostgresJson,
  type WriteContext
} from "../../../platform/postgres/write-context.js";

export interface PostgresArtifactBundle {
  artifact: {
    artifactRef: string;
    artifactType:
      | "ContentArtifact"
      | "OperationalProposal"
      | "ConfigurationAsset"
      | "EvidenceAsset";
    latestPublishedRevisionRef: string;
    metadata: FormalWriteMetadata & { owner: "artifact" };
  };
  revision: {
    revisionRef: string;
    artifactRef: string;
    revisionNumber: number;
    artifactType: string;
    title: string;
    body: string;
    sourceAgentRunRef?: string;
    parentRevisionRef?: string;
    revisionState: "draft" | "proposal" | "published";
    contentHash: string;
    metadata: FormalWriteMetadata & { owner: "artifact" };
  };
  outbox: {
    outboxRef: string;
    eventName: string;
    aggregateRef: string;
    payload: Record<string, unknown>;
    metadata: FormalWriteMetadata & { owner: "artifact" };
  };
}

export interface ArtifactRevisionView {
  revisionRef: string;
  artifactRef: string;
  revisionNumber: number;
  parentRevisionRef: string | null;
  revisionState: "draft" | "proposal" | "published";
  title: string;
  body: string;
  contentHash: string;
}

function contentHash(title: string, body: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ title, body }))
    .digest("hex");
}

export class PostgresArtifactRepository {
  async insertArtifactBundle(
    client: PostgresClient,
    bundle: PostgresArtifactBundle
  ): Promise<readonly FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO artifact.artifact (
         artifact_ref,
         artifact_type,
         latest_published_revision_ref,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3,
         $4, $5, $6, $7, $8, $9, $10
       )`,
      [
        bundle.artifact.artifactRef,
        bundle.artifact.artifactType,
        bundle.artifact.latestPublishedRevisionRef,
        ...formalMetadataValues(bundle.artifact.metadata)
      ]
    );
    await this.insertRevision(client, bundle.revision);
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
        bundle.outbox.outboxRef,
        bundle.outbox.eventName,
        bundle.outbox.aggregateRef,
        toPostgresJson(bundle.outbox.payload),
        ...formalMetadataValues(bundle.outbox.metadata)
      ]
    );
    return [
      createReceipt({
        writeRef: bundle.artifact.artifactRef,
        recordType: "Artifact",
        metadata: bundle.artifact.metadata
      }),
      createReceipt({
        writeRef: bundle.revision.revisionRef,
        recordType: "ArtifactRevision",
        metadata: bundle.revision.metadata
      }),
      createReceipt({
        writeRef: bundle.outbox.outboxRef,
        recordType: "OutboxRecord",
        metadata: bundle.outbox.metadata
      })
    ];
  }

  async insertRevision(
    client: PostgresClient,
    revision: PostgresArtifactBundle["revision"]
  ): Promise<void> {
    await client.query(
      `INSERT INTO artifact.artifact_revision (
         revision_ref,
         artifact_ref,
         revision_number,
         artifact_type,
         title,
         body,
         source_agent_run_ref,
         parent_revision_ref,
         revision_state,
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
         $11, $12, $13, $14, $15, $16, $17
       )`,
      [
        revision.revisionRef,
        revision.artifactRef,
        revision.revisionNumber,
        revision.artifactType,
        revision.title,
        revision.body,
        revision.sourceAgentRunRef ?? null,
        revision.parentRevisionRef ?? null,
        revision.revisionState,
        revision.contentHash,
        ...formalMetadataValues(revision.metadata)
      ]
    );
  }

  async insertProposalRevision(
    client: PostgresClient,
    input: {
      artifactRef: string;
      parentRevisionRef: string;
      title: string;
      body: string;
      writeContext: WriteContext;
    }
  ): Promise<{
    revision: ArtifactRevisionView;
    receipt: FormalWriteReceipt;
  }> {
    const artifact = await client.query<{
      artifact_type: string;
    }>(
      `SELECT artifact_type
         FROM artifact.artifact
        WHERE artifact_ref = $1
        FOR UPDATE`,
      [input.artifactRef]
    );
    if (!artifact.rows[0]) {
      throw new Error(`Artifact not found: ${input.artifactRef}`);
    }
    const parent = await this.getRevision(
      client,
      input.parentRevisionRef
    );
    if (!parent || parent.artifactRef !== input.artifactRef) {
      throw new Error("The proposal parent does not belong to the artifact.");
    }
    const next = await client.query<{ revision_number: number }>(
      `SELECT COALESCE(max(revision_number), 0)::integer + 1
              AS revision_number
         FROM artifact.artifact_revision
        WHERE artifact_ref = $1`,
      [input.artifactRef]
    );
    const revisionRef = `artifact-revision:${randomUUID()}`;
    const metadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      `proposal:${revisionRef}`
    );
    const revision: PostgresArtifactBundle["revision"] = {
      revisionRef,
      artifactRef: input.artifactRef,
      revisionNumber: next.rows[0]?.revision_number ?? 1,
      artifactType: artifact.rows[0].artifact_type,
      title: input.title,
      body: input.body,
      parentRevisionRef: input.parentRevisionRef,
      revisionState: "proposal",
      contentHash: contentHash(input.title, input.body),
      metadata
    };
    await this.insertRevision(client, revision);
    return {
      revision: {
        revisionRef,
        artifactRef: revision.artifactRef,
        revisionNumber: revision.revisionNumber,
        parentRevisionRef: input.parentRevisionRef,
        revisionState: "proposal",
        title: input.title,
        body: input.body,
        contentHash: revision.contentHash
      },
      receipt: createReceipt({
        writeRef: revisionRef,
        recordType: "ArtifactRevision",
        metadata
      })
    };
  }

  async getRevision(
    executor: SqlExecutor,
    revisionRef: string
  ): Promise<ArtifactRevisionView | undefined> {
    const result = await executor.query<{
      revision_ref: string;
      artifact_ref: string;
      revision_number: number;
      parent_revision_ref: string | null;
      revision_state: "draft" | "proposal" | "published";
      title: string;
      body: string;
      content_hash: string;
    }>(
      `SELECT revision_ref, artifact_ref, revision_number,
              parent_revision_ref, revision_state, title, body,
              content_hash
         FROM artifact.artifact_revision
        WHERE revision_ref = $1`,
      [revisionRef]
    );
    const row = result.rows[0];
    return row
      ? {
          revisionRef: row.revision_ref,
          artifactRef: row.artifact_ref,
          revisionNumber: row.revision_number,
          parentRevisionRef: row.parent_revision_ref,
          revisionState: row.revision_state,
          title: row.title,
          body: row.body,
          contentHash: row.content_hash
        }
      : undefined;
  }

  async latestPublishedRevisionRef(
    executor: SqlExecutor,
    artifactRef: string
  ): Promise<string | undefined> {
    const result = await executor.query<{
      latest_published_revision_ref: string | null;
    }>(
      `SELECT latest_published_revision_ref
         FROM artifact.artifact
        WHERE artifact_ref = $1`,
      [artifactRef]
    );
    return result.rows[0]?.latest_published_revision_ref ?? undefined;
  }
}

export function buildArtifactContentHash(
  title: string,
  body: string
): string {
  return contentHash(title, body);
}

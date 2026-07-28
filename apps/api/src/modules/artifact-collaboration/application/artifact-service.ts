import type {
  FormalWriteReceipt,
  OutboxRecord
} from "@edu-agent/contracts";

import { NotFoundError } from "../../../platform/errors.js";
import type { MetadataFactory } from "../../../platform/metadata.js";
import type { IdGenerator } from "../../../platform/system.js";
import type { ArtifactRevisionRecord } from "../domain/artifact-revision.js";

export interface ArtifactRepository {
  saveRevision(
    revision: ArtifactRevisionRecord,
    outbox: OutboxRecord
  ): void;
  findLatest(artifactRef: string): ArtifactRevisionRecord | undefined;
  listRevisions(): readonly ArtifactRevisionRecord[];
  listOutbox(): readonly OutboxRecord[];
}

export interface ArtifactCreationResult {
  revision: ArtifactRevisionRecord;
  outbox: OutboxRecord;
  receipts: readonly FormalWriteReceipt[];
}

export class ArtifactService {
  constructor(
    private readonly repository: ArtifactRepository,
    private readonly ids: IdGenerator
  ) {}

  createRevision(input: {
    title: string;
    body: string;
    sourceAgentRunRef: string;
    metadata: MetadataFactory;
  }): ArtifactCreationResult {
    const artifactRef = this.ids.next("artifact");
    const revisionRef = this.ids.next("artifact-revision");
    const revisionMetadata = input.metadata.create(
      "artifact",
      "artifact-revision"
    );
    const outboxMetadata = input.metadata.create(
      "artifact",
      "artifact-outbox"
    );
    const revision: ArtifactRevisionRecord = {
      artifactRef,
      revisionRef,
      revisionNumber: 1,
      artifactType: "ContentArtifact",
      title: input.title,
      body: input.body,
      sourceAgentRunRef: input.sourceAgentRunRef,
      metadata: revisionMetadata
    };
    const outbox: OutboxRecord = {
      outboxRef: this.ids.next("outbox"),
      eventName: "ArtifactRevisionCreated",
      aggregateRef: artifactRef,
      payload: {
        revisionRef,
        artifactType: revision.artifactType
      },
      metadata: outboxMetadata
    };

    this.repository.saveRevision(revision, outbox);

    return {
      revision,
      outbox,
      receipts: [
        {
          writeRef: revisionRef,
          recordType: "ArtifactRevision",
          owner: "artifact",
          metadata: revisionMetadata
        },
        {
          writeRef: outbox.outboxRef,
          recordType: "OutboxRecord",
          owner: "artifact",
          metadata: outboxMetadata
        }
      ]
    };
  }

  getLatest(artifactRef: string): ArtifactRevisionRecord {
    const revision = this.repository.findLatest(artifactRef);
    if (!revision) {
      throw new NotFoundError(`Artifact not found: ${artifactRef}`);
    }
    return revision;
  }
}

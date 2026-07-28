import type { OutboxRecord } from "@edu-agent/contracts";

import type { ArtifactRepository } from "../application/artifact-service.js";
import type { ArtifactRevisionRecord } from "../domain/artifact-revision.js";

export class InMemoryArtifactRepository implements ArtifactRepository {
  private readonly revisions = new Map<string, ArtifactRevisionRecord>();
  private readonly outbox = new Map<string, OutboxRecord>();

  saveRevision(
    revision: ArtifactRevisionRecord,
    outbox: OutboxRecord
  ): void {
    this.revisions.set(revision.artifactRef, revision);
    this.outbox.set(outbox.outboxRef, outbox);
  }

  findLatest(artifactRef: string): ArtifactRevisionRecord | undefined {
    return this.revisions.get(artifactRef);
  }

  listRevisions(): readonly ArtifactRevisionRecord[] {
    return [...this.revisions.values()];
  }

  listOutbox(): readonly OutboxRecord[] {
    return [...this.outbox.values()];
  }
}

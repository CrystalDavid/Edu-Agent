import type { FormalWriteMetadata } from "@edu-agent/contracts";

export interface ArtifactRevisionRecord {
  artifactRef: string;
  revisionRef: string;
  revisionNumber: 1;
  artifactType: "ContentArtifact";
  title: string;
  body: string;
  sourceAgentRunRef: string;
  metadata: FormalWriteMetadata & { owner: "artifact" };
}

import type {
  ArtifactReadResult,
  FormalWriteMetadata,
  WalkingSkeletonResult
} from "@edu-agent/contracts";

export interface TaskRecord {
  taskRef: string;
  title: string;
  status: "completed";
  metadata: FormalWriteMetadata;
}

export interface TaskRunRecord {
  taskRunRef: string;
  taskRef: string;
  attempt: 1;
  status: "completed";
  metadata: FormalWriteMetadata;
}

export interface QueryRunRecord {
  queryRunRef: string;
  queryName: string;
  status: "completed";
  resourceRef: string;
  requestedFieldMask: readonly string[];
  metadata: FormalWriteMetadata;
}

export interface IdempotencyRecord {
  idempotencyRef: string;
  rootKey: string;
  requestFingerprint: string;
  result: WalkingSkeletonResult;
  metadata: FormalWriteMetadata;
}

export interface QueryIdempotencyRecord {
  rootKey: string;
  requestFingerprint: string;
  result: ArtifactReadResult;
}

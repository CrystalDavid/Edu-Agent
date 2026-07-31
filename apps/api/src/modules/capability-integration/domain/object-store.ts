import type { Readable } from "node:stream";

export interface ObjectStorePutInput {
  content: Readable;
  maxBytes: number;
  expectedSizeBytes?: number;
}

export interface ObjectStorePutResult {
  objectKey: string;
  sizeBytes: number;
  sha256: string;
  firstBytesHex: string;
  createdAt: string;
}

export interface StoredObjectMetadata {
  objectKey: string;
  sizeBytes: number;
  sha256: string;
  modifiedAt: string;
}

export interface ObjectStore {
  put(input: ObjectStorePutInput): Promise<ObjectStorePutResult>;
  get(objectKey: string): Promise<Readable>;
  exists(objectKey: string): Promise<boolean>;
  metadata(objectKey: string): Promise<StoredObjectMetadata>;
  delete(objectKey: string): Promise<boolean>;
  listObjectKeys(): Promise<readonly string[]>;
  markOrphan(objectKey: string, safeReason: string): Promise<void>;
  clearOrphanMarker(objectKey: string): Promise<void>;
}

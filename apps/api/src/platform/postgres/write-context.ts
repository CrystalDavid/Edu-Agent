import { randomUUID } from "node:crypto";

import type {
  FormalWriteMetadata,
  FormalWriteReceipt,
  ModuleOwner
} from "@edu-agent/contracts";

export interface WriteContext {
  actorRef: string;
  purpose: string;
  rootIdempotencyKey: string;
  authorizationDecisionRef: string;
  createdAt: string;
}

export function createWriteMetadata<
  TOwner extends ModuleOwner
>(
  context: WriteContext,
  owner: TOwner,
  suffix: string
): FormalWriteMetadata & { owner: TOwner } {
  return {
    actorRef: context.actorRef,
    purpose: context.purpose,
    owner,
    idempotencyKey: `${context.rootIdempotencyKey}:${suffix}`,
    authorizationDecisionRef: context.authorizationDecisionRef,
    auditRef: `audit:${randomUUID()}`,
    createdAt: context.createdAt
  };
}

export function createReceipt(input: {
  writeRef: string;
  recordType: string;
  metadata: FormalWriteMetadata;
}): FormalWriteReceipt {
  return {
    writeRef: input.writeRef,
    recordType: input.recordType,
    owner: input.metadata.owner,
    metadata: input.metadata
  };
}

export function formalMetadataValues(
  metadata: FormalWriteMetadata
): unknown[] {
  return [
    metadata.actorRef,
    metadata.purpose,
    metadata.owner,
    metadata.idempotencyKey,
    metadata.authorizationDecisionRef,
    metadata.auditRef,
    metadata.createdAt
  ];
}

export function toPostgresJson(value: unknown): string {
  return JSON.stringify(value);
}

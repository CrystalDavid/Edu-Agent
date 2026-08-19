import { createHash } from "node:crypto";

import {
  MemoryContextPackManifestSchema,
  type MemoryContextDecisionEntry,
  type MemoryContextPackManifest,
  type MemoryContextPackOwner,
  type MemoryPreferenceDecisionEntry
} from "@edu-agent/contracts";

export const memoryContextPackManifestVersion = 1 as const;

const MemoryContextPackBuildInputSchema = MemoryContextPackManifestSchema.omit({
  packRef: true,
  packContentHash: true,
  manifestVersion: true,
  excludedCount: true
});

export interface MemoryContextPackBuildInput {
  readonly owner: MemoryContextPackOwner;
  readonly useCase: string;
  readonly policyVersion: string;
  readonly skillRef: string;
  readonly skillVersion: string;
  readonly skillContentHash: string;
  readonly conversationRef: string;
  readonly currentTurnRef: string;
  readonly currentTurnSequence: number;
  readonly currentTurnContentHash: string;
  readonly workingMemorySnapshotRef: string;
  readonly workingMemorySnapshotVersion: number;
  readonly workingMemorySnapshotContentHash: string;
  readonly contextDecisions: readonly MemoryContextDecisionEntry[];
  readonly preferenceDecisions: readonly MemoryPreferenceDecisionEntry[];
  readonly createdAt: string;
}

export function buildMemoryContextPackManifest(
  input: MemoryContextPackBuildInput
): MemoryContextPackManifest {
  const parsedInput = MemoryContextPackBuildInputSchema.parse(input);
  const contextDecisions = parsedInput.contextDecisions.map((entry) => ({
    ...entry,
    targetFields: [...entry.targetFields],
    allowedEffects: [...entry.allowedEffects]
  }));
  const preferenceDecisions = parsedInput.preferenceDecisions.map((entry) => ({
    ...entry,
    targetFields: [...entry.targetFields],
    allowedEffects: [...entry.allowedEffects]
  }));
  const excludedCount = [...contextDecisions, ...preferenceDecisions].filter(
    (entry) =>
      entry.decision === "excluded" || entry.decision === "overridden"
  ).length;
  const hashPayload = {
    manifestVersion: memoryContextPackManifestVersion,
    owner: { ...parsedInput.owner },
    useCase: parsedInput.useCase,
    policyVersion: parsedInput.policyVersion,
    skillRef: parsedInput.skillRef,
    skillVersion: parsedInput.skillVersion,
    skillContentHash: parsedInput.skillContentHash,
    conversationRef: parsedInput.conversationRef,
    currentTurnRef: parsedInput.currentTurnRef,
    currentTurnSequence: parsedInput.currentTurnSequence,
    currentTurnContentHash: parsedInput.currentTurnContentHash,
    workingMemorySnapshotRef: parsedInput.workingMemorySnapshotRef,
    workingMemorySnapshotVersion: parsedInput.workingMemorySnapshotVersion,
    workingMemorySnapshotContentHash:
      parsedInput.workingMemorySnapshotContentHash,
    contextDecisions,
    preferenceDecisions,
    excludedCount
  };
  const packContentHash = hashCanonical(hashPayload);

  return MemoryContextPackManifestSchema.parse({
    packRef: `memory-context-pack:${packContentHash}`,
    packContentHash,
    ...hashPayload,
    createdAt: parsedInput.createdAt
  });
}

function hashCanonical(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])])
    );
  }
  return value;
}

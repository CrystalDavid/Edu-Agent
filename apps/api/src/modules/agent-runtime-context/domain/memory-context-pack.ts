import { createHash } from "node:crypto";

import {
  MemoryContextPackManifestV1Schema,
  MemoryContextPackManifestV2Schema,
  MemoryContextPackManifestV3Schema,
  type MemoryContextDecisionEntry,
  type MemoryContextPackManifestV1,
  type MemoryContextPackManifestV2,
  type MemoryContextPackManifestV3,
  type MemoryContextPackOwner,
  type MemoryPreferenceDecisionEntry,
  type MemoryPreferenceDecisionEntryV2,
  type TemporaryOverrideDecisionEntry
} from "@edu-agent/contracts";

export const memoryContextPackManifestVersion = 1 as const;

const MemoryContextPackBuildInputSchema = MemoryContextPackManifestV1Schema.omit({
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
): MemoryContextPackManifestV1 {
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

  return MemoryContextPackManifestV1Schema.parse({
    packRef: `memory-context-pack:${packContentHash}`,
    packContentHash,
    ...hashPayload,
    createdAt: parsedInput.createdAt
  });
}

export const memoryContextPackManifestVersionV2 = 2 as const;

const MemoryContextPackBuildInputV2Schema =
  MemoryContextPackManifestV2Schema.omit({
    packRef: true,
    packContentHash: true,
    manifestVersion: true,
    selectedCount: true,
    overriddenCount: true,
    excludedCount: true
  });

export interface MemoryContextPackBuildInputV2 {
  readonly owner: MemoryContextPackOwner;
  readonly useCase: string;
  readonly policyVersion: string;
  readonly retrievalPolicyVersion: string;
  readonly teacherMemoryEpoch: number;
  readonly queryScopeHash: string;
  readonly querySkillId: string;
  readonly queryUseCase: string;
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
  readonly preferenceDecisions: readonly MemoryPreferenceDecisionEntryV2[];
  readonly createdAt: string;
}

export function buildMemoryContextPackManifestV2(
  input: MemoryContextPackBuildInputV2
): MemoryContextPackManifestV2 {
  const parsedInput = MemoryContextPackBuildInputV2Schema.parse(input);
  const contextDecisions = parsedInput.contextDecisions.map(copyDecision);
  const preferenceDecisions = parsedInput.preferenceDecisions.map(
    copyDecision
  );
  const selectedCount = preferenceDecisions.filter((entry) =>
    entry.decision === "selected" || entry.decision === "injected"
  ).length;
  const overriddenCount = preferenceDecisions.filter(
    (entry) => entry.decision === "overridden"
  ).length;
  const excludedCount = preferenceDecisions.filter(
    (entry) => entry.decision === "excluded"
  ).length;
  const hashPayload = {
    manifestVersion: memoryContextPackManifestVersionV2,
    owner: { ...parsedInput.owner },
    useCase: parsedInput.useCase,
    policyVersion: parsedInput.policyVersion,
    retrievalPolicyVersion: parsedInput.retrievalPolicyVersion,
    teacherMemoryEpoch: parsedInput.teacherMemoryEpoch,
    queryScopeHash: parsedInput.queryScopeHash,
    querySkillId: parsedInput.querySkillId,
    queryUseCase: parsedInput.queryUseCase,
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
    selectedCount,
    overriddenCount,
    excludedCount
  };
  const packContentHash = hashCanonical(hashPayload);
  return MemoryContextPackManifestV2Schema.parse({
    packRef: `memory-context-pack:${packContentHash}`,
    packContentHash,
    ...hashPayload,
    createdAt: parsedInput.createdAt
  });
}

export const memoryContextPackManifestVersionV3 = 3 as const;

const MemoryContextPackBuildInputV3Schema =
  MemoryContextPackManifestV3Schema.omit({
    packRef: true,
    packContentHash: true,
    manifestVersion: true,
    selectedCount: true,
    overriddenCount: true,
    excludedCount: true,
    injectedOverrideCount: true,
    suppressedPreferenceCount: true
  });

export interface MemoryContextPackBuildInputV3
  extends MemoryContextPackBuildInputV2 {
  readonly overridePolicyVersion:
    "temporary-preference-override-policy@1";
  readonly temporaryOverrideSetHash: string;
  readonly temporaryOverrideDecisions:
    readonly TemporaryOverrideDecisionEntry[];
}

export function buildMemoryContextPackManifestV3(
  input: MemoryContextPackBuildInputV3
): MemoryContextPackManifestV3 {
  const parsedInput = MemoryContextPackBuildInputV3Schema.parse(input);
  const contextDecisions = parsedInput.contextDecisions.map(copyDecision);
  const preferenceDecisions = parsedInput.preferenceDecisions.map(copyDecision);
  const temporaryOverrideDecisions =
    parsedInput.temporaryOverrideDecisions.map(copyDecision);
  const selectedCount = preferenceDecisions.filter((entry) =>
    entry.decision === "selected" || entry.decision === "injected"
  ).length;
  const overriddenCount = preferenceDecisions.filter(
    (entry) => entry.decision === "overridden"
  ).length;
  const excludedCount = preferenceDecisions.filter(
    (entry) => entry.decision === "excluded"
  ).length;
  const injectedOverrideCount = temporaryOverrideDecisions.filter((entry) =>
    entry.decision === "selected" || entry.decision === "injected"
  ).length;
  const suppressedPreferenceCount = temporaryOverrideDecisions.filter(
    (entry) => entry.effect === "suppress_preference" &&
      (entry.decision === "selected" || entry.decision === "injected")
  ).length;
  const hashPayload = {
    manifestVersion: memoryContextPackManifestVersionV3,
    owner: { ...parsedInput.owner },
    useCase: parsedInput.useCase,
    policyVersion: parsedInput.policyVersion,
    retrievalPolicyVersion: parsedInput.retrievalPolicyVersion,
    teacherMemoryEpoch: parsedInput.teacherMemoryEpoch,
    queryScopeHash: parsedInput.queryScopeHash,
    querySkillId: parsedInput.querySkillId,
    queryUseCase: parsedInput.queryUseCase,
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
    selectedCount,
    overriddenCount,
    excludedCount,
    overridePolicyVersion: parsedInput.overridePolicyVersion,
    temporaryOverrideSetHash: parsedInput.temporaryOverrideSetHash,
    temporaryOverrideDecisions,
    injectedOverrideCount,
    suppressedPreferenceCount
  };
  const packContentHash = hashCanonical(hashPayload);
  return MemoryContextPackManifestV3Schema.parse({
    packRef: `memory-context-pack:${packContentHash}`,
    packContentHash,
    ...hashPayload,
    createdAt: parsedInput.createdAt
  });
}

function copyDecision<T extends {
  readonly targetFields: readonly string[];
  readonly allowedEffects: readonly string[];
}>(entry: T): T {
  return {
    ...entry,
    targetFields: [...entry.targetFields],
    allowedEffects: [...entry.allowedEffects]
  };
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

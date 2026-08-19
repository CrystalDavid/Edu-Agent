import { describe, expect, it } from "vitest";

import {
  buildMemoryContextPackManifest,
  type MemoryContextPackBuildInput
} from "../../apps/api/src/modules/agent-runtime-context/domain/memory-context-pack.js";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const hashC = "c".repeat(64);
const hashD = "d".repeat(64);
const hashE = "e".repeat(64);

function buildInput(): MemoryContextPackBuildInput {
  return {
    owner: {
      tenantRef: "tenant:synthetic",
      teacherRef: "teacher:synthetic"
    },
    useCase: "lesson_preparation",
    policyVersion: "memory-context-policy@1",
    skillRef: "lesson-preparation",
    skillVersion: "lesson-preparation@5",
    skillContentHash: hashA,
    conversationRef: "conversation:synthetic",
    currentTurnRef: "turn:synthetic:2",
    currentTurnSequence: 2,
    currentTurnContentHash: hashB,
    workingMemorySnapshotRef: "working-memory:synthetic:2",
    workingMemorySnapshotVersion: 2,
    workingMemorySnapshotContentHash: hashC,
    contextDecisions: [
      {
        sourceKind: "current_instruction",
        sourceRef: "turn:synthetic:2",
        sourceVersion: 2,
        sourceContentHash: hashB,
        decision: "injected",
        reasonCode: "current_instruction",
        targetFields: ["teacher_request"],
        allowedEffects: ["guide_generation"],
        estimatedTokens: 5
      },
      {
        sourceKind: "working_memory",
        sourceRef: "working-memory:synthetic:2",
        sourceVersion: 2,
        sourceContentHash: hashC,
        decision: "injected",
        reasonCode: "same_task_working_memory",
        targetFields: ["task_context"],
        allowedEffects: ["guide_generation"],
        estimatedTokens: 12
      }
    ],
    preferenceDecisions: [
      {
        sourceKind: "teacher_preference",
        sourceRef: "preference:synthetic:concise",
        sourceVersion: 3,
        sourceContentHash: hashD,
        decision: "injected",
        reasonCode: "active_confirmed_preference",
        targetFields: ["lesson_detail"],
        allowedEffects: ["guide_generation"],
        estimatedTokens: 8
      },
      {
        sourceKind: "teacher_preference",
        sourceRef: "preference:synthetic:duplicate",
        sourceVersion: 1,
        sourceContentHash: hashE,
        decision: "excluded",
        reasonCode: "duplicate_key",
        targetFields: ["lesson_detail"],
        allowedEffects: [],
        estimatedTokens: 7
      }
    ],
    createdAt: "2026-08-19T08:00:00.000Z"
  };
}

describe("MemoryContextPackManifest@1", () => {
  it("produces the same identity for the same context despite a retry timestamp", () => {
    const first = buildMemoryContextPackManifest(buildInput());
    const retry = buildMemoryContextPackManifest({
      ...buildInput(),
      createdAt: "2026-08-19T08:01:00.000Z"
    });

    expect(retry.packRef).toBe(first.packRef);
    expect(retry.packContentHash).toBe(first.packContentHash);
    expect(retry.createdAt).not.toBe(first.createdAt);
    expect(first.excludedCount).toBe(1);
  });

  it("changes the hash when a source ref, version, hash, or input order changes", () => {
    const baseline = buildMemoryContextPackManifest(buildInput());
    const variants: MemoryContextPackBuildInput[] = [
      { ...buildInput(), currentTurnRef: "turn:synthetic:3" },
      { ...buildInput(), workingMemorySnapshotVersion: 3 },
      { ...buildInput(), skillContentHash: "f".repeat(64) },
      {
        ...buildInput(),
        preferenceDecisions: [...buildInput().preferenceDecisions].reverse()
      }
    ];

    for (const variant of variants) {
      expect(
        buildMemoryContextPackManifest(variant).packContentHash
      ).not.toBe(baseline.packContentHash);
    }
  });

  it("contains references and decisions but no copied memory or model content", () => {
    const manifest = buildMemoryContextPackManifest(buildInput());
    const serialized = JSON.stringify(manifest);

    expect(serialized).not.toContain("teacherText");
    expect(serialized).not.toContain("preferenceValue");
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("providerResponse");
    expect(serialized).not.toContain("evidenceBody");
    expect(manifest.preferenceDecisions[0]).toMatchObject({
      sourceRef: "preference:synthetic:concise",
      sourceVersion: 3,
      sourceContentHash: hashD,
      decision: "injected"
    });
  });

  it("rejects raw text or response fields at the pack boundary", () => {
    const contaminatedTopLevel = {
      ...buildInput(),
      teacherText: "synthetic raw teacher instruction"
    } as unknown as MemoryContextPackBuildInput;
    const clean = buildInput();
    const contaminatedPreference = {
      ...clean,
      preferenceDecisions: [
        {
          ...clean.preferenceDecisions[0]!,
          preferenceValue: "synthetic copied preference value"
        }
      ]
    } as unknown as MemoryContextPackBuildInput;

    expect(() =>
      buildMemoryContextPackManifest(contaminatedTopLevel)
    ).toThrow();
    expect(() =>
      buildMemoryContextPackManifest(contaminatedPreference)
    ).toThrow();
  });
});

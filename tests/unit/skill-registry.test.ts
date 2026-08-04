import { describe, expect, it } from "vitest";

import {
  createBuiltInSkillRegistry,
  lessonPreparationSkillV1
} from "../../apps/api/src/agent/skills/index.js";
import {
  cloneSkillManifest,
  SkillRegistryError,
  VersionedSkillRegistry
} from "../../apps/api/src/agent/skills/skill-registry.js";

describe("Phase 5 versioned Skill Registry", () => {
  it("loads the exact published Lesson Preparation version and exposes a Runtime binding", () => {
    const registry = createBuiltInSkillRegistry();
    const loaded = registry.loadPublished("lesson-preparation@1");
    const binding = registry.loadPublishedBinding(
      "lesson-preparation@1"
    );

    expect(loaded).toBe(lessonPreparationSkillV1);
    expect(binding).toEqual({
      skillId: "lesson-preparation",
      skillVersion: "1",
      skillRef: "lesson-preparation@1",
      contentHash: lessonPreparationSkillV1.manifest.contentHash,
      purpose: "lesson_preparation",
      status: "published"
    });
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.manifest)).toBe(true);
  });

  it("keeps a new version alongside published versions instead of overwriting them", () => {
    const registry = createBuiltInSkillRegistry();
    const version4 = Object.freeze({
      ...lessonPreparationSkillV1,
      manifest: cloneSkillManifest({
        manifest: lessonPreparationSkillV1.manifest,
        version: "4",
        status: "published"
      })
    });

    registry.register(version4);

    expect(registry.loadPublished("lesson-preparation@1"))
      .toBe(lessonPreparationSkillV1);
    expect(registry.loadPublished("lesson-preparation@4")).toBe(version4);
    expect(registry.list().map((item) => item.skillRef)).toEqual([
      "lesson-preparation@1",
      "lesson-preparation@2",
      "lesson-preparation@3",
      "lesson-preparation@4"
    ]);
  });

  it("does not execute draft or deprecated versions but preserves historical lookup", () => {
    for (const status of ["draft", "deprecated"] as const) {
      const registry = new VersionedSkillRegistry();
      const version = Object.freeze({
        ...lessonPreparationSkillV1,
        manifest: cloneSkillManifest({
          manifest: lessonPreparationSkillV1.manifest,
          version: status === "draft" ? "draft-1" : "deprecated-1",
          status
        })
      });
      registry.register(version);

      expect(() => registry.loadPublished(version.manifest.ref)).toThrow(
        SkillRegistryError
      );
      expect(registry.loadHistorical(version.manifest.ref)).toBe(version);
    }
  });

  it("fails closed on duplicate refs and a tampered Manifest", () => {
    const registry = createBuiltInSkillRegistry();
    expect(() => registry.register(lessonPreparationSkillV1)).toThrow(
      /already registered/u
    );

    const tampered = Object.freeze({
      ...lessonPreparationSkillV1,
      manifest: Object.freeze({
        ...lessonPreparationSkillV1.manifest,
        purpose: "tampered-purpose"
      })
    });
    const isolated = new VersionedSkillRegistry();
    expect(() => isolated.register(tampered)).toThrow(
      /content hash does not match/u
    );
  });

  it("reports blocking validation separately from non-blocking quality and operation metrics", () => {
    const policyFailure = lessonPreparationSkillV1.evaluateOutput({
      validation: {
        valid: false,
        category: "evidence",
        issues: ["unauthorized EvidenceRef"]
      },
      operation: {
        latencyMs: 125,
        usage: {
          inputTokens: 80,
          outputTokens: 40,
          totalTokens: 120
        },
        attemptCount: 1,
        estimatedCostUsd: 0.0002
      }
    });
    expect(policyFailure).toMatchObject({
      passedBlockingChecks: false,
      contract: { status: "not_evaluated" },
      policy: { status: "failed" },
      quality: { status: "not_evaluated" },
      operation: {
        status: "recorded",
        latencyMs: 125,
        inputTokens: 80,
        outputTokens: 40,
        totalTokens: 120,
        attemptCount: 1
      }
    });

    const contractFailure = lessonPreparationSkillV1.evaluateOutput({
      validation: {
        valid: false,
        category: "schema",
        issues: ["missing required field"]
      }
    });
    expect(contractFailure.contract.status).toBe("failed");
    expect(contractFailure.operation.status).toBe("not_recorded");
  });
});

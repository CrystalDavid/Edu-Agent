import { describe, expect, it } from "vitest";

import {
  createBuiltInSkillRegistry,
  lessonPreparationSkillV1,
  lessonPreparationSkillV4,
  lessonPreparationSkillV5,
  lessonPreparationSkillV6
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
    const version8 = Object.freeze({
      ...lessonPreparationSkillV1,
      manifest: cloneSkillManifest({
        manifest: lessonPreparationSkillV1.manifest,
        version: "8",
        status: "published"
      })
    });

    registry.register(version8);

    expect(registry.loadPublished("lesson-preparation@1"))
      .toBe(lessonPreparationSkillV1);
    expect(registry.loadPublished("lesson-preparation@4"))
      .toBe(lessonPreparationSkillV4);
    expect(registry.loadPublished("lesson-preparation@5"))
      .toBe(lessonPreparationSkillV5);
    expect(registry.loadPublished("lesson-preparation@6"))
      .toBe(lessonPreparationSkillV6);
    expect(registry.loadPublished("lesson-preparation@7").manifest)
      .toMatchObject({ inputSchemaRef: "lesson-preparation-input@6" });
    expect(registry.loadPublished("lesson-preparation@8")).toBe(version8);
    expect(registry.list().map((item) => item.skillRef)).toEqual([
      "classroom-reflection@1",
      "lesson-analysis@1",
      "lesson-preparation@1",
      "lesson-preparation@2",
      "lesson-preparation@3",
      "lesson-preparation@4",
      "lesson-preparation@5",
      "lesson-preparation@6",
      "lesson-preparation@7",
      "lesson-preparation@8",
      "material-generation@1",
      "next-lesson-adjustment@1",
      "reflection-analysis@1"
    ]);
  });

  it("keeps the personalized v3 Skill available for historical Run recovery", () => {
    const registry = createBuiltInSkillRegistry();

    expect(registry.loadHistorical("lesson-preparation@3").manifest)
      .toMatchObject({
        ref: "lesson-preparation@3",
        version: "3",
        status: "published"
      });
    expect(registry.loadPublished("lesson-preparation@4").manifest)
      .toMatchObject({
        ref: "lesson-preparation@4",
        inputSchemaRef: "lesson-preparation-input@3"
      });
    expect(registry.loadPublished("lesson-preparation@5").manifest)
      .toMatchObject({
        ref: "lesson-preparation@5",
        inputSchemaRef: "lesson-preparation-input@4"
      });
    expect(registry.loadPublished("lesson-preparation@6").manifest)
      .toMatchObject({
        ref: "lesson-preparation@6",
        inputSchemaRef: "lesson-preparation-input@5"
      });
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

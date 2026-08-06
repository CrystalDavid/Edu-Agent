import type {
  FileAssetDetail,
  TeachingPlanRevisionView
} from "@edu-agent/contracts";
import { describe, expect, it } from "vitest";

import {
  projectMaterialBundle,
  type MaterialDraftProvenance
} from "../../apps/api/src/modules/artifact-collaboration/application/material-bundle-projection.js";

describe("MaterialBundleProjection", () => {
  it("blocks generation without an approved TeachingPlan instead of inventing a baseline", () => {
    const result = projectMaterialBundle({
      lessonRef: "lesson:1",
      approvedTeachingPlan: null,
      files: [],
      generatedAt: now
    });

    expect(result.status).toBe("blocked_no_approved_plan");
    expect(result.approvedTeachingPlanRevisionRef).toBeNull();
    expect(result.items.every((item) => item.status === "missing")).toBe(true);
  });

  it("recognizes the approved-plan DOCX as an adopted lesson plan only", () => {
    const docx = file({
      assetRef: "file:docx",
      category: "lesson_plan",
      extension: ".docx",
      relation: "export"
    });
    const result = projectMaterialBundle({
      lessonRef,
      approvedTeachingPlan: approvedPlan,
      files: [docx],
      generatedAt: now
    });

    expect(result.status).toBe("partially_ready");
    expect(result.items.find((item) => item.kind === "lesson_plan"))
      .toMatchObject({
        status: "adopted",
        generatedBySkillRef: "teaching-plan-docx-export"
      });
    expect(result.items.filter((item) => item.kind !== "lesson_plan")
      .every((item) => item.status === "missing")).toBe(true);
  });

  it("projects generated content as a Draft until the teacher adopts it", () => {
    const draft = file({
      assetRef: "file:board",
      category: "reference",
      extension: ".md",
      relation: "reference"
    });
    const provenance: MaterialDraftProvenance = {
      kind: "board_design",
      teachingPlanRevisionRef: approvedPlan.revisionRef,
      skillRef: "material-generation@1",
      agentRunRef: "agent-run:material-1",
      contextManifestHash: "b".repeat(64)
    };
    const result = projectMaterialBundle({
      lessonRef,
      approvedTeachingPlan: approvedPlan,
      files: [draft],
      provenanceByVersionRef: {
        [draft.currentVersion.versionRef]: provenance
      },
      generatedAt: now
    });

    expect(result.status).toBe("waiting_for_teacher");
    expect(result.items.find((item) => item.kind === "board_design"))
      .toMatchObject({
        status: "draft",
        assetRef: "file:board",
        sourceTeachingPlanRevisionRef: approvedPlan.revisionRef,
        generatedBySkillRef: "material-generation@1"
      });
  });

  it("marks an item from an older approved revision as outdated", () => {
    const old = file({
      assetRef: "file:old-exercise",
      category: "assessment",
      extension: ".md",
      relation: "reference",
      revisionRef: "teaching-plan-revision:old"
    });
    const result = projectMaterialBundle({
      lessonRef,
      approvedTeachingPlan: approvedPlan,
      files: [old],
      provenanceByVersionRef: {
        [old.currentVersion.versionRef]: {
          kind: "exercise_set",
          teachingPlanRevisionRef: "teaching-plan-revision:old",
          skillRef: "material-generation@1",
          agentRunRef: "agent-run:old",
          contextManifestHash: "c".repeat(64)
        }
      },
      generatedAt: now
    });

    expect(result.items.find((item) => item.kind === "exercise_set")?.status)
      .toBe("outdated");
  });

  it("is ready only when all five current items have been explicitly adopted", () => {
    const kinds = [
      ["lesson_plan", "lesson_plan"],
      ["slide_outline", "courseware"],
      ["exercise_set", "assessment"],
      ["board_design", "reference"],
      ["differentiated_support", "worksheet"]
    ] as const;
    const files = kinds.map(([kind, category], index) =>
      file({
        assetRef: `file:${kind}`,
        category,
        extension: kind === "lesson_plan" ? ".docx" : ".md",
        relation: "export",
        second: index
      })
    );
    const provenanceByVersionRef = Object.fromEntries(
      files.slice(1).map((asset, index) => [
        asset.currentVersion.versionRef,
        {
          kind: kinds[index + 1]![0],
          teachingPlanRevisionRef: approvedPlan.revisionRef,
          skillRef: "material-generation@1",
          agentRunRef: `agent-run:${index}`,
          contextManifestHash: "d".repeat(64)
        }
      ])
    );
    const result = projectMaterialBundle({
      lessonRef,
      approvedTeachingPlan: approvedPlan,
      files,
      provenanceByVersionRef,
      generatedAt: now
    });

    expect(result.status).toBe("ready");
    expect(result.items.every((item) => item.status === "adopted")).toBe(true);
  });
});

const now = "2026-08-06T08:00:00.000Z";
const lessonRef = "lesson:1";
const approvedPlan: TeachingPlanRevisionView = {
  artifactRef: "teaching-plan:1",
  revisionRef: "teaching-plan-revision:approved",
  revisionNumber: 3,
  parentRevisionRef: "teaching-plan-revision:2",
  selectedStrategyId: "strategy:1",
  teacherSelection: "accepted",
  state: "approved",
  title: "Approved plan",
  content: {
    objective: "Objective",
    lessonFocus: "Focus",
    openingActivity: "Opening",
    teacherQuestions: ["Question"],
    studentActivity: "Activity",
    supportStrategy: "Support",
    independentCheck: "Check",
    followUp: "Follow-up",
    evidenceRefs: ["evidence:1"]
  },
  createdAt: now
};

function file(input: {
  assetRef: string;
  category: FileAssetDetail["category"];
  extension: string;
  relation: "reference" | "export";
  revisionRef?: string;
  second?: number;
}): FileAssetDetail {
  const timestamp = `2026-08-06T08:00:${String(input.second ?? 0).padStart(2, "0")}.000Z`;
  const versionRef = `${input.assetRef}:version:1`;
  const version = {
    versionRef,
    assetRef: input.assetRef,
    versionNumber: 1,
    originalFileName: `${input.assetRef.replaceAll(":", "-")}${input.extension}`,
    mimeType: input.extension === ".docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "text/markdown",
    extension: input.extension,
    previewKind: input.extension === ".docx" ? "office" as const : "text" as const,
    sizeBytes: 128,
    sha256: "e".repeat(64),
    contentSummary: "Material",
    createdBy: "teacher:lin",
    createdAt: timestamp
  };
  return {
    assetRef: input.assetRef,
    displayName: input.assetRef,
    category: input.category,
    source: "teaching_plan_export",
    status: "active",
    version: 1,
    currentVersion: version,
    bindingCount: 2,
    deletionProtected: true,
    createdBy: "teacher:lin",
    createdAt: timestamp,
    updatedAt: timestamp,
    versions: [version],
    bindings: [{
      bindingRef: `${input.assetRef}:binding:lesson`,
      assetRef: input.assetRef,
      versionRef,
      targetType: "lesson",
      targetRef: lessonRef,
      relation: "reference",
      createdAt: timestamp
    }, {
      bindingRef: `${input.assetRef}:binding:revision`,
      assetRef: input.assetRef,
      versionRef,
      targetType: "teaching_plan_revision",
      targetRef: input.revisionRef ?? approvedPlan.revisionRef,
      relation: input.relation,
      createdAt: timestamp
    }]
  };
}

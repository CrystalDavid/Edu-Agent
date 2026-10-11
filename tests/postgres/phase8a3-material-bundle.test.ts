import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import {
  AdoptMaterialBundleItemResultSchema,
  GenerateMaterialBundleResultSchema,
  LessonTeachingPlanStateSchema,
  MaterialBundleProjectionSchema,
  apiRoutes
} from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/sample-data";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import { createProductContainer } from "../../apps/api/src/composition/product-container.js";
import { LocalObjectStore } from "../../apps/api/src/modules/capability-integration/infrastructure/local-object-store.js";
import { gate25DemoRefs } from "../../scripts/sample/gate2-5-demo-fixture.js";
import { seedSampleData } from "../../scripts/sample/seed-sample-data.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const objectRoot = resolve(
  ".local-data",
  "test-output",
  "postgres",
  "phase8a3-material-bundle"
);
const product = createProductContainer(postgresEnvironment, {
  objectStoreSettings: {
    rootDirectory: objectRoot,
    maxUploadBytes: 1024 * 1024
  },
  objectStore: new LocalObjectStore(objectRoot)
});
const app = createApp({ product });
const demoHeaders = {
  "x-demo-tenant": gate2DemoRefs.tenantRef,
  "x-demo-actor": gate2DemoRefs.teacherRef
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await rm(objectRoot, { recursive: true, force: true });
  await seedSampleData(postgresEnvironment, {
    includeGate25: true,
    includeGate27: true
  });
});

afterAll(async () => {
  await Promise.all([product.close(), adminPool.end()]);
  await rm(objectRoot, { recursive: true, force: true });
});

describe("Phase 8A-3 Material Bundle", () => {
  it("requires an approved plan and never invents a material baseline", async () => {
    const lessonRef = gate25DemoRefs.lessonRefs.coefficientMethod;
    const bundle = MaterialBundleProjectionSchema.parse((
      await request(app)
        .get(apiRoutes.teacher.lessonMaterialBundle(lessonRef))
        .set(demoHeaders)
        .expect(200)
    ).body);
    expect(bundle).toMatchObject({
      status: "blocked_no_approved_plan",
      approvedTeachingPlanRevisionRef: null
    });

    await request(app)
      .post(apiRoutes.teacher.generateLessonMaterialBundle(lessonRef))
      .set(demoHeaders)
      .send({
        purpose: "material-bundle.generate",
        idempotencyKey: `phase8a3:no-plan:${randomUUID()}`,
        expectedApprovedTeachingPlanRevisionRef: "teaching-plan-revision:none",
        kinds: ["lesson_plan"],
        expectedAssetVersions: {},
        teacherAdjustment: null
      })
      .expect(409);
  });

  it("persists Drafts, replays idempotently, versions one item and adopts explicitly", async () => {
    const lessonRef = gate25DemoRefs.lessonRefs.slopeAndGraph;
    const plan = LessonTeachingPlanStateSchema.parse((
      await request(app)
        .get(apiRoutes.teacher.lessonTeachingPlans(lessonRef))
        .set(demoHeaders)
        .expect(200)
    ).body).currentApproved;
    expect(plan).not.toBeNull();
    if (!plan) return;

    const idempotencyKey = `phase8a3:generate:${randomUUID()}`;
    const firstRequest = {
      purpose: "material-bundle.generate" as const,
      idempotencyKey,
      expectedApprovedTeachingPlanRevisionRef: plan.revisionRef,
      kinds: ["slide_outline", "board_design"] as const,
      expectedAssetVersions: {},
      teacherAdjustment: null
    };
    const first = GenerateMaterialBundleResultSchema.parse((
      await request(app)
        .post(apiRoutes.teacher.generateLessonMaterialBundle(lessonRef))
        .set(demoHeaders)
        .send(firstRequest)
        .expect(201)
    ).body);
    expect(first).toMatchObject({
      replayed: false,
      bundle: {
        status: "waiting_for_teacher",
        approvedTeachingPlanRevisionRef: plan.revisionRef
      }
    });
    expect(first.generatedVersionRefs).toHaveLength(2);
    const slide = requiredItem(first.bundle, "slide_outline");
    const board = requiredItem(first.bundle, "board_design");
    expect(slide).toMatchObject({
      status: "draft",
      generatedBySkillRef: "material-generation@1"
    });
    expect(board).toMatchObject({
      status: "draft",
      generatedBySkillRef: "material-generation@1"
    });

    const replay = GenerateMaterialBundleResultSchema.parse((
      await request(app)
        .post(apiRoutes.teacher.generateLessonMaterialBundle(lessonRef))
        .set(demoHeaders)
        .send(firstRequest)
        .expect(201)
    ).body);
    expect(replay.replayed).toBe(true);
    expect(replay.agentRunRef).toBe(first.agentRunRef);
    expect(replay.generatedVersionRefs).toEqual(first.generatedVersionRefs);

    const regenerated = GenerateMaterialBundleResultSchema.parse((
      await request(app)
        .post(apiRoutes.teacher.generateLessonMaterialBundle(lessonRef))
        .set(demoHeaders)
        .send({
          purpose: "material-bundle.generate",
          idempotencyKey: `phase8a3:regenerate:${randomUUID()}`,
          expectedApprovedTeachingPlanRevisionRef: plan.revisionRef,
          kinds: ["board_design"],
          expectedAssetVersions: { board_design: board.assetVersion },
          teacherAdjustment: "板书只保留三个区块。"
        })
        .expect(201)
    ).body);
    const newBoard = requiredItem(regenerated.bundle, "board_design");
    const unchangedSlide = requiredItem(regenerated.bundle, "slide_outline");
    expect(newBoard.assetRef).toBe(board.assetRef);
    expect(newBoard.versionNumber).toBe((board.versionNumber ?? 0) + 1);
    expect(newBoard.versionRef).not.toBe(board.versionRef);
    expect(unchangedSlide.versionRef).toBe(slide.versionRef);

    const adopted = AdoptMaterialBundleItemResultSchema.parse((
      await request(app)
        .post(apiRoutes.teacher.adoptLessonMaterial(
          lessonRef,
          "board_design"
        ))
        .set(demoHeaders)
        .send({
          purpose: "material-bundle.adopt",
          idempotencyKey: `phase8a3:adopt:${randomUUID()}`,
          expectedApprovedTeachingPlanRevisionRef: plan.revisionRef,
          expectedAssetVersion: newBoard.assetVersion,
          expectedVersionRef: newBoard.versionRef
        })
        .expect(200)
    ).body);
    expect(requiredItem(adopted.bundle, "board_design").status).toBe(
      "adopted"
    );

    const rows = await adminPool.query<{
      version_number: number;
    }>(
      `SELECT version_number
         FROM artifact.file_version
        WHERE asset_ref = $1
        ORDER BY version_number`,
      [newBoard.assetRef]
    );
    expect(rows.rows.map((row) => row.version_number)).toEqual([1, 2]);
    const runtime = await adminPool.query<{ output: Record<string, unknown> }>(
      `SELECT output FROM runtime.agent_run WHERE agent_run_ref = $1`,
      [first.agentRunRef]
    );
    expect(runtime.rows[0]?.output).toMatchObject({
      kind: "material_content_draft",
      teachingPlanRevisionRef: plan.revisionRef,
      runtimeStatus: "waiting_for_human",
      skill: { ref: "material-generation@1", version: "1" }
    });
  });

  it("does not disclose a Material Bundle across school boundaries", async () => {
    const foreignLessonRef = "lesson:school-b-linear-function-application";
    await request(app)
      .get(apiRoutes.teacher.lessonMaterialBundle(foreignLessonRef))
      .set(demoHeaders)
      .expect(404);
    await request(app)
      .post(apiRoutes.teacher.generateLessonMaterialBundle(foreignLessonRef))
      .set(demoHeaders)
      .send({
        purpose: "material-bundle.generate",
        idempotencyKey: `phase8a3:foreign:${randomUUID()}`,
        expectedApprovedTeachingPlanRevisionRef: "teaching-plan-revision:foreign",
        kinds: ["lesson_plan"],
        expectedAssetVersions: {},
        teacherAdjustment: null
      })
      .expect(404);
  });
});

function requiredItem(
  bundle: ReturnType<typeof MaterialBundleProjectionSchema.parse>,
  kind: "slide_outline" | "board_design"
) {
  const item = bundle.items.find((candidate) => candidate.kind === kind);
  expect(item).toBeDefined();
  if (!item) throw new Error(`Missing ${kind}`);
  return item;
}

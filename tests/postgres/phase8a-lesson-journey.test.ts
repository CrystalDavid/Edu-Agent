import {
  LessonJourneyProjectionSchema,
  apiRoutes
} from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/sample-data";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import { createProductContainer } from "../../apps/api/src/composition/product-container.js";
import { gate25DemoRefs } from "../../scripts/sample/gate2-5-demo-fixture.js";
import { seedSampleData } from "../../scripts/sample/seed-sample-data.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const product = createProductContainer(postgresEnvironment);
const app = createApp({ product });
const demoHeaders = {
  "x-demo-tenant": gate2DemoRefs.tenantRef,
  "x-demo-actor": gate2DemoRefs.teacherRef
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await seedSampleData(postgresEnvironment, {
    includeGate25: true,
    includeGate27: true
  });
});

afterAll(async () => {
  await Promise.all([product.close(), adminPool.end()]);
});

describe("Phase 8A Lesson Journey read API", () => {
  it("returns a compact, rebuildable Projection from persisted product state", async () => {
    const response = await request(app)
      .get(apiRoutes.teacher.lessonJourney(gate25DemoRefs.lessonRefs.slopeAndGraph))
      .set(demoHeaders)
      .expect(200);
    const projection = LessonJourneyProjectionSchema.parse(response.body);

    expect(projection.lessonRef).toBe(gate25DemoRefs.lessonRefs.slopeAndGraph);
    expect(projection.nextBestAction.href).toMatch(/^\/(?:teaching|files)/u);
    expect(projection.sourceRefs.length).toBeGreaterThan(0);
    expect(JSON.stringify(projection)).not.toContain("currentEvidenceRefs");
    expect(JSON.stringify(projection)).not.toContain("responseSummary");
    expect(Object.keys(response.body).sort()).toEqual([
      "blockingReasons",
      "completedMilestones",
      "currentStage",
      "detailLinks",
      "generatedAt",
      "lessonRef",
      "nextBestAction",
      "sourceRefs",
      "sourceVersionVector",
      "status"
    ]);
  });

  it("does not reveal a Lesson from another school", async () => {
    await request(app)
      .get(apiRoutes.teacher.lessonJourney(
        "lesson:school-b-linear-function-application"
      ))
      .set(demoHeaders)
      .expect(404)
      .expect(({ body }) => {
        expect(body.code).toBe("NOT_FOUND");
        expect(JSON.stringify(body)).not.toContain("School B");
      });
  });
});

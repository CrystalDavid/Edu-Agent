import { randomUUID } from "node:crypto";

import { apiRoutes } from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/sample-data";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import {
  createProductContainer
} from "../../apps/api/src/composition/product-container.js";
import { seedSampleData } from "../../scripts/sample/seed-sample-data.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData,
  tableCount
} from "./support/database.js";

const adminPool = poolFor("admin");
const product = createProductContainer(postgresEnvironment);
const app = createApp({ product, allowTestIdentityHeaders: true });
const teacherA = {
  "x-demo-tenant": gate2DemoRefs.tenantRef,
  "x-demo-actor": gate2DemoRefs.teacherRef
};
const teacherB = {
  "x-demo-tenant": "tenant:demo-school-b",
  "x-demo-actor": "user:teacher-b-001"
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await seedSampleData(postgresEnvironment);
});

afterAll(async () => {
  await Promise.all([product.close(), adminPool.end()]);
});

describe("Phase 7A PostgreSQL Memory persistence", () => {
  it("persists confirmation across a service restart and excludes revoked preferences from Context", async () => {
    const createResponse = await request(app)
      .post(apiRoutes.teacher.memoryCandidates)
      .set(teacherA)
      .send({
        summary: "教师明确要求备课建议保持简洁。",
        preferenceKey: "lesson_plan_detail",
        preferenceValue: "简洁",
        purpose: "personalization.candidate.create",
        idempotencyKey: `phase7a-create-${randomUUID()}`
      })
      .expect(201);

    expect(await product.services.personalization.listConfirmedPreferences({
      tenantRef: teacherA["x-demo-tenant"],
      teacherRef: teacherA["x-demo-actor"]
    })).toEqual([]);

    const confirmResponse = await request(app)
      .post(apiRoutes.teacher.memoryCandidateConfirm(
        createResponse.body.candidate.candidateRef
      ))
      .set(teacherA)
      .send({
        expectedVersion: createResponse.body.candidate.version,
        purpose: "personalization.candidate.confirm",
        idempotencyKey: `phase7a-confirm-${randomUUID()}`
      })
      .expect(200);

    const preferenceRef = confirmResponse.body.preference.preferenceRef as string;
    expect(await product.services.personalization.listConfirmedPreferences({
      tenantRef: teacherA["x-demo-tenant"],
      teacherRef: teacherA["x-demo-actor"]
    })).toEqual([
      expect.objectContaining({
        preferenceRef,
        preferenceKey: "lesson_plan_detail",
        preferenceValue: "简洁"
      })
    ]);
    expect(await tableCount(adminPool, "personalization.memory_candidate"))
      .toBe(1);
    expect(await tableCount(adminPool, "personalization.teacher_preference"))
      .toBe(1);

    const restartedProduct = createProductContainer(postgresEnvironment);
    try {
      const restartedApp = createApp({
        product: restartedProduct,
        allowTestIdentityHeaders: true
      });
      await request(restartedApp)
        .get(apiRoutes.teacher.personalizationState)
        .set(teacherA)
        .expect(200)
        .expect(({ body }) => {
          expect(body.preferences).toEqual([
            expect.objectContaining({
              preferenceRef,
              preferenceValue: "简洁",
              status: "active"
            })
          ]);
        });
    } finally {
      await restartedProduct.close();
    }

    await request(app)
      .post(apiRoutes.teacher.teacherPreferenceRevoke(preferenceRef))
      .set(teacherA)
      .send({
        expectedVersion: confirmResponse.body.preference.version,
        purpose: "personalization.preference.revoke",
        idempotencyKey: `phase7a-revoke-${randomUUID()}`
      })
      .expect(200);

    expect(await product.services.personalization.listConfirmedPreferences({
      tenantRef: teacherA["x-demo-tenant"],
      teacherRef: teacherA["x-demo-actor"]
    })).toEqual([]);
    expect(await tableCount(adminPool, "personalization.teacher_preference_revision"))
      .toBe(2);
  });

  it("isolates candidates and preferences by tenant and owner", async () => {
    await request(app)
      .post(apiRoutes.teacher.memoryCandidates)
      .set(teacherA)
      .send({
        summary: "只属于 School A 教师的偏好。",
        preferenceKey: "example_preference",
        preferenceValue: "课堂案例",
        purpose: "personalization.candidate.create",
        idempotencyKey: `phase7a-isolation-${randomUUID()}`
      })
      .expect(201);

    await request(app)
      .get(apiRoutes.teacher.personalizationState)
      .set(teacherA)
      .expect(200)
      .expect(({ body }) => expect(body.candidates).toHaveLength(1));
    await request(app)
      .get(apiRoutes.teacher.personalizationState)
      .set(teacherB)
      .expect(200)
      .expect(({ body }) => {
        expect(body.candidates).toEqual([]);
        expect(body.preferences).toEqual([]);
      });
  });
});

import { apiRoutes } from "@edu-agent/contracts";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import { createProductContainer } from "../../apps/api/src/composition/product-container.js";
import { seedSampleData } from "../../scripts/sample/seed-sample-data.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const product = createProductContainer(postgresEnvironment);
const app = createApp({ product });

beforeEach(async () => {
  await resetGate1BData(adminPool);
});

afterAll(async () => {
  await Promise.all([product.close(), adminPool.end()]);
});

async function seedEmptyTeacherWorkspace() {
  const createdAt = "2026-10-01T00:00:00.000Z";
  await adminPool.query(
    `INSERT INTO governance.organization (
       organization_ref, organization_type, name, status, timezone,
       data_source, version, created_at, updated_at
     ) VALUES (
       'tenant:empty-school', 'school', '空白学校', 'active',
       'Asia/Shanghai', 'test-fixture', 1, $1, $1
     );`,
    [createdAt]
  );
  await adminPool.query(
    `INSERT INTO governance.user_account (
       user_ref, display_name, status, data_source, version,
       created_at, updated_at
     ) VALUES (
       'user:empty-teacher', '空白教师', 'active', 'test-fixture',
       1, $1, $1
     );`,
    [createdAt]
  );
  await adminPool.query(
    `INSERT INTO governance.organization_membership (
       membership_ref, organization_ref, user_ref, status,
       created_by, activated_at, version, created_at, updated_at
     ) VALUES (
       'membership:empty-school:teacher', 'tenant:empty-school',
       'user:empty-teacher', 'active', 'system:test', $1, 1, $1, $1
     );`,
    [createdAt]
  );
  await adminPool.query(
    `INSERT INTO governance.membership_role_assignment (
       membership_ref, role_key, assigned_by, assigned_at
     ) VALUES (
       'membership:empty-school:teacher', 'ordinary_teacher',
       'system:test', $1
     );`,
    [createdAt]
  );
}

describe("Phase 2 sample data runtime behavior", () => {
  it("returns a safe empty-workspace response instead of falling back to a sample CourseRun", async () => {
    await seedEmptyTeacherWorkspace();

    await request(app)
      .get(apiRoutes.demo.bootstrap)
      .set("x-demo-tenant", "tenant:empty-school")
      .set("x-demo-actor", "user:empty-teacher")
      .expect(404)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: "NOT_FOUND" });
        expect(JSON.stringify(body)).not.toContain(
          "course-run:grade8-math-class3-2026-fall"
        );
      });
  });

  it("uses the formal API after explicit Sample Seed initialization", async () => {
    await seedSampleData(postgresEnvironment, {
      includeGate25: true,
      includeGate27: true
    });

    await request(app)
      .get(apiRoutes.demo.bootstrap)
      .set("x-demo-tenant", "tenant:demo-school")
      .set("x-demo-actor", "user:teacher-001")
      .expect(200)
      .expect(({ body }) => {
        expect(body.courseRun.courseRunRef).toBe(
          "course-run:grade8-math-class3-2026-fall"
        );
      });
  });
});

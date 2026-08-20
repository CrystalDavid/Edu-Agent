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
  secondaryCourseDemoRefs
} from "../../scripts/sample/gate2-5-demo-fixture.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const product = createProductContainer(postgresEnvironment);
const app = createApp({ product, allowTestIdentityHeaders: true });
const owner = {
  tenantRef: gate2DemoRefs.tenantRef,
  teacherRef: gate2DemoRefs.teacherRef
};
const headers = {
  "x-demo-tenant": owner.tenantRef,
  "x-demo-actor": owner.teacherRef
};
const mainCourse = gate2DemoRefs.courseRunRef;
const secondCourse = secondaryCourseDemoRefs.courseRunRef;

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await seedSampleData(postgresEnvironment);
});

afterAll(async () => {
  await Promise.all([product.close(), adminPool.end()]);
});

describe("scoped TeacherPreference PostgreSQL", () => {
  it("allows the same key in different scopes and resolves deterministically", async () => {
    const global = await confirmPreference({
      key: "lesson_plan_detail",
      value: "简洁"
    });
    const course = await confirmPreference({
      key: "lesson_plan_detail",
      value: "详细",
      courseRunRef: mainCourse
    });

    const inMainCourse = await product.services.personalization
      .resolveConfirmedPreferences(query(mainCourse));
    expect(inMainCourse.memoryEpoch).toBe(2);
    expect(inMainCourse.selected).toEqual([
      expect.objectContaining({
        preferenceRef: course.preferenceRef,
        preferenceValue: "详细",
        scope: expect.objectContaining({ kind: "course_run" }),
        matchSpecificity: 3,
        matchedSkillConstraint: true
      })
    ]);
    expect(inMainCourse.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({
        preferenceRef: global.preferenceRef,
        reasonCode: "more_specific_scope"
      })
    ]));

    const inSecondCourse = await product.services.personalization
      .resolveConfirmedPreferences(query(secondCourse));
    expect(inSecondCourse.selected).toEqual([
      expect.objectContaining({
        preferenceRef: global.preferenceRef,
        preferenceValue: "简洁",
        scope: expect.objectContaining({ kind: "global" })
      })
    ]);
    expect(inSecondCourse.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({
        preferenceRef: course.preferenceRef,
        reasonCode: "scope_mismatch"
      })
    ]));
    await expect(product.services.personalization.listConfirmedPreferences({
      tenantRef: owner.tenantRef,
      teacherRef: owner.teacherRef
    })).resolves.toEqual([
      expect.objectContaining({ preferenceRef: global.preferenceRef })
    ]);
  });

  it("enforces one active row per canonical key and scope", async () => {
    await confirmPreference({
      key: "lesson_plan_detail",
      value: "详细",
      courseRunRef: mainCourse
    });
    const candidate = await createCandidate({
      key: "lesson_plan_detail",
      value: "另一条详细偏好",
      courseRunRef: mainCourse
    });
    await request(app)
      .post(apiRoutes.teacher.memoryCandidateConfirm(
        candidate.candidateRef
      ))
      .set(headers)
      .send({
        expectedVersion: candidate.version,
        purpose: "personalization.candidate.confirm",
        idempotencyKey: `scope-duplicate-confirm:${randomUUID()}`
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe("ACTIVE_TEACHER_PREFERENCE_CONFLICT");
      });
  });

  it("increments memoryEpoch for confirmation, scope/value update and revoke", async () => {
    const preference = await confirmPreference({
      key: "response_length",
      value: "简洁"
    });
    expect(await memoryEpoch()).toBe(1);

    const scoped = await request(app)
      .put(apiRoutes.teacher.teacherPreferenceScope(preference.preferenceRef))
      .set(headers)
      .send({
        scope: courseScope(mainCourse),
        expectedVersion: preference.version,
        purpose: "personalization.preference.update-scope",
        idempotencyKey: `scope-update:${randomUUID()}`
      })
      .expect(200);
    expect(scoped.body.preference).toMatchObject({
      version: 2,
      scope: { kind: "course_run", courseRunRef: mainCourse }
    });
    expect(await memoryEpoch()).toBe(2);

    const updated = await request(app)
      .put(apiRoutes.teacher.teacherPreference(preference.preferenceRef))
      .set(headers)
      .send({
        preferenceValue: "更简洁",
        expectedVersion: scoped.body.preference.version,
        purpose: "personalization.preference.update",
        idempotencyKey: `scope-value-update:${randomUUID()}`
      })
      .expect(200);
    expect(await memoryEpoch()).toBe(3);

    await request(app)
      .post(apiRoutes.teacher.teacherPreferenceRevoke(preference.preferenceRef))
      .set(headers)
      .send({
        expectedVersion: updated.body.preference.version,
        purpose: "personalization.preference.revoke",
        idempotencyKey: `scope-revoke:${randomUUID()}`
      })
      .expect(200);
    expect(await memoryEpoch()).toBe(4);

    const revisions = await adminPool.query<{ version: number }>(
      `SELECT version
         FROM personalization.teacher_preference_revision
        WHERE preference_ref = $1
        ORDER BY version`,
      [preference.preferenceRef]
    );
    expect(revisions.rows.map((entry) => entry.version)).toEqual([1, 2, 3, 4]);
  });

  it("filters valid time and fails closed for unauthorized or foreign refs", async () => {
    const future = await confirmPreference({
      key: "future_preference",
      value: "未来生效",
      validFrom: "2099-01-01T00:00:00.000Z"
    });
    const expired = await confirmPreference({
      key: "expired_preference",
      value: "已到期",
      validFrom: "2020-01-01T00:00:00.000Z",
      validUntil: "2021-01-01T00:00:00.000Z"
    });
    const resolution = await product.services.personalization
      .resolveConfirmedPreferences(query(mainCourse));
    expect(resolution.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({
        preferenceRef: future.preferenceRef,
        reasonCode: "not_yet_valid"
      }),
      expect.objectContaining({
        preferenceRef: expired.preferenceRef,
        reasonCode: "expired"
      })
    ]));

    await request(app)
      .post(apiRoutes.teacher.memoryCandidates)
      .set(headers)
      .send({
        summary: "不得写入未授权 CourseRun 的合成偏好。",
        preferenceKey: "unauthorized_scope",
        preferenceValue: "拒绝",
        proposedScope: courseScope("course-run:foreign-school"),
        purpose: "personalization.candidate.create",
        idempotencyKey: `scope-unauthorized:${randomUUID()}`
      })
      .expect((response) => {
        expect([403, 404]).toContain(response.status);
      });

    await request(app)
      .put(apiRoutes.teacher.teacherPreferenceScope(future.preferenceRef))
      .set(headers)
      .send({
        scope: {
          kind: "lesson",
          subject: null,
          gradeLevel: null,
          courseRunRef: mainCourse,
          lessonRef: secondaryCourseDemoRefs.lessonRef,
          taskRef: null,
          skillIds: ["lesson-preparation"]
        },
        expectedVersion: future.version,
        purpose: "personalization.preference.update-scope",
        idempotencyKey: `scope-lesson-mismatch:${randomUUID()}`
      })
      .expect((response) => {
        expect([403, 404]).toContain(response.status);
      });

    await request(app)
      .put(apiRoutes.teacher.teacherPreferenceScope(future.preferenceRef))
      .set(headers)
      .send({
        scope: {
          kind: "task",
          subject: null,
          gradeLevel: null,
          courseRunRef: null,
          lessonRef: null,
          taskRef: "task:foreign-or-missing",
          skillIds: ["lesson-preparation"]
        },
        expectedVersion: future.version,
        purpose: "personalization.preference.update-scope",
        idempotencyKey: `scope-task-mismatch:${randomUUID()}`
      })
      .expect((response) => {
        expect([403, 404]).toContain(response.status);
      });

    await request(app)
      .put(apiRoutes.teacher.teacherPreferenceScope(future.preferenceRef))
      .set({
        "x-demo-tenant": "tenant:demo-school-b",
        "x-demo-actor": "user:teacher-b-001"
      })
      .send({
        scope: courseScope("course-run:school-b-grade8-math-2026-fall"),
        expectedVersion: future.version,
        purpose: "personalization.preference.update-scope",
        idempotencyKey: `scope-foreign-owner:${randomUUID()}`
      })
      .expect((response) => {
        expect([403, 404]).toContain(response.status);
      });
  });

  it("keeps current rows and revisions physically immutable", async () => {
    const preference = await confirmPreference({
      key: "example_preference",
      value: "生活化"
    });
    await expect(adminPool.query(
      `DELETE FROM personalization.teacher_preference
        WHERE preference_ref = $1`,
      [preference.preferenceRef]
    )).rejects.toThrow(/delete/u);
    await expect(adminPool.query(
      `UPDATE personalization.teacher_preference_revision
          SET preference_value = 'forbidden'
        WHERE preference_ref = $1`,
      [preference.preferenceRef]
    )).rejects.toThrow(/immutable/u);
  });

  it("fails closed for scoped writes when the server feature flag is off", async () => {
    const disabledProduct = createProductContainer(postgresEnvironment, {
      memoryScopedPreferencesSettings: {
        enabled: false,
        policyVersion: "teacher-preference-scope@1"
      }
    });
    try {
      const disabledApp = createApp({
        product: disabledProduct,
        allowTestIdentityHeaders: true
      });
      await request(disabledApp)
        .get(apiRoutes.teacher.personalizationState)
        .set(headers)
        .expect(200)
        .expect(({ body }) => {
          expect(body.scopedPreferencesEnabled).toBe(false);
        });
      await request(disabledApp)
        .post(apiRoutes.teacher.memoryCandidates)
        .set(headers)
        .send({
          summary: "关闭功能时不得写入课程级偏好。",
          preferenceKey: "flag_scope",
          preferenceValue: "拒绝",
          proposedScope: courseScope(mainCourse),
          purpose: "personalization.candidate.create",
          idempotencyKey: `scope-disabled:${randomUUID()}`
        })
        .expect(409)
        .expect(({ body }) => {
          expect(body.code).toBe("SCOPED_PREFERENCES_DISABLED");
        });
      await request(disabledApp)
        .post(apiRoutes.teacher.memoryCandidates)
        .set(headers)
        .send({
          summary: "Feature-off rejects Skill-constrained global scope.",
          preferenceKey: "flag_skill_scope",
          preferenceValue: "reject",
          proposedScope: {
            kind: "global",
            subject: null,
            gradeLevel: null,
            courseRunRef: null,
            lessonRef: null,
            taskRef: null,
            skillIds: ["lesson-preparation"]
          },
          purpose: "personalization.candidate.create",
          idempotencyKey: `scope-disabled-skill:${randomUUID()}`
        })
        .expect(409)
        .expect(({ body }) => {
          expect(body.code).toBe("SCOPED_PREFERENCES_DISABLED");
        });
      await request(disabledApp)
        .post(apiRoutes.teacher.memoryCandidates)
        .set(headers)
        .send({
          summary: "关闭功能时仍允许全局偏好。",
          preferenceKey: "flag_global",
          preferenceValue: "允许",
          purpose: "personalization.candidate.create",
          idempotencyKey: `scope-disabled-global:${randomUUID()}`
        })
        .expect(201);
    } finally {
      await disabledProduct.close();
    }
  });
});

async function createCandidate(input: {
  key: string;
  value: string;
  courseRunRef?: string;
  validFrom?: string;
  validUntil?: string;
}) {
  const response = await request(app)
    .post(apiRoutes.teacher.memoryCandidates)
    .set(headers)
    .send({
      summary: `合成偏好 ${input.key}=${input.value}`,
      preferenceKey: input.key,
      preferenceValue: input.value,
      ...(input.courseRunRef
        ? { proposedScope: courseScope(input.courseRunRef) }
        : {}),
      ...(input.validFrom ? { validFrom: input.validFrom } : {}),
      ...(input.validUntil ? { validUntil: input.validUntil } : {}),
      purpose: "personalization.candidate.create",
      idempotencyKey: `scope-candidate:${randomUUID()}`
    })
    .expect(201);
  return response.body.candidate as {
    candidateRef: string;
    version: number;
  };
}

async function confirmPreference(input: {
  key: string;
  value: string;
  courseRunRef?: string;
  validFrom?: string;
  validUntil?: string;
}) {
  const candidate = await createCandidate(input);
  const response = await request(app)
    .post(apiRoutes.teacher.memoryCandidateConfirm(candidate.candidateRef))
    .set(headers)
    .send({
      expectedVersion: candidate.version,
      purpose: "personalization.candidate.confirm",
      idempotencyKey: `scope-confirm:${randomUUID()}`
    })
    .expect(200);
  return response.body.preference as {
    preferenceRef: string;
    version: number;
  };
}

function courseScope(courseRunRef: string) {
  return {
    kind: "course_run",
    subject: null,
    gradeLevel: null,
    courseRunRef,
    lessonRef: null,
    taskRef: null,
    skillIds: ["lesson-preparation"]
  };
}

function query(courseRunRef: string) {
  return {
    tenantRef: owner.tenantRef,
    teacherRef: owner.teacherRef,
    useCase: "lesson_preparation",
    skillId: "lesson-preparation",
    subject: "数学",
    gradeLevel: "八年级",
    courseRunRef,
    lessonRef: courseRunRef === mainCourse
      ? "lesson:slope-and-graph-change"
      : secondaryCourseDemoRefs.lessonRef,
    taskRef: null,
    at: "2026-09-20T00:00:00.000Z"
  };
}

async function memoryEpoch(): Promise<number> {
  const result = await adminPool.query<{ memory_epoch: string }>(
    `SELECT memory_epoch
       FROM personalization.teacher_memory_state
      WHERE tenant_ref = $1 AND teacher_ref = $2`,
    [owner.tenantRef, owner.teacherRef]
  );
  return Number(result.rows[0]?.memory_epoch ?? 0);
}

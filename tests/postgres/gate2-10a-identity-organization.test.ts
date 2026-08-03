import { randomUUID } from "node:crypto";

import { apiRoutes } from "@edu-agent/contracts";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import { createProductContainer } from "../../apps/api/src/composition/product-container.js";
import { createLocalDemoTeacherCredential } from "../../apps/api/src/modules/identity-governance-audit/infrastructure/local-identity-provider.js";
import { readIdentitySettings } from "../../apps/api/src/platform/auth/config.js";
import { seedSampleData } from "../../scripts/sample/seed-sample-data.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const syntheticLogin = {
  phone: "13900000001",
  password: "SyntheticDemo123!"
} as const;
const syntheticCredential = createLocalDemoTeacherCredential(
  syntheticLogin.phone,
  syntheticLogin.password
);
const product = createProductContainer(postgresEnvironment, {
  identitySettings: readIdentitySettings({
    APP_ENV: "test",
    IDENTITY_PROVIDER_MODE: "local",
    LOCAL_IDENTITY_PROVIDER_ENABLED: "true",
    LOCAL_DEMO_TEACHER_PHONE_SHA256: syntheticCredential.phoneSha256,
    LOCAL_DEMO_TEACHER_CREDENTIAL_SCRYPT: syntheticCredential.credentialScrypt
  })
});
const app = createApp({ product });

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

async function login(
  agent: ReturnType<typeof request.agent>,
  profile: "teacher" | "admin" | "multi_school" | "school_b_teacher"
) {
  const response = await agent
    .post(apiRoutes.authentication.localLogin)
    .set("Origin", "http://localhost:5173")
    .send({ profile, returnTo: "/overview" })
    .expect(201);
  expect(response.body).toMatchObject({
    authenticated: true,
    authenticationMethod: "local-identity"
  });
  const cookies = response.headers["set-cookie"] as unknown as string[];
  expect(cookies.some((value) => /edu_agent_session=.*HttpOnly/i.test(value))).toBe(true);
  expect(cookies.every((value) => /SameSite=Lax/i.test(value))).toBe(true);
  expect(JSON.stringify(response.body)).not.toContain("teacher-a");
  return response.body as {
    csrfToken: string;
    sessionVersion: number;
    sessionRef: string;
    memberships: Array<{
      membershipRef: string;
      organizationRef: string;
      version: number;
    }>;
    currentWorkspace: {
      membershipRef: string;
      organizationRef: string;
    } | null;
  };
}

describe("Gate 2.10A formal identity and organization boundary", () => {
  it("logs the local teacher in with a password or one-time demo code", async () => {
    const passwordAgent = request.agent(app);
    await passwordAgent
      .post(apiRoutes.authentication.localCredentialLogin)
      .set("Origin", "http://localhost:5173")
      .send({
        method: "password",
        phone: syntheticLogin.phone,
        password: syntheticLogin.password,
        returnTo: "/overview"
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          authenticated: true,
          user: { displayName: "林老师（合成）" },
          currentWorkspace: { organizationRef: "tenant:demo-school" }
        });
      });

    await request(app)
      .post(apiRoutes.authentication.localCredentialLogin)
      .set("Origin", "http://localhost:5173")
      .send({
        method: "password",
        phone: syntheticLogin.phone,
        password: "not-the-password",
        returnTo: "/overview"
      })
      .expect(401)
      .expect(({ body }) => {
        expect(body.message).toBe("手机号或登录凭据不正确。");
        expect(JSON.stringify(body)).not.toContain(syntheticLogin.phone);
      });

    const challengeResponse = await request(app)
      .post(apiRoutes.authentication.localSmsCode)
      .set("Origin", "http://localhost:5173")
      .send({ phone: syntheticLogin.phone })
      .expect(201);
    expect(challengeResponse.body).toMatchObject({
      phoneMasked: "139****0001",
      retryAfterSeconds: 60
    });

    const smsAgent = request.agent(app);
    await smsAgent
      .post(apiRoutes.authentication.localCredentialLogin)
      .set("Origin", "http://localhost:5173")
      .send({
        method: "sms",
        phone: syntheticLogin.phone,
        challengeRef: challengeResponse.body.challengeRef,
        code: challengeResponse.body.demoCode,
        returnTo: "/overview"
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.user.displayName).toBe("林老师（合成）");
      });

    await request(app)
      .post(apiRoutes.authentication.localCredentialLogin)
      .set("Origin", "http://localhost:5173")
      .send({
        method: "sms",
        phone: syntheticLogin.phone,
        challengeRef: challengeResponse.body.challengeRef,
        code: challengeResponse.body.demoCode,
        returnTo: "/overview"
      })
      .expect(401);
  });

  it("creates, refreshes, restores, and revokes an HttpOnly server session", async () => {
    await request(app).get(apiRoutes.teacher.courseRuns).expect(401);
    const agent = request.agent(app);
    let status = await login(agent, "teacher");

    await agent
      .get(apiRoutes.authentication.session)
      .expect(200)
      .expect(({ body }) => {
        expect(body.authenticated).toBe(true);
        expect(body.currentWorkspace.organizationRef).toBe("tenant:demo-school");
      });
    await agent.get(apiRoutes.teacher.courseRuns).expect(200);

    await agent
      .post(apiRoutes.authentication.sessionRefresh)
      .set("Origin", "http://localhost:5173")
      .set("x-csrf-token", status.csrfToken)
      .send({ expectedSessionVersion: status.sessionVersion })
      .expect(200)
      .expect(({ body }) => {
        expect(body.sessionRef).toBe(status.sessionRef);
        expect(body.sessionVersion).toBe(status.sessionVersion + 1);
        status = body;
      });

    await agent
      .post(apiRoutes.authentication.logout)
      .set("Origin", "http://localhost:5173")
      .set("x-csrf-token", status.csrfToken)
      .expect(204);
    await agent.get(apiRoutes.teacher.courseRuns).expect(401);
  });

  it("requires CSRF and an allowed Origin for authenticated mutations", async () => {
    const agent = request.agent(app);
    const status = await login(agent, "teacher");
    await agent
      .post(apiRoutes.authentication.sessionRefresh)
      .set("Origin", "https://attacker.example")
      .set("x-csrf-token", status.csrfToken)
      .send({ expectedSessionVersion: status.sessionVersion })
      .expect(403);
    await agent
      .post(apiRoutes.authentication.sessionRefresh)
      .set("Origin", "http://localhost:5173")
      .set("x-csrf-token", "wrong-csrf-token-that-is-long-enough")
      .send({ expectedSessionVersion: status.sessionVersion })
      .expect(403);
    await agent
      .post(apiRoutes.authentication.sessionRefresh)
      .set("Origin", "http://localhost:5173")
      .send({ expectedSessionVersion: status.sessionVersion })
      .expect(403);
    await agent
      .post(apiRoutes.authentication.logout)
      .set("Origin", "http://localhost:5173")
      .expect(403);
    await agent.get(apiRoutes.teacher.courseRuns).expect(200);
  });

  it("lets a user revoke another persisted session without exposing either token", async () => {
    const first = request.agent(app);
    const firstStatus = await login(first, "teacher");
    const second = request.agent(app);
    await login(second, "teacher");

    const sessions = await first
      .get(apiRoutes.authentication.activeSessions)
      .expect(200);
    const other = sessions.body.items.find(
      (item: { current: boolean; revokedAt: string | null }) =>
        !item.current && item.revokedAt === null
    ) as { sessionRef: string; version: number } | undefined;
    expect(other).toBeTruthy();
    expect(JSON.stringify(sessions.body)).not.toContain("session_token");
    expect(JSON.stringify(sessions.body)).not.toContain("csrf_token");

    await first
      .post(apiRoutes.authentication.revokeSession(other!.sessionRef))
      .set("Origin", "http://localhost:5173")
      .set("x-csrf-token", firstStatus.csrfToken)
      .send({ expectedVersion: other!.version })
      .expect(204);
    await second.get(apiRoutes.teacher.courseRuns).expect(401);
    const audit = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM governance.security_event
        WHERE event_type = 'SessionRevoked'
          AND actor_ref = 'user:teacher-001'
          AND session_ref = $1`,
      [other!.sessionRef]
    );
    expect(Number(audit.rows[0]?.count ?? 0)).toBe(1);
  });

  it("selects one active school workspace and denies another school's refs", async () => {
    const agent = request.agent(app);
    let status = await login(agent, "multi_school");
    expect(status.currentWorkspace).toBeNull();
    await agent.get(apiRoutes.teacher.courseRuns).expect(403);

    const schoolA = status.memberships.find(
      (item) => item.organizationRef === "tenant:demo-school"
    );
    expect(schoolA).toBeTruthy();
    const switched = await agent
      .post(apiRoutes.authentication.switchWorkspace)
      .set("Origin", "http://localhost:5173")
      .set("x-csrf-token", status.csrfToken)
      .send({
        membershipRef: schoolA!.membershipRef,
        expectedSessionVersion: status.sessionVersion
      })
      .expect(200);
    status = switched.body;
    await agent
      .get(apiRoutes.teacher.courseRun("course-run:school-b-grade8-math-2026-fall"))
      .expect(404);

    const denied = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM governance.security_event
        WHERE event_type = 'ProductAccessDenied'
          AND actor_ref = 'user:multi-school-001'`
    );
    expect(Number(denied.rows[0]?.count ?? 0)).toBeGreaterThan(0);
  });

  it("lets a school admin preconfigure members and suspension revokes access", async () => {
    const teacher = request.agent(app);
    await login(teacher, "teacher");
    const admin = request.agent(app);
    const adminStatus = await login(admin, "admin");
    await product.services.identity.recordSecurityEvent({
      eventType: "SchoolBIsolatedSecurityEvent",
      actorRef: "user:teacher-b-001",
      organizationRef: "tenant:demo-school-b",
      outcome: "success",
      safeReason: "Synthetic cross-school audit isolation fixture."
    });
    await admin
      .get(apiRoutes.organization.securityEvents)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ eventType: "SchoolBIsolatedSecurityEvent" })
          ])
        );
      });
    const members = await admin
      .get(apiRoutes.organization.members)
      .expect(200);
    const teacherMembership = members.body.items.find(
      (item: { userRef: string }) => item.userRef === "user:teacher-001"
    );
    const adminMembership = members.body.items.find(
      (item: { userRef: string }) => item.userRef === "user:school-admin-001"
    );
    expect(teacherMembership).toBeTruthy();
    expect(adminMembership).toBeTruthy();

    const created = await admin
      .post(apiRoutes.organization.members)
      .set("x-csrf-token", adminStatus.csrfToken)
      .send({
        displayName: "合成新教师",
        email: `new-${randomUUID()}@example.test`,
        externalProvider: "fake-oidc",
        externalSubject: `subject-${randomUUID()}`,
        roles: ["ordinary_teacher"],
        courseRunRefs: ["course-run:grade8-math-class3-2026-fall"],
        idempotencyKey: `member-create:${randomUUID()}`
      })
      .expect(201);
    expect(created.body.membershipRef).toMatch(/^membership:/);

    const roles = await admin
      .put(apiRoutes.organization.memberRoles(created.body.membershipRef))
      .set("Origin", "http://localhost:5173")
      .set("x-csrf-token", adminStatus.csrfToken)
      .send({
        roles: ["ordinary_teacher", "subject_lead"],
        expectedVersion: created.body.version,
        idempotencyKey: `member-roles:${randomUUID()}`
      })
      .expect(200);
    expect(roles.body).toMatchObject({
      roles: ["ordinary_teacher", "subject_lead"],
      version: created.body.version + 1
    });

    const courseAccess = await admin
      .put(apiRoutes.organization.memberCourseAccess(created.body.membershipRef))
      .set("Origin", "http://localhost:5173")
      .set("x-csrf-token", adminStatus.csrfToken)
      .send({
        courseRunRefs: [],
        expectedVersion: roles.body.version,
        idempotencyKey: `member-course-access:${randomUUID()}`
      })
      .expect(200);
    expect(courseAccess.body).toMatchObject({
      courseRunRefs: [],
      version: roles.body.version + 1
    });
    const unscopedTeacher = request(app)
      .get(apiRoutes.demo.bootstrap)
      .set("x-demo-tenant", "tenant:demo-school")
      .set("x-demo-actor", created.body.userRef);
    await unscopedTeacher.expect(404);

    await admin
      .put(apiRoutes.organization.memberCourseAccess(created.body.membershipRef))
      .set("Origin", "http://localhost:5173")
      .set("x-csrf-token", adminStatus.csrfToken)
      .send({
        courseRunRefs: ["course-run:school-b-grade8-math-2026-fall"],
        expectedVersion: courseAccess.body.version,
        idempotencyKey: `member-cross-school-course:${randomUUID()}`
      })
      .expect(403);

    const adminOnlyRole = await admin
      .put(apiRoutes.organization.memberRoles(adminMembership.membershipRef))
      .set("Origin", "http://localhost:5173")
      .set("x-csrf-token", adminStatus.csrfToken)
      .send({
        roles: ["school_admin"],
        expectedVersion: adminMembership.version,
        idempotencyKey: `member-admin-only:${randomUUID()}`
      })
      .expect(200);
    expect(adminOnlyRole.body.roles).toEqual(["school_admin"]);
    await admin.get(apiRoutes.organization.members).expect(200);
    await admin.get(apiRoutes.teacher.courseRuns).expect(403);

    await admin
      .put(apiRoutes.organization.memberStatus(teacherMembership.membershipRef))
      .set("x-csrf-token", adminStatus.csrfToken)
      .send({
        status: "suspended",
        expectedVersion: teacherMembership.version,
        idempotencyKey: `member-suspend:${randomUUID()}`
      })
      .expect(200);
    await teacher.get(apiRoutes.teacher.courseRuns).expect(401);

    const formalAuthorization = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM governance.authorization_decision
        WHERE actor_ref = 'user:school-admin-001'
          AND action LIKE 'organization.member.%'
          AND effect = 'allow'`
    );
    expect(Number(formalAuthorization.rows[0]?.count ?? 0)).toBeGreaterThan(0);
  });

  it("denies school administration APIs to an ordinary teacher", async () => {
    const teacher = request.agent(app);
    const status = await login(teacher, "teacher");
    await teacher.get(apiRoutes.organization.members).expect(403);
    await teacher.get(apiRoutes.organization.securityEvents).expect(403);
    await teacher
      .post(apiRoutes.organization.members)
      .set("Origin", "http://localhost:5173")
      .set("x-csrf-token", status.csrfToken)
      .send({
        displayName: "Unauthorized Synthetic Teacher",
        externalProvider: "fake-oidc",
        externalSubject: `unauthorized-${randomUUID()}`,
        roles: ["ordinary_teacher"],
        courseRunRefs: [],
        idempotencyKey: `unauthorized-member:${randomUUID()}`
      })
      .expect(403);
  });

  it("registers idempotent export and de-identification review requests without deleting history", async () => {
    const teacher = request.agent(app);
    const status = await login(teacher, "teacher");
    const idempotencyKey = `data-export:${randomUUID()}`;
    const body = {
      requestType: "export",
      reason: "Synthetic Gate 2.10A export review request.",
      idempotencyKey
    };
    const first = await teacher
      .post(apiRoutes.userGovernance.requests)
      .set("Origin", "http://localhost:5173")
      .set("x-csrf-token", status.csrfToken)
      .send(body)
      .expect(201);
    const replay = await teacher
      .post(apiRoutes.userGovernance.requests)
      .set("Origin", "http://localhost:5173")
      .set("x-csrf-token", status.csrfToken)
      .send(body)
      .expect(201);
    expect(first.body.items).toHaveLength(1);
    expect(replay.body.items).toHaveLength(1);
    expect(first.body.items[0]).toMatchObject({
      requestType: "export",
      status: "requested"
    });
    expect(first.body.items[0].retentionNotice).toContain("不会被直接删除");

    await teacher
      .post(apiRoutes.userGovernance.requests)
      .set("Origin", "http://localhost:5173")
      .set("x-csrf-token", status.csrfToken)
      .send({ ...body, requestType: "de_identification" })
      .expect(409)
      .expect(({ body: error }) => {
        expect(error.code).toBe("IDEMPOTENCY_CONFLICT");
      });
    const events = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM governance.security_event
        WHERE event_type = 'UserDataGovernanceRequested'
          AND actor_ref = 'user:teacher-001'`
    );
    expect(Number(events.rows[0]?.count ?? 0)).toBe(1);
  });
});

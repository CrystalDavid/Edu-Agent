import { randomUUID } from "node:crypto";

import { apiRoutes } from "@edu-agent/contracts";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import { createProductContainer } from "../../apps/api/src/composition/product-container.js";
import type {
  ExternalIdentity,
  IdentityProvider,
  IdentityProviderAvailability,
  OidcAuthorizationRequest
} from "../../apps/api/src/modules/identity-governance-audit/domain/identity-provider.js";
import { readIdentitySettings } from "../../apps/api/src/platform/auth/config.js";
import { seedSampleData } from "../../scripts/sample/seed-sample-data.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const providerName = "https://identity.example.test";
const externalSubject = "oidc-teacher-preconfigured";

class FakeOidcIdentityProvider implements IdentityProvider {
  readonly mode = "oidc" as const;
  available = true;
  rejectCallback = false;
  subject = externalSubject;
  lastCurrentUrl: URL | undefined;
  private sequence = 0;

  async availability(): Promise<IdentityProviderAvailability> {
    return {
      mode: "oidc",
      available: this.available,
      label: "Fake OIDC for isolated integration tests",
      ...(!this.available
        ? { safeReason: "Synthetic identity provider unavailable." }
        : {})
    };
  }

  async createAuthorizationRequest(): Promise<OidcAuthorizationRequest> {
    if (!this.available) throw new Error("provider unavailable");
    this.sequence += 1;
    const state = `fake-state-${this.sequence}-${randomUUID()}`;
    return {
      authorizationUrl: `https://identity.example.test/authorize?state=${encodeURIComponent(state)}`,
      state,
      nonce: `fake-nonce-${this.sequence}`,
      codeVerifier: `fake-code-verifier-${this.sequence}-with-safe-length`
    };
  }

  async completeAuthorization(input: {
    currentUrl: URL;
    state: string;
    nonce: string;
    codeVerifier: string;
  }): Promise<ExternalIdentity> {
    this.lastCurrentUrl = input.currentUrl;
    if (!this.available || this.rejectCallback) {
      throw new Error("invalid synthetic OIDC response");
    }
    return {
      provider: providerName,
      subject: this.subject,
      displayName: "OIDC 合成教师",
      email: "oidc.teacher@example.test"
    };
  }
}

const adminPool = poolFor("admin");
const localProduct = createProductContainer(postgresEnvironment, {
  identitySettings: readIdentitySettings({
    APP_ENV: "test",
    IDENTITY_PROVIDER_MODE: "local",
    LOCAL_IDENTITY_PROVIDER_ENABLED: "true"
  })
});
const fakeOidc = new FakeOidcIdentityProvider();
const oidcProduct = createProductContainer(postgresEnvironment, {
  identitySettings: readIdentitySettings({
    APP_ENV: "test",
    IDENTITY_PROVIDER_MODE: "oidc",
    LOCAL_IDENTITY_PROVIDER_ENABLED: "false",
    OIDC_ISSUER_URL: providerName,
    OIDC_CLIENT_ID: "edu-agent-test-client",
    OIDC_REDIRECT_URI: "http://localhost:3000/api/v1/auth/oidc/callback",
    WEB_ALLOWED_ORIGINS: "http://localhost:5173"
  }),
  identityProvider: fakeOidc
});
const oidcApp = createApp({ product: oidcProduct });

function requiredLocation(response: { headers: Record<string, string | string[] | undefined> }): string {
  const value = response.headers.location;
  const location = Array.isArray(value) ? value[0] : value;
  if (!location) throw new Error("Expected an OIDC redirect Location header.");
  return location;
}

beforeEach(async () => {
  fakeOidc.available = true;
  fakeOidc.rejectCallback = false;
  fakeOidc.subject = externalSubject;
  fakeOidc.lastCurrentUrl = undefined;
  await resetGate1BData(adminPool);
  await seedSampleData(postgresEnvironment, {
    includeGate25: true,
    includeGate27: true
  });
  const adminSession = await localProduct.services.identity.localLogin({
    profile: "admin",
    clientLabel: "OIDC test bootstrap"
  });
  const admin = await localProduct.services.identity.resolveProductIdentity({
    sessionToken: adminSession.sessionToken,
    csrfToken: adminSession.csrfToken
  });
  await localProduct.services.identity.createMember(admin, {
    displayName: "OIDC 合成教师",
    email: "oidc.teacher@example.test",
    externalProvider: providerName,
    externalSubject,
    roles: ["ordinary_teacher"],
    courseRunRefs: ["course-run:grade8-math-class3-2026-fall"],
    idempotencyKey: `oidc-member:${randomUUID()}`
  });
});

afterAll(async () => {
  await Promise.all([
    localProduct.close(),
    oidcProduct.close(),
    adminPool.end()
  ]);
});

async function oidcLogin(agent: ReturnType<typeof request.agent>) {
  const started = await agent
    .get(apiRoutes.authentication.oidcStart)
    .query({ returnTo: "/overview" })
    .expect(302);
  const state = new URL(requiredLocation(started)).searchParams.get("state");
  expect(state).toBeTruthy();
  await agent
    .get(apiRoutes.authentication.oidcCallback)
    .query({ state, code: "synthetic-authorization-code" })
    .expect(302)
    .expect("Location", "/overview");
  return state!;
}

describe("Gate 2.10A provider-neutral OIDC session", () => {
  it("establishes an HttpOnly product session from a preconfigured external subject", async () => {
    const agent = request.agent(oidcApp);
    const state = await oidcLogin(agent);
    expect(fakeOidc.lastCurrentUrl?.origin).toBe("http://localhost:3000");
    expect(fakeOidc.lastCurrentUrl?.pathname).toBe("/api/v1/auth/oidc/callback");
    await agent
      .get(apiRoutes.authentication.session)
      .expect(200)
      .expect(({ body }) => {
        expect(body.authenticated).toBe(true);
        expect(body.authenticationMethod).toBe("oidc");
        expect(body.currentWorkspace.organizationRef).toBe("tenant:demo-school");
      });
    await agent.get(apiRoutes.teacher.courseRuns).expect(200);

    await agent
      .get(apiRoutes.authentication.oidcCallback)
      .query({ state, code: "replayed-code" })
      .expect(401);

    const stored = await adminPool.query<{
      provider: string;
      session_token_hash: string;
      csrf_token_hash: string;
    }>(
      `SELECT provider, session_token_hash, csrf_token_hash
         FROM governance.authentication_session
        WHERE authentication_method = 'oidc'`
    );
    expect(stored.rows[0]?.provider).toBe(providerName);
    expect(stored.rows[0]?.session_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.rows[0]?.csrf_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored.rows)).not.toContain("synthetic-authorization-code");
  });

  it("fails closed for an unavailable provider, invalid callback, and unknown subject", async () => {
    fakeOidc.available = false;
    await request(oidcApp)
      .get(apiRoutes.authentication.oidcStart)
      .expect(503);

    fakeOidc.available = true;
    fakeOidc.rejectCallback = true;
    const invalidStart = await request(oidcApp)
      .get(apiRoutes.authentication.oidcStart)
      .expect(302);
    const invalidState = new URL(requiredLocation(invalidStart)).searchParams.get("state");
    await request(oidcApp)
      .get(apiRoutes.authentication.oidcCallback)
      .query({ state: invalidState, code: "invalid-signature" })
      .expect(401);

    fakeOidc.rejectCallback = false;
    fakeOidc.subject = "unknown-unconfigured-subject";
    const unknownStart = await request(oidcApp)
      .get(apiRoutes.authentication.oidcStart)
      .expect(302);
    const unknownState = new URL(requiredLocation(unknownStart)).searchParams.get("state");
    await request(oidcApp)
      .get(apiRoutes.authentication.oidcCallback)
      .query({ state: unknownState, code: "valid-but-unconfigured" })
      .expect(403);
  });

  it("expires a persisted session and denies subsequent product access", async () => {
    const agent = request.agent(oidcApp);
    await oidcLogin(agent);
    await adminPool.query(
      `UPDATE governance.authentication_session
          SET expires_at = now() - interval '1 minute'
        WHERE authentication_method = 'oidc'`
    );
    await agent.get(apiRoutes.teacher.courseRuns).expect(401);
    await agent
      .get(apiRoutes.authentication.session)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          authenticated: false,
          reason: "expired_session"
        });
      });
  });
});

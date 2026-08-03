import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import {
  ActiveSessionListSchema,
  AdminMemberListSchema,
  AuthenticationProviderAvailabilitySchema,
  AuthenticationSessionStatusSchema,
  DataGovernanceRequestListSchema,
  SchoolDetailSchema,
  SecurityEventListSchema,
  type AuthenticationProviderAvailability,
  type AuthenticationSessionStatus,
  type CreateDataGovernanceRequest,
  type CreateMemberRequest,
  type LocalCredentialLoginRequest,
  type LocalSmsChallenge,
  type OrganizationRole,
  type UpdateMemberCourseAccessRequest,
  type UpdateMemberRolesRequest,
  type UpdateMemberStatusRequest,
  type WorkspaceMembershipView
} from "@edu-agent/contracts";
import type { Pool, PoolClient } from "pg";

import type {
  IdentityContextFacade,
  ProductResourceRefs,
  ResolvedProductIdentity,
  SessionCreationResult
} from "../modules/identity-governance-audit/application/identity-context-facade.js";
import type { IdentitySettings } from "../platform/auth/config.js";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  DomainConflictError,
  NotFoundError,
  ServiceUnavailableError
} from "../platform/errors.js";
import type {
  ExternalIdentity,
  IdentityProvider,
  OidcAuthorizationRequest
} from "../modules/identity-governance-audit/domain/identity-provider.js";
import {
  LocalIdentityProvider,
  type LocalIdentityProfile
} from "../modules/identity-governance-audit/infrastructure/local-identity-provider.js";

type AuthenticatedStatus = Extract<
  AuthenticationSessionStatus,
  { authenticated: true }
>;

interface SessionRow {
  session_ref: string;
  csrf_token_hash: string;
  user_ref: string;
  active_membership_ref: string | null;
  authentication_method: "server-session" | "local-identity" | "oidc";
  provider: string;
  client_label: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  version: number;
  display_name: string;
  email: string | null;
  user_status: "active" | "suspended";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqualHash(raw: string, expectedHash: string): boolean {
  const actual = Buffer.from(sha256(raw), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function roleRefs(roles: readonly OrganizationRole[]): string[] {
  const values = roles.map((role) => `role:${role}`);
  if (roles.includes("ordinary_teacher")) values.push("role:math-teacher");
  return values;
}

function maskSubjectHint(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 5) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export class PostgresIdentityOrganizationService
  implements IdentityContextFacade
{
  constructor(
    private readonly pool: Pool,
    readonly settings: IdentitySettings,
    private readonly provider: IdentityProvider,
    private readonly localProvider?: LocalIdentityProvider
  ) {}

  async providerAvailability(): Promise<AuthenticationProviderAvailability> {
    const availability = await this.provider.availability();
    return AuthenticationProviderAvailabilitySchema.parse({
      mode: availability.mode,
      available: availability.available,
      label: availability.label,
      loginPath:
        availability.available && availability.mode === "oidc"
          ? "/api/v1/auth/oidc/start"
          : null,
      localProfiles:
        availability.available && availability.mode === "local"
          ? [
              { profile: "teacher", displayName: "林老师", description: "School A 普通教师" },
              { profile: "admin", displayName: "周管理员", description: "School A 最小管理员" },
              { profile: "multi_school", displayName: "陈老师", description: "School A / School B 多工作空间" },
              { profile: "school_b_teacher", displayName: "王老师", description: "School B 普通教师" }
            ]
          : [],
      safeReason: availability.safeReason ?? null
    });
  }

  async listActiveTeacherScopes(): Promise<
    ReadonlyArray<{
      tenantRef: string;
      actorRef: string;
      courseRunRefs: readonly string[];
    }>
  > {
    const result = await this.pool.query<{
      organization_ref: string;
      user_ref: string;
      course_run_refs: string[];
    }>(
      `SELECT membership.organization_ref, membership.user_ref,
              COALESCE(array_agg(DISTINCT access.course_run_ref)
                FILTER (WHERE access.course_run_ref IS NOT NULL),
                ARRAY[]::text[]) AS course_run_refs
         FROM governance.organization_membership AS membership
         JOIN governance.organization AS organization
           ON organization.organization_ref = membership.organization_ref
         JOIN governance.user_account AS account
           ON account.user_ref = membership.user_ref
         JOIN governance.membership_role_assignment AS role
          ON role.membership_ref = membership.membership_ref
          AND role.role_key = 'ordinary_teacher'
         LEFT JOIN governance.membership_course_run_access AS access
           ON access.membership_ref = membership.membership_ref
        WHERE membership.status = 'active'
          AND organization.status = 'active'
          AND account.status = 'active'
        GROUP BY membership.membership_ref, membership.organization_ref,
                 membership.user_ref`
    );
    return result.rows.map((row) => ({
      tenantRef: row.organization_ref,
      actorRef: row.user_ref,
      courseRunRefs: row.course_run_refs
    }));
  }

  async localLogin(input: {
    profile: LocalIdentityProfile;
    clientLabel: string;
    clientFingerprint?: string;
  }): Promise<SessionCreationResult> {
    if (!this.localProvider || !this.settings.localProviderEnabled) {
      throw new ServiceUnavailableError("Local identity provider is disabled.");
    }
    const external = this.localProvider.authenticate(input.profile);
    return this.createSessionForExternalIdentity({
      external,
      authenticationMethod: "local-identity",
      clientLabel: input.clientLabel,
      ...(input.clientFingerprint
        ? { clientFingerprint: input.clientFingerprint }
        : {})
    });
  }

  async requestLocalSmsCode(phone: string): Promise<LocalSmsChallenge> {
    if (!this.localProvider || !this.settings.localProviderEnabled) {
      throw new ServiceUnavailableError("Local identity provider is disabled.");
    }
    try {
      const challenge = this.localProvider.requestSmsCode(phone);
      await this.recordSecurityEvent({
        eventType: "LocalSmsCodeIssued",
        outcome: "success",
        safeReason: "手机号验证码已发出。"
      });
      return challenge;
    } catch {
      await this.recordSecurityEvent({
        eventType: "LocalAuthenticationDenied",
        outcome: "denied",
        safeReason: "手机号登录尝试被拒绝。"
      });
      throw new AuthenticationRequiredError("手机号或验证码不正确。");
    }
  }

  async localCredentialLogin(input: {
    request: LocalCredentialLoginRequest;
    clientLabel: string;
    clientFingerprint?: string;
  }): Promise<SessionCreationResult> {
    if (!this.localProvider || !this.settings.localProviderEnabled) {
      throw new ServiceUnavailableError("Local identity provider is disabled.");
    }
    let external: ExternalIdentity;
    try {
      external =
        input.request.method === "password"
          ? this.localProvider.authenticatePassword(
              input.request.phone,
              input.request.password
            )
          : this.localProvider.authenticateSms(
              input.request.phone,
              input.request.challengeRef,
              input.request.code
            );
    } catch {
      await this.recordSecurityEvent({
        eventType: "LocalAuthenticationDenied",
        outcome: "denied",
        safeReason: "手机号登录尝试被拒绝。"
      });
      throw new AuthenticationRequiredError("手机号或登录凭据不正确。");
    }
    return this.createSessionForExternalIdentity({
      external,
      authenticationMethod: "local-identity",
      clientLabel: input.clientLabel,
      ...(input.clientFingerprint
        ? { clientFingerprint: input.clientFingerprint }
        : {})
    });
  }

  async beginOidcLogin(returnTo: string): Promise<{
    authorizationUrl: string;
  }> {
    if (!this.provider.createAuthorizationRequest) {
      throw new ServiceUnavailableError("OIDC identity provider is not configured.");
    }
    let request: OidcAuthorizationRequest;
    try {
      request = await this.provider.createAuthorizationRequest({ returnTo });
    } catch {
      await this.recordSecurityEvent({
        eventType: "IdentityProviderUnavailable",
        outcome: "failure",
        safeReason: "OIDC authorization could not be initiated."
      });
      throw new ServiceUnavailableError("The identity provider is temporarily unavailable.");
    }
    const now = new Date();
    await this.pool.query(
      `INSERT INTO governance.oidc_login_state (
         login_state_ref, provider, state_hash, nonce,
         pkce_code_verifier, return_to, created_at, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `oidc-login-state:${randomUUID()}`,
        "oidc",
        sha256(request.state),
        request.nonce,
        request.codeVerifier,
        returnTo,
        now,
        new Date(now.getTime() + 10 * 60_000)
      ]
    );
    return { authorizationUrl: request.authorizationUrl };
  }

  async completeOidcLogin(input: {
    currentUrl: URL;
    state: string;
    clientLabel: string;
    clientFingerprint?: string;
  }): Promise<SessionCreationResult & { returnTo: string }> {
    if (!this.provider.completeAuthorization) {
      throw new ServiceUnavailableError("OIDC identity provider is not configured.");
    }
    const client = await this.pool.connect();
    let loginState: {
      login_state_ref: string;
      nonce: string;
      pkce_code_verifier: string;
      return_to: string;
    };
    try {
      await client.query("BEGIN");
      const result = await client.query<typeof loginState>(
        `SELECT login_state_ref, nonce, pkce_code_verifier, return_to
           FROM governance.oidc_login_state
          WHERE state_hash = $1
            AND consumed_at IS NULL
            AND expires_at > now()
          FOR UPDATE`,
        [sha256(input.state)]
      );
      const row = result.rows[0];
      if (!row) {
        throw new AuthenticationRequiredError("OIDC state is invalid or expired.");
      }
      loginState = row;
      await client.query(
        `UPDATE governance.oidc_login_state
            SET consumed_at = now()
          WHERE login_state_ref = $1`,
        [row.login_state_ref]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    let external: ExternalIdentity;
    try {
      external = await this.provider.completeAuthorization({
        currentUrl: input.currentUrl,
        state: input.state,
        nonce: loginState.nonce,
        codeVerifier: loginState.pkce_code_verifier
      });
    } catch {
      await this.recordSecurityEvent({
        eventType: "LoginDenied",
        outcome: "denied",
        safeReason: "OIDC callback validation failed."
      });
      throw new AuthenticationRequiredError("OIDC authentication failed.");
    }
    const session = await this.createSessionForExternalIdentity({
      external,
      authenticationMethod: "oidc",
      clientLabel: input.clientLabel,
      ...(input.clientFingerprint
        ? { clientFingerprint: input.clientFingerprint }
        : {})
    });
    return { ...session, returnTo: loginState.return_to };
  }

  async getSessionStatus(input: {
    sessionToken?: string;
    csrfToken?: string;
  }): Promise<AuthenticationSessionStatus> {
    if (!input.sessionToken) return this.unauthenticated("missing_session");
    const row = await this.findSession(input.sessionToken);
    if (!row) return this.unauthenticated("missing_session");
    if (row.revoked_at) return this.unauthenticated("revoked_session");
    if (row.expires_at.getTime() <= Date.now()) {
      return this.unauthenticated("expired_session");
    }
    if (row.user_status !== "active") {
      return this.unauthenticated("revoked_session");
    }
    if (!input.csrfToken || !safeEqualHash(input.csrfToken, row.csrf_token_hash)) {
      return this.unauthenticated("revoked_session");
    }
    return this.authenticatedStatus(row, input.csrfToken);
  }

  async resolveProductIdentity(input: {
    sessionToken?: string;
    csrfToken?: string;
    requireTeacherProductAccess?: boolean;
  }): Promise<ResolvedProductIdentity> {
    if (!input.sessionToken) {
      throw new AuthenticationRequiredError("A valid server session is required.");
    }
    const row = await this.findSession(input.sessionToken);
    if (!row || row.revoked_at || row.expires_at.getTime() <= Date.now()) {
      throw new AuthenticationRequiredError("The server session is missing, expired, or revoked.");
    }
    if (row.user_status !== "active") {
      throw new AuthorizationDeniedError("The user account is suspended.");
    }
    if (!input.csrfToken || !safeEqualHash(input.csrfToken, row.csrf_token_hash)) {
      throw new AuthenticationRequiredError(
        "The server session cookie pair is incomplete or invalid."
      );
    }
    const status = await this.authenticatedStatus(row, input.csrfToken);
    const workspace = status.currentWorkspace;
    if (!workspace) {
      throw new AuthorizationDeniedError("Select an active school workspace before accessing product data.");
    }
    if (workspace.organizationStatus !== "active" || workspace.membershipStatus !== "active") {
      throw new AuthorizationDeniedError("The current school membership is inactive.");
    }
    if (
      input.requireTeacherProductAccess !== false &&
      !workspace.roles.includes("ordinary_teacher")
    ) {
      throw new AuthorizationDeniedError("The current membership does not include teacher product access.");
    }
    return {
      tenant: {
        tenantRef: workspace.organizationRef,
        dataMode: "synthetic"
      },
      acting: {
        actorRef: status.user.userRef,
        tenantRef: workspace.organizationRef,
        roleRefs: roleRefs(workspace.roles),
        authenticationMethod: status.authenticationMethod,
        membershipRef: workspace.membershipRef,
        organizationRef: workspace.organizationRef,
        courseRunRefs: workspace.courseRunRefs,
        sessionRef: status.sessionRef
      },
      status,
      csrfTokenHash: row.csrf_token_hash
    };
  }

  async resolveFixtureIdentity(input: {
    tenantRef: string;
    actorRef: string;
  }): Promise<ResolvedProductIdentity> {
    const membership = await this.findActiveMembership(input.tenantRef, input.actorRef);
    if (!membership || !membership.roles.includes("ordinary_teacher")) {
      await this.recordSecurityEvent({
        eventType: "TestIdentityDenied",
        actorRef: input.actorRef,
        organizationRef: input.tenantRef,
        outcome: "denied",
        safeReason: "No active teacher membership for test fixture identity."
      });
      throw new AuthorizationDeniedError("The test identity is not authorized for this school.");
    }
    const status = AuthenticationSessionStatusSchema.parse({
      authenticated: true,
      sessionRef: `session:test-fixture:${sha256(`${input.tenantRef}|${input.actorRef}`).slice(0, 16)}`,
      user: {
        userRef: input.actorRef,
        displayName: membership.displayName,
        email: membership.email,
        status: "active"
      },
      memberships: [membership],
      currentWorkspace: membership,
      csrfToken: "test-fixture-csrf-token-0000000000000000",
      authenticationMethod: "test-fixture",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      sessionVersion: 1,
      demoIdentity: false
    }) as AuthenticatedStatus;
    return {
      tenant: { tenantRef: input.tenantRef, dataMode: "synthetic" },
      acting: {
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        roleRefs: roleRefs(membership.roles),
        authenticationMethod: "test-fixture",
        membershipRef: membership.membershipRef,
        organizationRef: membership.organizationRef,
        courseRunRefs: membership.courseRunRefs,
        sessionRef: status.sessionRef
      },
      status
    };
  }

  async resolveDemoBypassIdentity(): Promise<ResolvedProductIdentity> {
    if (!this.localProvider) {
      throw new AuthorizationDeniedError(
        "Demo identity bypass requires the explicit local identity provider."
      );
    }
    const external = this.localProvider.authenticate("teacher");
    const linked = await this.pool.query<{
      user_ref: string;
      organization_ref: string;
    }>(
      `SELECT account.user_ref, membership.organization_ref
         FROM governance.external_identity_link AS link
         JOIN governance.user_account AS account
           ON account.user_ref = link.user_ref
          AND account.status = 'active'
         JOIN governance.organization_membership AS membership
           ON membership.user_ref = account.user_ref
          AND membership.status = 'active'
         JOIN governance.organization AS organization
           ON organization.organization_ref = membership.organization_ref
          AND organization.status = 'active'
        WHERE link.provider = $1
          AND link.external_subject_hash = $2
          AND link.unlinked_at IS NULL
        ORDER BY membership.created_at, membership.membership_ref
        LIMIT 2`,
      [
        external.provider,
        this.externalSubjectHash(external.provider, external.subject)
      ]
    );
    if (linked.rows.length !== 1) {
      throw new AuthorizationDeniedError(
        "Demo identity bypass requires exactly one active local teacher workspace."
      );
    }
    const selected = linked.rows[0]!;
    const fixture = await this.resolveFixtureIdentity({
      tenantRef: selected.organization_ref,
      actorRef: selected.user_ref
    });
    const status = AuthenticationSessionStatusSchema.parse({
      ...fixture.status,
      sessionRef: "session:demo-bypass",
      authenticationMethod: "demo-bypass",
      demoIdentity: true
    }) as AuthenticatedStatus;
    return {
      ...fixture,
      status,
      acting: {
        ...fixture.acting,
        authenticationMethod: "demo-bypass",
        sessionRef: "session:demo-bypass"
      }
    };
  }

  verifyCsrf(identity: ResolvedProductIdentity, provided?: string): void {
    if (!identity.csrfTokenHash) return;
    if (!provided || !safeEqualHash(provided, identity.csrfTokenHash)) {
      throw new AuthorizationDeniedError("CSRF validation failed.");
    }
  }

  async switchWorkspace(input: {
    sessionToken: string;
    csrfToken: string;
    membershipRef: string;
    expectedSessionVersion: number;
  }): Promise<AuthenticatedStatus> {
    const row = await this.requireSession(input.sessionToken);
    if (!safeEqualHash(input.csrfToken, row.csrf_token_hash)) {
      throw new AuthorizationDeniedError("CSRF validation failed.");
    }
    const membership = await this.findMembershipByRef(input.membershipRef, row.user_ref);
    if (!membership || membership.membershipStatus !== "active" || membership.organizationStatus !== "active") {
      throw new AuthorizationDeniedError("The selected school membership is not active.");
    }
    const changed = await this.pool.query(
      `UPDATE governance.authentication_session
          SET active_membership_ref = $2,
              version = version + 1,
              last_seen_at = now()
        WHERE session_ref = $1
          AND version = $3
          AND revoked_at IS NULL
          AND expires_at > now()`,
      [row.session_ref, input.membershipRef, input.expectedSessionVersion]
    );
    if (changed.rowCount !== 1) {
      throw new DomainConflictError(
        "SESSION_VERSION_CONFLICT",
        "The session changed before the workspace switch completed."
      );
    }
    await this.pool.query(
      `UPDATE governance.organization_membership
          SET last_used_at = now()
        WHERE membership_ref = $1`,
      [input.membershipRef]
    );
    await this.recordSecurityEvent({
      eventType: "WorkspaceSwitched",
      actorRef: row.user_ref,
      organizationRef: membership.organizationRef,
      sessionRef: row.session_ref,
      outcome: "success",
      safeReason: "Active workspace changed by the authenticated user."
    });
    const refreshed = await this.requireSession(input.sessionToken);
    return this.authenticatedStatus(refreshed, input.csrfToken);
  }

  async refreshSession(input: {
    sessionToken: string;
    csrfToken: string;
    expectedSessionVersion: number;
  }): Promise<SessionCreationResult> {
    const row = await this.requireSession(input.sessionToken);
    if (!safeEqualHash(input.csrfToken, row.csrf_token_hash)) {
      throw new AuthorizationDeniedError("CSRF validation failed.");
    }
    const sessionToken = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.settings.sessionTtlMs);
    const changed = await this.pool.query(
      `UPDATE governance.authentication_session
          SET session_token_hash = $2,
              csrf_token_hash = $3,
              expires_at = $4,
              last_seen_at = now(),
              version = version + 1
        WHERE session_ref = $1
          AND version = $5
          AND revoked_at IS NULL
          AND expires_at > now()`,
      [
        row.session_ref,
        sha256(sessionToken),
        sha256(csrfToken),
        expiresAt,
        input.expectedSessionVersion
      ]
    );
    if (changed.rowCount !== 1) {
      throw new DomainConflictError(
        "SESSION_VERSION_CONFLICT",
        "The session changed before it could be refreshed."
      );
    }
    await this.recordSecurityEvent({
      eventType: "SessionRefreshed",
      actorRef: row.user_ref,
      sessionRef: row.session_ref,
      outcome: "success",
      safeReason: "The authenticated session credentials were rotated."
    });
    const refreshed = await this.requireSession(sessionToken);
    return {
      sessionToken,
      csrfToken,
      status: await this.authenticatedStatus(refreshed, csrfToken)
    };
  }

  async logout(sessionToken: string | undefined, csrfToken?: string): Promise<void> {
    if (!sessionToken) return;
    const row = await this.findSession(sessionToken);
    if (!row) return;
    if (!csrfToken || !safeEqualHash(csrfToken, row.csrf_token_hash)) {
      throw new AuthorizationDeniedError("CSRF validation failed.");
    }
    await this.pool.query(
      `UPDATE governance.authentication_session
          SET revoked_at = COALESCE(revoked_at, now()),
              revoke_reason = COALESCE(revoke_reason, 'user-logout'),
              version = version + CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END
        WHERE session_ref = $1`,
      [row.session_ref]
    );
    await this.recordSecurityEvent({
      eventType: "Logout",
      actorRef: row.user_ref,
      organizationRef: null,
      sessionRef: row.session_ref,
      outcome: "success",
      safeReason: "Session revoked by user logout."
    });
  }

  async listSessions(current: ResolvedProductIdentity) {
    const result = await this.pool.query<{
      session_ref: string;
      authentication_method: AuthenticatedStatus["authenticationMethod"];
      organization_ref: string | null;
      created_at: Date;
      last_seen_at: Date;
      expires_at: Date;
      revoked_at: Date | null;
      version: number;
      client_label: string;
    }>(
      `SELECT session.session_ref, session.authentication_method,
              membership.organization_ref, session.created_at,
              session.last_seen_at, session.expires_at,
              session.revoked_at, session.version, session.client_label
         FROM governance.authentication_session AS session
         LEFT JOIN governance.organization_membership AS membership
           ON membership.membership_ref = session.active_membership_ref
        WHERE session.user_ref = $1
        ORDER BY session.created_at DESC`,
      [current.acting.actorRef]
    );
    return ActiveSessionListSchema.parse({
      items: result.rows.map((row) => ({
        sessionRef: row.session_ref,
        current: row.session_ref === current.status.sessionRef,
        authenticationMethod: row.authentication_method,
        organizationRef: row.organization_ref,
        createdAt: row.created_at.toISOString(),
        lastSeenAt: row.last_seen_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        revokedAt: row.revoked_at?.toISOString() ?? null,
        version: row.version,
        clientLabel: row.client_label
      }))
    });
  }

  async revokeSession(input: {
    current: ResolvedProductIdentity;
    sessionRef: string;
    expectedVersion: number;
  }): Promise<void> {
    const result = await this.pool.query(
      `UPDATE governance.authentication_session
          SET revoked_at = COALESCE(revoked_at, now()),
              revoke_reason = COALESCE(revoke_reason, 'user-revoked'),
              version = version + 1
        WHERE session_ref = $1
          AND user_ref = $2
          AND version = $3
          AND revoked_at IS NULL`,
      [input.sessionRef, input.current.acting.actorRef, input.expectedVersion]
    );
    if (result.rowCount !== 1) {
      throw new DomainConflictError(
        "SESSION_VERSION_CONFLICT",
        "The session was already revoked or changed."
      );
    }
    await this.recordSecurityEvent({
      eventType: "SessionRevoked",
      actorRef: input.current.acting.actorRef,
      organizationRef: input.current.acting.tenantRef,
      sessionRef: input.sessionRef,
      outcome: "success",
      safeReason: "An authenticated user revoked one of their sessions."
    });
  }

  async getCurrentSchool(current: ResolvedProductIdentity) {
    const organization = current.status.currentWorkspace;
    if (!organization) throw new NotFoundError("No active school workspace.");
    const result = await this.pool.query<{
      organization_ref: string;
      organization_type: "school";
      name: string;
      status: "active" | "suspended";
      timezone: string;
      created_at: Date;
      version: number;
    }>(
      `SELECT organization_ref, organization_type, name, status,
              timezone, created_at, version
         FROM governance.organization
        WHERE organization_ref = $1`,
      [organization.organizationRef]
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError("School not found.");
    return SchoolDetailSchema.parse({
      organizationRef: row.organization_ref,
      organizationType: row.organization_type,
      name: row.name,
      status: row.status,
      timezone: row.timezone,
      createdAt: row.created_at.toISOString(),
      version: row.version
    });
  }

  async listMembers(current: ResolvedProductIdentity) {
    this.assertAdmin(current);
    const organizationRef = current.acting.tenantRef;
    const result = await this.pool.query<{
      membership_ref: string;
      user_ref: string;
      display_name: string;
      email: string | null;
      status: "invited" | "active" | "suspended";
      roles: OrganizationRole[];
      course_run_refs: string[];
      provider: string | null;
      display_hint: string | null;
      created_at: Date;
      updated_at: Date;
      version: number;
    }>(
      `SELECT membership.membership_ref, membership.user_ref,
              account.display_name, account.email, membership.status,
              COALESCE(array_agg(DISTINCT role.role_key)
                FILTER (WHERE role.role_key IS NOT NULL), ARRAY[]::text[]) AS roles,
              COALESCE(array_agg(DISTINCT access.course_run_ref)
                FILTER (WHERE access.course_run_ref IS NOT NULL), ARRAY[]::text[]) AS course_run_refs,
              identity.provider, identity.display_hint,
              membership.created_at, membership.updated_at, membership.version
         FROM governance.organization_membership AS membership
         JOIN governance.user_account AS account
           ON account.user_ref = membership.user_ref
         LEFT JOIN governance.membership_role_assignment AS role
           ON role.membership_ref = membership.membership_ref
         LEFT JOIN governance.membership_course_run_access AS access
           ON access.membership_ref = membership.membership_ref
         LEFT JOIN LATERAL (
           SELECT provider, display_hint
             FROM governance.external_identity_link
            WHERE user_ref = membership.user_ref AND unlinked_at IS NULL
            ORDER BY linked_at DESC LIMIT 1
         ) AS identity ON true
        WHERE membership.organization_ref = $1
        GROUP BY membership.membership_ref, account.display_name, account.email,
                 identity.provider, identity.display_hint
        ORDER BY account.display_name`,
      [organizationRef]
    );
    return AdminMemberListSchema.parse({
      items: result.rows.map((row) => ({
        membershipRef: row.membership_ref,
        userRef: row.user_ref,
        displayName: row.display_name,
        email: row.email,
        status: row.status,
        roles: row.roles,
        courseRunRefs: row.course_run_refs,
        externalProvider: row.provider,
        externalSubjectMasked: row.display_hint,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        version: row.version
      }))
    });
  }

  async createMember(current: ResolvedProductIdentity, request: CreateMemberRequest) {
    this.assertAdmin(current);
    const organizationRef = current.acting.tenantRef;
    const fingerprint = sha256(JSON.stringify(request));
    const rootKey = `${organizationRef}|member.create|${request.idempotencyKey}`;
    const existing = await this.getIdentityCommand(rootKey, fingerprint);
    if (existing) return existing;
    await this.assertCourseRunsBelongToOrganization(organizationRef, request.courseRunRefs);
    const userRef = `user:${randomUUID()}`;
    const membershipRef = `membership:${randomUUID()}`;
    const now = new Date();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO governance.user_account (
           user_ref, display_name, email, status, data_source,
           version, created_at, updated_at
         ) VALUES ($1, $2, $3, 'active', 'admin-preconfigured', 1, $4, $4)`,
        [userRef, request.displayName, request.email ?? null, now]
      );
      await client.query(
        `INSERT INTO governance.external_identity_link (
           identity_link_ref, user_ref, provider, external_subject_hash,
           display_hint, linked_at
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `identity-link:${randomUUID()}`,
          userRef,
          request.externalProvider,
          this.externalSubjectHash(request.externalProvider, request.externalSubject),
          maskSubjectHint(request.externalSubject),
          now
        ]
      );
      await client.query(
        `INSERT INTO governance.organization_membership (
           membership_ref, organization_ref, user_ref, status,
           created_by, activated_at, version, created_at, updated_at
         ) VALUES ($1, $2, $3, 'active', $4, $5, 1, $5, $5)`,
        [membershipRef, organizationRef, userRef, current.acting.actorRef, now]
      );
      await this.replaceRoles(client, membershipRef, request.roles, current.acting.actorRef, now);
      await this.replaceCourseAccess(client, membershipRef, request.courseRunRefs, current.acting.actorRef, now);
      const result = { membershipRef, userRef, version: 1 };
      await this.insertIdentityCommand(client, {
        rootKey,
        fingerprint,
        actorRef: current.acting.actorRef,
        organizationRef,
        action: "organization.member.create",
        result,
        createdAt: now
      });
      await this.insertFormalAudit(client, current, "OrganizationMembership", membershipRef, "organization.member.create", request.idempotencyKey, now);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateMemberStatus(
    current: ResolvedProductIdentity,
    membershipRef: string,
    request: UpdateMemberStatusRequest
  ) {
    this.assertAdmin(current);
    return this.updateMembership(current, membershipRef, request, "status", async (client, now) => {
      const result = await client.query(
        `UPDATE governance.organization_membership
            SET status = $4,
                activated_at = CASE WHEN $4 = 'active' THEN COALESCE(activated_at, $5) ELSE activated_at END,
                suspended_at = CASE WHEN $4 = 'suspended' THEN $5 ELSE NULL END,
                version = version + 1,
                updated_at = $5
          WHERE membership_ref = $1
            AND organization_ref = $2
            AND version = $3
          RETURNING user_ref, version`,
        [membershipRef, current.acting.tenantRef, request.expectedVersion, request.status, now]
      );
      const row = result.rows[0] as { user_ref: string; version: number } | undefined;
      if (!row) this.versionConflict("Membership status");
      if (request.status === "suspended") {
        await client.query(
          `UPDATE governance.authentication_session
              SET revoked_at = COALESCE(revoked_at, $2),
                  revoke_reason = COALESCE(revoke_reason, 'membership-suspended'),
                  version = version + CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END
            WHERE active_membership_ref = $1`,
          [membershipRef, now]
        );
      }
      return { membershipRef, status: request.status, version: row!.version };
    });
  }

  async updateMemberRoles(
    current: ResolvedProductIdentity,
    membershipRef: string,
    request: UpdateMemberRolesRequest
  ) {
    this.assertAdmin(current);
    return this.updateMembership(current, membershipRef, request, "roles", async (client, now) => {
      const version = await this.bumpMembership(client, current.acting.tenantRef, membershipRef, request.expectedVersion, now);
      await this.replaceRoles(client, membershipRef, request.roles, current.acting.actorRef, now);
      return { membershipRef, roles: request.roles, version };
    });
  }

  async updateMemberCourseAccess(
    current: ResolvedProductIdentity,
    membershipRef: string,
    request: UpdateMemberCourseAccessRequest
  ) {
    this.assertAdmin(current);
    await this.assertCourseRunsBelongToOrganization(current.acting.tenantRef, request.courseRunRefs);
    return this.updateMembership(current, membershipRef, request, "course-access", async (client, now) => {
      const version = await this.bumpMembership(client, current.acting.tenantRef, membershipRef, request.expectedVersion, now);
      await this.replaceCourseAccess(client, membershipRef, request.courseRunRefs, current.acting.actorRef, now);
      return { membershipRef, courseRunRefs: request.courseRunRefs, version };
    });
  }

  async listSecurityEvents(current: ResolvedProductIdentity) {
    this.assertAdmin(current);
    const result = await this.pool.query<{
      event_ref: string;
      event_type: string;
      actor_ref: string | null;
      organization_ref: string | null;
      outcome: "success" | "denied" | "failure";
      safe_reason: string;
      occurred_at: Date;
    }>(
      `SELECT event_ref, event_type, actor_ref, organization_ref,
              outcome, safe_reason, occurred_at
         FROM governance.security_event
        WHERE organization_ref = $1
        ORDER BY occurred_at DESC
        LIMIT 100`,
      [current.acting.tenantRef]
    );
    return SecurityEventListSchema.parse({
      items: result.rows.map((row) => ({
        eventRef: row.event_ref,
        eventType: row.event_type,
        actorRef: row.actor_ref,
        organizationRef: row.organization_ref,
        outcome: row.outcome,
        safeReason: row.safe_reason,
        occurredAt: row.occurred_at.toISOString()
      }))
    });
  }

  async createDataGovernanceRequest(
    current: ResolvedProductIdentity,
    request: CreateDataGovernanceRequest
  ) {
    const requestRef = `data-governance-request:${randomUUID()}`;
    const now = new Date();
    const retentionNotice =
      "Audit、Evidence、TeachingPlan、Assignment、GradeDecision 与 Reflection 历史不会被直接删除；请求需人工审核后导出或去标识。";
    const inserted = await this.pool.query<{
      request_ref: string;
    }>(
      `INSERT INTO governance.data_governance_request (
         request_ref, user_ref, organization_ref, request_type,
         status, reason, retention_notice, requested_by,
         idempotency_key, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'requested', $5, $6, $2, $7, $8, $8)
       ON CONFLICT (user_ref, idempotency_key) DO NOTHING
       RETURNING request_ref`,
      [
        requestRef,
        current.acting.actorRef,
        current.acting.tenantRef,
        request.requestType,
        request.reason,
        retentionNotice,
        request.idempotencyKey,
        now
      ]
    );
    const effectiveRef = inserted.rows[0]?.request_ref;
    if (!effectiveRef) {
      const existing = await this.pool.query<{ request_ref: string; request_type: string; reason: string }>(
        `SELECT request_ref, request_type, reason
           FROM governance.data_governance_request
          WHERE user_ref = $1 AND idempotency_key = $2`,
        [current.acting.actorRef, request.idempotencyKey]
      );
      const row = existing.rows[0];
      if (!row || row.request_type !== request.requestType || row.reason !== request.reason) {
        throw new DomainConflictError(
          "IDEMPOTENCY_CONFLICT",
          "The data request idempotency key was used for another payload."
        );
      }
    } else {
      await this.recordSecurityEvent({
        eventType: "UserDataGovernanceRequested",
        actorRef: current.acting.actorRef,
        organizationRef: current.acting.tenantRef,
        ...(current.acting.sessionRef
          ? { sessionRef: current.acting.sessionRef }
          : {}),
        outcome: "success",
        safeReason: `A ${request.requestType} request entered the governed review queue.`,
        safeDetails: { requestRef: effectiveRef, requestType: request.requestType }
      });
    }
    return this.listDataGovernanceRequests(current);
  }

  async listDataGovernanceRequests(current: ResolvedProductIdentity) {
    const result = await this.pool.query<{
      request_ref: string;
      request_type: "export" | "de_identification" | "deletion";
      status: "requested" | "under_review" | "approved" | "rejected" | "completed";
      reason: string;
      retention_notice: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT request_ref, request_type, status, reason,
              retention_notice, created_at, updated_at
         FROM governance.data_governance_request
        WHERE user_ref = $1
        ORDER BY created_at DESC`,
      [current.acting.actorRef]
    );
    return DataGovernanceRequestListSchema.parse({
      items: result.rows.map((row) => ({
        requestRef: row.request_ref,
        requestType: row.request_type,
        status: row.status,
        reason: row.reason,
        retentionNotice: row.retention_notice,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString()
      }))
    });
  }

  async recordSecurityEvent(input: {
    eventType: string;
    actorRef?: string | null;
    organizationRef?: string | null;
    sessionRef?: string | null;
    outcome: "success" | "denied" | "failure";
    safeReason: string;
    safeDetails?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO governance.security_event (
         event_ref, event_type, actor_ref, organization_ref,
         session_ref, outcome, safe_reason, safe_details, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
      [
        `security-event:${randomUUID()}`,
        input.eventType,
        input.actorRef ?? null,
        input.organizationRef ?? null,
        input.sessionRef ?? null,
        input.outcome,
        input.safeReason,
        JSON.stringify(input.safeDetails ?? {})
      ]
    );
  }

  assertCourseRunAccess(identity: ResolvedProductIdentity, courseRunRef: string): void {
    if (!identity.acting.courseRunRefs?.includes(courseRunRef)) {
      throw new NotFoundError("The requested resource is not available in this workspace.");
    }
  }

  async assertResourceAccess(
    identity: ResolvedProductIdentity,
    refs: ProductResourceRefs
  ): Promise<void> {
    const authorized = new Set(identity.acting.courseRunRefs ?? []);
    const required = new Set(refs.courseRunRefs ?? []);
    const collect = async (
      sql: string,
      values: readonly string[] | undefined
    ): Promise<void> => {
      if (!values?.length) return;
      const result = await this.pool.query<{ course_run_ref: string }>(sql, [
        [...new Set(values)]
      ]);
      for (const row of result.rows) required.add(row.course_run_ref);
    };

    await Promise.all([
      collect(
        `SELECT DISTINCT course_run_ref
           FROM education.curriculum_unit
          WHERE unit_ref = ANY($1::text[])`,
        refs.unitRefs
      ),
      collect(
        `SELECT DISTINCT unit.course_run_ref
           FROM education.lesson AS lesson
           JOIN education.curriculum_unit AS unit
             ON unit.unit_ref = lesson.unit_ref
          WHERE lesson.lesson_ref = ANY($1::text[])`,
        refs.lessonRefs
      ),
      collect(
        `SELECT DISTINCT course_run_ref
           FROM education.assignment
          WHERE assignment_ref = ANY($1::text[])`,
        refs.assignmentRefs
      ),
      collect(
        `SELECT DISTINCT course_run_ref
           FROM education.course_run_enrollment
          WHERE learner_ref = ANY($1::text[])`,
        refs.learnerRefs
      ),
      collect(
        `SELECT DISTINCT course_run_ref
           FROM education.lesson_delivery
          WHERE delivery_ref = ANY($1::text[])`,
        refs.deliveryRefs
      ),
      collect(
        `SELECT DISTINCT course_run_ref
           FROM education.classroom_observation
          WHERE observation_ref = ANY($1::text[])`,
        refs.observationRefs
      ),
      collect(
        `SELECT DISTINCT course_run_ref
           FROM artifact.lesson_reflection_scope
          WHERE artifact_ref = ANY($1::text[])`,
        refs.reflectionRefs
      ),
      collect(
        `SELECT DISTINCT course_run_ref
           FROM work.lesson_preparation_task_details
          WHERE task_ref = ANY($1::text[])`,
        refs.taskRefs
      )
    ]);

    for (const courseRunRef of required) {
      if (!authorized.has(courseRunRef)) {
        throw new NotFoundError(
          "The requested resource is not available in this workspace."
        );
      }
    }
  }

  private externalSubjectHash(provider: string, subject: string): string {
    return sha256(`${provider}\u0000${subject}`);
  }

  private async createSessionForExternalIdentity(input: {
    external: ExternalIdentity;
    authenticationMethod: "local-identity" | "oidc";
    clientLabel: string;
    clientFingerprint?: string;
  }): Promise<SessionCreationResult> {
    const identity = await this.pool.query<{
      user_ref: string;
      display_name: string;
    }>(
      `SELECT account.user_ref, account.display_name
         FROM governance.external_identity_link AS link
         JOIN governance.user_account AS account
           ON account.user_ref = link.user_ref
        WHERE link.provider = $1
          AND link.external_subject_hash = $2
          AND link.unlinked_at IS NULL
          AND account.status = 'active'`,
      [
        input.external.provider,
        this.externalSubjectHash(input.external.provider, input.external.subject)
      ]
    );
    const user = identity.rows[0];
    if (!user) {
      await this.recordSecurityEvent({
        eventType: "LoginDenied",
        outcome: "denied",
        safeReason: "External identity has no active Edu-Agent account."
      });
      throw new AuthorizationDeniedError(
        "This identity has not been preconfigured for an Edu-Agent school."
      );
    }
    const memberships = await this.listMemberships(user.user_ref);
    const active = memberships.filter(
      (item) =>
        item.membershipStatus === "active" &&
        item.organizationStatus === "active"
    );
    if (active.length === 0) {
      throw new AuthorizationDeniedError("No active school membership is available.");
    }
    const current = active.length === 1 ? active[0]! : null;
    const sessionToken = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const sessionRef = `session:${randomUUID()}`;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + this.settings.sessionTtlMs);
    await this.pool.query(
      `INSERT INTO governance.authentication_session (
         session_ref, session_token_hash, csrf_token_hash, user_ref,
         active_membership_ref, authentication_method, provider,
         client_label, client_fingerprint_hash, created_at,
         last_seen_at, expires_at, version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, 1)`,
      [
        sessionRef,
        sha256(sessionToken),
        sha256(csrfToken),
        user.user_ref,
        current?.membershipRef ?? null,
        input.authenticationMethod,
        input.external.provider,
        input.clientLabel.slice(0, 160) || "Unknown client",
        input.clientFingerprint ? sha256(input.clientFingerprint) : null,
        createdAt,
        expiresAt
      ]
    );
    await this.recordSecurityEvent({
      eventType: "LoginSucceeded",
      actorRef: user.user_ref,
      organizationRef: current?.organizationRef ?? null,
      sessionRef,
      outcome: "success",
      safeReason: "External identity matched an active Edu-Agent account."
    });
    const row = await this.requireSession(sessionToken);
    return {
      sessionToken,
      csrfToken,
      status: await this.authenticatedStatus(row, csrfToken)
    };
  }

  private async unauthenticated(
    reason: "missing_session" | "expired_session" | "revoked_session" | "provider_unavailable"
  ): Promise<AuthenticationSessionStatus> {
    const availability = await this.provider.availability();
    return AuthenticationSessionStatusSchema.parse({
      authenticated: false,
      providerMode: availability.mode,
      providerAvailable: availability.available,
      demoBypassAvailable: false,
      reason
    });
  }

  private async findSession(sessionToken: string): Promise<SessionRow | undefined> {
    const result = await this.pool.query<SessionRow>(
      `SELECT session.session_ref, session.csrf_token_hash,
              session.user_ref, session.active_membership_ref,
              session.authentication_method, session.provider,
              session.client_label, session.created_at,
              session.last_seen_at, session.expires_at,
              session.revoked_at, session.version,
              account.display_name, account.email,
              account.status AS user_status
         FROM governance.authentication_session AS session
         JOIN governance.user_account AS account
           ON account.user_ref = session.user_ref
        WHERE session.session_token_hash = $1`,
      [sha256(sessionToken)]
    );
    return result.rows[0];
  }

  private async requireSession(sessionToken: string): Promise<SessionRow> {
    const row = await this.findSession(sessionToken);
    if (!row || row.revoked_at || row.expires_at.getTime() <= Date.now()) {
      throw new AuthenticationRequiredError("The server session is missing, expired, or revoked.");
    }
    return row;
  }

  private async authenticatedStatus(
    row: SessionRow,
    csrfToken: string
  ): Promise<AuthenticatedStatus> {
    const memberships = await this.listMemberships(row.user_ref);
    const currentWorkspace =
      memberships.find(
        (item) =>
          item.membershipRef === row.active_membership_ref &&
          item.membershipStatus === "active" &&
          item.organizationStatus === "active"
      ) ?? null;
    return AuthenticationSessionStatusSchema.parse({
      authenticated: true,
      sessionRef: row.session_ref,
      user: {
        userRef: row.user_ref,
        displayName: row.display_name,
        email: row.email,
        status: row.user_status
      },
      memberships,
      currentWorkspace,
      csrfToken,
      authenticationMethod: row.authentication_method,
      expiresAt: row.expires_at.toISOString(),
      sessionVersion: row.version,
      demoIdentity: false
    }) as AuthenticatedStatus;
  }

  private async listMemberships(userRef: string): Promise<WorkspaceMembershipView[]> {
    const result = await this.pool.query<{
      membership_ref: string;
      organization_ref: string;
      organization_name: string;
      organization_status: "active" | "suspended";
      membership_status: "invited" | "active" | "suspended";
      roles: OrganizationRole[];
      course_run_refs: string[];
      version: number;
    }>(
      `SELECT membership.membership_ref, membership.organization_ref,
              organization.name AS organization_name,
              organization.status AS organization_status,
              membership.status AS membership_status,
              COALESCE(array_agg(DISTINCT role.role_key)
                FILTER (WHERE role.role_key IS NOT NULL), ARRAY[]::text[]) AS roles,
              COALESCE(array_agg(DISTINCT access.course_run_ref)
                FILTER (WHERE access.course_run_ref IS NOT NULL), ARRAY[]::text[]) AS course_run_refs,
              membership.version
         FROM governance.organization_membership AS membership
         JOIN governance.organization AS organization
           ON organization.organization_ref = membership.organization_ref
         LEFT JOIN governance.membership_role_assignment AS role
           ON role.membership_ref = membership.membership_ref
         LEFT JOIN governance.membership_course_run_access AS access
           ON access.membership_ref = membership.membership_ref
        WHERE membership.user_ref = $1
        GROUP BY membership.membership_ref, organization.name,
                 organization.status
        ORDER BY membership.last_used_at DESC NULLS LAST,
                 organization.name`,
      [userRef]
    );
    return result.rows.map((row) => ({
      membershipRef: row.membership_ref,
      organizationRef: row.organization_ref,
      organizationName: row.organization_name,
      organizationStatus: row.organization_status,
      membershipStatus: row.membership_status,
      roles: row.roles,
      courseRunRefs: row.course_run_refs,
      version: row.version
    }));
  }

  private async findActiveMembership(
    organizationRef: string,
    userRef: string
  ): Promise<(WorkspaceMembershipView & { displayName: string; email: string | null }) | undefined> {
    const memberships = await this.listMemberships(userRef);
    const membership = memberships.find(
      (item) =>
        item.organizationRef === organizationRef &&
        item.membershipStatus === "active" &&
        item.organizationStatus === "active"
    );
    if (!membership) return undefined;
    const user = await this.pool.query<{ display_name: string; email: string | null; status: string }>(
      `SELECT display_name, email, status
         FROM governance.user_account
        WHERE user_ref = $1`,
      [userRef]
    );
    if (user.rows[0]?.status !== "active") return undefined;
    return {
      ...membership,
      displayName: user.rows[0].display_name,
      email: user.rows[0].email
    };
  }

  private async findMembershipByRef(
    membershipRef: string,
    userRef: string
  ): Promise<WorkspaceMembershipView | undefined> {
    return (await this.listMemberships(userRef)).find(
      (item) => item.membershipRef === membershipRef
    );
  }

  private assertAdmin(current: ResolvedProductIdentity): void {
    if (!current.status.currentWorkspace?.roles.includes("school_admin")) {
      throw new AuthorizationDeniedError("School administrator role is required.");
    }
  }

  private async assertCourseRunsBelongToOrganization(
    organizationRef: string,
    courseRunRefs: readonly string[]
  ): Promise<void> {
    if (courseRunRefs.length === 0) return;
    const result = await this.pool.query<{ course_run_ref: string }>(
      `SELECT course_run_ref
         FROM education.course_run
        WHERE tenant_ref = $1 AND course_run_ref = ANY($2::text[])`,
      [organizationRef, [...courseRunRefs]]
    );
    if (result.rowCount !== new Set(courseRunRefs).size) {
      throw new AuthorizationDeniedError(
        "CourseRun access can only be granted inside the current school."
      );
    }
  }

  private async replaceRoles(
    client: PoolClient,
    membershipRef: string,
    roles: readonly OrganizationRole[],
    actorRef: string,
    now: Date
  ): Promise<void> {
    await client.query(
      `DELETE FROM governance.membership_role_assignment
        WHERE membership_ref = $1`,
      [membershipRef]
    );
    for (const role of new Set(roles)) {
      await client.query(
        `INSERT INTO governance.membership_role_assignment (
           membership_ref, role_key, assigned_by, assigned_at
         ) VALUES ($1, $2, $3, $4)`,
        [membershipRef, role, actorRef, now]
      );
    }
  }

  private async replaceCourseAccess(
    client: PoolClient,
    membershipRef: string,
    courseRunRefs: readonly string[],
    actorRef: string,
    now: Date
  ): Promise<void> {
    await client.query(
      `DELETE FROM governance.membership_course_run_access
        WHERE membership_ref = $1`,
      [membershipRef]
    );
    for (const courseRunRef of new Set(courseRunRefs)) {
      await client.query(
        `INSERT INTO governance.membership_course_run_access (
           membership_ref, course_run_ref, granted_by, granted_at
         ) VALUES ($1, $2, $3, $4)`,
        [membershipRef, courseRunRef, actorRef, now]
      );
    }
  }

  private async bumpMembership(
    client: PoolClient,
    organizationRef: string,
    membershipRef: string,
    expectedVersion: number,
    now: Date
  ): Promise<number> {
    const result = await client.query<{ version: number }>(
      `UPDATE governance.organization_membership
          SET version = version + 1, updated_at = $4
        WHERE membership_ref = $1
          AND organization_ref = $2
          AND version = $3
        RETURNING version`,
      [membershipRef, organizationRef, expectedVersion, now]
    );
    const version = result.rows[0]?.version;
    if (!version) this.versionConflict("Membership");
    return version!;
  }

  private versionConflict(resource: string): never {
    throw new DomainConflictError(
      "EXPECTED_VERSION_CONFLICT",
      `${resource} changed before the command completed.`
    );
  }

  private async updateMembership<TRequest extends { idempotencyKey: string }, TResult>(
    current: ResolvedProductIdentity,
    membershipRef: string,
    request: TRequest,
    action: string,
    change: (client: PoolClient, now: Date) => Promise<TResult>
  ): Promise<TResult> {
    const rootKey = `${current.acting.tenantRef}|membership:${membershipRef}|${action}|${request.idempotencyKey}`;
    const fingerprint = sha256(JSON.stringify(request));
    const existing = await this.getIdentityCommand(rootKey, fingerprint);
    if (existing) return existing as TResult;
    const client = await this.pool.connect();
    const now = new Date();
    try {
      await client.query("BEGIN");
      const result = await change(client, now);
      await this.insertIdentityCommand(client, {
        rootKey,
        fingerprint,
        actorRef: current.acting.actorRef,
        organizationRef: current.acting.tenantRef,
        action: `organization.member.${action}`,
        result: result as Record<string, unknown>,
        createdAt: now
      });
      await this.insertFormalAudit(
        client,
        current,
        "OrganizationMembership",
        membershipRef,
        `organization.member.${action}`,
        request.idempotencyKey,
        now
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async getIdentityCommand(
    rootKey: string,
    fingerprint: string
  ): Promise<Record<string, unknown> | undefined> {
    const result = await this.pool.query<{
      request_fingerprint: string;
      result: Record<string, unknown>;
    }>(
      `SELECT request_fingerprint, result
         FROM governance.identity_command
        WHERE root_key = $1`,
      [rootKey]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    if (row.request_fingerprint !== fingerprint) {
      throw new DomainConflictError(
        "IDEMPOTENCY_CONFLICT",
        "The idempotency key was used for another payload."
      );
    }
    return row.result;
  }

  private async insertIdentityCommand(
    client: PoolClient,
    input: {
      rootKey: string;
      fingerprint: string;
      actorRef: string;
      organizationRef: string;
      action: string;
      result: Record<string, unknown>;
      createdAt: Date;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO governance.identity_command (
         command_ref, root_key, request_fingerprint, result,
         actor_ref, organization_ref, action, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `identity-command:${randomUUID()}`,
        input.rootKey,
        input.fingerprint,
        JSON.stringify(input.result),
        input.actorRef,
        input.organizationRef,
        input.action,
        input.createdAt
      ]
    );
  }

  private async insertFormalAudit(
    client: PoolClient,
    current: ResolvedProductIdentity,
    recordType: string,
    writeRef: string,
    action: string,
    idempotencyKey: string,
    createdAt: Date
  ): Promise<void> {
    const authorizationDecisionRef = `authorization-decision:${randomUUID()}`;
    const decisionAuditRef = `audit:${randomUUID()}`;
    const writeAuditRef = `audit:${randomUUID()}`;
    await client.query(
      `INSERT INTO governance.authorization_decision (
         decision_ref, tenant_ref, action, resource_ref, effect,
         reason_codes, policy_version, requested_field_mask, decided_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, 'allow', $5, 'gate-2.10a.organization-admin@1',
         $6, $7, $8, $3, 'governance', $9, $1, $10, $7
       )`,
      [
        authorizationDecisionRef,
        current.acting.tenantRef,
        action,
        writeRef,
        JSON.stringify([
          "authenticated-server-session",
          "active-school-membership",
          "school-admin-role"
        ]),
        JSON.stringify(["membership", "role-assignment", "course-run-access"]),
        createdAt,
        current.acting.actorRef,
        `${idempotencyKey}:authorization`,
        decisionAuditRef
      ]
    );
    await client.query(
      `INSERT INTO governance.audit_record (
         record_ref, write_ref, record_type, action, actor_ref,
         purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, 'AuthorizationDecision', 'formal-write', $3,
         $4, 'governance', $5, $2, $1, $6)`,
      [
        decisionAuditRef,
        authorizationDecisionRef,
        current.acting.actorRef,
        action,
        `${idempotencyKey}:authorization:audit`,
        createdAt
      ]
    );
    await client.query(
      `INSERT INTO governance.audit_record (
         record_ref, write_ref, record_type, action, actor_ref,
         purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES ($1, $2, $3, $4, $5, $4, 'governance', $6, $7, $1, $8)`,
      [
        writeAuditRef,
        writeRef,
        recordType,
        action,
        current.acting.actorRef,
        `${idempotencyKey}:governance-audit`,
        authorizationDecisionRef,
        createdAt
      ]
    );
  }
}

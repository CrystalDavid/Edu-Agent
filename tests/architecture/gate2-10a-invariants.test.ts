import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

function filesUnder(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const child = join(path, entry);
    return statSync(child).isDirectory() ? filesUnder(child) : [child];
  });
}

describe("Gate 2.10A identity and organization invariants", () => {
  it("keeps identity, organization, membership, role, session, and governance history in Governance", () => {
    const migration = source(
      "apps/api/src/modules/identity-governance-audit/infrastructure/migrations/0005_gate2_10a_identity_organization.sql"
    );
    for (const table of [
      "governance.user_account",
      "governance.external_identity_link",
      "governance.organization",
      "governance.organization_membership",
      "governance.membership_role_assignment",
      "governance.membership_course_run_access",
      "governance.authentication_session",
      "governance.security_event",
      "governance.data_governance_request"
    ]) {
      expect(migration).toContain(table);
    }
    expect(migration).not.toMatch(/password_hash|password_reset|mfa_secret/i);
    expect(migration).not.toMatch(/api_key|refresh_token|access_token/i);
  });

  it("derives product ActingContext from a server session and confines Header identity to an explicit test adapter", () => {
    const app = source("apps/api/src/app.ts");
    const config = source("apps/api/src/platform/auth/config.ts");
    expect(app).toContain("resolveProductIdentity");
    expect(app).toContain("assertResourceAccess");
    expect(app).toContain("allowTestIdentityHeaders");
    expect(app).not.toContain(
      'request.header("x-csrf-token") ?? cookies.csrfToken'
    );
    expect(config).toContain("ALLOW_TEST_IDENTITY_HEADERS is forbidden in production");
    expect(config).toContain("Production requires IDENTITY_PROVIDER_MODE=oidc");
    expect(config).toContain("Production authentication cookies must be Secure");
  });

  it("keeps identity tokens out of Web state and the OIDC SDK out of the browser bundle", () => {
    const webFiles = filesUnder(resolve(root, "apps/web/src"))
      .filter((path) => /\.(?:ts|tsx)$/u.test(path));
    const web = webFiles.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(web).not.toContain("openid-client");
    expect(web).not.toContain("x-demo-tenant");
    expect(web).not.toContain("x-demo-actor");
    expect(web).not.toMatch(/localStorage\.(?:setItem|getItem).*token/i);
    expect(web).not.toMatch(/sessionStorage\.(?:setItem|getItem).*token/i);
    expect(source("apps/api/src/modules/identity-governance-audit/infrastructure/oidc-identity-provider.ts"))
      .toContain('from "openid-client"');
  });

  it("centralizes typed authentication and organization APIs in contracts", () => {
    const identity = source("packages/contracts/src/identity.ts");
    const routes = source("packages/contracts/src/api-routes.ts");
    const webApi = source("apps/web/src/api.ts");
    expect(identity).toContain("AuthenticationSessionStatusSchema");
    expect(identity).toContain("WorkspaceMembershipViewSchema");
    expect(identity).toContain("AdminMemberViewSchema");
    expect(routes).toContain("switchWorkspace");
    expect(routes).toContain("memberCourseAccess");
    expect(webApi).toContain("apiRoutes.authentication.session");
    expect(webApi).toContain("apiRoutes.organization.members");
  });

  it("keeps model, task, file, and education ownership outside Governance", () => {
    const service = source(
      "apps/api/src/composition/postgres-identity-organization-service.ts"
    );
    expect(service).not.toMatch(/INSERT\s+INTO\s+(?:education|work|artifact|capability)\./iu);
    expect(service).not.toMatch(/UPDATE\s+(?:education|work|artifact|capability)\./iu);
  });

  it("reconstructs Reflection model work from the sealed execution tenant instead of School A", () => {
    const invocation = source(
      "apps/api/src/composition/postgres-model-invocation-service.ts"
    );
    expect(invocation).toContain(
      "const tenantRef = await this.executionTenantRef(execution);"
    );
    expect(invocation).toContain(
      "const tenantRef = await this.executionTenantRef(execution, client);"
    );
    expect(invocation).not.toContain('"tenant:demo-school"');
    expect(invocation).toContain('"tenant:system-capability-probe"');
  });

  it("scopes teacher proposals and Runs to the authenticated request owner", () => {
    const repository = source(
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/postgres-gate2-work-repository.ts"
    );
    const readService = source(
      "apps/api/src/composition/postgres-gate2-read-service.ts"
    );
    expect(repository).toContain(
      "task_run.request_payload ->> 'actorRef' = $3"
    );
    expect(repository).toContain(
      "task_run.request_payload ->> 'actorRef' = $2"
    );
    expect(readService).toContain(
      "input.allowedCourseRunRefs"
    );
  });
});

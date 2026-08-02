import { describe, expect, it } from "vitest";

import { LocalIdentityProvider } from "../../apps/api/src/modules/identity-governance-audit/infrastructure/local-identity-provider.js";
import { readIdentitySettings } from "../../apps/api/src/platform/auth/config.js";

describe("Gate 2.10A identity configuration", () => {
  it("fails closed when production is not configured for OIDC", () => {
    expect(() =>
      readIdentitySettings({
        APP_ENV: "production",
        NODE_ENV: "production",
        IDENTITY_PROVIDER_MODE: "local",
        LOCAL_IDENTITY_PROVIDER_ENABLED: "false"
      })
    ).toThrow(/requires IDENTITY_PROVIDER_MODE=oidc/);

    expect(() =>
      readIdentitySettings({
        APP_ENV: "production",
        NODE_ENV: "production",
        IDENTITY_PROVIDER_MODE: "oidc",
        LOCAL_IDENTITY_PROVIDER_ENABLED: "false"
      })
    ).toThrow(/requires OIDC_ISSUER_URL/);
  });

  it("forbids insecure test identity controls in production", () => {
    expect(() =>
      readIdentitySettings({
        APP_ENV: "production",
        NODE_ENV: "production",
        IDENTITY_PROVIDER_MODE: "oidc",
        OIDC_ISSUER_URL: "https://identity.example.test",
        OIDC_CLIENT_ID: "edu-agent",
        OIDC_REDIRECT_URI: "https://edu.example.test/api/v1/auth/oidc/callback",
        LOCAL_IDENTITY_PROVIDER_ENABLED: "false",
        ALLOW_TEST_IDENTITY_HEADERS: "true"
      })
    ).toThrow(/ALLOW_TEST_IDENTITY_HEADERS is forbidden/);
  });

  it("keeps the local identity adapter explicit and synthetic", async () => {
    const disabled = new LocalIdentityProvider(false);
    expect(await disabled.availability()).toMatchObject({
      mode: "local",
      available: false
    });
    expect(() => disabled.authenticate("teacher")).toThrow(/disabled/);

    const enabled = new LocalIdentityProvider(true);
    expect(enabled.authenticate("teacher")).toMatchObject({
      provider: "local-development",
      subject: "teacher-a"
    });
  });
});

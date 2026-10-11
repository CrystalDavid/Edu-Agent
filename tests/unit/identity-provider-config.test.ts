import { describe, expect, it } from "vitest";

import {
  createLocalDemoTeacherCredential,
  LocalIdentityProvider
} from "../../apps/api/src/modules/identity-governance-audit/infrastructure/local-identity-provider.js";
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
    const credential = createLocalDemoTeacherCredential(
      "13900000001",
      "SyntheticDemo123!"
    );
    const disabled = new LocalIdentityProvider(false, credential);
    expect(await disabled.availability()).toMatchObject({
      mode: "local",
      available: false
    });
    expect(() => disabled.authenticate("teacher")).toThrow(/disabled/);

    const enabled = new LocalIdentityProvider(true, credential);
    expect(enabled.authenticate("teacher")).toMatchObject({
      provider: "local-development",
      subject: "teacher-a"
    });
  });

  it("authenticates the local teacher by password or a one-time demo code", () => {
    const credential = createLocalDemoTeacherCredential(
      "13900000001",
      "SyntheticDemo123!"
    );
    const provider = new LocalIdentityProvider(true, credential);

    expect(
      provider.authenticatePassword("13900000001", "SyntheticDemo123!")
    ).toMatchObject({ subject: "teacher-a" });
    expect(() =>
      provider.authenticatePassword("13900000001", "wrong-password")
    ).toThrow(/Invalid local credentials/);

    const challenge = provider.requestSmsCode("13900000001");
    expect(challenge).toMatchObject({
      phoneMasked: "139****0001",
      retryAfterSeconds: 60
    });
    expect(
      provider.authenticateSms(
        "13900000001",
        challenge.challengeRef,
        challenge.demoCode
      )
    ).toMatchObject({ subject: "teacher-a" });
    expect(() =>
      provider.authenticateSms(
        "13900000001",
        challenge.challengeRef,
        challenge.demoCode
      )
    ).toThrow(/Invalid local credentials/);
  });

  it("validates optional local credential digests without accepting plaintext", () => {
    expect(() =>
      readIdentitySettings({
        APP_ENV: "local",
        IDENTITY_PROVIDER_MODE: "local",
        LOCAL_DEMO_TEACHER_PHONE_SHA256: "not-a-hash"
      })
    ).toThrow(/LOCAL_DEMO_TEACHER_PHONE_SHA256/);

    const settings = readIdentitySettings({
      APP_ENV: "local",
      IDENTITY_PROVIDER_MODE: "local"
    });
    expect(settings.localDemoTeacherCredential.phoneSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(settings.localDemoTeacherCredential.credentialScrypt).toMatch(/^[a-f0-9]{128}$/);
  });
});

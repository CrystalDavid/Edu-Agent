import * as oidc from "openid-client";

import type { OidcProviderSettings } from "../../../platform/auth/config.js";
import type {
  ExternalIdentity,
  IdentityProvider,
  IdentityProviderAvailability,
  OidcAuthorizationRequest
} from "../domain/identity-provider.js";

export class OidcIdentityProvider implements IdentityProvider {
  readonly mode = "oidc" as const;
  private configuration: Promise<oidc.Configuration> | undefined;

  constructor(private readonly settings: OidcProviderSettings) {}

  private config(): Promise<oidc.Configuration> {
    this.configuration ??= oidc.discovery(
      this.settings.issuerUrl,
      this.settings.clientId,
      this.settings.clientSecret
    );
    return this.configuration;
  }

  async availability(): Promise<IdentityProviderAvailability> {
    try {
      await this.config();
      return {
        mode: "oidc",
        available: true,
        label: "学校统一身份（OIDC）"
      };
    } catch {
      this.configuration = undefined;
      return {
        mode: "oidc",
        available: false,
        label: "学校统一身份（OIDC）",
        safeReason: "Identity provider discovery is unavailable."
      };
    }
  }

  async createAuthorizationRequest(): Promise<OidcAuthorizationRequest> {
    const configuration = await this.config();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: this.settings.redirectUri,
      scope: this.settings.scopes,
      response_type: "code",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce
    });
    return {
      authorizationUrl: authorizationUrl.href,
      state,
      nonce,
      codeVerifier
    };
  }

  async completeAuthorization(input: {
    currentUrl: URL;
    state: string;
    nonce: string;
    codeVerifier: string;
  }): Promise<ExternalIdentity> {
    const configuration = await this.config();
    const tokens = await oidc.authorizationCodeGrant(
      configuration,
      input.currentUrl,
      {
        pkceCodeVerifier: input.codeVerifier,
        expectedState: input.state,
        expectedNonce: input.nonce
      }
    );
    const claims = tokens.claims();
    if (!claims?.sub) {
      throw new Error("OIDC response did not contain a stable subject.");
    }
    return {
      provider: this.settings.issuerUrl.href.replace(/\/$/u, ""),
      subject: claims.sub,
      displayName:
        typeof claims.name === "string" && claims.name.trim()
          ? claims.name.trim()
          : typeof claims.preferred_username === "string" && claims.preferred_username.trim()
            ? claims.preferred_username.trim()
            : "Edu-Agent 用户",
      ...(typeof claims.email === "string" ? { email: claims.email } : {})
    };
  }
}

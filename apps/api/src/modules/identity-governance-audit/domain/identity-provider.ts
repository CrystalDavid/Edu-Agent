export interface ExternalIdentity {
  provider: string;
  subject: string;
  displayName: string;
  email?: string;
}

export interface IdentityProviderAvailability {
  mode: "local" | "oidc";
  available: boolean;
  label: string;
  safeReason?: string;
}

export interface OidcAuthorizationRequest {
  authorizationUrl: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface IdentityProvider {
  readonly mode: "local" | "oidc";
  availability(): Promise<IdentityProviderAvailability>;
  createAuthorizationRequest?(input: {
    returnTo: string;
  }): Promise<OidcAuthorizationRequest>;
  completeAuthorization?(input: {
    currentUrl: URL;
    state: string;
    nonce: string;
    codeVerifier: string;
  }): Promise<ExternalIdentity>;
}

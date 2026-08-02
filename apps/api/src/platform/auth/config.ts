import type { ApplicationEnvironment } from "../demo-identity.js";

export interface OidcProviderSettings {
  issuerUrl: URL;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string;
}

export interface IdentitySettings {
  applicationEnvironment: ApplicationEnvironment;
  providerMode: "local" | "oidc";
  localProviderEnabled: boolean;
  oidc?: OidcProviderSettings;
  sessionCookieName: string;
  csrfCookieName: string;
  sessionTtlMs: number;
  sessionSecure: boolean;
  sessionSameSite: "lax";
  allowedWebOrigins: readonly string[];
  allowTestIdentityHeaders: boolean;
  localDemoTeacherCredential: {
    phoneSha256: string;
    credentialScrypt: string;
  };
}

const defaultLocalDemoTeacherCredential = {
  phoneSha256:
    "59a06e055ff23abe75665b51c5de4de3aaef4eca1fdf25570f240664cbfb1f38",
  credentialScrypt:
    "624246bfffebdede9630d230c2c55bd5b99f34c21eae505e25ae848fc6f9e4613952648c95e2c12767f67111b6bb913cb06814680ae7ebfa4128f6836445bfc1"
} as const;

const environments = new Set<ApplicationEnvironment>([
  "local",
  "demo",
  "test",
  "production"
]);

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function optionalUrl(value: string | undefined, name: string): URL | undefined {
  if (!value) return undefined;
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new Error(`${name} must use HTTPS outside localhost.`);
  }
  return parsed;
}

function fixedHex(
  value: string | undefined,
  fallback: string,
  bytes: number,
  name: string
): string {
  const selected = value?.trim() || fallback;
  if (!new RegExp(`^[a-f0-9]{${bytes * 2}}$`, "i").test(selected)) {
    throw new Error(`${name} must be a ${bytes}-byte hexadecimal digest.`);
  }
  return selected.toLowerCase();
}

export function readIdentitySettings(
  environment: NodeJS.ProcessEnv = process.env
): IdentitySettings {
  const rawEnvironment =
    environment.APP_ENV ??
    (environment.NODE_ENV === "production" ? "production" : "test");
  if (!environments.has(rawEnvironment as ApplicationEnvironment)) {
    throw new Error("APP_ENV must be local, demo, test, or production.");
  }
  const applicationEnvironment = rawEnvironment as ApplicationEnvironment;
  const production =
    applicationEnvironment === "production" ||
    environment.NODE_ENV === "production";
  const requestedMode = environment.IDENTITY_PROVIDER_MODE;
  const providerMode =
    requestedMode === "oidc"
      ? "oidc"
      : requestedMode === "local" || !requestedMode
        ? "local"
        : (() => {
            throw new Error("IDENTITY_PROVIDER_MODE must be local or oidc.");
          })();

  if (production && providerMode !== "oidc") {
    throw new Error(
      "Production requires IDENTITY_PROVIDER_MODE=oidc; local identity fails closed."
    );
  }

  const localProviderEnabled =
    environment.LOCAL_IDENTITY_PROVIDER_ENABLED === "true" ||
    (!production && environment.LOCAL_IDENTITY_PROVIDER_ENABLED !== "false");
  if (production && localProviderEnabled) {
    throw new Error("LOCAL_IDENTITY_PROVIDER_ENABLED is forbidden in production.");
  }

  let oidc: OidcProviderSettings | undefined;
  if (providerMode === "oidc") {
    const issuerUrl = optionalUrl(environment.OIDC_ISSUER_URL, "OIDC_ISSUER_URL");
    const redirectUrl = optionalUrl(environment.OIDC_REDIRECT_URI, "OIDC_REDIRECT_URI");
    if (!issuerUrl || !environment.OIDC_CLIENT_ID || !redirectUrl) {
      throw new Error(
        "OIDC mode requires OIDC_ISSUER_URL, OIDC_CLIENT_ID, and OIDC_REDIRECT_URI."
      );
    }
    oidc = {
      issuerUrl,
      clientId: environment.OIDC_CLIENT_ID,
      ...(environment.OIDC_CLIENT_SECRET
        ? { clientSecret: environment.OIDC_CLIENT_SECRET }
        : {}),
      redirectUri: redirectUrl.href,
      scopes: environment.OIDC_SCOPES ?? "openid profile email"
    };
  }

  const sessionSecure = production || environment.AUTH_SESSION_SECURE === "true";
  if (production && !sessionSecure) {
    throw new Error("Production authentication cookies must be Secure.");
  }
  const configuredOrigins = (environment.WEB_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);

  const allowTestIdentityHeaders =
    environment.ALLOW_TEST_IDENTITY_HEADERS === "true";
  if (production && allowTestIdentityHeaders) {
    throw new Error("ALLOW_TEST_IDENTITY_HEADERS is forbidden in production.");
  }

  return {
    applicationEnvironment,
    providerMode,
    localProviderEnabled,
    ...(oidc ? { oidc } : {}),
    sessionCookieName: production
      ? "__Host-edu_agent_session"
      : "edu_agent_session",
    csrfCookieName: production
      ? "__Host-edu_agent_csrf"
      : "edu_agent_csrf",
    sessionTtlMs:
      positiveInteger(environment.AUTH_SESSION_TTL_MINUTES, 480, "AUTH_SESSION_TTL_MINUTES") *
      60_000,
    sessionSecure,
    sessionSameSite: "lax",
    allowedWebOrigins: configuredOrigins,
    allowTestIdentityHeaders,
    localDemoTeacherCredential: {
      phoneSha256: fixedHex(
        environment.LOCAL_DEMO_TEACHER_PHONE_SHA256,
        defaultLocalDemoTeacherCredential.phoneSha256,
        32,
        "LOCAL_DEMO_TEACHER_PHONE_SHA256"
      ),
      credentialScrypt: fixedHex(
        environment.LOCAL_DEMO_TEACHER_CREDENTIAL_SCRYPT,
        defaultLocalDemoTeacherCredential.credentialScrypt,
        64,
        "LOCAL_DEMO_TEACHER_CREDENTIAL_SCRYPT"
      )
    }
  };
}

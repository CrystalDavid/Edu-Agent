import type { IdentitySettings } from "../../../platform/auth/config.js";
import type {
  LocalAuthenticationPort
} from "../application/local-authentication-port.js";
import type { IdentityProvider } from "../domain/identity-provider.js";
import { LocalIdentityProvider } from "./local-identity-provider.js";
import { OidcIdentityProvider } from "./oidc-identity-provider.js";

export interface ConfiguredIdentityProviders {
  identityProvider: IdentityProvider;
  localIdentityProvider?: LocalAuthenticationPort;
}

export function createConfiguredIdentityProviders(
  settings: IdentitySettings
): ConfiguredIdentityProviders {
  if (settings.providerMode === "oidc") {
    if (!settings.oidc) {
      throw new Error(
        "OIDC identity settings are required in OIDC mode."
      );
    }
    return {
      identityProvider: new OidcIdentityProvider(settings.oidc)
    };
  }

  const localIdentityProvider = new LocalIdentityProvider(
    settings.localProviderEnabled,
    settings.localDemoTeacherCredential
  );
  return {
    identityProvider: localIdentityProvider,
    localIdentityProvider
  };
}

import type { LocalSmsChallenge } from "@edu-agent/contracts";

import type {
  ExternalIdentity,
  IdentityProvider
} from "../domain/identity-provider.js";

export type LocalIdentityProfile =
  | "teacher"
  | "admin"
  | "multi_school"
  | "school_b_teacher";

/** Local/demo authentication capability; never accepted in production. */
export interface LocalAuthenticationPort extends IdentityProvider {
  authenticate(profile: LocalIdentityProfile): ExternalIdentity;
  authenticatePassword(phone: string, password: string): ExternalIdentity;
  requestSmsCode(phone: string): LocalSmsChallenge;
  authenticateSms(
    phone: string,
    challengeRef: string,
    code: string
  ): ExternalIdentity;
}

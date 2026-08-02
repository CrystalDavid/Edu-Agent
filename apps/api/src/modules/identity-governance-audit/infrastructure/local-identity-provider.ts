import type {
  ExternalIdentity,
  IdentityProvider,
  IdentityProviderAvailability
} from "../domain/identity-provider.js";

export type LocalIdentityProfile =
  | "teacher"
  | "admin"
  | "multi_school"
  | "school_b_teacher";

const profiles: Record<LocalIdentityProfile, ExternalIdentity> = {
  teacher: {
    provider: "local-development",
    subject: "teacher-a",
    displayName: "林老师（合成）",
    email: "lin.teacher@example.test"
  },
  admin: {
    provider: "local-development",
    subject: "school-admin-a",
    displayName: "周管理员（合成）",
    email: "zhou.admin@example.test"
  },
  multi_school: {
    provider: "local-development",
    subject: "multi-school-teacher",
    displayName: "陈老师（多学校合成）",
    email: "chen.teacher@example.test"
  },
  school_b_teacher: {
    provider: "local-development",
    subject: "teacher-b",
    displayName: "王老师（合成）",
    email: "wang.teacher@example.test"
  }
};

export class LocalIdentityProvider implements IdentityProvider {
  readonly mode = "local" as const;

  constructor(private readonly enabled: boolean) {}

  async availability(): Promise<IdentityProviderAvailability> {
    return {
      mode: "local",
      available: this.enabled,
      label: "本地合成身份",
      ...(!this.enabled
        ? { safeReason: "Local identity provider is disabled." }
        : {})
    };
  }

  authenticate(profile: LocalIdentityProfile): ExternalIdentity {
    if (!this.enabled) {
      throw new Error("Local identity provider is disabled.");
    }
    return { ...profiles[profile] };
  }
}

import {
  createHash,
  randomInt,
  randomUUID,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

import type {
  ExternalIdentity,
  IdentityProvider,
  IdentityProviderAvailability
} from "../domain/identity-provider.js";

export interface LocalDemoTeacherCredential {
  phoneSha256: string;
  credentialScrypt: string;
}

export interface LocalSmsChallenge {
  challengeRef: string;
  phoneMasked: string;
  expiresAt: string;
  retryAfterSeconds: number;
  demoCode: string;
}

interface StoredSmsChallenge {
  phoneSha256: string;
  codeSha256: string;
  expiresAt: number;
  attemptsRemaining: number;
}

const credentialSalt = "edu-agent-local-demo-credential-v1";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeHexEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export function createLocalDemoTeacherCredential(
  phone: string,
  password: string
): LocalDemoTeacherCredential {
  const normalizedPhone = phone.trim();
  return {
    phoneSha256: sha256(normalizedPhone),
    credentialScrypt: scryptSync(
      `${normalizedPhone}\0${password}`,
      credentialSalt,
      64
    ).toString("hex")
  };
}

function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

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

  private readonly smsChallenges = new Map<string, StoredSmsChallenge>();

  constructor(
    private readonly enabled: boolean,
    private readonly teacherCredential: LocalDemoTeacherCredential
  ) {}

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

  authenticatePassword(phone: string, password: string): ExternalIdentity {
    this.assertEnabled();
    const normalizedPhone = phone.trim();
    const phoneMatches = safeHexEqual(
      sha256(normalizedPhone),
      this.teacherCredential.phoneSha256
    );
    const credentialMatches = safeHexEqual(
      scryptSync(
        `${normalizedPhone}\0${password}`,
        credentialSalt,
        64
      ).toString("hex"),
      this.teacherCredential.credentialScrypt
    );
    if (!phoneMatches || !credentialMatches) {
      throw new Error("Invalid local credentials.");
    }
    return { ...profiles.teacher };
  }

  requestSmsCode(phone: string): LocalSmsChallenge {
    this.assertEnabled();
    const normalizedPhone = phone.trim();
    const phoneSha256 = sha256(normalizedPhone);
    if (!safeHexEqual(phoneSha256, this.teacherCredential.phoneSha256)) {
      throw new Error("Invalid local credentials.");
    }
    const challengeRef = `local-sms:${randomUUID()}`;
    const demoCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = Date.now() + 5 * 60_000;
    this.removeExpiredChallenges();
    this.smsChallenges.set(challengeRef, {
      phoneSha256,
      codeSha256: sha256(`${challengeRef}\0${demoCode}`),
      expiresAt,
      attemptsRemaining: 5
    });
    return {
      challengeRef,
      phoneMasked: maskPhone(normalizedPhone),
      expiresAt: new Date(expiresAt).toISOString(),
      retryAfterSeconds: 60,
      demoCode
    };
  }

  authenticateSms(
    phone: string,
    challengeRef: string,
    code: string
  ): ExternalIdentity {
    this.assertEnabled();
    const challenge = this.smsChallenges.get(challengeRef);
    const phoneSha256 = sha256(phone.trim());
    if (
      !challenge ||
      challenge.expiresAt <= Date.now() ||
      challenge.attemptsRemaining <= 0 ||
      !safeHexEqual(phoneSha256, challenge.phoneSha256) ||
      !safeHexEqual(
        sha256(`${challengeRef}\0${code}`),
        challenge.codeSha256
      )
    ) {
      if (challenge) {
        challenge.attemptsRemaining -= 1;
        if (challenge.attemptsRemaining <= 0 || challenge.expiresAt <= Date.now()) {
          this.smsChallenges.delete(challengeRef);
        }
      }
      throw new Error("Invalid local credentials.");
    }
    this.smsChallenges.delete(challengeRef);
    return { ...profiles.teacher };
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new Error("Local identity provider is disabled.");
    }
  }

  private removeExpiredChallenges(): void {
    const now = Date.now();
    for (const [challengeRef, challenge] of this.smsChallenges) {
      if (challenge.expiresAt <= now) this.smsChallenges.delete(challengeRef);
    }
  }
}

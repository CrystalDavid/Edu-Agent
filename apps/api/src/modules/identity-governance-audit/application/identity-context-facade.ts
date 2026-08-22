import type {
  ActingContext,
  AuthenticationSessionStatus,
  TenantContext
} from "@edu-agent/contracts";

type AuthenticatedStatus = Extract<
  AuthenticationSessionStatus,
  { authenticated: true }
>;

export interface ResolvedProductIdentity {
  tenant: TenantContext;
  acting: ActingContext;
  status: AuthenticatedStatus;
  csrfTokenHash?: string;
}

export interface SessionCreationResult {
  sessionToken: string;
  csrfToken: string;
  status: AuthenticatedStatus;
}

export interface ProductResourceRefs {
  courseRunRefs?: readonly string[];
  unitRefs?: readonly string[];
  lessonRefs?: readonly string[];
  assignmentRefs?: readonly string[];
  learnerRefs?: readonly string[];
  deliveryRefs?: readonly string[];
  observationRefs?: readonly string[];
  reflectionRefs?: readonly string[];
  taskRefs?: readonly string[];
}

/**
 * Security boundary between verified server identity and product use cases.
 * External identity tokens and provider-specific values do not cross it.
 */
export interface IdentityContextFacade {
  listActiveTeacherScopes(): Promise<
    ReadonlyArray<{
      tenantRef: string;
      actorRef: string;
      courseRunRefs: readonly string[];
    }>
  >;

  resolveProductIdentity(input: {
    sessionToken?: string;
    csrfToken?: string;
    requireTeacherProductAccess?: boolean;
  }): Promise<ResolvedProductIdentity>;

  resolveFixtureIdentity(input: {
    tenantRef: string;
    actorRef: string;
  }): Promise<ResolvedProductIdentity>;

  resolveDemoBypassIdentity(): Promise<ResolvedProductIdentity>;

  verifyCsrf(
    identity: ResolvedProductIdentity,
    provided?: string
  ): void;

  assertCourseRunAccess(
    identity: ResolvedProductIdentity,
    courseRunRef: string
  ): void;

  assertResourceAccess(
    identity: ResolvedProductIdentity,
    refs: ProductResourceRefs
  ): Promise<void>;

  recordSecurityEvent(input: {
    eventType: string;
    actorRef?: string | null;
    organizationRef?: string | null;
    sessionRef?: string | null;
    outcome: "success" | "denied" | "failure";
    safeReason: string;
    safeDetails?: Record<string, unknown>;
  }): Promise<void>;
}

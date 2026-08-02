import { z } from "zod";

export const OrganizationRoleSchema = z.enum([
  "ordinary_teacher",
  "school_admin",
  "subject_lead",
  "homeroom_teacher"
]);

export const MembershipStatusSchema = z.enum([
  "invited",
  "active",
  "suspended"
]);

export const OrganizationStatusSchema = z.enum([
  "active",
  "suspended"
]);

export const AuthenticationMethodSchema = z.enum([
  "server-session",
  "local-identity",
  "oidc",
  "demo-bypass",
  "test-fixture"
]);

export const UserIdentityViewSchema = z.object({
  userRef: z.string().min(1),
  displayName: z.string().min(1),
  email: z.string().email().nullable(),
  status: z.enum(["active", "suspended"])
});

export const WorkspaceMembershipViewSchema = z.object({
  membershipRef: z.string().min(1),
  organizationRef: z.string().min(1),
  organizationName: z.string().min(1),
  organizationStatus: OrganizationStatusSchema,
  membershipStatus: MembershipStatusSchema,
  roles: z.array(OrganizationRoleSchema),
  courseRunRefs: z.array(z.string().min(1)),
  version: z.number().int().positive()
});

const UnauthenticatedSessionSchema = z.object({
  authenticated: z.literal(false),
  providerMode: z.enum(["local", "oidc", "unavailable"]),
  providerAvailable: z.boolean(),
  demoBypassAvailable: z.boolean(),
  reason: z.enum([
    "missing_session",
    "expired_session",
    "revoked_session",
    "provider_unavailable"
  ])
});

const AuthenticatedSessionSchema = z.object({
  authenticated: z.literal(true),
  sessionRef: z.string().min(1),
  user: UserIdentityViewSchema,
  memberships: z.array(WorkspaceMembershipViewSchema),
  currentWorkspace: WorkspaceMembershipViewSchema.nullable(),
  csrfToken: z.string().min(32),
  authenticationMethod: AuthenticationMethodSchema,
  expiresAt: z.string().datetime(),
  sessionVersion: z.number().int().positive(),
  demoIdentity: z.boolean()
});

export const AuthenticationSessionStatusSchema = z.discriminatedUnion(
  "authenticated",
  [UnauthenticatedSessionSchema, AuthenticatedSessionSchema]
);

export const AuthenticationProviderAvailabilitySchema = z.object({
  mode: z.enum(["local", "oidc", "unavailable"]),
  available: z.boolean(),
  label: z.string().min(1),
  loginPath: z.string().min(1).nullable(),
  localProfiles: z
    .array(
      z.object({
        profile: z.enum(["teacher", "admin", "multi_school", "school_b_teacher"]),
        displayName: z.string().min(1),
        description: z.string().min(1)
      })
    )
    .default([]),
  safeReason: z.string().min(1).nullable()
});

export const LocalLoginRequestSchema = z.object({
  profile: z.enum([
    "teacher",
    "admin",
    "multi_school",
    "school_b_teacher"
  ]),
  returnTo: z.string().startsWith("/").default("/overview")
});

export const SwitchWorkspaceRequestSchema = z.object({
  membershipRef: z.string().min(1),
  expectedSessionVersion: z.number().int().positive()
});

export const RefreshSessionRequestSchema = z.object({
  expectedSessionVersion: z.number().int().positive()
});

export const RevokeSessionRequestSchema = z.object({
  expectedVersion: z.number().int().positive()
});

export const ActiveSessionViewSchema = z.object({
  sessionRef: z.string().min(1),
  current: z.boolean(),
  authenticationMethod: AuthenticationMethodSchema,
  organizationRef: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  version: z.number().int().positive(),
  clientLabel: z.string().min(1)
});

export const ActiveSessionListSchema = z.object({
  items: z.array(ActiveSessionViewSchema)
});

export const SchoolDetailSchema = z.object({
  organizationRef: z.string().min(1),
  organizationType: z.literal("school"),
  name: z.string().min(1),
  status: OrganizationStatusSchema,
  timezone: z.string().min(1),
  createdAt: z.string().datetime(),
  version: z.number().int().positive()
});

export const AdminMemberViewSchema = z.object({
  membershipRef: z.string().min(1),
  userRef: z.string().min(1),
  displayName: z.string().min(1),
  email: z.string().email().nullable(),
  status: MembershipStatusSchema,
  roles: z.array(OrganizationRoleSchema),
  courseRunRefs: z.array(z.string().min(1)),
  externalProvider: z.string().min(1).nullable(),
  externalSubjectMasked: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive()
});

export const AdminMemberListSchema = z.object({
  items: z.array(AdminMemberViewSchema)
});

export const CreateMemberRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().email().optional(),
  externalProvider: z.string().trim().min(1).max(80),
  externalSubject: z.string().trim().min(1).max(240),
  roles: z.array(OrganizationRoleSchema).min(1),
  courseRunRefs: z.array(z.string().min(1)).default([]),
  idempotencyKey: z.string().min(8)
});

export const UpdateMemberStatusRequestSchema = z.object({
  status: z.enum(["active", "suspended"]),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8)
});

export const UpdateMemberRolesRequestSchema = z.object({
  roles: z.array(OrganizationRoleSchema).min(1),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8)
});

export const UpdateMemberCourseAccessRequestSchema = z.object({
  courseRunRefs: z.array(z.string().min(1)),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8)
});

export const SecurityEventViewSchema = z.object({
  eventRef: z.string().min(1),
  eventType: z.string().min(1),
  actorRef: z.string().min(1).nullable(),
  organizationRef: z.string().min(1).nullable(),
  outcome: z.enum(["success", "denied", "failure"]),
  safeReason: z.string().min(1),
  occurredAt: z.string().datetime()
});

export const SecurityEventListSchema = z.object({
  items: z.array(SecurityEventViewSchema)
});

export const DataGovernanceRequestTypeSchema = z.enum([
  "export",
  "de_identification",
  "deletion"
]);

export const CreateDataGovernanceRequestSchema = z.object({
  requestType: DataGovernanceRequestTypeSchema,
  reason: z.string().trim().min(1).max(1000),
  idempotencyKey: z.string().min(8)
});

export const DataGovernanceRequestViewSchema = z.object({
  requestRef: z.string().min(1),
  requestType: DataGovernanceRequestTypeSchema,
  status: z.enum([
    "requested",
    "under_review",
    "approved",
    "rejected",
    "completed"
  ]),
  reason: z.string().min(1),
  retentionNotice: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const DataGovernanceRequestListSchema = z.object({
  items: z.array(DataGovernanceRequestViewSchema)
});

export type OrganizationRole = z.infer<typeof OrganizationRoleSchema>;
export type AuthenticationMethod = z.infer<typeof AuthenticationMethodSchema>;
export type UserIdentityView = z.infer<typeof UserIdentityViewSchema>;
export type WorkspaceMembershipView = z.infer<typeof WorkspaceMembershipViewSchema>;
export type AuthenticationSessionStatus = z.infer<typeof AuthenticationSessionStatusSchema>;
export type AuthenticationProviderAvailability = z.infer<typeof AuthenticationProviderAvailabilitySchema>;
export type LocalLoginRequest = z.infer<typeof LocalLoginRequestSchema>;
export type SwitchWorkspaceRequest = z.infer<typeof SwitchWorkspaceRequestSchema>;
export type RefreshSessionRequest = z.infer<typeof RefreshSessionRequestSchema>;
export type ActiveSessionView = z.infer<typeof ActiveSessionViewSchema>;
export type SchoolDetail = z.infer<typeof SchoolDetailSchema>;
export type AdminMemberView = z.infer<typeof AdminMemberViewSchema>;
export type CreateMemberRequest = z.infer<typeof CreateMemberRequestSchema>;
export type UpdateMemberStatusRequest = z.infer<typeof UpdateMemberStatusRequestSchema>;
export type UpdateMemberRolesRequest = z.infer<typeof UpdateMemberRolesRequestSchema>;
export type UpdateMemberCourseAccessRequest = z.infer<typeof UpdateMemberCourseAccessRequestSchema>;
export type CreateDataGovernanceRequest = z.infer<typeof CreateDataGovernanceRequestSchema>;
export type DataGovernanceRequestView = z.infer<typeof DataGovernanceRequestViewSchema>;
export type SecurityEventView = z.infer<typeof SecurityEventViewSchema>;

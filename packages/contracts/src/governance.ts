import { z } from "zod";

export const ModuleOwnerSchema = z.enum([
  "governance",
  "work",
  "runtime",
  "capability",
  "artifact",
  "education",
  "personalization"
]);

export type ModuleOwner = z.infer<typeof ModuleOwnerSchema>;

export const TenantContextSchema = z.object({
  tenantRef: z.string().min(1),
  dataMode: z.literal("synthetic")
});

export const ActingContextSchema = z.object({
  actorRef: z.string().min(1),
  tenantRef: z.string().min(1),
  roleRefs: z.array(z.string().min(1)).min(1),
  authenticationMethod: z.literal("demo-token")
});

export const AuthorizationDecisionSchema = z.object({
  decisionRef: z.string().min(1),
  actorRef: z.string().min(1),
  tenantRef: z.string().min(1),
  purpose: z.string().min(1),
  action: z.string().min(1),
  resourceRef: z.string().min(1),
  requestedFieldMask: z.array(z.string()),
  effect: z.enum(["allow", "deny"]),
  reasonCodes: z.array(z.string().min(1)).min(1),
  policyVersion: z.string().min(1),
  decidedAt: z.string().datetime()
});

export const FormalWriteMetadataSchema = z.object({
  actorRef: z.string().min(1),
  purpose: z.string().min(1),
  owner: ModuleOwnerSchema,
  idempotencyKey: z.string().min(8),
  authorizationDecisionRef: z.string().min(1),
  auditRef: z.string().min(1),
  createdAt: z.string().datetime()
});

export type TenantContext = z.infer<typeof TenantContextSchema>;
export type ActingContext = z.infer<typeof ActingContextSchema>;
export type AuthorizationDecision = z.infer<
  typeof AuthorizationDecisionSchema
>;
export type FormalWriteMetadata = z.infer<
  typeof FormalWriteMetadataSchema
>;

import type {
  ActingContext,
  TenantContext,
  WalkingSkeletonCommand,
  WalkingSkeletonQuery
} from "@edu-agent/contracts";

export * from "./gate1b.js";

export const syntheticTenant: TenantContext = {
  tenantRef: "tenant:demo-school",
  dataMode: "synthetic"
};

export const syntheticTeacher: ActingContext = {
  actorRef: "user:teacher-001",
  tenantRef: syntheticTenant.tenantRef,
  roleRefs: ["role:math-teacher"],
  authenticationMethod: "demo-token"
};

export function makeWalkingSkeletonCommand(
  idempotencyKey = "idem:gate1a:001"
): WalkingSkeletonCommand {
  return {
    kind: "Command",
    envelopeId: "envelope:command:001",
    tenantRef: syntheticTenant.tenantRef,
    actorRef: syntheticTeacher.actorRef,
    purpose: "gate1a.walking-skeleton",
    idempotencyKey,
    occurredAt: "2026-07-28T08:00:00.000Z",
    commandName: "CreateWalkingSkeletonArtifact",
    payload: {
      title: "Gate 1A 无 LLM 骨架",
      body: "这是只使用合成数据、MockModelProvider 和 FakeTool 的确定性结果。"
    }
  };
}

export function makeWalkingSkeletonQuery(
  artifactRef: string
): WalkingSkeletonQuery {
  return {
    kind: "Query",
    envelopeId: "envelope:query:001",
    tenantRef: syntheticTenant.tenantRef,
    actorRef: syntheticTeacher.actorRef,
    purpose: "gate1a.read-artifact",
    idempotencyKey: "idem:gate1a:query:001",
    occurredAt: "2026-07-28T08:01:00.000Z",
    queryName: "GetWalkingSkeletonArtifact",
    requestedFieldMask: ["title", "body", "owner", "actorRef", "purpose"],
    payload: {
      artifactRef
    }
  };
}

import { z } from "zod";

import {
  CommandEnvelopeSchema,
  QueryEnvelopeSchema
} from "./ingress.js";

export const WalkingSkeletonCommandSchema = CommandEnvelopeSchema.extend({
  commandName: z.literal("CreateWalkingSkeletonArtifact"),
  payload: z.object({
    title: z.string().min(1),
    body: z.string().min(1)
  })
});

export const WalkingSkeletonQuerySchema = QueryEnvelopeSchema.extend({
  queryName: z.literal("GetWalkingSkeletonArtifact"),
  payload: z.object({
    artifactRef: z.string().min(1)
  })
});

export const WalkingSkeletonResultSchema = z.object({
  replayed: z.boolean(),
  authorizationDecisionRef: z.string().min(1),
  taskRef: z.string().min(1),
  taskRunRef: z.string().min(1),
  agentRunRef: z.string().min(1),
  artifactRef: z.string().min(1),
  artifactRevisionRef: z.string().min(1),
  auditRefs: z.array(z.string().min(1)).min(1),
  outboxRefs: z.array(z.string().min(1)).min(1),
  modelProvider: z.literal("mock"),
  toolName: z.literal("fake.echo")
});

export const ArtifactReadResultSchema = z.object({
  queryRunRef: z.string().min(1),
  artifactRef: z.string().min(1),
  revisionRef: z.string().min(1),
  title: z.string(),
  body: z.string(),
  owner: z.literal("artifact"),
  actorRef: z.string(),
  purpose: z.string()
});

export type WalkingSkeletonCommand = z.infer<
  typeof WalkingSkeletonCommandSchema
>;
export type WalkingSkeletonQuery = z.infer<
  typeof WalkingSkeletonQuerySchema
>;
export type WalkingSkeletonResult = z.infer<
  typeof WalkingSkeletonResultSchema
>;
export type ArtifactReadResult = z.infer<typeof ArtifactReadResultSchema>;

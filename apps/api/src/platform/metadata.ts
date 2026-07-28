import type {
  AuthorizationDecision,
  FormalWriteMetadata,
  ModuleOwner
} from "@edu-agent/contracts";

import type { Clock, IdGenerator } from "./system.js";

export interface MetadataFactory {
  create<TOwner extends ModuleOwner>(
    owner: TOwner,
    idempotencySuffix: string
  ): FormalWriteMetadata & { owner: TOwner };
}

export function createMetadataFactory(input: {
  actorRef: string;
  purpose: string;
  rootIdempotencyKey: string;
  authorizationDecision: AuthorizationDecision;
  clock: Clock;
  ids: IdGenerator;
}): MetadataFactory {
  return {
    create(owner, idempotencySuffix) {
      return {
        actorRef: input.actorRef,
        purpose: input.purpose,
        owner,
        idempotencyKey: `${input.rootIdempotencyKey}:${idempotencySuffix}`,
        authorizationDecisionRef: input.authorizationDecision.decisionRef,
        auditRef: input.ids.next("audit"),
        createdAt: input.clock.now()
      };
    }
  };
}

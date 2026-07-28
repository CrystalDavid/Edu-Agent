import { randomUUID } from "node:crypto";

import type { AuthorizationDecision } from "@edu-agent/contracts";
import type { Pool } from "pg";

import {
  PostgresArtifactRepository,
  type ArtifactRevisionView
} from "../modules/artifact-collaboration/infrastructure/postgres-artifact-repository.js";
import {
  PostgresGovernanceRepository
} from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";

export class PostgresArtifactRevisionService {
  constructor(
    private readonly pool: Pool,
    private readonly governance =
      new PostgresGovernanceRepository(),
    private readonly artifacts = new PostgresArtifactRepository()
  ) {}

  async createProposal(input: {
    artifactRef: string;
    parentRevisionRef: string;
    title: string;
    body: string;
    tenantRef: string;
    actorRef: string;
    purpose: string;
    idempotencyKey: string;
  }): Promise<ArtifactRevisionView> {
    const client = await this.pool.connect();
    const decisionRef = `authorization-decision:${randomUUID()}`;
    const now = new Date().toISOString();
    const writeContext: WriteContext = {
      actorRef: input.actorRef,
      purpose: input.purpose,
      rootIdempotencyKey: input.idempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt: now
    };

    try {
      await client.query("BEGIN");
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: input.purpose,
        action: "artifact.proposal.create",
        resourceRef: input.artifactRef,
        requestedFieldMask: [],
        effect: "allow",
        reasonCodes: ["artifact-collaboration-policy"],
        policyVersion: "artifact-collaboration-policy@1",
        decidedAt: now
      };
      const decisionReceipt = await this.governance.saveDecision(
        client,
        {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "proposal-authorization"
          )
        }
      );
      const proposal = await this.artifacts.insertProposalRevision(
        client,
        {
          artifactRef: input.artifactRef,
          parentRevisionRef: input.parentRevisionRef,
          title: input.title,
          body: input.body,
          writeContext
        }
      );
      await this.governance.saveAudits(client, [
        decisionReceipt,
        proposal.receipt
      ]);
      await client.query("COMMIT");
      return proposal.revision;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

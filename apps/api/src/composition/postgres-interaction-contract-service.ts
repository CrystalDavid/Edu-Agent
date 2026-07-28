import { createHash, randomUUID } from "node:crypto";

import type { AuthorizationDecision } from "@edu-agent/contracts";
import type { Pool } from "pg";

import {
  PostgresEducationRepository
} from "../modules/education-domain/infrastructure/postgres-education-repository.js";
import {
  PostgresGovernanceRepository
} from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  PostgresWorkRepository
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-work-repository.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export class PostgresInteractionContractService {
  constructor(
    private readonly pool: Pool,
    private readonly governance =
      new PostgresGovernanceRepository(),
    private readonly education = new PostgresEducationRepository(),
    private readonly work = new PostgresWorkRepository()
  ) {}

  async resolve(input: {
    boundRunKind: "QueryRun" | "TaskRun";
    boundRunRef: string;
    profileRef: string;
    profileVersion: number;
    tenantRef: string;
    actorRef: string;
    purpose: string;
    idempotencyKey: string;
  }): Promise<{
    contractRef: string;
    contentHash: string;
    profileVersion: number;
  }> {
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
      if (
        !(await this.work.runExists(
          client,
          input.boundRunKind,
          input.boundRunRef
        ))
      ) {
        throw new Error("Resolved contract must bind to an existing Run.");
      }
      const profile = await this.education.getProfile(
        client,
        input.profileRef,
        input.profileVersion
      );
      if (!profile) {
        throw new Error("LearningInteractionProfile version not found.");
      }
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: input.purpose,
        action: "learning-interaction-contract.resolve",
        resourceRef: input.boundRunRef,
        requestedFieldMask: [],
        effect: "allow",
        reasonCodes: ["commit-time-contract-authorization"],
        policyVersion: "contract-resolution-policy@1",
        decidedAt: now
      };
      const decisionReceipt = await this.governance.saveDecision(
        client,
        {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "contract-authorization"
          )
        }
      );
      const contractRef = `interaction-contract:${randomUUID()}`;
      const contractPayload = {
        profileRef: profile.profileRef,
        profileVersion: profile.profileVersion,
        profileContentHash: profile.contentHash,
        policyVersionRef: profile.policyVersionRef,
        promptVersionRef: profile.promptVersionRef,
        evidenceRuleVersionRef: profile.evidenceRuleVersionRef,
        participationMode: profile.participationMode,
        supportLimit: profile.supportLimit,
        answerReleaseBoundary: profile.answerReleaseBoundary
      };
      const contentHash = hash(contractPayload);
      const contractReceipt = await this.work.insertResolvedContract(
        client,
        {
          contractRef,
          boundRunKind: input.boundRunKind,
          boundRunRef: input.boundRunRef,
          profileRef: profile.profileRef,
          profileVersion: profile.profileVersion,
          policyVersionRef: profile.policyVersionRef,
          promptVersionRef: profile.promptVersionRef,
          evidenceRuleVersionRef: profile.evidenceRuleVersionRef,
          participationMode: profile.participationMode,
          supportLimit: profile.supportLimit,
          answerReleaseBoundary: profile.answerReleaseBoundary,
          contractPayload,
          contentHash,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "resolved-contract"
          )
        }
      );
      await this.governance.saveAudits(client, [
        decisionReceipt,
        contractReceipt
      ]);
      await client.query("COMMIT");
      return {
        contractRef,
        contentHash,
        profileVersion: profile.profileVersion
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

import { randomUUID } from "node:crypto";

import type {
  AuthorizationDecision,
  FormalWriteReceipt
} from "@edu-agent/contracts";
import type { Pool } from "pg";

import {
  buildArtifactContentHash,
  PostgresArtifactRepository
} from "../modules/artifact-collaboration/infrastructure/postgres-artifact-repository.js";
import type {
  SyntheticEducationSlice
} from "../modules/education-domain/domain/gate1b.js";
import {
  PostgresEducationRepository
} from "../modules/education-domain/infrastructure/postgres-education-repository.js";
import {
  PostgresGovernanceRepository
} from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";

export class PostgresGate1BEducationService {
  constructor(
    private readonly pool: Pool,
    private readonly governance =
      new PostgresGovernanceRepository(),
    private readonly artifacts = new PostgresArtifactRepository(),
    private readonly education = new PostgresEducationRepository()
  ) {}

  async commitSyntheticSlice(input: {
    slice: SyntheticEducationSlice;
    teachingPlan: {
      artifactRef: string;
      title: string;
      body: string;
    };
  }): Promise<{
    teachingPlanRevisionRef: string;
    observationRef: string;
    claimRef: string;
  }> {
    if (
      input.slice.teachingPlanAlignment.teachingPlanArtifactRef !==
      input.teachingPlan.artifactRef
    ) {
      throw new Error(
        "TeachingPlan alignment must reference the Artifact owner."
      );
    }
    const client = await this.pool.connect();
    const decisionRef =
      input.slice.courseRun.metadata.authorizationDecisionRef;
    const writeContext: WriteContext = {
      actorRef: input.slice.courseRun.metadata.actorRef,
      purpose: input.slice.courseRun.metadata.purpose,
      rootIdempotencyKey:
        input.slice.courseRun.metadata.idempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt: input.slice.courseRun.metadata.createdAt
    };
    const revisionRef = `artifact-revision:${randomUUID()}`;
    const outboxRef = `artifact-outbox:${randomUUID()}`;

    try {
      await client.query("BEGIN");
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: writeContext.actorRef,
        tenantRef: input.slice.courseRun.tenantRef,
        purpose: writeContext.purpose,
        action: "education.synthetic-slice.commit",
        resourceRef: input.slice.courseRun.courseRunRef,
        requestedFieldMask: [],
        effect: "allow",
        reasonCodes: ["synthetic-gate1b-fixture"],
        policyVersion: "gate1b-education-fixture-policy@1",
        decidedAt: writeContext.createdAt
      };
      const receipts: FormalWriteReceipt[] = [
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "education-authorization"
          )
        })
      ];
      receipts.push(
        ...(await this.artifacts.insertArtifactBundle(client, {
          artifact: {
            artifactRef: input.teachingPlan.artifactRef,
            artifactType: "ContentArtifact",
            latestPublishedRevisionRef: revisionRef,
            metadata: createWriteMetadata(
              writeContext,
              "artifact",
              "teaching-plan-artifact"
            )
          },
          revision: {
            revisionRef,
            artifactRef: input.teachingPlan.artifactRef,
            revisionNumber: 1,
            artifactType: "ContentArtifact",
            title: input.teachingPlan.title,
            body: input.teachingPlan.body,
            revisionState: "published",
            contentHash: buildArtifactContentHash(
              input.teachingPlan.title,
              input.teachingPlan.body
            ),
            metadata: createWriteMetadata(
              writeContext,
              "artifact",
              "teaching-plan-revision"
            )
          },
          outbox: {
            outboxRef,
            eventName: "TeachingPlanPublished",
            aggregateRef: input.teachingPlan.artifactRef,
            payload: {
              revisionRef,
              courseRunRef: input.slice.courseRun.courseRunRef
            },
            metadata: createWriteMetadata(
              writeContext,
              "artifact",
              "teaching-plan-outbox"
            )
          }
        }))
      );
      receipts.push(
        ...(await this.education.insertSyntheticSlice(
          client,
          input.slice
        ))
      );
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return {
        teachingPlanRevisionRef: revisionRef,
        observationRef: input.slice.observation.observationRef,
        claimRef: input.slice.claim.claimRef
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

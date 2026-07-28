import { createHash, randomUUID } from "node:crypto";

import type {
  AuthorizationDecision,
  FormalWriteReceipt
} from "@edu-agent/contracts";
import {
  baselineTeachingPlan,
  gate2DemoRefs,
  gate2SyntheticFixture
} from "@edu-agent/test-fixtures";
import type { Pool } from "pg";

import {
  PostgresGate2ArtifactRepository
} from "../modules/artifact-collaboration/infrastructure/postgres-gate2-artifact-repository.js";
import {
  PostgresEducationRepository
} from "../modules/education-domain/infrastructure/postgres-education-repository.js";
import {
  PostgresGovernanceRepository
} from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  PostgresGate2WorkRepository
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-work-repository.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export class Gate2DemoSeedService {
  constructor(
    private readonly pool: Pool,
    private readonly governance =
      new PostgresGovernanceRepository(),
    private readonly work = new PostgresGate2WorkRepository(),
    private readonly artifacts =
      new PostgresGate2ArtifactRepository(),
    private readonly education = new PostgresEducationRepository()
  ) {}

  async seed(): Promise<{
    replayed: boolean;
    courseRunRef: string;
    goalRef: string;
    teachingPlanArtifactRef: string;
  }> {
    const rootIdempotencyKey = "gate2:synthetic-demo-seed:v1";
    const rootKey = [
      gate2DemoRefs.tenantRef,
      gate2DemoRefs.teacherRef,
      "gate2.synthetic-demo.seed",
      rootIdempotencyKey
    ].join("|");
    const decisionRef =
      "authorization-decision:gate2-synthetic-demo-seed";
    const createdAt = "2026-09-18T08:00:00.000Z";
    const writeContext: WriteContext = {
      actorRef: gate2DemoRefs.teacherRef,
      purpose: "gate2.synthetic-demo.seed",
      rootIdempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt
    };
    const result = {
      replayed: false,
      courseRunRef: gate2DemoRefs.courseRunRef,
      goalRef: gate2DemoRefs.goalRef,
      teachingPlanArtifactRef:
        gate2DemoRefs.teachingPlanArtifactRef
    };
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(
        client,
        {
          idempotencyRef: "idempotency:gate2-demo-seed",
          rootKey,
          requestFingerprint: hash({
            fixture: "gate2-slope-demo@1"
          }),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "seed-idempotency"
          )
        }
      );
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return {
          ...result,
          replayed: true
        };
      }

      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: gate2DemoRefs.teacherRef,
        tenantRef: gate2DemoRefs.tenantRef,
        purpose: writeContext.purpose,
        action: "gate2.synthetic-demo.seed",
        resourceRef: gate2DemoRefs.courseRunRef,
        requestedFieldMask: [],
        effect: "allow",
        reasonCodes: ["local-synthetic-demo-bootstrap"],
        policyVersion: "policy:gate2-local-demo-seed@1",
        decidedAt: createdAt
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "seed-authorization"
          )
        })
      ];

      receipts.push(
        ...(await this.work.insertCaseAndGoal(client, {
          caseRecord: {
            ...gate2SyntheticFixture.teachingImprovementCase,
            tenantRef: gate2DemoRefs.tenantRef,
            metadata: createWriteMetadata(
              writeContext,
              "work",
              "teaching-improvement-case"
            )
          },
          goal: {
            ...gate2SyntheticFixture.goal,
            tenantRef: gate2DemoRefs.tenantRef,
            metadata: createWriteMetadata(
              writeContext,
              "work",
              "teaching-improvement-goal"
            )
          }
        }))
      );

      receipts.push(
        ...(await this.artifacts.insertTeachingPlanSeed(client, {
          artifactRef: gate2DemoRefs.teachingPlanArtifactRef,
          revisionRef: gate2DemoRefs.teachingPlanRevisionRef,
          title: "一次函数斜率与图像关系｜课前草稿",
          content: baselineTeachingPlan,
          metadata: createWriteMetadata(
            writeContext,
            "artifact",
            "teaching-plan-seed"
          ),
          outboxMetadata: createWriteMetadata(
            writeContext,
            "artifact",
            "teaching-plan-seed-outbox"
          ),
          outboxRef: "outbox:gate2-teaching-plan-seed"
        }))
      );

      const firstAttempt = gate2SyntheticFixture.attempts[0];
      const firstObservation =
        gate2SyntheticFixture.observations[0];
      const firstClaim = gate2SyntheticFixture.claims[0];
      if (!firstAttempt || !firstObservation || !firstClaim) {
        throw new Error("Gate 2 fixture is incomplete.");
      }
      receipts.push(
        ...(await this.education.insertSyntheticSlice(client, {
          courseRun: {
            ...gate2SyntheticFixture.courseRun,
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "course-run"
            )
          },
          objective: {
            ...gate2SyntheticFixture.objective,
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "learning-objective"
            )
          },
          profile: {
            ...gate2SyntheticFixture.profile,
            profilePayload: {
              ...gate2SyntheticFixture.profile.profilePayload
            },
            contentHash: hash(
              gate2SyntheticFixture.profile.profilePayload
            ),
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "interaction-profile"
            )
          },
          attempt: {
            ...firstAttempt,
            courseRunRef: gate2DemoRefs.courseRunRef,
            objectiveRef: gate2DemoRefs.objectiveRef,
            responseSummary: {
              ...firstAttempt.responseSummary
            },
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "attempt-1"
            )
          },
          observation: {
            ...firstObservation,
            objectiveRef: gate2DemoRefs.objectiveRef,
            observerType: "synthetic-rule",
            observationValue: {
              ...firstObservation.observationValue
            },
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "observation-1"
            )
          },
          claim: {
            ...firstClaim,
            objectiveRef: gate2DemoRefs.objectiveRef,
            claimValue: {
              ...firstClaim.claimValue,
              confidenceExplanation:
                firstClaim.confidenceExplanation
            },
            status: "candidate",
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "claim-1"
            )
          },
          claimObservation: {
            claimRef: firstClaim.claimRef,
            observationRef: firstObservation.observationRef,
            relationType: "supports",
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "claim-observation-1"
            )
          },
          teachingPlanAlignment: {
            alignmentRef:
              "teaching-plan-alignment:gate2-slope-demo",
            teachingPlanArtifactRef:
              gate2DemoRefs.teachingPlanArtifactRef,
            courseRunRef: gate2DemoRefs.courseRunRef,
            objectiveRef: gate2DemoRefs.objectiveRef,
            validationStatus: "validated",
            validationResult: {
              objectiveAligned: true,
              bodyStoredInEducation: false,
              dataMode: "synthetic"
            },
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "teaching-plan-alignment"
            )
          },
          outbox: {
            outboxRef: "outbox:gate2-evidence-1",
            eventName: "EvidenceClaimRecorded",
            aggregateRef: firstClaim.claimRef,
            payload: {
              observationRef: firstObservation.observationRef,
              claimRef: firstClaim.claimRef
            },
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "evidence-outbox-1"
            )
          }
        }))
      );

      const secondAttempt = gate2SyntheticFixture.attempts[1];
      const secondObservation =
        gate2SyntheticFixture.observations[1];
      const secondClaim = gate2SyntheticFixture.claims[1];
      if (!secondAttempt || !secondObservation || !secondClaim) {
        throw new Error("Gate 2 fixture is incomplete.");
      }
      receipts.push(
        ...(await this.education.insertAdditionalEvidenceBundle(
          client,
          {
            attempt: {
              ...secondAttempt,
              courseRunRef: gate2DemoRefs.courseRunRef,
              objectiveRef: gate2DemoRefs.objectiveRef,
              responseSummary: {
                ...secondAttempt.responseSummary
              },
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "attempt-2"
              )
            },
            observation: {
              ...secondObservation,
              objectiveRef: gate2DemoRefs.objectiveRef,
              observerType: "synthetic-rule",
              observationValue: {
                ...secondObservation.observationValue
              },
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "observation-2"
              )
            },
            claim: {
              ...secondClaim,
              objectiveRef: gate2DemoRefs.objectiveRef,
              claimValue: {
                ...secondClaim.claimValue,
                confidenceExplanation:
                  secondClaim.confidenceExplanation
              },
              status: "candidate",
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "claim-2"
              )
            },
            relation: {
              claimRef: secondClaim.claimRef,
              observationRef: secondObservation.observationRef,
              relationType: "supports",
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "claim-observation-2"
              )
            },
            outbox: {
              outboxRef: "outbox:gate2-evidence-2",
              eventName: "EvidenceClaimRecorded",
              aggregateRef: secondClaim.claimRef,
              payload: {
                observationRef:
                  secondObservation.observationRef,
                claimRef: secondClaim.claimRef
              },
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "evidence-outbox-2"
              )
            }
          }
        ))
      );

      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: createdAt
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

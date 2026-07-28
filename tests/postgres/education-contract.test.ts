import { createHash, randomUUID } from "node:crypto";

import {
  makeGate1BSyntheticFixture
} from "@edu-agent/test-fixtures";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  PostgresGate1BCommandService
} from "../../apps/api/src/composition/postgres-gate1b-command-service.js";
import {
  PostgresGate1BEducationService
} from "../../apps/api/src/composition/postgres-gate1b-education-service.js";
import {
  PostgresInteractionContractService
} from "../../apps/api/src/composition/postgres-interaction-contract-service.js";
import {
  PostgresEducationRepository
} from "../../apps/api/src/modules/education-domain/infrastructure/postgres-education-repository.js";
import {
  PostgresGovernanceRepository
} from "../../apps/api/src/modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  PostgresWorkRepository
} from "../../apps/api/src/modules/work-assistant-durable-execution/infrastructure/postgres-work-repository.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../../apps/api/src/platform/postgres/write-context.js";
import {
  poolFor,
  resetGate1BData,
  tableCount,
  uniqueSuffix
} from "./support/database.js";

const adminPool = poolFor("admin");
const appPool = poolFor("app", {
  max: 6
});
const runtimePool = poolFor("runtime");
const commandService = new PostgresGate1BCommandService(appPool);
const educationService = new PostgresGate1BEducationService(appPool);
const contractService = new PostgresInteractionContractService(appPool);
const educationRepository = new PostgresEducationRepository();
const workRepository = new PostgresWorkRepository();
const governanceRepository = new PostgresGovernanceRepository();

beforeEach(async () => {
  await resetGate1BData(adminPool);
});

afterAll(async () => {
  await Promise.all([
    runtimePool.end(),
    appPool.end(),
    adminPool.end()
  ]);
});

describe("minimal Education Domain persistence", () => {
  it("persists Attempt → Observation → Claim and exposes only a read projection", async () => {
    const suffix = uniqueSuffix("education");
    const fixture = makeGate1BSyntheticFixture(suffix);
    const committed = await educationService.commitSyntheticSlice({
      slice: fixture,
      teachingPlan: fixture.teachingPlan
    });

    const evidence = await educationRepository.readLearningEvidenceView(
      runtimePool,
      committed.observationRef
    );
    expect(evidence).toMatchObject({
      observationRef: fixture.observation.observationRef,
      attemptRef: fixture.attempt.attemptRef,
      objectiveRef: fixture.objective.objectiveRef,
      claimRef: fixture.claim.claimRef,
      claimType: "possible-misconception",
      confidence: 0.78,
      relationType: "supports"
    });
    await expect(
      tableCount(appPool, "education.attempt")
    ).resolves.toBe(1);

    const genericEvidenceTable = await adminPool.query<{
      count: string;
    }>(
      `SELECT count(*)::text AS count
         FROM information_schema.tables
        WHERE table_schema = 'education'
          AND table_name = 'learning_evidence'`
    );
    expect(Number(genericEvidenceTable.rows[0]?.count)).toBe(0);
  });

  it("stores TeachingPlan content only in Artifact and only alignment semantics in Education", async () => {
    const fixture = makeGate1BSyntheticFixture(
      uniqueSuffix("teaching-plan")
    );
    const committed = await educationService.commitSyntheticSlice({
      slice: fixture,
      teachingPlan: fixture.teachingPlan
    });
    const artifact = await appPool.query<{
      body: string;
    }>(
      `SELECT body
         FROM artifact.artifact_revision
        WHERE revision_ref = $1`,
      [committed.teachingPlanRevisionRef]
    );
    expect(artifact.rows[0]?.body).toBe(fixture.teachingPlan.body);

    const educationBodyColumns = await adminPool.query<{
      table_name: string;
    }>(
      `SELECT table_name
         FROM information_schema.columns
        WHERE table_schema = 'education'
          AND column_name = 'body'`
    );
    expect(educationBodyColumns.rows).toEqual([]);

    const alignment = await appPool.query<{
      teaching_plan_artifact_ref: string;
      validation_status: string;
    }>(
      `SELECT teaching_plan_artifact_ref, validation_status
         FROM education.teaching_plan_alignment`
    );
    expect(alignment.rows[0]).toEqual({
      teaching_plan_artifact_ref:
        fixture.teachingPlan.artifactRef,
      validation_status: "validated"
    });
  });

  it("seals an exact Profile version into an immutable TaskRun contract", async () => {
    const suffix = uniqueSuffix("contract");
    const command = await commandService.execute({
      tenantRef: "tenant:demo-school",
      actorRef: "user:teacher-001",
      purpose: "gate1b.contract-task",
      idempotencyKey: `idempotency:${suffix}`,
      title: "Contract task",
      body: "Synthetic"
    });
    const fixture = makeGate1BSyntheticFixture(suffix);
    await educationService.commitSyntheticSlice({
      slice: fixture,
      teachingPlan: fixture.teachingPlan
    });
    const contract = await contractService.resolve({
      boundRunKind: "TaskRun",
      boundRunRef: command.taskRunRef,
      profileRef: fixture.profile.profileRef,
      profileVersion: 1,
      tenantRef: "tenant:demo-school",
      actorRef: "user:teacher-001",
      purpose: "gate1b.resolve-learning-contract",
      idempotencyKey: `idempotency:${uniqueSuffix("contract")}`
    });
    const sealed = await workRepository.getResolvedContract(
      appPool,
      contract.contractRef
    );
    expect(sealed).toMatchObject({
      boundRunKind: "TaskRun",
      boundRunRef: command.taskRunRef,
      profileRef: fixture.profile.profileRef,
      profileVersion: 1,
      policyVersionRef: fixture.profile.policyVersionRef,
      promptVersionRef: fixture.profile.promptVersionRef,
      evidenceRuleVersionRef:
        fixture.profile.evidenceRuleVersionRef,
      participationMode: fixture.profile.participationMode,
      supportLimit: fixture.profile.supportLimit,
      answerReleaseBoundary:
        fixture.profile.answerReleaseBoundary,
      contentHash: contract.contentHash
    });
    expect(sealed?.metadata.authorizationDecisionRef).not.toBe(
      fixture.authorizationDecisionRef
    );

    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      const decisionRef = `authorization-decision:${randomUUID()}`;
      const now = new Date().toISOString();
      const writeContext: WriteContext = {
        actorRef: "user:teacher-001",
        purpose: "gate1b.profile-version",
        rootIdempotencyKey: `idempotency:${uniqueSuffix("profile-v2")}`,
        authorizationDecisionRef: decisionRef,
        createdAt: now
      };
      const decisionReceipt = await governanceRepository.saveDecision(
        client,
        {
          decision: {
            decisionRef,
            actorRef: writeContext.actorRef,
            tenantRef: "tenant:demo-school",
            purpose: writeContext.purpose,
            action: "learning-interaction-profile.version",
            resourceRef: fixture.profile.profileRef,
            requestedFieldMask: [],
            effect: "allow",
            reasonCodes: ["profile-version-policy"],
            policyVersion: "profile-version-policy@1",
            decidedAt: now
          },
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "profile-v2-authorization"
          )
        }
      );
      const profilePayload = {
        ...fixture.profile.profilePayload,
        askBeforeHint: false
      };
      const profileReceipt = await educationRepository.insertProfile(
        client,
        {
          ...fixture.profile,
          profileVersion: 2,
          supportLimit: 3,
          profilePayload,
          contentHash: createHash("sha256")
            .update(JSON.stringify(profilePayload))
            .digest("hex"),
          validFrom: now,
          metadata: createWriteMetadata(
            writeContext,
            "education",
            "profile-v2"
          )
        }
      );
      await governanceRepository.saveAudits(client, [
        decisionReceipt,
        profileReceipt
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const stillSealed = await workRepository.getResolvedContract(
      appPool,
      contract.contractRef
    );
    expect(stillSealed?.profileVersion).toBe(1);
    expect(stillSealed?.supportLimit).toBe(
      fixture.profile.supportLimit
    );
    expect(stillSealed?.contentHash).toBe(contract.contentHash);

    await expect(
      appPool.query(
        `UPDATE work.resolved_learning_interaction_contract
            SET support_limit = 99
          WHERE contract_ref = $1`,
        [contract.contractRef]
      )
    ).rejects.toThrow(
      "ResolvedLearningInteractionContract is immutable"
    );
  });

  it("accepts an existing QueryRun binding and rejects an orphan Run", async () => {
    const suffix = uniqueSuffix("query-contract");
    const fixture = makeGate1BSyntheticFixture(suffix);
    await educationService.commitSyntheticSlice({
      slice: fixture,
      teachingPlan: fixture.teachingPlan
    });
    const client = await appPool.connect();
    const queryRunRef = `query-run:${suffix}`;
    try {
      await client.query("BEGIN");
      const receipt = await workRepository.insertQueryRun(client, {
        queryRunRef,
        queryName: "ReadLearningEvidence",
        status: "completed",
        resourceRef: fixture.observation.observationRef,
        requestedFieldMask: ["observation", "claim"],
        metadata: {
          actorRef: "user:teacher-001",
          purpose: "gate1b.query-contract",
          owner: "work",
          idempotencyKey: `idempotency:query-run:${suffix}`,
          authorizationDecisionRef:
            fixture.authorizationDecisionRef,
          auditRef: `audit:query-run:${suffix}`,
          createdAt: "2026-07-28T09:10:00.000Z"
        }
      });
      await governanceRepository.saveAudits(client, [receipt]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await expect(
      contractService.resolve({
        boundRunKind: "QueryRun",
        boundRunRef: queryRunRef,
        profileRef: fixture.profile.profileRef,
        profileVersion: 1,
        tenantRef: "tenant:demo-school",
        actorRef: "user:teacher-001",
        purpose: "gate1b.query-contract",
        idempotencyKey: `idempotency:${uniqueSuffix("query-contract")}`
      })
    ).resolves.toMatchObject({
      profileVersion: 1
    });

    await expect(
      contractService.resolve({
        boundRunKind: "TaskRun",
        boundRunRef: "task-run:missing",
        profileRef: fixture.profile.profileRef,
        profileVersion: 1,
        tenantRef: "tenant:demo-school",
        actorRef: "user:teacher-001",
        purpose: "gate1b.orphan-contract",
        idempotencyKey: `idempotency:${uniqueSuffix("orphan")}`
      })
    ).rejects.toThrow("must bind to an existing Run");
  });
});

import { randomUUID } from "node:crypto";

import { apiRoutes } from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/sample-data";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import {
  createProductContainer
} from "../../apps/api/src/composition/product-container.js";
import { PostgresMemoryApplicationService } from "../../apps/api/src/modules/personalization-memory-analytics/infrastructure/postgres-memory-application-service.js";
import type { MemoryApplicationSelection } from "../../apps/api/src/modules/personalization-memory-analytics/application/memory-application-recorder.js";
import { seedSampleData } from "../../scripts/sample/seed-sample-data.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const appPool = poolFor("app");
const product = createProductContainer(postgresEnvironment);
const app = createApp({ product, allowTestIdentityHeaders: true });
const owner = {
  tenantRef: gate2DemoRefs.tenantRef,
  teacherRef: gate2DemoRefs.teacherRef
};
const headers = {
  "x-demo-tenant": owner.tenantRef,
  "x-demo-actor": owner.teacherRef
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await seedSampleData(postgresEnvironment);
});

afterAll(async () => {
  await Promise.all([product.close(), appPool.end(), adminPool.end()]);
});

describe("Memory application observability PostgreSQL", () => {
  it("persists owner-scoped append-only application and at-least-once outcomes", async () => {
    const preference = await confirmSyntheticPreference();
    const selection = selectionFor(preference);

    await product.services.memoryApplications.recordSelection(selection);
    await product.services.memoryApplications.recordSelection(selection);
    expect(await applicationCount()).toBe(1);

    const application = (
      await product.services.memoryApplications.listApplicationsForRun({
        owner,
        agentRunRef: selection.agentRunRef
      })
    )[0]!;
    expect(application).toMatchObject({
      preferenceRef: preference.preferenceRef,
      preferenceVersion: preference.version,
      decision: "injected",
      reasonCode: "active_confirmed_preference",
      retentionPolicyVersion: "memory-application-retention@1"
    });
    expect(application.retentionUntil > application.createdAt).toBe(true);
    expect(
      await product.services.memoryApplications.listApplicationsForRun({
        owner: { ...owner, teacherRef: "user:teacher-foreign" },
        agentRunRef: selection.agentRunRef
      })
    ).toEqual([]);

    for (const [sourceEventRef, outcomeStatus] of [
      ["outbox:accepted", "adopted"],
      ["outbox:edited", "edited"],
      ["outbox:rejected", "rejected"],
      ["outbox:deferred", "deferred"]
    ] as const) {
      const outcome = {
        owner,
        sourceEventRef,
        agentRunRef: selection.agentRunRef,
        outcomeStatus,
        resultingRevisionRef:
          outcomeStatus === "adopted" || outcomeStatus === "edited"
            ? `artifact-revision:${outcomeStatus}`
            : null,
        policyVersion: "memory-application-outcome@1",
        idempotencyKey: `memory-outcome:${sourceEventRef}`
      };
      await product.services.memoryApplications.recordOutcome(outcome);
      await product.services.memoryApplications.recordOutcome(outcome);
    }
    const outcomes =
      await product.services.memoryApplications.listOutcomesForRun({
        owner,
        agentRunRef: selection.agentRunRef
      });
    expect(outcomes.map((outcome) => outcome.outcomeStatus).sort()).toEqual([
      "adopted",
      "deferred",
      "edited",
      "rejected"
    ]);

    await expect(
      adminPool.query(
        `UPDATE personalization.memory_application
            SET estimated_tokens = estimated_tokens + 1
          WHERE application_ref = $1`,
        [application.applicationRef]
      )
    ).rejects.toThrow(/append-only/u);
    await expect(
      adminPool.query(
        `DELETE FROM personalization.memory_application_outcome
          WHERE application_ref = $1`,
        [application.applicationRef]
      )
    ).rejects.toThrow(/append-only/u);

    const restarted = new PostgresMemoryApplicationService(appPool);
    await expect(
      restarted.getApplicationForOwner({
        owner,
        applicationRef: application.applicationRef
      })
    ).resolves.toMatchObject({
      applicationRef: application.applicationRef,
      packContentHash: selection.packContentHash
    });
  });

  it("fails closed on foreign revisions, preserves historical revisions, and disables collection", async () => {
    const preference = await confirmSyntheticPreference();
    const selection = selectionFor(preference);
    await expect(
      product.services.memoryApplications.recordSelection({
        ...selection,
        owner: { ...owner, teacherRef: "user:teacher-foreign" },
        idempotencyKey: "memory-application:foreign-owner"
      })
    ).rejects.toThrow(/active owner scope/u);
    expect(await applicationCount()).toBe(0);

    await request(app)
      .post(apiRoutes.teacher.teacherPreferenceRevoke(preference.preferenceRef))
      .set(headers)
      .send({
        expectedVersion: preference.version,
        purpose: "personalization.preference.revoke",
        idempotencyKey: `memory-observability:revoke:${randomUUID()}`
      })
      .expect(200);
    await expect(
      product.services.memoryApplications.resolvePreferenceRevision({
        owner,
        preferenceRef: preference.preferenceRef,
        preferenceVersion: preference.version,
        expectedContentHash: preference.contentHash
      })
    ).resolves.toMatchObject({
      preferenceValue: "贴近日常生活",
      statusAtRun: "active",
      currentStatus: "revoked"
    });
    expect(
      await product.services.personalization.listConfirmedPreferences(owner)
    ).toEqual([]);

    const disabled = new PostgresMemoryApplicationService(appPool, {
      collectionEnabled: false,
      retentionDurationMilliseconds: 365 * 24 * 60 * 60 * 1000,
      policyVersion: "memory-application-observability@1",
      retentionPolicyVersion: "memory-application-retention@1"
    });
    await disabled.recordSelection(selection);
    await disabled.recordOutcome({
      owner,
      sourceEventRef: "outbox:disabled",
      agentRunRef: selection.agentRunRef,
      outcomeStatus: "unknown",
      resultingRevisionRef: null,
      policyVersion: "memory-application-outcome@1",
      idempotencyKey: "memory-outcome:disabled"
    });
    expect(await applicationCount()).toBe(0);
    await product.services.memoryApplications.recordSelection(selection);
    expect(await applicationCount()).toBe(1);
    await expect(disabled.listApplicationsForRun({
      owner,
      agentRunRef: selection.agentRunRef
    })).resolves.toMatchObject([{
      preferenceRef: preference.preferenceRef,
      packContentHash: selection.packContentHash
    }]);
    await expect(disabled.listApplicationsForRun({
      owner: { ...owner, teacherRef: "user:teacher-foreign" },
      agentRunRef: selection.agentRunRef
    })).resolves.toEqual([]);
  });
});

async function confirmSyntheticPreference() {
  const candidate = await request(app)
    .post(apiRoutes.teacher.memoryCandidates)
    .set(headers)
    .send({
      summary: "合成教师确认案例应贴近日常生活。",
      preferenceKey: "example_preference",
      preferenceValue: "贴近日常生活",
      purpose: "personalization.candidate.create",
      idempotencyKey: `memory-observability:candidate:${randomUUID()}`
    })
    .expect(201);
  const confirmed = await request(app)
    .post(
      apiRoutes.teacher.memoryCandidateConfirm(
        candidate.body.candidate.candidateRef
      )
    )
    .set(headers)
    .send({
      expectedVersion: candidate.body.candidate.version,
      purpose: "personalization.candidate.confirm",
      idempotencyKey: `memory-observability:confirm:${randomUUID()}`
    })
    .expect(200);
  return confirmed.body.preference as {
    preferenceRef: string;
    version: number;
    contentHash: string;
  };
}

function selectionFor(preference: {
  preferenceRef: string;
  version: number;
  contentHash: string;
}): MemoryApplicationSelection {
  return {
    owner,
    conversationRef: "conversation:synthetic-observability",
    turnRef: "turn:synthetic-observability",
    taskRef: "task:synthetic-observability",
    agentRunRef: "agent-run:synthetic-observability",
    modelExecutionRef: null,
    skillRef: "lesson-preparation@5",
    useCase: "lesson_preparation",
    scopeHash: "a".repeat(64),
    preferenceRef: preference.preferenceRef,
    preferenceVersion: preference.version,
    preferenceContentHash: preference.contentHash,
    packRef: "memory-context-pack:synthetic-observability",
    packContentHash: "b".repeat(64),
    decision: "injected",
    reasonCode: "active_confirmed_preference",
    targetFields: ["prompt.context.confirmedPreferences"],
    estimatedTokens: 8,
    policyVersion: "memory-context-pack-policy@1",
    idempotencyKey: "memory-application:synthetic-observability",
    authorizationDecisionRef: "decision:synthetic-observability",
    auditRef: "audit:synthetic-observability"
  };
}

async function applicationCount(): Promise<number> {
  const result = await adminPool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM personalization.memory_application"
  );
  return Number(result.rows[0]?.count ?? "0");
}

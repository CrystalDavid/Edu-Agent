import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  PostgresArtifactRevisionService
} from "../../apps/api/src/composition/postgres-artifact-revision-service.js";
import {
  PostgresGate1BCommandService
} from "../../apps/api/src/composition/postgres-gate1b-command-service.js";
import {
  PostgresArtifactRepository
} from "../../apps/api/src/modules/artifact-collaboration/infrastructure/postgres-artifact-repository.js";
import {
  poolFor,
  resetGate1BData,
  uniqueSuffix
} from "./support/database.js";

const adminPool = poolFor("admin");
const appPool = poolFor("app", {
  max: 6
});
const commandService = new PostgresGate1BCommandService(appPool);
const revisionService = new PostgresArtifactRevisionService(appPool);
const artifactRepository = new PostgresArtifactRepository();

beforeEach(async () => {
  await resetGate1BData(adminPool);
});

afterAll(async () => {
  await Promise.all([appPool.end(), adminPool.end()]);
});

describe("concurrent Artifact revisions", () => {
  it("creates two explicit Proposal revisions from one parent without overwriting the published revision", async () => {
    const initial = await commandService.execute({
      tenantRef: "tenant:demo-school",
      actorRef: "user:teacher-001",
      purpose: "gate1b.artifact-concurrency",
      idempotencyKey: `idempotency:${uniqueSuffix("artifact-base")}`,
      title: "一次函数教学计划",
      body: "Published baseline"
    });
    const parent = await artifactRepository.getRevision(
      appPool,
      initial.artifactRevisionRef
    );
    expect(parent?.revisionState).toBe("published");

    const [proposalA, proposalB] = await Promise.all([
      revisionService.createProposal({
        artifactRef: initial.artifactRef,
        parentRevisionRef: initial.artifactRevisionRef,
        title: "教师修改 A",
        body: "增加斜率正负比较。",
        tenantRef: "tenant:demo-school",
        actorRef: "user:teacher-001",
        purpose: "gate1b.artifact-proposal",
        idempotencyKey: `idempotency:${uniqueSuffix("proposal-a")}`
      }),
      revisionService.createProposal({
        artifactRef: initial.artifactRef,
        parentRevisionRef: initial.artifactRevisionRef,
        title: "教师修改 B",
        body: "增加斜率绝对值与陡峭程度比较。",
        tenantRef: "tenant:demo-school",
        actorRef: "user:teacher-001",
        purpose: "gate1b.artifact-proposal",
        idempotencyKey: `idempotency:${uniqueSuffix("proposal-b")}`
      })
    ]);

    expect(proposalA.revisionRef).not.toBe(proposalB.revisionRef);
    expect(
      [proposalA.revisionNumber, proposalB.revisionNumber].sort()
    ).toEqual([2, 3]);
    for (const proposal of [proposalA, proposalB]) {
      expect(proposal).toMatchObject({
        artifactRef: initial.artifactRef,
        parentRevisionRef: initial.artifactRevisionRef,
        revisionState: "proposal"
      });
    }

    await expect(
      artifactRepository.latestPublishedRevisionRef(
        appPool,
        initial.artifactRef
      )
    ).resolves.toBe(initial.artifactRevisionRef);
    const unchangedParent = await artifactRepository.getRevision(
      appPool,
      initial.artifactRevisionRef
    );
    expect(unchangedParent).toMatchObject({
      revisionState: "published",
      title: "一次函数教学计划"
    });
    expect(unchangedParent?.body).toContain("Published baseline");

    await expect(
      appPool.query(
        `UPDATE artifact.artifact_revision
            SET body = 'silent overwrite'
          WHERE revision_ref = $1`,
        [initial.artifactRevisionRef]
      )
    ).rejects.toThrow("Published ArtifactRevision is immutable");
  });
});

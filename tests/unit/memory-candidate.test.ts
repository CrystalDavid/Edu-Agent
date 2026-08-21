import { describe, expect, it } from "vitest";

import {
  MemoryCandidateApplicationError,
  MemoryCandidateService
} from "../../apps/api/src/modules/personalization-memory-analytics/application/memory-candidate-service.js";
import {
  MemoryCandidateDomainError,
  createMemoryCandidate,
  createMemoryScope,
  evaluateMemoryCandidate,
  evaluateTeacherPreference,
  memoryClassOwnership
} from "../../apps/api/src/modules/personalization-memory-analytics/domain/index.js";
import {
  InMemoryMemoryCandidateRepository
} from "../../apps/api/src/modules/personalization-memory-analytics/infrastructure/in-memory-memory-candidate-repository.js";

describe("Phase 6 Memory Candidate foundation", () => {
  it("keeps working/task memory with their owners and candidates in personalization", () => {
    expect(memoryClassOwnership).toEqual({
      working: "runtime",
      task: "work",
      preference_candidate: "personalization",
      episodic_candidate: "personalization"
    });
  });

  it("creates only a draft candidate and requires the teacher to confirm a preference", async () => {
    const repository = new InMemoryMemoryCandidateRepository();
    const service = serviceAt(repository, "2026-08-04T08:00:00.000Z");
    const draft = await service.create(preferenceCandidateInput());

    expect(draft).toMatchObject({
      status: "draft",
      type: "preference",
      proposedBy: "agent",
      version: 1
    });
    expect(await repository.getPreferenceByCandidate(draft.candidateRef))
      .toBeNull();

    const review = await serviceAt(
      repository,
      "2026-08-04T09:00:00.000Z"
    ).confirm({
      candidateRef: draft.candidateRef,
      actorRef: "user:teacher-1",
      tenantRef: "school:1",
      expectedVersion: 1,
      preferenceRef: "teacher-preference:1"
    });

    expect(review.candidate).toMatchObject({
      status: "confirmed",
      version: 2,
      confirmedAt: "2026-08-04T09:00:00.000Z"
    });
    expect(review.preference).toMatchObject({
      preferenceRef: "teacher-preference:1",
      preferenceKey: "lesson_plan_detail",
      preferenceValue: "concise",
      status: "active",
      sourceCandidateRef: draft.candidateRef,
      confirmedByRef: "user:teacher-1"
    });
    expect((await repository.listCandidateHistory(draft.candidateRef)))
      .toHaveLength(2);
  });

  it("rejects cross-teacher confirmation and learner-owned memory", async () => {
    const repository = new InMemoryMemoryCandidateRepository();
    const service = serviceAt(repository, "2026-08-04T08:00:00.000Z");
    const draft = await service.create(preferenceCandidateInput());

    await expect(service.confirm({
      candidateRef: draft.candidateRef,
      actorRef: "user:teacher-2",
      tenantRef: "school:1",
      expectedVersion: 1,
      preferenceRef: "teacher-preference:1"
    })).rejects.toThrow(MemoryCandidateDomainError);

    expect(() => createMemoryCandidate({
      ...preferenceCandidateInput(),
      owner: {
        tenantRef: "school:1",
        teacherRef: "student:anonymous-1"
      },
      createdAt: "2026-08-04T08:00:00.000Z"
    })).toThrow(/learner owner/u);
  });

  it("rejects, expires and revokes without overwriting history", async () => {
    const repository = new InMemoryMemoryCandidateRepository();
    const created = await serviceAt(
      repository,
      "2026-08-04T08:00:00.000Z"
    ).create(preferenceCandidateInput());
    const confirmed = await serviceAt(
      repository,
      "2026-08-04T09:00:00.000Z"
    ).confirm({
      candidateRef: created.candidateRef,
      actorRef: "user:teacher-1",
      tenantRef: "school:1",
      expectedVersion: 1,
      preferenceRef: "teacher-preference:1"
    });
    const revoked = await serviceAt(
      repository,
      "2026-08-04T10:00:00.000Z"
    ).revokePreference({
      preferenceRef: "teacher-preference:1",
      actorRef: "user:teacher-1",
      tenantRef: "school:1",
      expectedVersion: 1
    });
    expect(revoked).toMatchObject({ status: "revoked", version: 2 });
    expect(await repository.listPreferenceHistory("teacher-preference:1"))
      .toHaveLength(2);
    expect(confirmed.preference?.status).toBe("active");

    const rejectedDraft = await serviceAt(
      repository,
      "2026-08-04T08:00:00.000Z"
    ).create({
      ...preferenceCandidateInput(),
      candidateRef: "memory-candidate:rejected"
    });
    const rejected = await serviceAt(
      repository,
      "2026-08-04T09:00:00.000Z"
    ).reject({
      candidateRef: rejectedDraft.candidateRef,
      actorRef: "user:teacher-1",
      tenantRef: "school:1",
      expectedVersion: 1
    });
    expect(rejected.status).toBe("rejected");

    const expiringDraft = await serviceAt(
      repository,
      "2026-08-04T08:00:00.000Z"
    ).create({
      ...preferenceCandidateInput(),
      candidateRef: "memory-candidate:expired",
      expiresAt: "2026-08-04T09:30:00.000Z"
    });
    const expired = await serviceAt(
      repository,
      "2026-08-04T10:00:00.000Z"
    ).expire(expiringDraft.candidateRef);
    expect(expired.status).toBe("expired");
  });

  it("evaluates source, expiry and confidence without treating candidates as facts", () => {
    const candidate = createMemoryCandidate({
      ...preferenceCandidateInput(),
      confidence: 0.45,
      createdAt: "2026-08-04T08:00:00.000Z"
    });
    expect(evaluateMemoryCandidate({
      candidate,
      at: "2026-08-04T09:00:00.000Z"
    })).toMatchObject({
      passed: true,
      source: { status: "passed", count: 2 },
      lifecycle: { status: "passed", candidateStatus: "draft" },
      boundary: { status: "passed" },
      confidence: { status: "needs_review", value: 0.45 }
    });
    expect(evaluateMemoryCandidate({
      candidate,
      at: "2026-08-12T08:00:00.000Z"
    })).toMatchObject({
      passed: false,
      lifecycle: { status: "failed" }
    });
  });

  it("fails closed on duplicate candidate refs and tenant-scoped lookup", async () => {
    const repository = new InMemoryMemoryCandidateRepository();
    const service = serviceAt(repository, "2026-08-04T08:00:00.000Z");
    const input = preferenceCandidateInput();
    await service.create(input);
    await expect(service.create(input)).rejects.toThrow(
      MemoryCandidateApplicationError
    );
    await expect(service.confirm({
      candidateRef: input.candidateRef,
      actorRef: "user:teacher-1",
      tenantRef: "school:2",
      expectedVersion: 1,
      preferenceRef: "teacher-preference:1"
    })).rejects.toThrow(/active tenant/u);
  });

  it("evaluates confirmed preference source, owner and revocation before Context use", async () => {
    const repository = new InMemoryMemoryCandidateRepository();
    const service = serviceAt(repository, "2026-08-04T08:00:00.000Z");
    const candidate = await service.create(preferenceCandidateInput());
    const confirmed = await serviceAt(
      repository,
      "2026-08-04T09:00:00.000Z"
    ).confirm({
      candidateRef: candidate.candidateRef,
      actorRef: "user:teacher-1",
      tenantRef: "school:1",
      expectedVersion: candidate.version,
      preferenceRef: "teacher-preference:evaluation"
    });
    expect(evaluateTeacherPreference({
      preference: confirmed.preference!,
      tenantRef: "school:1",
      teacherRef: "user:teacher-1"
    })).toMatchObject({
      passed: true,
      owner: { status: "passed" },
      source: { status: "passed" },
      lifecycle: { status: "passed", preferenceStatus: "active" }
    });

    const revoked = await serviceAt(
      repository,
      "2026-08-04T10:00:00.000Z"
    ).revokePreference({
      preferenceRef: "teacher-preference:evaluation",
      actorRef: "user:teacher-1",
      tenantRef: "school:1",
      expectedVersion: 1
    });
    expect(evaluateTeacherPreference({
      preference: revoked,
      tenantRef: "school:2",
      teacherRef: "user:teacher-2"
    })).toMatchObject({
      passed: false,
      owner: { status: "failed" },
      lifecycle: { status: "failed", preferenceStatus: "revoked" }
    });
  });

  it("replaces a conflicting preference only through the explicit typed path", async () => {
    const repository = new InMemoryMemoryCandidateRepository();
    const scope = createMemoryScope({
      kind: "global",
      subject: null,
      gradeLevel: null,
      courseRunRef: null,
      lessonRef: null,
      taskRef: null,
      skillIds: ["lesson-preparation"]
    });
    const original = await serviceAt(
      repository,
      "2026-08-04T08:00:00.000Z"
    ).create({
      ...preferenceCandidateInput(),
      content: {
        summary: "教案详细程度：简洁",
        preferenceKey: "lesson_plan_detail",
        preferenceValue: "简洁",
        canonicalKey: "lesson_plan_detail",
        proposedScope: scope
      }
    });
    const confirmed = await serviceAt(
      repository,
      "2026-08-04T09:00:00.000Z"
    ).confirm({
      candidateRef: original.candidateRef,
      actorRef: "user:teacher-1",
      tenantRef: "school:1",
      expectedVersion: original.version,
      preferenceRef: "teacher-preference:replace"
    });
    const conflict = await serviceAt(
      repository,
      "2026-08-04T10:00:00.000Z"
    ).create({
      ...preferenceCandidateInput(),
      candidateRef: "memory-candidate:replacement",
      content: {
        summary: "教案详细程度：详细",
        preferenceKey: "lesson_plan_detail",
        preferenceValue: "详细",
        canonicalKey: "lesson_plan_detail",
        proposedScope: scope,
        consentProposal: {
          basis: "teacher_explicit_command",
          version: "consent:explicit-remember@1"
        },
        sourceCommandRef: "turn:command",
        conflictPreferenceRef: confirmed.preference!.preferenceRef,
        conflictPreferenceVersion: confirmed.preference!.version,
        reviewReason: "existing_preference_conflict",
        parsingRuleId: "catalog.lesson-plan-detail.detailed@1"
      }
    });
    const replacement = await serviceAt(
      repository,
      "2026-08-04T11:00:00.000Z"
    ).confirmReplacement({
      candidateRef: conflict.candidateRef,
      preferenceRef: confirmed.preference!.preferenceRef,
      actorRef: "user:teacher-1",
      tenantRef: "school:1",
      expectedCandidateVersion: conflict.version,
      expectedPreferenceVersion: confirmed.preference!.version
    });

    expect(replacement.candidate).toMatchObject({
      status: "confirmed",
      version: 2
    });
    expect(replacement.preference).toMatchObject({
      preferenceRef: "teacher-preference:replace",
      preferenceValue: "详细",
      version: 2,
      sourceCandidateRef: "memory-candidate:replacement",
      consentBasis: "teacher_explicit_command",
      consentVersion: "consent:explicit-remember@1"
    });
    expect(await repository.listPreferenceHistory("teacher-preference:replace"))
      .toHaveLength(2);
    expect(await repository.getMemoryEpoch({
      tenantRef: "school:1",
      teacherRef: "user:teacher-1"
    })).toBe(2);
  });
});

function serviceAt(
  repository: InMemoryMemoryCandidateRepository,
  timestamp: string
): MemoryCandidateService {
  return new MemoryCandidateService(repository, () => new Date(timestamp));
}

function preferenceCandidateInput() {
  return {
    candidateRef: "memory-candidate:preference-1",
    owner: {
      tenantRef: "school:1",
      teacherRef: "user:teacher-1"
    },
    type: "preference" as const,
    content: {
      summary: "教师连续两次明确要求教案更简洁。",
      preferenceKey: "lesson_plan_detail",
      preferenceValue: "concise"
    },
    sources: [
      {
        sourceRef: "teacher-request:1",
        sourceType: "teacher_request" as const,
        version: "1",
        contentHash: "a".repeat(64),
        provenance: "work.task_run_request"
      },
      {
        sourceRef: "teacher-request:2",
        sourceType: "teacher_request" as const,
        version: "1",
        contentHash: "b".repeat(64),
        provenance: "work.task_run_request"
      }
    ],
    confidence: 0.8,
    proposedBy: "agent" as const,
    createdByRef: "agent-run:1",
    expiresAt: "2026-08-11T08:00:00.000Z"
  };
}

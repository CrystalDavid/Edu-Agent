import { describe, expect, it, vi } from "vitest";

import {
  mapPreferenceApplicationDecision,
  mapSuggestionDispositionToMemoryOutcome,
  type MemoryApplicationSelection,
  type RecordedMemoryApplication
} from "../../apps/api/src/modules/personalization-memory-analytics/application/memory-application-recorder.js";
import {
  PostgresMemoryApplicationRepository
} from "../../apps/api/src/modules/personalization-memory-analytics/infrastructure/postgres-memory-application-repository.js";
import {
  PostgresMemoryApplicationService
} from "../../apps/api/src/modules/personalization-memory-analytics/infrastructure/postgres-memory-application-service.js";
import type { SqlExecutor } from "../../apps/api/src/platform/postgres/types.js";

describe("memory application observability", () => {
  it.each([
    ["selected_active_confirmed", "selected", "active_confirmed_preference"],
    ["injected_active_confirmed", "injected", "active_confirmed_preference"],
    ["excluded_duplicate_key", "excluded", "duplicate_key"],
    ["excluded_token_budget", "excluded", "token_budget"]
  ] as const)("maps %s to a controlled application decision", (
    source,
    decision,
    reasonCode
  ) => {
    expect(mapPreferenceApplicationDecision(source)).toEqual({
      decision,
      reasonCode
    });
  });

  it.each([
    ["accepted", "adopted"],
    ["accepted_with_changes", "edited"],
    ["rejected", "rejected"],
    ["deferred", "deferred"]
  ] as const)("maps disposition %s to outcome %s", (disposition, outcome) => {
    expect(mapSuggestionDispositionToMemoryOutcome(disposition)).toBe(outcome);
  });

  it("accepts an exact application retry and rejects conflicting content", async () => {
    const record = recordedSelection();
    const exactQuery = vi.fn()
      .mockResolvedValueOnce(queryResult(1, [{
        application_ref: record.applicationRef,
        content_hash: record.contentHash
      }]))
      .mockResolvedValueOnce(queryResult(0, []))
      .mockResolvedValueOnce(queryResult(1, [{
        application_ref: record.applicationRef,
        content_hash: record.contentHash
      }]));
    const exact = new PostgresMemoryApplicationRepository({
      query: exactQuery
    } as SqlExecutor);
    await expect(exact.recordSelection(record)).resolves.toBeUndefined();
    await expect(exact.recordSelection(record)).resolves.toBeUndefined();

    const conflictingQuery = vi.fn()
      .mockResolvedValueOnce(queryResult(0, []))
      .mockResolvedValueOnce(queryResult(1, [{
        application_ref: record.applicationRef,
        content_hash: "f".repeat(64)
      }]));
    const conflicting = new PostgresMemoryApplicationRepository({
      query: conflictingQuery
    } as SqlExecutor);
    await expect(conflicting.recordSelection(record)).rejects.toThrow(
      /idempotency conflict/u
    );
  });

  it("fans one disposition event out to every injected application without edits", async () => {
    const rows = [applicationRow("application:1", "preference:1"),
      applicationRow("application:2", "preference:2")];
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return queryResult(0, []);
      }
      if (
        sql.includes("FROM personalization.memory_application") &&
        sql.includes("decision = 'injected'")
      ) {
        return queryResult(rows.length, rows);
      }
      if (sql.includes("INSERT INTO personalization.memory_application_outcome")) {
        return queryResult(1, [{
          outcome_ref: values?.[0],
          content_hash: values?.[10]
        }]);
      }
      throw new Error(`Unexpected SQL in synthetic recorder test: ${sql}`);
    });
    const client = { query, release: vi.fn() };
    const pool = {
      connect: vi.fn().mockResolvedValue(client)
    };
    const service = new PostgresMemoryApplicationService(
      pool as never,
      settings(true),
      () => new Date("2026-08-04T10:00:00.000Z")
    );
    const outcome = {
      owner: { tenantRef: "tenant:1", teacherRef: "teacher:1" },
      sourceEventRef: "outbox:suggestion-disposed:1",
      agentRunRef: "agent-run:1",
      outcomeStatus: "edited" as const,
      resultingRevisionRef: "teaching-plan-revision:2",
      policyVersion: "memory-application-outcome@1",
      idempotencyKey: "memory-outcome:event:1"
    };
    expect(JSON.stringify(outcome)).not.toContain("teacherEdits");
    await service.recordOutcome(outcome);

    expect(query.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO personalization.memory_application_outcome")
    )).toHaveLength(2);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("does not write when the feature flag is disabled", async () => {
    const query = vi.fn();
    const connect = vi.fn();
    const service = new PostgresMemoryApplicationService(
      { query, connect } as never,
      settings(false)
    );
    await service.recordSelection(selection());
    await service.recordOutcome({
      owner: { tenantRef: "tenant:1", teacherRef: "teacher:1" },
      sourceEventRef: "outbox:1",
      agentRunRef: "agent-run:1",
      outcomeStatus: "rejected",
      resultingRevisionRef: null,
      policyVersion: "memory-application-outcome@1",
      idempotencyKey: "memory-outcome:disabled"
    });
    expect(query).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("keeps owner-scoped historical reads available when collection is disabled", async () => {
    const application = applicationRow(
      "memory-application:history",
      "preference:history"
    );
    const outcome = outcomeRow(application.application_ref);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("memory_application_outcome")) {
        return queryResult(1, [outcome]);
      }
      return queryResult(1, [application]);
    });
    const service = new PostgresMemoryApplicationService(
      { query } as never,
      settings(false),
      () => new Date("2026-08-04T10:00:00.000Z")
    );

    await expect(service.listApplicationsForRun({
      owner: { tenantRef: "tenant:1", teacherRef: "teacher:1" },
      agentRunRef: "agent-run:1"
    })).resolves.toHaveLength(1);
    await expect(service.listOutcomesForRun({
      owner: { tenantRef: "tenant:1", teacherRef: "teacher:1" },
      agentRunRef: "agent-run:1"
    })).resolves.toMatchObject([{ outcomeStatus: "adopted" }]);
    await expect(service.getApplicationForOwner({
      owner: { tenantRef: "tenant:1", teacherRef: "teacher:1" },
      applicationRef: application.application_ref
    })).resolves.toMatchObject({
      applicationRef: application.application_ref,
      preferenceRef: "preference:history"
    });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("keeps canonical selection inputs free of copied memory or model payloads", () => {
    const serialized = JSON.stringify(selection());
    for (const forbidden of [
      "prompt",
      "providerResponse",
      "hiddenReasoning",
      "turnText",
      "preferenceValue",
      "evidenceBody"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function selection(): MemoryApplicationSelection {
  return {
    owner: { tenantRef: "tenant:1", teacherRef: "teacher:1" },
    conversationRef: "conversation:1",
    turnRef: "turn:2",
    taskRef: "task:1",
    agentRunRef: "agent-run:1",
    modelExecutionRef: "model-execution:1",
    skillRef: "lesson-preparation@5",
    useCase: "lesson_preparation",
    scopeHash: "a".repeat(64),
    preferenceRef: "preference:1",
    preferenceVersion: 2,
    preferenceContentHash: "b".repeat(64),
    packRef: "memory-context-pack:1",
    packContentHash: "c".repeat(64),
    decision: "injected",
    reasonCode: "active_confirmed_preference",
    targetFields: ["teachingPlan.detail"],
    estimatedTokens: 12,
    policyVersion: "memory-context-pack-policy@1",
    idempotencyKey: "memory-application:agent-run:1:preference:1:2:injected",
    authorizationDecisionRef: "authorization-decision:1",
    auditRef: "audit:1"
  };
}

function recordedSelection(): RecordedMemoryApplication {
  return {
    ...selection(),
    applicationRef: "memory-application:1",
    retentionPolicyVersion: "memory-application-retention@1",
    retentionUntil: "2027-08-04T10:00:00.000Z",
    contentHash: "d".repeat(64),
    createdAt: "2026-08-04T10:00:00.000Z"
  };
}

function applicationRow(applicationRef: string, preferenceRef: string) {
  return {
    application_ref: applicationRef,
    tenant_ref: "tenant:1",
    teacher_ref: "teacher:1",
    conversation_ref: "conversation:1",
    turn_ref: "turn:2",
    task_ref: "task:1",
    agent_run_ref: "agent-run:1",
    model_execution_ref: "model-execution:1",
    skill_ref: "lesson-preparation@5",
    use_case: "lesson_preparation",
    scope_hash: "a".repeat(64),
    preference_ref: preferenceRef,
    preference_version: 1,
    preference_content_hash: "b".repeat(64),
    pack_ref: "memory-context-pack:1",
    pack_content_hash: "c".repeat(64),
    decision: "injected",
    reason_code: "active_confirmed_preference",
    target_fields: ["teachingPlan.detail"],
    estimated_tokens: 8,
    policy_version: "memory-context-pack-policy@1",
    retention_policy_version: "memory-application-retention@1",
    retention_until: "2027-08-04T10:00:00.000Z",
    idempotency_key: `memory-application:${applicationRef}`,
    authorization_decision_ref: "authorization-decision:1",
    audit_ref: "audit:1",
    content_hash: "d".repeat(64),
    created_at: "2026-08-04T10:00:00.000Z"
  };
}

function settings(collectionEnabled: boolean) {
  return {
    collectionEnabled,
    retentionDurationMilliseconds: 365 * 24 * 60 * 60 * 1000,
    policyVersion: "memory-application-observability@1" as const,
    retentionPolicyVersion: "memory-application-retention@1" as const
  };
}

function outcomeRow(applicationRef: string) {
  return {
    outcome_ref: "memory-application-outcome:history",
    application_ref: applicationRef,
    tenant_ref: "tenant:1",
    teacher_ref: "teacher:1",
    source_event_ref: "outbox:history",
    agent_run_ref: "agent-run:1",
    outcome_status: "adopted",
    resulting_revision_ref: "teaching-plan-revision:history",
    policy_version: "memory-application-outcome@1",
    idempotency_key: "memory-outcome:history",
    authorization_decision_ref: "authorization-decision:1",
    audit_ref: "audit:history",
    content_hash: "e".repeat(64),
    created_at: "2026-08-04T10:00:00.000Z"
  };
}

function queryResult(rowCount: number, rows: object[]) {
  return {
    command: "synthetic",
    rowCount,
    oid: 0,
    fields: [],
    rows
  };
}

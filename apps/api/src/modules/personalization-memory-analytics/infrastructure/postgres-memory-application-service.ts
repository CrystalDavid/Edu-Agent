import { createHash } from "node:crypto";

import type { Pool } from "pg";

import {
  assertTeacherPreferenceIntegrity
} from "../domain/memory-candidate.js";
import type {
  MemoryApplicationOutcome,
  MemoryApplicationOwner,
  MemoryApplicationRecorder,
  MemoryApplicationSelection,
  RecordedMemoryApplication,
  RecordedMemoryApplicationOutcome
} from "../application/memory-application-recorder.js";
import type {
  TeacherPreferenceRevisionReader,
  TeacherPreferenceRevisionResolution
} from "../application/teacher-preference-revision-reader.js";
import {
  readMemoryApplicationObservabilitySettings,
  type MemoryApplicationObservabilitySettings
} from "./memory-application-observability-config.js";
import {
  PostgresMemoryApplicationRepository
} from "./postgres-memory-application-repository.js";

type Clock = () => Date;

export class PostgresMemoryApplicationService
  implements MemoryApplicationRecorder, TeacherPreferenceRevisionReader
{
  constructor(
    private readonly pool: Pool,
    readonly settings: MemoryApplicationObservabilitySettings =
      readMemoryApplicationObservabilitySettings(),
    private readonly clock: Clock = () => new Date()
  ) {}

  get enabled(): boolean {
    return this.settings.enabled;
  }

  async recordSelection(input: MemoryApplicationSelection): Promise<void> {
    if (!this.settings.enabled) return;
    assertSelection(input);
    const createdAt = this.clock().toISOString();
    const retentionUntil = new Date(
      Date.parse(createdAt) + this.settings.retentionDurationMilliseconds
    ).toISOString();
    const targetFields = unique(input.targetFields);
    const applicationRef = applicationReference(input);
    const hashPayload = {
      applicationRef,
      owner: input.owner,
      conversationRef: input.conversationRef,
      turnRef: input.turnRef,
      taskRef: input.taskRef,
      agentRunRef: input.agentRunRef,
      modelExecutionRef: input.modelExecutionRef,
      skillRef: input.skillRef,
      useCase: input.useCase,
      scopeHash: input.scopeHash,
      preferenceRef: input.preferenceRef,
      preferenceVersion: input.preferenceVersion,
      preferenceContentHash: input.preferenceContentHash,
      packRef: input.packRef,
      packContentHash: input.packContentHash,
      decision: input.decision,
      reasonCode: input.reasonCode,
      targetFields,
      estimatedTokens: input.estimatedTokens,
      policyVersion: input.policyVersion,
      retentionPolicyVersion: this.settings.retentionPolicyVersion,
      idempotencyKey: input.idempotencyKey,
      authorizationDecisionRef: input.authorizationDecisionRef,
      auditRef: input.auditRef
    };
    const record: RecordedMemoryApplication = Object.freeze({
      ...input,
      owner: Object.freeze({ ...input.owner }),
      targetFields: Object.freeze(targetFields),
      applicationRef,
      retentionPolicyVersion: this.settings.retentionPolicyVersion,
      retentionUntil,
      contentHash: hash(hashPayload),
      createdAt
    });
    const repository = new PostgresMemoryApplicationRepository(this.pool);
    const source = await repository.resolvePreferenceRevision({
      tenantRef: input.owner.tenantRef,
      teacherRef: input.owner.teacherRef,
      preferenceRef: input.preferenceRef,
      preferenceVersion: input.preferenceVersion,
      expectedContentHash: input.preferenceContentHash
    });
    if (!source) {
      throw new Error(
        "Memory application source was not found in the active owner scope."
      );
    }
    assertTeacherPreferenceIntegrity(source.revision);
    await repository.recordSelection(record);
  }

  async recordOutcome(input: MemoryApplicationOutcome): Promise<void> {
    if (!this.settings.enabled) return;
    assertOutcome(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const repository = new PostgresMemoryApplicationRepository(client);
      const applications = await repository.listInjectedApplications({
        tenantRef: input.owner.tenantRef,
        teacherRef: input.owner.teacherRef,
        agentRunRef: input.agentRunRef
      });
      const createdAt = this.clock().toISOString();
      for (const application of applications) {
        const outcomeRef = outcomeReference(
          input.sourceEventRef,
          application.applicationRef
        );
        const idempotencyKey = outcomeIdempotencyKey(
          input.idempotencyKey,
          application.applicationRef
        );
        const auditRef = `audit:${hash([
          input.sourceEventRef,
          application.applicationRef,
          input.outcomeStatus
        ]).slice(0, 40)}`;
        const hashPayload = {
          outcomeRef,
          applicationRef: application.applicationRef,
          owner: input.owner,
          sourceEventRef: input.sourceEventRef,
          agentRunRef: input.agentRunRef,
          outcomeStatus: input.outcomeStatus,
          resultingRevisionRef: input.resultingRevisionRef,
          policyVersion: input.policyVersion,
          idempotencyKey,
          authorizationDecisionRef: application.authorizationDecisionRef,
          auditRef
        };
        await repository.recordOutcome(Object.freeze({
          outcomeRef,
          applicationRef: application.applicationRef,
          owner: Object.freeze({ ...input.owner }),
          sourceEventRef: input.sourceEventRef,
          agentRunRef: input.agentRunRef,
          outcomeStatus: input.outcomeStatus,
          resultingRevisionRef: input.resultingRevisionRef,
          policyVersion: input.policyVersion,
          idempotencyKey,
          authorizationDecisionRef: application.authorizationDecisionRef,
          auditRef,
          contentHash: hash(hashPayload),
          createdAt
        }));
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listApplicationsForRun(input: {
    readonly owner: MemoryApplicationOwner;
    readonly agentRunRef: string;
  }): Promise<readonly RecordedMemoryApplication[]> {
    if (!this.settings.enabled) return [];
    assertOwner(input.owner);
    assertRef(input.agentRunRef, "agentRunRef");
    return new PostgresMemoryApplicationRepository(this.pool)
      .listApplicationsForRun({
        tenantRef: input.owner.tenantRef,
        teacherRef: input.owner.teacherRef,
        agentRunRef: input.agentRunRef,
        asOf: this.clock().toISOString()
      });
  }

  async listOutcomesForRun(input: {
    readonly owner: MemoryApplicationOwner;
    readonly agentRunRef: string;
  }): Promise<readonly RecordedMemoryApplicationOutcome[]> {
    if (!this.settings.enabled) return [];
    assertOwner(input.owner);
    assertRef(input.agentRunRef, "agentRunRef");
    return new PostgresMemoryApplicationRepository(this.pool)
      .listOutcomesForRun({
        tenantRef: input.owner.tenantRef,
        teacherRef: input.owner.teacherRef,
        agentRunRef: input.agentRunRef,
        asOf: this.clock().toISOString()
      });
  }

  async getApplicationForOwner(input: {
    readonly owner: MemoryApplicationOwner;
    readonly applicationRef: string;
  }): Promise<RecordedMemoryApplication | null> {
    if (!this.settings.enabled) return null;
    assertOwner(input.owner);
    assertRef(input.applicationRef, "applicationRef");
    return new PostgresMemoryApplicationRepository(this.pool)
      .getApplicationForOwner({
        tenantRef: input.owner.tenantRef,
        teacherRef: input.owner.teacherRef,
        applicationRef: input.applicationRef,
        asOf: this.clock().toISOString()
      });
  }

  async resolvePreferenceRevision(input: {
    readonly owner: MemoryApplicationOwner;
    readonly preferenceRef: string;
    readonly preferenceVersion: number;
    readonly expectedContentHash: string;
  }): Promise<TeacherPreferenceRevisionResolution | null> {
    assertOwner(input.owner);
    assertRef(input.preferenceRef, "preferenceRef");
    assertPositiveInteger(input.preferenceVersion, "preferenceVersion");
    assertHash(input.expectedContentHash, "expectedContentHash");
    const resolved = await new PostgresMemoryApplicationRepository(this.pool)
      .resolvePreferenceRevision({
        tenantRef: input.owner.tenantRef,
        teacherRef: input.owner.teacherRef,
        preferenceRef: input.preferenceRef,
        preferenceVersion: input.preferenceVersion,
        expectedContentHash: input.expectedContentHash
      });
    if (!resolved) return null;
    assertTeacherPreferenceIntegrity(resolved.revision);
    return Object.freeze({
      preferenceRef: resolved.revision.preferenceRef,
      preferenceVersion: resolved.revision.version,
      preferenceKey: resolved.revision.preferenceKey,
      preferenceValue: resolved.revision.preferenceValue,
      preferenceContentHash: resolved.revision.contentHash,
      sourceCandidateRef: resolved.revision.sourceCandidateRef,
      confirmedAt: resolved.revision.confirmedAt,
      updatedAt: resolved.revision.updatedAt,
      statusAtRun: resolved.revision.status,
      currentStatus: resolved.currentStatus,
      currentVersion: resolved.currentVersion,
      revokedAt: resolved.currentRevokedAt
    });
  }
}

function applicationReference(input: MemoryApplicationSelection): string {
  return `memory-application:${hash([
    input.owner.tenantRef,
    input.owner.teacherRef,
    input.agentRunRef,
    input.preferenceRef,
    input.preferenceVersion,
    input.decision
  ]).slice(0, 40)}`;
}

function outcomeReference(
  sourceEventRef: string,
  applicationRef: string
): string {
  return `memory-application-outcome:${hash([
    sourceEventRef,
    applicationRef
  ]).slice(0, 40)}`;
}

function outcomeIdempotencyKey(
  rootIdempotencyKey: string,
  applicationRef: string
): string {
  return `memory-application-outcome:${hash([
    rootIdempotencyKey,
    applicationRef
  ])}`;
}

function assertSelection(input: MemoryApplicationSelection): void {
  assertOwner(input.owner);
  for (const [field, value] of [
    ["conversationRef", input.conversationRef],
    ["turnRef", input.turnRef],
    ["taskRef", input.taskRef],
    ["agentRunRef", input.agentRunRef],
    ["skillRef", input.skillRef],
    ["useCase", input.useCase],
    ["preferenceRef", input.preferenceRef],
    ["packRef", input.packRef],
    ["policyVersion", input.policyVersion],
    ["idempotencyKey", input.idempotencyKey],
    ["authorizationDecisionRef", input.authorizationDecisionRef],
    ["auditRef", input.auditRef]
  ] as const) {
    assertRef(value, field);
  }
  if (input.modelExecutionRef !== null) {
    assertRef(input.modelExecutionRef, "modelExecutionRef");
  }
  assertPositiveInteger(input.preferenceVersion, "preferenceVersion");
  assertHash(input.scopeHash, "scopeHash");
  assertHash(input.preferenceContentHash, "preferenceContentHash");
  assertHash(input.packContentHash, "packContentHash");
  if (!Number.isInteger(input.estimatedTokens) || input.estimatedTokens < 0) {
    throw new Error("estimatedTokens must be a non-negative integer.");
  }
  for (const targetField of input.targetFields) {
    assertRef(targetField, "targetFields[]");
  }
  const validReason =
    ((input.decision === "selected" || input.decision === "injected") &&
      input.reasonCode === "active_confirmed_preference") ||
    (input.decision === "excluded" && [
      "duplicate_key",
      "token_budget",
      "skill_not_allowed",
      "expired",
      "revoked",
      "superseded"
    ].includes(input.reasonCode)) ||
    (input.decision === "overridden" &&
      input.reasonCode === "current_instruction_override");
  if (!validReason) {
    throw new Error("Memory application decision and reasonCode do not match.");
  }
}

function assertOutcome(input: MemoryApplicationOutcome): void {
  assertOwner(input.owner);
  assertRef(input.sourceEventRef, "sourceEventRef");
  assertRef(input.agentRunRef, "agentRunRef");
  assertRef(input.policyVersion, "policyVersion");
  assertRef(input.idempotencyKey, "idempotencyKey");
  if (input.resultingRevisionRef !== null) {
    assertRef(input.resultingRevisionRef, "resultingRevisionRef");
  }
}

function assertOwner(owner: MemoryApplicationOwner): void {
  assertRef(owner.tenantRef, "owner.tenantRef");
  assertRef(owner.teacherRef, "owner.teacherRef");
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
}

function assertHash(value: string, field: string): void {
  if (value.trim().length < 16) {
    throw new Error(`${field} must be a trustworthy content hash.`);
  }
}

function assertRef(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required.`);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()))].sort();
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

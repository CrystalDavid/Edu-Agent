import { createHash, randomUUID } from "node:crypto";

import {
  CreateMemoryCandidateRequestSchema,
  MemoryCandidateMutationResultSchema,
  MemoryCandidateViewSchema,
  ReviewMemoryCandidateRequestSchema,
  TeacherPersonalizationStateSchema,
  TeacherPreferenceMutationResultSchema,
  TeacherPreferenceViewSchema,
  UpdateTeacherPreferenceRequestSchema,
  RevokeTeacherPreferenceRequestSchema,
  type AuthorizationDecision,
  type FormalWriteReceipt
} from "@edu-agent/contracts";
import type { Pool } from "pg";

import {
  MemoryCandidateApplicationError,
  MemoryCandidateService,
  type ConfirmedTeacherPreferenceSnapshot,
  type PersonalizationContextProvider
} from "../modules/personalization-memory-analytics/application/index.js";
import {
  MemoryCandidateDomainError,
  type MemoryCandidate,
  type TeacherPreference
} from "../modules/personalization-memory-analytics/domain/index.js";
import {
  PostgresMemoryCandidateRepository
} from "../modules/personalization-memory-analytics/infrastructure/index.js";
import {
  PostgresGovernanceRepository
} from "../modules/identity-governance-audit/infrastructure/index.js";
import {
  AuthorizationDeniedError,
  DomainConflictError,
  NotFoundError
} from "../platform/errors.js";
import type { PostgresClient } from "../platform/postgres/types.js";
import {
  createReceipt,
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";

type CommandContext = {
  client: PostgresClient;
  writeContext: WriteContext;
  receipts: FormalWriteReceipt[];
};

export class PostgresPersonalizationService
  implements PersonalizationContextProvider
{
  constructor(
    private readonly pool: Pool,
    private readonly governance = new PostgresGovernanceRepository(),
    private readonly clock: () => Date = () => new Date()
  ) {}

  async getState(input: { tenantRef: string; actorRef: string }) {
    this.assertActor(input);
    const service = new MemoryCandidateService(
      new PostgresMemoryCandidateRepository(this.pool),
      this.clock
    );
    const [candidates, preferences] = await Promise.all([
      service.listCandidates({
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef
      }),
      service.listPreferences({
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef
      })
    ]);
    return TeacherPersonalizationStateSchema.parse({
      candidates: candidates.map(candidateView),
      preferences: preferences.map(preferenceView)
    });
  }

  async createCandidate(input: {
    tenantRef: string;
    actorRef: string;
    request: unknown;
  }) {
    this.assertActor(input);
    const request = CreateMemoryCandidateRequestSchema.parse(input.request);
    return this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash(request),
      action: request.purpose,
      resourceRef: input.actorRef,
      requestedFieldMask: ["memoryCandidate.preference"],
      operation: async ({ client, writeContext, receipts }) => {
        const candidateRef = `memory-candidate:${randomUUID()}`;
        const service = this.commandService(client, writeContext);
        const createdAt = new Date(writeContext.createdAt);
        const candidate = await service.create({
          candidateRef,
          owner: {
            tenantRef: input.tenantRef,
            teacherRef: input.actorRef
          },
          type: "preference",
          content: {
            summary: request.summary,
            preferenceKey: request.preferenceKey,
            preferenceValue: request.preferenceValue
          },
          sources: [
            {
              sourceRef: `teacher-action:${hash([
                input.tenantRef,
                input.actorRef,
                request.idempotencyKey
              ]).slice(0, 32)}`,
              sourceType: "teacher_action",
              version: "1",
              contentHash: hash({
                summary: request.summary,
                preferenceKey: request.preferenceKey,
                preferenceValue: request.preferenceValue
              }),
              provenance: "teacher_settings_explicit_input"
            }
          ],
          confidence: 1,
          proposedBy: "teacher",
          createdByRef: input.actorRef,
          expiresAt:
            request.expiresAt ??
            new Date(createdAt.getTime() + 90 * 24 * 60 * 60 * 1_000).toISOString()
        });
        receipts.push(
          createReceipt({
            writeRef: candidate.candidateRef,
            recordType: "MemoryCandidateCreated",
            metadata: createWriteMetadata(
              writeContext,
              "personalization",
              "memory-candidate-audit"
            )
          })
        );
        return MemoryCandidateMutationResultSchema.parse({
          replayed: false,
          candidate: candidateView(candidate),
          preference: null
        });
      }
    }, MemoryCandidateMutationResultSchema.parse);
  }

  async reviewCandidate(input: {
    tenantRef: string;
    actorRef: string;
    candidateRef: string;
    action: "confirm" | "reject";
    request: unknown;
  }) {
    this.assertActor(input);
    const request = ReviewMemoryCandidateRequestSchema.parse(input.request);
    const expectedPurpose = `personalization.candidate.${input.action}`;
    if (request.purpose !== expectedPurpose) {
      throw new AuthorizationDeniedError("偏好候选操作与用途不匹配。");
    }
    return this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({
        candidateRef: input.candidateRef,
        action: input.action,
        ...request
      }),
      action: request.purpose,
      resourceRef: input.candidateRef,
      requestedFieldMask: ["memoryCandidate.status", "teacherPreference"],
      operation: async ({ client, writeContext, receipts }) => {
        const service = this.commandService(client, writeContext);
        const result = input.action === "confirm"
          ? await service.confirm({
              candidateRef: input.candidateRef,
              actorRef: input.actorRef,
              tenantRef: input.tenantRef,
              expectedVersion: request.expectedVersion,
              preferenceRef: `teacher-preference:${randomUUID()}`
            })
          : {
              candidate: await service.reject({
                candidateRef: input.candidateRef,
                actorRef: input.actorRef,
                tenantRef: input.tenantRef,
                expectedVersion: request.expectedVersion
              }),
              preference: null
            };
        receipts.push(
          createReceipt({
            writeRef: result.candidate.candidateRef,
            recordType:
              input.action === "confirm"
                ? "MemoryCandidateConfirmed"
                : "MemoryCandidateRejected",
            metadata: createWriteMetadata(
              writeContext,
              "personalization",
              "memory-candidate-review-audit"
            )
          })
        );
        return MemoryCandidateMutationResultSchema.parse({
          replayed: false,
          candidate: candidateView(result.candidate),
          preference: result.preference ? preferenceView(result.preference) : null
        });
      }
    }, MemoryCandidateMutationResultSchema.parse);
  }

  async updatePreference(input: {
    tenantRef: string;
    actorRef: string;
    preferenceRef: string;
    request: unknown;
  }) {
    this.assertActor(input);
    const request = UpdateTeacherPreferenceRequestSchema.parse(input.request);
    return this.preferenceCommand(input, request, "update");
  }

  async revokePreference(input: {
    tenantRef: string;
    actorRef: string;
    preferenceRef: string;
    request: unknown;
  }) {
    this.assertActor(input);
    const request = RevokeTeacherPreferenceRequestSchema.parse(input.request);
    return this.preferenceCommand(input, request, "revoke");
  }

  async listConfirmedPreferences(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
  }): Promise<readonly ConfirmedTeacherPreferenceSnapshot[]> {
    this.assertActor({ tenantRef: input.tenantRef, actorRef: input.teacherRef });
    const repository = new PostgresMemoryCandidateRepository(this.pool);
    const preferences = await repository.listPreferences({
      tenantRef: input.tenantRef,
      teacherRef: input.teacherRef,
      statuses: ["active"]
    });
    return Object.freeze(
      preferences.map((preference) => Object.freeze({
        tenantRef: preference.owner.tenantRef,
        teacherRef: preference.owner.teacherRef,
        preferenceRef: preference.preferenceRef,
        preferenceKey: preference.preferenceKey,
        preferenceValue: preference.preferenceValue,
        version: preference.version,
        contentHash: preference.contentHash,
        sourceCandidateRef: preference.sourceCandidateRef,
        confirmedAt: preference.confirmedAt,
        updatedAt: preference.updatedAt
      }))
    );
  }

  private async preferenceCommand(
    input: {
      tenantRef: string;
      actorRef: string;
      preferenceRef: string;
    },
    request: {
      expectedVersion: number;
      purpose: "personalization.preference.update" | "personalization.preference.revoke";
      idempotencyKey: string;
      preferenceValue?: string;
    },
    action: "update" | "revoke"
  ) {
    return this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ preferenceRef: input.preferenceRef, action, ...request }),
      action: request.purpose,
      resourceRef: input.preferenceRef,
      requestedFieldMask: ["teacherPreference.value", "teacherPreference.status"],
      operation: async ({ client, writeContext, receipts }) => {
        const service = this.commandService(client, writeContext);
        const preference = action === "update"
          ? await service.updatePreference({
              preferenceRef: input.preferenceRef,
              actorRef: input.actorRef,
              tenantRef: input.tenantRef,
              expectedVersion: request.expectedVersion,
              preferenceValue: request.preferenceValue ?? ""
            })
          : await service.revokePreference({
              preferenceRef: input.preferenceRef,
              actorRef: input.actorRef,
              tenantRef: input.tenantRef,
              expectedVersion: request.expectedVersion
            });
        receipts.push(
          createReceipt({
            writeRef: preference.preferenceRef,
            recordType:
              action === "update"
                ? "TeacherPreferenceUpdated"
                : "TeacherPreferenceRevoked",
            metadata: createWriteMetadata(
              writeContext,
              "personalization",
              "teacher-preference-audit"
            )
          })
        );
        return TeacherPreferenceMutationResultSchema.parse({
          replayed: false,
          preference: preferenceView(preference)
        });
      }
    }, TeacherPreferenceMutationResultSchema.parse);
  }

  private commandService(client: PostgresClient, writeContext: WriteContext) {
    return new MemoryCandidateService(
      new PostgresMemoryCandidateRepository(
        client,
        (suffix) => createWriteMetadata(
          writeContext,
          "personalization",
          suffix
        )
      ),
      () => new Date(writeContext.createdAt)
    );
  }

  private async executeCommand<T extends Record<string, unknown>>(input: {
    tenantRef: string;
    actorRef: string;
    purpose: string;
    idempotencyKey: string;
    requestFingerprint: string;
    action: string;
    resourceRef: string;
    requestedFieldMask: string[];
    operation: (context: CommandContext) => Promise<T>;
  }, parse: (value: unknown) => T): Promise<T> {
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      input.purpose,
      input.idempotencyKey
    ].join("|");
    const decisionRef = `authorization-decision:${hash(rootKey).slice(0, 32)}`;
    const now = this.clock().toISOString();
    const writeContext: WriteContext = {
      actorRef: input.actorRef,
      purpose: input.purpose,
      rootIdempotencyKey: input.idempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt: now
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(client, {
        idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: input.requestFingerprint,
        metadata: createWriteMetadata(
          writeContext,
          "governance",
          "phase7a-command-idempotency"
        )
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return parse({ ...reservation.result, replayed: true });
      }
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: input.purpose,
        action: input.action,
        resourceRef: input.resourceRef,
        requestedFieldMask: input.requestedFieldMask,
        effect: "allow",
        reasonCodes: ["authenticated-teacher", "teacher-owned-personalization"],
        policyVersion: "policy:phase7a-teacher-personalization@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "phase7a-command-authorization"
          )
        })
      ];
      const result = await input.operation({ client, writeContext, receipts });
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: now
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw mapPersonalizationError(error);
    } finally {
      client.release();
    }
  }

  private assertActor(input: { tenantRef: string; actorRef: string }): void {
    if (!input.tenantRef.trim() || !input.actorRef.trim()) {
      throw new AuthorizationDeniedError("当前会话无权访问教师个性化数据。");
    }
  }
}

function candidateView(candidate: MemoryCandidate) {
  return MemoryCandidateViewSchema.parse({
    candidateRef: candidate.candidateRef,
    type: candidate.type,
    summary: candidate.content.summary,
    preferenceKey: candidate.content.preferenceKey ?? null,
    preferenceValue: candidate.content.preferenceValue ?? null,
    sources: candidate.sources,
    confidence: candidate.confidence,
    proposedBy: candidate.proposedBy,
    status: candidate.status,
    createdAt: candidate.createdAt,
    expiresAt: candidate.expiresAt,
    confirmedAt: candidate.confirmedAt,
    rejectedAt: candidate.rejectedAt,
    expiredAt: candidate.expiredAt,
    version: candidate.version,
    contentHash: candidate.contentHash
  });
}

function preferenceView(preference: TeacherPreference) {
  return TeacherPreferenceViewSchema.parse({
    preferenceRef: preference.preferenceRef,
    preferenceKey: preference.preferenceKey,
    preferenceValue: preference.preferenceValue,
    sourceCandidateRef: preference.sourceCandidateRef,
    status: preference.status,
    version: preference.version,
    confirmedAt: preference.confirmedAt,
    updatedAt: preference.updatedAt,
    revokedAt: preference.revokedAt,
    contentHash: preference.contentHash
  });
}

function mapPersonalizationError(error: unknown): Error {
  if (error instanceof MemoryCandidateApplicationError) {
    if (
      error.code === "MEMORY_CANDIDATE_NOT_FOUND" ||
      error.code === "TEACHER_PREFERENCE_NOT_FOUND"
    ) {
      return new NotFoundError("个性化记录不存在。");
    }
    return new DomainConflictError(error.code, error.message);
  }
  if (error instanceof MemoryCandidateDomainError) {
    return new DomainConflictError(error.code, error.message);
  }
  if (isPostgresUniqueViolation(error)) {
    return new DomainConflictError(
      "ACTIVE_TEACHER_PREFERENCE_CONFLICT",
      "同一偏好已有有效版本，请修改或撤销现有偏好。"
    );
  }
  if (error instanceof Error && error.message.includes("version conflict")) {
    return new DomainConflictError(
      "PERSONALIZATION_VERSION_CONFLICT",
      "偏好版本已经变化，请刷新后重试。"
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && (error as { code?: unknown }).code === "23505";
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

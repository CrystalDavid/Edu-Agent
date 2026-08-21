import { createHash, randomUUID } from "node:crypto";

import {
  CreateMemoryCandidateRequestSchema,
  MemoryCandidateMutationResultSchema,
  MemoryCandidateViewSchema,
  ReviewMemoryCandidateRequestSchema,
  TeacherPersonalizationStateSchema,
  TeacherPreferenceMutationResultSchema,
  TeacherPreferenceViewSchema,
  UpdateTeacherPreferenceScopeRequestSchema,
  UpdateTeacherPreferenceRequestSchema,
  RevokeTeacherPreferenceRequestSchema,
  type AuthorizationDecision,
  type FormalWriteReceipt,
  type MemoryScope
} from "@edu-agent/contracts";
import type { Pool } from "pg";

import {
  MemoryCandidateApplicationError,
  MemoryCandidateService,
  type ConfirmedTeacherPreferenceSnapshot,
  type PersonalizationContextProvider,
  type ResolvedConfirmedPreferences,
  type TeacherPreferenceScopeAuthorizationPort
} from "../modules/personalization-memory-analytics/application/index.js";
import {
  MemoryCandidateDomainError,
  MemoryScopeDomainError,
  createMemoryScope,
  evaluateTeacherPreference,
  normalizeCanonicalPreferenceKey,
  resolveTeacherPreferences,
  type MemoryCandidate,
  type TeacherPreference
} from "../modules/personalization-memory-analytics/domain/index.js";
import {
  PostgresMemoryCandidateRepository,
  readMemoryScopedPreferencesSettings,
  type MemoryScopedPreferencesSettings
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
    private readonly clock: () => Date = () => new Date(),
    private readonly scopeAuthorization:
      TeacherPreferenceScopeAuthorizationPort = globalOnlyScopeAuthorization,
    private readonly scopedSettings: MemoryScopedPreferencesSettings =
      readMemoryScopedPreferencesSettings()
  ) {}

  get scopedPreferencesEnabled(): boolean {
    return this.scopedSettings.enabled;
  }

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
      preferences: preferences.map(preferenceView),
      scopedPreferencesEnabled: this.scopedSettings.enabled
    });
  }

  async createCandidate(input: {
    tenantRef: string;
    actorRef: string;
    allowedCourseRunRefs?: readonly string[];
    request: unknown;
  }) {
    this.assertActor(input);
    const request = CreateMemoryCandidateRequestSchema.parse(input.request);
    const canonicalKey = normalizeCanonicalPreferenceKey(
      request.preferenceKey
    );
    if (
      request.canonicalKey !== undefined &&
      normalizeCanonicalPreferenceKey(request.canonicalKey) !== canonicalKey
    ) {
      throw new DomainConflictError(
        "MEMORY_CANONICALIZATION_NOT_SUPPORTED",
        "本阶段不自动合并不同名称的偏好类型。"
      );
    }
    if (
      request.consentProposal !== undefined &&
      request.consentProposal.basis !== "teacher_settings_confirmed"
    ) {
      throw new DomainConflictError(
        "MEMORY_CONSENT_BASIS_NOT_SUPPORTED",
        "本阶段只接受教师在设置页确认的偏好。"
      );
    }
    const proposedScope = createMemoryScope(
      request.proposedScope ?? {
        kind: "global",
        subject: null,
        gradeLevel: null,
        courseRunRef: null,
        lessonRef: null,
        taskRef: null,
        skillIds: []
      }
    );
    this.assertFeatureAllowsScope(proposedScope);
    await this.scopeAuthorization.assertAuthorized({
      tenantRef: input.tenantRef,
      teacherRef: input.actorRef,
      scope: proposedScope,
      allowedCourseRunRefs: input.allowedCourseRunRefs ?? [],
      purpose: request.purpose
    });
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
            preferenceValue: request.preferenceValue,
            canonicalKey,
            proposedScope,
            ...(request.validFrom ? { validFrom: request.validFrom } : {}),
            ...(request.validUntil !== undefined
              ? { validUntil: request.validUntil }
              : {}),
            consentProposal: request.consentProposal ?? {
              basis: "teacher_settings_confirmed",
              version: "consent:teacher-settings@1"
            }
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
    allowedCourseRunRefs?: readonly string[];
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
        if (input.action === "confirm") {
          const candidate = await new PostgresMemoryCandidateRepository(
            client
          ).getCandidate(input.candidateRef);
          if (
            !candidate ||
            candidate.owner.tenantRef !== input.tenantRef ||
            candidate.owner.teacherRef !== input.actorRef
          ) {
            throw new NotFoundError("个性化记录不存在。");
          }
          const scope = candidate.content.proposedScope ?? createMemoryScope({
            kind: "global",
            subject: null,
            gradeLevel: null,
            courseRunRef: null,
            lessonRef: null,
            taskRef: null,
            skillIds: []
          });
          this.assertFeatureAllowsScope(scope);
          await this.scopeAuthorization.assertAuthorized({
            tenantRef: input.tenantRef,
            teacherRef: input.actorRef,
            scope,
            allowedCourseRunRefs: input.allowedCourseRunRefs ?? [],
            purpose: request.purpose
          });
        }
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

  async updatePreferenceScope(input: {
    tenantRef: string;
    actorRef: string;
    preferenceRef: string;
    allowedCourseRunRefs?: readonly string[];
    request: unknown;
  }) {
    this.assertActor(input);
    const request = UpdateTeacherPreferenceScopeRequestSchema.parse(
      input.request
    );
    const scope = createMemoryScope(request.scope);
    this.assertFeatureAllowsScope(scope);
    await this.scopeAuthorization.assertAuthorized({
      tenantRef: input.tenantRef,
      teacherRef: input.actorRef,
      scope,
      allowedCourseRunRefs: input.allowedCourseRunRefs ?? [],
      purpose: request.purpose
    });
    return this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({
        preferenceRef: input.preferenceRef,
        ...request,
        scope
      }),
      action: request.purpose,
      resourceRef: input.preferenceRef,
      requestedFieldMask: [
        "teacherPreference.scope",
        "teacherPreference.validTime"
      ],
      operation: async ({ client, writeContext, receipts }) => {
        const preference = await this.commandService(
          client,
          writeContext
        ).updatePreferenceScope({
          preferenceRef: input.preferenceRef,
          actorRef: input.actorRef,
          tenantRef: input.tenantRef,
          expectedVersion: request.expectedVersion,
          scope,
          ...(request.validFrom !== undefined
            ? { validFrom: request.validFrom }
            : {}),
          ...(request.validUntil !== undefined
            ? { validUntil: request.validUntil }
            : {})
        });
        receipts.push(createReceipt({
          writeRef: preference.preferenceRef,
          recordType: "TeacherPreferenceScopeUpdated",
          metadata: createWriteMetadata(
            writeContext,
            "personalization",
            "teacher-preference-scope-audit"
          )
        }));
        return TeacherPreferenceMutationResultSchema.parse({
          replayed: false,
          preference: preferenceView(preference)
        });
      }
    }, TeacherPreferenceMutationResultSchema.parse);
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
    const now = this.clock().getTime();
    for (const preference of preferences) {
      const evaluation = evaluateTeacherPreference({
        preference,
        tenantRef: input.tenantRef,
        teacherRef: input.teacherRef
      });
      if (!evaluation.passed) {
        throw new AuthorizationDeniedError(
          "教师偏好不满足当前所有者或生命周期策略。"
        );
      }
    }
    return Object.freeze(
      preferences
        .filter((preference) =>
          preference.scope.kind === "global" &&
          preference.scope.skillIds.length === 0 &&
          Date.parse(preference.validFrom) <= now &&
          (preference.validUntil === null ||
            now < Date.parse(preference.validUntil))
        )
        .map(preferenceSnapshot)
    );
  }

  async resolveConfirmedPreferences(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly useCase: string;
    readonly skillId: string;
    readonly subject: string | null;
    readonly gradeLevel: string | null;
    readonly courseRunRef: string | null;
    readonly lessonRef: string | null;
    readonly taskRef: string | null;
    readonly at: string;
  }): Promise<ResolvedConfirmedPreferences> {
    this.assertActor({
      tenantRef: input.tenantRef,
      actorRef: input.teacherRef
    });
    const repository = new PostgresMemoryCandidateRepository(this.pool);
    const preferences = await repository.listPreferences({
      tenantRef: input.tenantRef,
      teacherRef: input.teacherRef,
      statuses: ["active"]
    });
    const resolution = resolveTeacherPreferences({
      owner: {
        tenantRef: input.tenantRef,
        teacherRef: input.teacherRef
      },
      preferences,
      memoryEpoch: await repository.getMemoryEpoch({
        tenantRef: input.tenantRef,
        teacherRef: input.teacherRef
      }),
      useCase: input.useCase,
      skillId: input.skillId,
      query: {
        subject: input.subject,
        gradeLevel: input.gradeLevel,
        courseRunRef: input.courseRunRef,
        lessonRef: input.lessonRef,
        taskRef: input.taskRef
      },
      at: input.at
    });
    return Object.freeze({
      memoryEpoch: resolution.memoryEpoch,
      policyVersion: resolution.policyVersion,
      queryScopeHash: resolution.queryScopeHash,
      selected: Object.freeze(resolution.selected.map((entry) => ({
        ...preferenceSnapshot(entry.preference),
        canonicalKey: entry.preference.canonicalKey,
        scope: entry.preference.scope,
        scopeFingerprint: entry.preference.scopeFingerprint,
        validFrom: entry.preference.validFrom,
        validUntil: entry.preference.validUntil,
        explicitness: entry.preference.explicitness,
        consentBasis: entry.preference.consentBasis,
        consentVersion: entry.preference.consentVersion,
        policyVersion: entry.preference.policyVersion,
        matchSpecificity: entry.matchSpecificity,
        matchedSkillConstraint: entry.matchedSkillConstraint
      }))),
      excluded: Object.freeze(resolution.excluded.map((entry) => ({
        preferenceRef: entry.preferenceRef,
        version: entry.version,
        contentHash: entry.contentHash,
        canonicalKey: entry.canonicalKey,
        scopeFingerprint: entry.scopeFingerprint,
        scopeKind: entry.scopeKind,
        matchSpecificity: entry.matchSpecificity,
        matchedSkillConstraint: entry.matchedSkillConstraint,
        reasonCode: entry.reasonCode,
        ...(entry.preference
          ? {
              preferenceKey: entry.preference.preferenceKey,
              preferenceValue: entry.preference.preferenceValue,
              scope: entry.preference.scope
            }
          : {})
      })))
    });
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

  private assertFeatureAllowsScope(scope: MemoryScope): void {
    if (
      !this.scopedSettings.enabled &&
      (scope.kind !== "global" || scope.skillIds.length > 0)
    ) {
      throw new DomainConflictError(
        "SCOPED_PREFERENCES_DISABLED",
        "当前环境未启用分范围教师偏好。"
      );
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
    canonicalKey: candidate.content.canonicalKey ??
      candidate.content.preferenceKey ?? null,
    proposedScope: candidate.content.proposedScope ?? null,
    validFrom: candidate.content.validFrom ?? null,
    validUntil: candidate.content.validUntil ?? null,
    consentProposal: candidate.content.consentProposal ?? null,
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
    canonicalKey: preference.canonicalKey,
    scope: preference.scope,
    scopeFingerprint: preference.scopeFingerprint,
    validFrom: preference.validFrom,
    validUntil: preference.validUntil,
    explicitness: preference.explicitness,
    consentBasis: preference.consentBasis,
    consentVersion: preference.consentVersion,
    policyVersion: preference.policyVersion,
    sourceCandidateRef: preference.sourceCandidateRef,
    status: preference.status,
    version: preference.version,
    confirmedAt: preference.confirmedAt,
    updatedAt: preference.updatedAt,
    revokedAt: preference.revokedAt,
    contentHash: preference.contentHash
  });
}

function preferenceSnapshot(
  preference: TeacherPreference
): ConfirmedTeacherPreferenceSnapshot {
  return Object.freeze({
    tenantRef: preference.owner.tenantRef,
    teacherRef: preference.owner.teacherRef,
    preferenceRef: preference.preferenceRef,
    preferenceKey: preference.preferenceKey,
    preferenceValue: preference.preferenceValue,
    canonicalKey: preference.canonicalKey,
    scope: preference.scope,
    scopeFingerprint: preference.scopeFingerprint,
    validFrom: preference.validFrom,
    validUntil: preference.validUntil,
    explicitness: preference.explicitness,
    consentBasis: preference.consentBasis,
    consentVersion: preference.consentVersion,
    policyVersion: preference.policyVersion,
    version: preference.version,
    contentHash: preference.contentHash,
    sourceCandidateRef: preference.sourceCandidateRef,
    confirmedAt: preference.confirmedAt,
    updatedAt: preference.updatedAt
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
  if (error instanceof MemoryScopeDomainError) {
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

const globalOnlyScopeAuthorization: TeacherPreferenceScopeAuthorizationPort = {
  async assertAuthorized(input) {
    if (input.scope.kind !== "global") {
      throw new AuthorizationDeniedError(
        "Scoped TeacherPreference authorization is unavailable."
      );
    }
  }
};

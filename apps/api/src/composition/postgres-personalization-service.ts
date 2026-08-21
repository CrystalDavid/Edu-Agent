import { createHash, randomUUID } from "node:crypto";

import {
  ApplyExplicitForgetResultSchema,
  ApplyExplicitRememberResultSchema,
  ConfirmMemoryCandidateReplacementRequestSchema,
  ConfirmMemoryCandidateReplacementResultSchema,
  CreateMemoryCandidateRequestSchema,
  ExplicitTeacherMemoryCommandInterpretationSchema,
  ExplicitTeacherForgetCommandInterpretationSchema,
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
  type ExplicitRememberCommandItem,
  type ExplicitForgetReceiptTarget,
  type ExplicitForgetSelectionOption,
  type FormalWriteReceipt,
  type MemoryScope,
  type ExplicitTeacherMemoryCommandInterpretation,
  type ExplicitTeacherForgetCommandInterpretation
} from "@edu-agent/contracts";
import type { Pool } from "pg";

import {
  MemoryCandidateApplicationError,
  MemoryCandidateService,
  type ExplicitTeacherForgetCommandService,
  type ExplicitTeacherMemoryCommandService,
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
  explicitForgetTargetMatchesPreference,
  normalizeCanonicalPreferenceKey,
  planExplicitTeacherForget,
  resolveTeacherPreferences,
  teacherPreferenceCatalogLabel,
  type MemoryCandidate,
  type TeacherPreference
} from "../modules/personalization-memory-analytics/domain/index.js";
import {
  PostgresMemoryCandidateRepository,
  readMemoryExplicitForgetSettings,
  readMemoryExplicitRememberSettings,
  readMemoryScopedPreferencesSettings,
  type MemoryExplicitRememberSettings,
  type MemoryExplicitForgetSettings,
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

type ForgetCommand = Extract<
  ExplicitTeacherForgetCommandInterpretation,
  { readonly intent: "forget" }
>;

export class PostgresPersonalizationService
  implements PersonalizationContextProvider,
    ExplicitTeacherMemoryCommandService,
    ExplicitTeacherForgetCommandService
{
  constructor(
    private readonly pool: Pool,
    private readonly governance = new PostgresGovernanceRepository(),
    private readonly clock: () => Date = () => new Date(),
    private readonly scopeAuthorization:
      TeacherPreferenceScopeAuthorizationPort = globalOnlyScopeAuthorization,
    private readonly scopedSettings: MemoryScopedPreferencesSettings =
      readMemoryScopedPreferencesSettings(),
    private readonly explicitRememberSettings: MemoryExplicitRememberSettings =
      readMemoryExplicitRememberSettings(),
    private readonly explicitForgetSettings: MemoryExplicitForgetSettings =
      readMemoryExplicitForgetSettings()
  ) {}

  get scopedPreferencesEnabled(): boolean {
    return this.scopedSettings.enabled;
  }

  get explicitRememberEnabled(): boolean {
    return this.explicitRememberSettings.enabled &&
      this.scopedSettings.enabled;
  }

  get explicitForgetEnabled(): boolean {
    return this.explicitForgetSettings.enabled;
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
      scopedPreferencesEnabled: this.scopedSettings.enabled,
      explicitRememberEnabled: this.explicitRememberEnabled,
      explicitForgetEnabled: this.explicitForgetEnabled
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
          if (candidate.content.conflictPreferenceRef) {
            throw new DomainConflictError(
              "MEMORY_REPLACEMENT_CONFIRMATION_REQUIRED",
              "该偏好与现有记录冲突，请明确选择替换或保留原偏好。"
            );
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

  async applyExplicitRemember(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly allowedCourseRunRefs: readonly string[];
    readonly command: Extract<
      ExplicitTeacherMemoryCommandInterpretation,
      { readonly intent: "remember" }
    >;
    readonly purpose: "personalization.explicit-remember.apply";
    readonly idempotencyKey: string;
  }) {
    this.assertActor(input);
    const command = ExplicitTeacherMemoryCommandInterpretationSchema.parse(
      input.command
    );
    if (
      command.intent !== "remember" ||
      !command.fullCoverage ||
      command.residualText !== "" ||
      command.items.length === 0 ||
      command.items.some((item) =>
        item.riskLevel !== "low" || !item.directActivationEligible
      )
    ) {
      throw new DomainConflictError(
        "EXPLICIT_REMEMBER_NOT_ELIGIBLE",
        "该命令未满足安全的长期偏好直接启用条件。"
      );
    }
    if (!this.explicitRememberEnabled) {
      throw new DomainConflictError(
        "EXPLICIT_REMEMBER_DISABLED",
        "长期偏好功能当前未启用，本次未保存。"
      );
    }
    for (const scope of uniqueScopes(command.items.map((item) => item.proposedScope))) {
      await this.scopeAuthorization.assertAuthorized({
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        scope,
        allowedCourseRunRefs: input.allowedCourseRunRefs,
        purpose: input.purpose
      });
    }
    return this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: input.purpose,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: hash({
        sourceTurnRef: command.sourceTurnRef,
        sourceTurnContentHash: command.sourceTurnContentHash,
        commandContentHash: command.commandContentHash,
        items: command.items
      }),
      action: input.purpose,
      resourceRef: command.sourceTurnRef,
      requestedFieldMask: [
        "memoryCandidate.safeCanonicalPreference",
        "teacherPreference.value",
        "teacherPreference.scope"
      ],
      operation: async ({ client, writeContext, receipts }) => {
        const repository = new PostgresMemoryCandidateRepository(
          client,
          (suffix) => createWriteMetadata(
            writeContext,
            "personalization",
            suffix
          )
        );
        const memoryEpochBefore = await repository.getMemoryEpoch({
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef
        });
        const active = await repository.listPreferences({
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          statuses: ["active"]
        });
        const itemResults: ExplicitRememberCommandItem[] = [];
        for (const item of command.items) {
          const current = active.find((preference) =>
            preference.canonicalKey === item.canonicalKey &&
            preference.scopeFingerprint === item.proposedScope.fingerprint
          );
          const currentValid = current !== undefined &&
            Date.parse(current.validFrom) <= Date.parse(writeContext.createdAt) &&
            (current.validUntil === null ||
              Date.parse(writeContext.createdAt) < Date.parse(current.validUntil));
          if (current && currentValid &&
              current.preferenceValue === item.canonicalValue) {
            itemResults.push(receiptItem({
              item,
              status: "already_remembered",
              candidateRef: null,
              preference: current,
              conflict: null,
              safeReasonCode: "exact_active_preference_exists"
            }));
            continue;
          }

          const candidateRef = `memory-candidate:${randomUUID()}`;
          const itemService = new MemoryCandidateService(
            new PostgresMemoryCandidateRepository(
              client,
              (suffix) => createWriteMetadata(
                writeContext,
                "personalization",
                `explicit-memory-item:${candidateRef}:${suffix}`
              )
            ),
            () => new Date(writeContext.createdAt)
          );
          const candidate = await itemService.create({
            candidateRef,
            owner: {
              tenantRef: input.tenantRef,
              teacherRef: input.actorRef
            },
            type: "preference",
            content: {
              summary: safeCandidateSummary(
                item.canonicalKey,
                item.safeDisplayValue
              ),
              preferenceKey: item.preferenceKey,
              preferenceValue: item.canonicalValue,
              canonicalKey: item.canonicalKey,
              proposedScope: item.proposedScope,
              validFrom: writeContext.createdAt,
              validUntil: null,
              consentProposal: {
                basis: "teacher_explicit_command",
                version: "consent:explicit-remember@1"
              },
              sourceCommandRef: command.sourceTurnRef,
              parsingRuleId: item.parsingRuleId,
              ...(current
                ? {
                    conflictPreferenceRef: current.preferenceRef,
                    conflictPreferenceVersion: current.version,
                    reviewReason: "existing_preference_conflict"
                  }
                : {})
            },
            sources: [{
              sourceRef: command.sourceTurnRef,
              sourceType: "teacher_request",
              version: String(command.sourceTurnSequence),
              contentHash: command.sourceTurnContentHash,
              provenance:
                "work.conversation_turn.teacher_explicit_memory_command"
            }],
            confidence: 1,
            proposedBy: "teacher",
            createdByRef: input.actorRef,
            expiresAt: new Date(
              Date.parse(writeContext.createdAt) + 90 * 24 * 60 * 60 * 1_000
            ).toISOString()
          });
          receipts.push(createReceipt({
            writeRef: candidate.candidateRef,
            recordType: "ExplicitMemoryCandidateCreated",
            metadata: createWriteMetadata(
              writeContext,
              "personalization",
              `explicit-memory-candidate:${candidate.candidateRef}`
            )
          }));
          if (current) {
            itemResults.push(receiptItem({
              item,
              status: "review_required",
              candidateRef: candidate.candidateRef,
              preference: null,
              conflict: current,
              safeReasonCode: currentValid
                ? "active_preference_conflict"
                : "inactive_validity_preference_conflict"
            }));
            continue;
          }
          const confirmed = await itemService.confirm({
            candidateRef: candidate.candidateRef,
            actorRef: input.actorRef,
            tenantRef: input.tenantRef,
            expectedVersion: candidate.version,
            preferenceRef: `teacher-preference:${randomUUID()}`
          });
          if (!confirmed.preference) {
            throw new Error("Explicit preference confirmation produced no preference.");
          }
          receipts.push(createReceipt({
            writeRef: confirmed.preference.preferenceRef,
            recordType: "ExplicitTeacherPreferenceActivated",
            metadata: createWriteMetadata(
              writeContext,
              "personalization",
              `explicit-preference:${confirmed.preference.preferenceRef}`
            )
          }));
          itemResults.push(receiptItem({
            item,
            status: "applied",
            candidateRef: confirmed.candidate.candidateRef,
            preference: confirmed.preference,
            conflict: null,
            safeReasonCode: "explicit_teacher_command_applied"
          }));
        }
        const memoryEpochAfter = await repository.getMemoryEpoch({
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef
        });
        const status = aggregateReceiptStatus(itemResults);
        const receipt = {
          commandRef: `memory-command:${command.commandContentHash.slice(0, 32)}`,
          interpreterVersion: command.interpreterVersion,
          sourceTurnRef: command.sourceTurnRef,
          sourceTurnContentHash: command.sourceTurnContentHash,
          status,
          safeReasonCode: receiptReasonCode(status),
          safeMessage: receiptMessage(status, itemResults.length),
          items: itemResults,
          memoryEpochBefore,
          memoryEpochAfter,
          createdAt: writeContext.createdAt
        };
        receipts.push(createReceipt({
          writeRef: receipt.commandRef,
          recordType: "ExplicitTeacherMemoryCommandEvaluated",
          metadata: createWriteMetadata(
            writeContext,
            "personalization",
            "explicit-memory-command-audit"
          )
        }));
        return ApplyExplicitRememberResultSchema.parse({
          replayed: false,
          receipt
        });
      }
    }, ApplyExplicitRememberResultSchema.parse);
  }

  async applyExplicitForget(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly allowedCourseRunRefs: readonly string[];
    readonly courseRunRef: string;
    readonly command: ForgetCommand;
    readonly purpose: "personalization.explicit-forget.apply";
    readonly idempotencyKey: string;
  }) {
    this.assertActor(input);
    const command = this.requireForgetCommand(input.command);
    if (!this.explicitForgetEnabled) {
      throw new DomainConflictError(
        "EXPLICIT_FORGET_DISABLED",
        "对话式忘记当前未启用，本次没有修改长期偏好。"
      );
    }
    return this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: input.purpose,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: hash({
        sourceTurnRef: command.sourceTurnRef,
        sourceTurnContentHash: command.sourceTurnContentHash,
        commandContentHash: command.commandContentHash,
        courseRunRef: input.courseRunRef,
        targets: command.targets
      }),
      action: input.purpose,
      resourceRef: command.sourceTurnRef,
      requestedFieldMask: [
        "teacherPreference.status",
        "teacherPreference.scope"
      ],
      operation: async ({ client, writeContext, receipts }) => {
        const repository = this.commandRepository(client, writeContext);
        const memoryEpochBefore = await repository.getMemoryEpoch({
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef
        });
        const active = await repository.listPreferencesForUpdate({
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          statuses: ["active"]
        });
        const plan = planExplicitTeacherForget({
          command,
          preferences: active,
          currentCourseRunRef: input.courseRunRef
        });
        const matches = plan.matches;
        const allOptions = plan.preferences;
        if (plan.kind === "rejected") {
          return this.forgetResult({
            command,
            status: "rejected",
            safeReasonCode: "too_many_matching_preferences",
            safeMessage:
              "匹配的偏好超过 10 条，本次未修改。请在“助手偏好”中管理。",
            targets: matches.map(({ target }) => ({
              ...target,
              status: "rejected" as const,
              options: []
            })),
            memoryEpochBefore,
            memoryEpochAfter: memoryEpochBefore,
            createdAt: writeContext.createdAt,
            receipts,
            writeContext
          });
        }
        if (plan.kind === "nothing_to_forget") {
          return this.forgetResult({
            command,
            status: "nothing_to_forget",
            safeReasonCode: "no_active_matching_preference",
            safeMessage:
              "没有找到当前可撤销的匹配偏好。你可以在“助手偏好”中查看现有记录。",
            targets: matches.map(({ target, preferences }) => ({
              ...target,
              status: preferences.length === 0
                ? "not_found" as const
                : "rejected" as const,
              options: []
            })),
            memoryEpochBefore,
            memoryEpochAfter: memoryEpochBefore,
            createdAt: writeContext.createdAt,
            receipts,
            writeContext
          });
        }
        if (plan.kind === "selection_required") {
          await this.assertForgetScopesAuthorized({
            tenantRef: input.tenantRef,
            actorRef: input.actorRef,
            allowedCourseRunRefs: input.allowedCourseRunRefs,
            preferences: allOptions,
            purpose: input.purpose
          });
          return this.forgetResult({
            command,
            status: "selection_required",
            safeReasonCode: "multiple_active_preferences_match",
            safeMessage:
              `找到 ${allOptions.length} 条匹配偏好，请选择要忘掉的范围。`,
            targets: matches.map(({ target, preferences }) => ({
              ...target,
              status: "selection_required" as const,
              options: preferences.map(forgetSelectionOption)
            })),
            memoryEpochBefore,
            memoryEpochAfter: memoryEpochBefore,
            createdAt: writeContext.createdAt,
            receipts,
            writeContext
          });
        }
        await this.assertForgetScopesAuthorized({
          tenantRef: input.tenantRef,
          actorRef: input.actorRef,
          allowedCourseRunRefs: input.allowedCourseRunRefs,
          preferences: allOptions,
          purpose: input.purpose
        });
        const revoked = await this.revokePreferences({
          client,
          writeContext,
          tenantRef: input.tenantRef,
          actorRef: input.actorRef,
          preferences: allOptions
        });
        const byRef = new Map(revoked.map((preference) => [
          preference.preferenceRef,
          preference
        ]));
        const memoryEpochAfter = await repository.getMemoryEpoch({
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef
        });
        return this.forgetResult({
          command,
          status: "revoked",
          safeReasonCode: "explicit_preferences_revoked",
          safeMessage: forgetRevokedMessage(revoked.length),
          targets: matches.map(({ target, preferences }) => ({
            ...target,
            status: "revoked" as const,
            options: preferences.map((preference) =>
              forgetSelectionOption(byRef.get(preference.preferenceRef)!)
            )
          })),
          memoryEpochBefore,
          memoryEpochAfter,
          createdAt: writeContext.createdAt,
          receipts,
          writeContext
        });
      }
    }, ApplyExplicitForgetResultSchema.parse);
  }

  async confirmExplicitForget(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly allowedCourseRunRefs: readonly string[];
    readonly courseRunRef: string;
    readonly command: ForgetCommand;
    readonly allowedPreferenceRefs: readonly string[];
    readonly selections: readonly {
      readonly preferenceRef: string;
      readonly expectedVersion: number;
    }[];
    readonly purpose: "personalization.explicit-forget.confirm";
    readonly idempotencyKey: string;
  }) {
    this.assertActor(input);
    const command = this.requireForgetCommand(input.command);
    if (!this.explicitForgetEnabled) {
      throw new DomainConflictError(
        "EXPLICIT_FORGET_DISABLED",
        "对话式忘记当前未启用，本次没有修改长期偏好。"
      );
    }
    const allowedPreferenceRefs = uniqueText(input.allowedPreferenceRefs);
    const selections = [...new Map(input.selections.map((selection) => [
      selection.preferenceRef,
      selection
    ])).values()].sort((left, right) =>
      left.preferenceRef.localeCompare(right.preferenceRef)
    );
    if (
      selections.length === 0 ||
      selections.length > 10 ||
      allowedPreferenceRefs.length > 10 ||
      selections.some((selection) =>
        !allowedPreferenceRefs.includes(selection.preferenceRef)
      )
    ) {
      throw new AuthorizationDeniedError(
        "所选偏好不属于这条忘记命令的持久化选项。"
      );
    }
    return this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: input.purpose,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: hash({
        commandContentHash: command.commandContentHash,
        courseRunRef: input.courseRunRef,
        allowedPreferenceRefs,
        selections
      }),
      action: input.purpose,
      resourceRef: command.sourceTurnRef,
      requestedFieldMask: ["teacherPreference.status"],
      operation: async ({ client, writeContext, receipts }) => {
        const repository = this.commandRepository(client, writeContext);
        const memoryEpochBefore = await repository.getMemoryEpoch({
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef
        });
        const preferences = await repository.getPreferencesByRefsForUpdate({
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          preferenceRefs: selections.map((selection) => selection.preferenceRef)
        });
        if (preferences.length !== selections.length) {
          throw new NotFoundError("个性化记录不存在。");
        }
        for (const selection of selections) {
          const preference = preferences.find((entry) =>
            entry.preferenceRef === selection.preferenceRef
          );
          if (
            !preference ||
            preference.status !== "active" ||
            preference.version !== selection.expectedVersion ||
            !command.targets.some((target) =>
              explicitForgetTargetMatchesPreference(
                target,
                preference,
                input.courseRunRef
              )
            )
          ) {
            throw new DomainConflictError(
              "EXPLICIT_FORGET_SELECTION_CONFLICT",
              "偏好状态或版本已经变化，请刷新后重新确认。"
            );
          }
        }
        await this.assertForgetScopesAuthorized({
          tenantRef: input.tenantRef,
          actorRef: input.actorRef,
          allowedCourseRunRefs: input.allowedCourseRunRefs,
          preferences,
          purpose: input.purpose
        });
        const revoked = await this.revokePreferences({
          client,
          writeContext,
          tenantRef: input.tenantRef,
          actorRef: input.actorRef,
          preferences
        });
        const memoryEpochAfter = await repository.getMemoryEpoch({
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef
        });
        return this.forgetResult({
          command,
          status: "revoked",
          safeReasonCode: "explicit_selected_preferences_revoked",
          safeMessage: forgetRevokedMessage(revoked.length),
          targets: command.targets.flatMap((target) => {
            const targetPreferences = revoked.filter((preference) => {
              const activeView = { ...preference, status: "active" as const };
              return explicitForgetTargetMatchesPreference(
                target,
                activeView,
                input.courseRunRef
              );
            });
            return targetPreferences.length > 0
              ? [{
                  ...target,
                  status: "revoked" as const,
                  options: targetPreferences.map(forgetSelectionOption)
                }]
              : [];
          }),
          memoryEpochBefore,
          memoryEpochAfter,
          createdAt: writeContext.createdAt,
          receipts,
          writeContext
        });
      }
    }, ApplyExplicitForgetResultSchema.parse);
  }

  async resolveExplicitForgetOptions(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly preferenceRefs: readonly string[];
  }): Promise<readonly ExplicitForgetSelectionOption[]> {
    this.assertActor(input);
    const preferenceRefs = uniqueText(input.preferenceRefs);
    if (preferenceRefs.length > 10) {
      throw new AuthorizationDeniedError("偏好引用数量超过安全上限。");
    }
    if (preferenceRefs.length === 0) return Object.freeze([]);
    const preferences = await new PostgresMemoryCandidateRepository(this.pool)
      .listPreferences({
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef
      });
    const selected = preferenceRefs.flatMap((preferenceRef) => {
      const preference = preferences.find((entry) =>
        entry.preferenceRef === preferenceRef
      );
      return preference ? [preference] : [];
    });
    if (selected.length !== preferenceRefs.length) {
      throw new NotFoundError("个性化记录不存在。");
    }
    return Object.freeze(selected.map(forgetSelectionOption));
  }

  async confirmCandidateReplacement(input: {
    tenantRef: string;
    actorRef: string;
    candidateRef: string;
    allowedCourseRunRefs: readonly string[];
    request: unknown;
  }) {
    this.assertActor(input);
    const request = ConfirmMemoryCandidateReplacementRequestSchema.parse(
      input.request
    );
    return this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({
        candidateRef: input.candidateRef,
        ...request
      }),
      action: request.purpose,
      resourceRef: input.candidateRef,
      requestedFieldMask: [
        "memoryCandidate.status",
        "teacherPreference.value",
        "teacherPreference.sourceCandidate"
      ],
      operation: async ({ client, writeContext, receipts }) => {
        const repository = new PostgresMemoryCandidateRepository(client);
        const candidate = await repository.getCandidate(input.candidateRef);
        if (
          !candidate ||
          candidate.owner.tenantRef !== input.tenantRef ||
          candidate.owner.teacherRef !== input.actorRef ||
          !candidate.content.conflictPreferenceRef ||
          !candidate.content.proposedScope
        ) {
          throw new NotFoundError("个性化记录不存在。");
        }
        await this.scopeAuthorization.assertAuthorized({
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          scope: candidate.content.proposedScope,
          allowedCourseRunRefs: input.allowedCourseRunRefs,
          purpose: request.purpose
        });
        const result = await this.commandService(
          client,
          writeContext
        ).confirmReplacement({
          candidateRef: candidate.candidateRef,
          preferenceRef: candidate.content.conflictPreferenceRef,
          actorRef: input.actorRef,
          tenantRef: input.tenantRef,
          expectedCandidateVersion: request.expectedCandidateVersion,
          expectedPreferenceVersion: request.expectedPreferenceVersion
        });
        receipts.push(createReceipt({
          writeRef: result.preference.preferenceRef,
          recordType: "ExplicitTeacherPreferenceReplaced",
          metadata: createWriteMetadata(
            writeContext,
            "personalization",
            "explicit-memory-replacement-audit"
          )
        }));
        return ConfirmMemoryCandidateReplacementResultSchema.parse({
          replayed: false,
          candidate: candidateView(result.candidate),
          preference: preferenceView(result.preference)
        });
      }
    }, ConfirmMemoryCandidateReplacementResultSchema.parse);
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

  private requireForgetCommand(command: ForgetCommand): ForgetCommand {
    const parsed = ExplicitTeacherForgetCommandInterpretationSchema.parse(
      command
    );
    if (
      parsed.intent !== "forget" ||
      !parsed.fullCoverage ||
      parsed.residualText !== "" ||
      parsed.targets.length === 0
    ) {
      throw new DomainConflictError(
        "EXPLICIT_FORGET_NOT_ELIGIBLE",
        "该命令未满足安全、确定性的长期偏好撤销条件。"
      );
    }
    return parsed;
  }

  private commandRepository(
    client: PostgresClient,
    writeContext: WriteContext
  ): PostgresMemoryCandidateRepository {
    return new PostgresMemoryCandidateRepository(
      client,
      (suffix) => createWriteMetadata(
        writeContext,
        "personalization",
        `explicit-forget:${suffix}`
      )
    );
  }

  private async assertForgetScopesAuthorized(input: {
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly allowedCourseRunRefs: readonly string[];
    readonly preferences: readonly TeacherPreference[];
    readonly purpose: string;
  }): Promise<void> {
    for (const scope of uniqueScopes(
      input.preferences.map((preference) => preference.scope)
    )) {
      await this.scopeAuthorization.assertAuthorized({
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        scope,
        allowedCourseRunRefs: input.allowedCourseRunRefs,
        purpose: input.purpose
      });
    }
  }

  private async revokePreferences(input: {
    readonly client: PostgresClient;
    readonly writeContext: WriteContext;
    readonly tenantRef: string;
    readonly actorRef: string;
    readonly preferences: readonly TeacherPreference[];
  }): Promise<readonly TeacherPreference[]> {
    const revoked: TeacherPreference[] = [];
    for (const preference of input.preferences) {
      const service = new MemoryCandidateService(
        new PostgresMemoryCandidateRepository(
          input.client,
          (suffix) => createWriteMetadata(
            input.writeContext,
            "personalization",
            `explicit-forget:${preference.preferenceRef}:${suffix}`
          )
        ),
        () => new Date(input.writeContext.createdAt)
      );
      revoked.push(await service.revokePreference({
        preferenceRef: preference.preferenceRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        expectedVersion: preference.version
      }));
    }
    return Object.freeze(revoked);
  }

  private forgetResult(input: {
    readonly command: ForgetCommand;
    readonly status:
      | "revoked"
      | "selection_required"
      | "nothing_to_forget"
      | "rejected";
    readonly safeReasonCode: string;
    readonly safeMessage: string;
    readonly targets: readonly ExplicitForgetReceiptTarget[];
    readonly memoryEpochBefore: number;
    readonly memoryEpochAfter: number;
    readonly createdAt: string;
    readonly receipts: FormalWriteReceipt[];
    readonly writeContext: WriteContext;
  }) {
    const receipt = {
      commandRef:
        `memory-forget-command:${input.command.commandContentHash.slice(0, 32)}`,
      interpreterVersion: input.command.interpreterVersion,
      sourceTurnRef: input.command.sourceTurnRef,
      sourceTurnContentHash: input.command.sourceTurnContentHash,
      status: input.status,
      safeReasonCode: input.safeReasonCode,
      targets: input.targets,
      memoryEpochBefore: input.memoryEpochBefore,
      memoryEpochAfter: input.memoryEpochAfter,
      safeMessage: input.safeMessage,
      createdAt: input.createdAt
    };
    input.receipts.push(createReceipt({
      writeRef: receipt.commandRef,
      recordType: "ExplicitTeacherForgetCommandEvaluated",
      metadata: createWriteMetadata(
        input.writeContext,
        "personalization",
        "explicit-forget-command-audit"
      )
    }));
    return ApplyExplicitForgetResultSchema.parse({
      replayed: false,
      receipt
    });
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
    sourceCommandRef: candidate.content.sourceCommandRef ?? null,
    conflictPreferenceRef: candidate.content.conflictPreferenceRef ?? null,
    conflictPreferenceVersion:
      candidate.content.conflictPreferenceVersion ?? null,
    reviewReason: candidate.content.reviewReason ?? null,
    parsingRuleId: candidate.content.parsingRuleId ?? null,
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

function uniqueScopes(scopes: readonly MemoryScope[]): readonly MemoryScope[] {
  return [...new Map(scopes.map((scope) => [scope.fingerprint, scope])).values()];
}

function forgetSelectionOption(
  preference: TeacherPreference
): ExplicitForgetSelectionOption {
  return Object.freeze({
    preferenceRef: preference.preferenceRef,
    preferenceVersion: preference.version,
    canonicalKey: preference.canonicalKey,
    displayValue: preference.preferenceValue,
    scope: preference.scope,
    validFrom: preference.validFrom,
    validUntil: preference.validUntil,
    currentStatus: preference.status
  });
}

function uniqueText(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort();
}

function forgetRevokedMessage(count: number): string {
  return `已忘掉 ${count} 条偏好。从现在起创建的新备课不会再参考${
    count === 1 ? "这条偏好" : "这些偏好"
  }；历史运行仍会保留当时的使用记录。`;
}

function safeCandidateSummary(
  canonicalKey: string,
  displayValue: string
): string {
  return `${teacherPreferenceCatalogLabel(canonicalKey)}：${displayValue}`;
}

function receiptItem(input: {
  item: {
    canonicalKey: string;
    preferenceKey: string;
    safeDisplayValue: string;
    proposedScope: MemoryScope;
    parsingRuleId: string;
  };
  status: ExplicitRememberCommandItem["status"];
  candidateRef: string | null;
  preference: TeacherPreference | null;
  conflict: TeacherPreference | null;
  safeReasonCode: string;
}): ExplicitRememberCommandItem {
  return Object.freeze({
    canonicalKey: input.item.canonicalKey,
    preferenceKey: input.item.preferenceKey,
    displayValue: input.item.safeDisplayValue,
    previousDisplayValue: input.conflict?.preferenceValue ?? null,
    scope: input.item.proposedScope,
    parsingRuleId: input.item.parsingRuleId,
    status: input.status,
    candidateRef: input.candidateRef,
    preferenceRef: input.preference?.preferenceRef ?? null,
    preferenceVersion: input.preference?.version ?? null,
    conflictPreferenceRef: input.conflict?.preferenceRef ?? null,
    conflictPreferenceVersion: input.conflict?.version ?? null,
    safeReasonCode: input.safeReasonCode
  });
}

function aggregateReceiptStatus(
  items: readonly ExplicitRememberCommandItem[]
): "applied" | "already_remembered" | "review_required" | "mixed" {
  const statuses = new Set(items.map((item) => item.status));
  if (statuses.size !== 1) return "mixed";
  const status = items[0]?.status;
  if (status === "applied" || status === "already_remembered" ||
      status === "review_required") {
    return status;
  }
  return "mixed";
}

function receiptReasonCode(
  status: "applied" | "already_remembered" | "review_required" | "mixed"
): string {
  return {
    applied: "explicit_preferences_applied",
    already_remembered: "explicit_preferences_already_remembered",
    review_required: "explicit_preference_conflict_review_required",
    mixed: "explicit_preferences_mixed_result"
  }[status];
}

function receiptMessage(
  status: "applied" | "already_remembered" | "review_required" | "mixed",
  count: number
): string {
  if (status === "applied") {
    return `已记住 ${count} 条偏好。这些偏好会从下一次备课生成开始生效。`;
  }
  if (status === "already_remembered") {
    return "这些偏好已经记住了，没有重复保存。";
  }
  if (status === "review_required") {
    return "这次偏好与已保存偏好冲突，请明确选择替换原偏好或保留原偏好。";
  }
  return "偏好命令已处理；部分记录已经存在或需要你确认。";
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

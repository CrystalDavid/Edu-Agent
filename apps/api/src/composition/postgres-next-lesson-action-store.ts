import { createHash, randomUUID } from "node:crypto";

import {
  GenerateNextLessonActionsResultSchema,
  NextLessonActionMutationResultSchema,
  type AuthorizationDecision,
  type FormalWriteReceipt,
  type NextLessonActionCandidate
} from "@edu-agent/contracts";
import type { Pool } from "pg";

import type {
  NextLessonActionStore,
  NextLessonOptimizationContext
} from "../modules/agent-runtime-context/application/next-lesson-optimization-service.js";
import { PostgresGate2RuntimeRepository } from "../modules/agent-runtime-context/infrastructure/postgres-gate2-runtime-repository.js";
import { PostgresRuntimeRepository } from "../modules/agent-runtime-context/infrastructure/postgres-runtime-repository.js";
import { PostgresGovernanceRepository } from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import { PostgresNextLessonActionRepository } from "../modules/work-assistant-durable-execution/infrastructure/postgres-next-lesson-action-repository.js";
import { PostgresWorkRepository } from "../modules/work-assistant-durable-execution/infrastructure/postgres-work-repository.js";
import {
  DomainConflictError,
  NotFoundError
} from "../platform/errors.js";
import {
  createReceipt,
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";

export class PostgresNextLessonActionStore implements NextLessonActionStore {
  constructor(
    private readonly pool: Pool,
    private readonly governance = new PostgresGovernanceRepository(),
    private readonly work = new PostgresWorkRepository(),
    private readonly actions = new PostgresNextLessonActionRepository(),
    private readonly runtime = new PostgresRuntimeRepository(),
    private readonly runtimeContext = new PostgresGate2RuntimeRepository(),
    private readonly clock: () => Date = () => new Date()
  ) {}

  async saveGenerated(
    input: Parameters<NextLessonActionStore["saveGenerated"]>[0]
  ) {
    const now = this.clock();
    const nowIso = now.toISOString();
    const rootKey = rootKeyFor(
      input.context.tenantRef,
      input.context.actorRef,
      input.request.purpose,
      input.request.idempotencyKey
    );
    const decisionRef = decisionRefFor(rootKey);
    const writeContext = writeContextFor(
      input.context.actorRef,
      input.request.purpose,
      input.request.idempotencyKey,
      decisionRef,
      nowIso
    );
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000)
      .toISOString();
    const candidates: NextLessonActionCandidate[] = input.output.candidates.map(
      (candidate) => ({
        candidateRef: `next-lesson-action:${randomUUID()}`,
        tenantRef: input.context.tenantRef,
        teacherRef: input.context.actorRef,
        sourceReflectionRef: input.context.reflectionRef,
        sourceReflectionRevisionRef: input.request.reflectionRevisionRef,
        sourceAgentRunRef: input.agentRunRef,
        contextManifestRef: input.contextManifestRef,
        candidateType: candidate.candidateType,
        title: candidate.title,
        reason: candidate.reason,
        confidence: candidate.confidence,
        status: "candidate",
        version: 1,
        targetLessonRef: candidate.targetLessonRef,
        targetRef: null,
        deepLink: null,
        teacherNote: input.request.teacherAdjustment,
        sourceRefs: [...candidate.basisRefs],
        generatedBySkillRef: input.skill.ref,
        expiresAt,
        decidedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso
      })
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(client, {
        idempotencyRef: `idempotency:${sha256(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: input.requestFingerprint,
        metadata: createWriteMetadata(
          writeContext,
          "governance",
          "next-lesson-actions-generate-idempotency"
        )
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return GenerateNextLessonActionsResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }
      const authorization: AuthorizationDecision = {
        decisionRef,
        actorRef: input.context.actorRef,
        tenantRef: input.context.tenantRef,
        purpose: input.request.purpose,
        action: input.request.purpose,
        resourceRef: input.request.reflectionRevisionRef,
        requestedFieldMask: [...input.runtimeContext.manifest.requestedFieldMask],
        effect: "allow",
        reasonCodes: [
          "authenticated-teacher",
          "confirmed-reflection-required",
          "authorized-evidence-only",
          "candidate-only",
          "teacher-final-control"
        ],
        policyVersion: "policy:next-lesson-adjustment-context@1",
        decidedAt: nowIso
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision: authorization,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "next-lesson-actions-generate-authorization"
          )
        }),
        await this.work.insertQueryRun(client, {
          queryRunRef: input.queryRunRef,
          queryName: "next-lesson-adjustment",
          status: "completed",
          resourceRef: input.request.reflectionRevisionRef,
          requestedFieldMask: input.runtimeContext.manifest.requestedFieldMask,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "next-lesson-actions-query-run"
          )
        })
      ];
      receipts.push(
        ...(await this.runtime.insertAgentRunBundle(client, {
          agentRun: {
            agentRunRef: input.agentRunRef,
            runKind: "QueryRun",
            boundRunRef: input.queryRunRef,
            status: "completed",
            modelProvider: "none",
            modelProfile: "deterministic-next-lesson-adjustment@1",
            toolName: "none",
            output: {
              kind: "next_lesson_action_candidates",
              tenantRef: input.context.tenantRef,
              reflectionRef: input.context.reflectionRef,
              reflectionRevisionRef: input.request.reflectionRevisionRef,
              targetLessonRef: input.request.targetLessonRef,
              runtimeStatus: "waiting_for_human",
              skill: input.skill,
              contextManifestHash: input.runtimeContext.manifest.contentHash,
              evaluation: input.evaluation,
              candidateRefs: candidates.map((candidate) => candidate.candidateRef)
            },
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "next-lesson-actions-agent-run"
            )
          },
          manifest: {
            manifestRef: `run-manifest:${randomUUID()}`,
            agentRunRef: input.agentRunRef,
            contextManifestRef: input.contextManifestRef,
            promptVersionRef:
              `${input.skill.promptBundleRef}@${input.skill.promptBundleVersion}`,
            policyVersionRef: "next-lesson-adjustment-context@1",
            capabilityRefs: [input.skill.ref],
            contextRefs: input.runtimeContext.manifest.resourceRefs,
            contentHash: sha256({
              skill: input.skill,
              contextManifestHash: input.runtimeContext.manifest.contentHash,
              candidateRefs: candidates.map((candidate) => candidate.candidateRef)
            }),
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "next-lesson-actions-run-manifest"
            )
          },
          outbox: {
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "NextLessonActionCandidatesGenerated",
            aggregateRef: input.agentRunRef,
            payload: {
              reflectionRef: input.context.reflectionRef,
              reflectionRevisionRef: input.request.reflectionRevisionRef,
              skillRef: input.skill.ref,
              candidateRefs: candidates.map((candidate) => candidate.candidateRef),
              candidateOnly: true
            },
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "next-lesson-actions-agent-run-outbox"
            )
          }
        }))
      );
      const learningObjectiveRefs = [
        ...input.runtimeContext.input.targetLesson.learningObjectiveRefs,
        ...input.runtimeContext.input.sourceLesson.learningObjectiveRefs
      ];
      receipts.push(
        await this.runtimeContext.insertContextManifest(client, {
          contextManifestRef: input.contextManifestRef,
          agentRunRef: input.agentRunRef,
          resourceRefs: input.runtimeContext.manifest.resourceRefs,
          evidenceRefs: input.runtimeContext.manifest.evidenceRefs,
          unknowns: [
            ...input.runtimeContext.manifest.missingInformation,
            ...input.runtimeContext.manifest.excludedInformation
          ],
          requestedFieldMask: input.runtimeContext.manifest.requestedFieldMask,
          taskRef: input.queryRunRef,
          requestSummary: {
            requestText:
              input.request.teacherAdjustment ?? "生成下一课优化行动候选",
            actorRef: input.context.actorRef,
            purpose: input.request.purpose,
            courseRunRef: input.runtimeContext.input.sourceLesson.courseRunRef,
            learningObjectiveRefs:
              learningObjectiveRefs.length > 0
                ? [...new Set(learningObjectiveRefs)]
                : [input.runtimeContext.input.targetLesson.lessonRef],
            selectedEvidenceRefs: [...input.runtimeContext.manifest.evidenceRefs],
            lessonRef: input.request.targetLessonRef,
            createdAt: nowIso,
            requestVersion: 1
          },
          metadata: createWriteMetadata(
            writeContext,
            "runtime",
            "next-lesson-actions-context-manifest"
          )
        })
      );
      for (const [index, candidate] of candidates.entries()) {
        receipts.push(...await this.actions.insertCandidate(client, {
          candidate,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            `next-lesson-action-candidate-${index + 1}`
          ),
          historyRef: `next-lesson-action-history:${randomUUID()}`,
          historyMetadata: createWriteMetadata(
            writeContext,
            "work",
            `next-lesson-action-history-created-${index + 1}`
          )
        }));
      }
      receipts.push(await this.actions.insertOutbox(client, {
        outboxRef: `outbox:${randomUUID()}`,
        eventName: "NextLessonActionCandidatesProjected",
        aggregateRef: input.context.reflectionRef,
        payload: {
          reflectionRevisionRef: input.request.reflectionRevisionRef,
          candidateRefs: candidates.map((candidate) => candidate.candidateRef)
        },
        metadata: createWriteMetadata(
          writeContext,
          "work",
          "next-lesson-actions-work-outbox"
        )
      }));
      const result = GenerateNextLessonActionsResultSchema.parse({
        replayed: false,
        agentRunRef: input.agentRunRef,
        contextManifestRef: input.contextManifestRef,
        skillRef: input.skill.ref,
        items: candidates
      });
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: nowIso
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

  list(context: NextLessonOptimizationContext) {
    return this.actions.listByReflection(this.pool, {
      tenantRef: context.tenantRef,
      teacherRef: context.actorRef,
      reflectionRef: context.reflectionRef
    });
  }

  async get(input: {
    tenantRef: string;
    actorRef: string;
    candidateRef: string;
  }) {
    const candidate = await this.actions.get(this.pool, {
      tenantRef: input.tenantRef,
      teacherRef: input.actorRef,
      candidateRef: input.candidateRef
    });
    if (!candidate) {
      throw new NotFoundError("下一课行动候选不存在或不属于当前工作空间。");
    }
    return candidate;
  }

  update(input: Parameters<NextLessonActionStore["update"]>[0]) {
    return this.mutate({
      ...input,
      changeKind: "updated",
      eventName: "NextLessonActionCandidateUpdated",
      next: (current, now) => ({
        title: input.request.title,
        reason: input.request.reason,
        targetLessonRef: input.request.targetLessonRef,
        targetRef: null,
        deepLink: null,
        teacherNote: input.request.teacherNote,
        status: "candidate" as const,
        decidedAt: null,
        updatedAt: now
      })
    });
  }

  reject(input: Parameters<NextLessonActionStore["reject"]>[0]) {
    return this.mutate({
      ...input,
      changeKind: "rejected",
      eventName: "NextLessonActionCandidateRejected",
      next: (current, now) => ({
        title: current.title,
        reason: current.reason,
        targetLessonRef: current.targetLessonRef,
        targetRef: null,
        deepLink: null,
        teacherNote: input.request.reason ?? current.teacherNote,
        status: "rejected" as const,
        decidedAt: now,
        updatedAt: now
      })
    });
  }

  accept(input: Parameters<NextLessonActionStore["accept"]>[0]) {
    return this.mutate({
      ...input,
      changeKind: "accepted",
      eventName: "NextLessonActionCandidateAccepted",
      allowAcceptedReplay: true,
      next: (current, now) => ({
        title: current.title,
        reason: current.reason,
        targetLessonRef: current.targetLessonRef,
        targetRef: input.target.targetRef,
        deepLink: input.target.deepLink,
        teacherNote: current.teacherNote,
        status: "accepted" as const,
        decidedAt: now,
        updatedAt: now
      })
    });
  }

  private async mutate(input: {
    tenantRef: string;
    actorRef: string;
    candidateRef: string;
    request: { expectedVersion: number; purpose: string; idempotencyKey: string };
    requestFingerprint: string;
    changeKind: "updated" | "accepted" | "rejected" | "expired";
    eventName: string;
    allowAcceptedReplay?: boolean;
    next: (
      current: NextLessonActionCandidate,
      now: string
    ) => Parameters<PostgresNextLessonActionRepository["update"]>[1]["next"];
  }) {
    const now = this.clock().toISOString();
    const rootKey = rootKeyFor(
      input.tenantRef,
      input.actorRef,
      input.request.purpose,
      input.request.idempotencyKey
    );
    const decisionRef = decisionRefFor(rootKey);
    const writeContext = writeContextFor(
      input.actorRef,
      input.request.purpose,
      input.request.idempotencyKey,
      decisionRef,
      now
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(client, {
        idempotencyRef: `idempotency:${sha256(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: input.requestFingerprint,
        metadata: createWriteMetadata(
          writeContext,
          "governance",
          `next-lesson-action-${input.changeKind}-idempotency`
        )
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return NextLessonActionMutationResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }
      const current = await this.actions.get(client, {
        tenantRef: input.tenantRef,
        teacherRef: input.actorRef,
        candidateRef: input.candidateRef
      }, true);
      if (!current) {
        throw new NotFoundError("下一课行动候选不存在或不属于当前工作空间。");
      }
      if (
        input.allowAcceptedReplay &&
        current.status === "accepted" &&
        current.targetRef &&
        current.deepLink
      ) {
        const replay = NextLessonActionMutationResultSchema.parse({
          replayed: true,
          candidate: current
        });
        await this.governance.completeIdempotency(client, {
          rootKey,
          result: replay,
          completedAt: now
        });
        await this.governance.saveAudits(client, [reservation.receipt!]);
        await client.query("COMMIT");
        return replay;
      }
      if (current.status !== "candidate") {
        throw new DomainConflictError(
          "NEXT_LESSON_ACTION_ALREADY_DECIDED",
          "该下一课行动候选已经由教师处置。"
        );
      }
      if (current.version !== input.request.expectedVersion) {
        throw new DomainConflictError(
          "NEXT_LESSON_ACTION_VERSION_CONFLICT",
          "行动候选已变化，请刷新后再操作。",
          { currentVersion: current.version }
        );
      }
      if (current.expiresAt && new Date(current.expiresAt).getTime() <= Date.now()) {
        throw new DomainConflictError(
          "NEXT_LESSON_ACTION_EXPIRED",
          "该行动候选已过期，请重新生成。"
        );
      }
      const authorization: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: input.request.purpose,
        action: input.request.purpose,
        resourceRef: input.candidateRef,
        requestedFieldMask: [
          "nextLessonAction.teacherDecision",
          ...(input.changeKind === "accepted" ? ["followUp.formalTarget"] : [])
        ],
        effect: "allow",
        reasonCodes: [
          "authenticated-teacher",
          "candidate-owner",
          "expected-version-matched",
          "teacher-final-control"
        ],
        policyVersion: "policy:next-lesson-action-decision@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision: authorization,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            `next-lesson-action-${input.changeKind}-authorization`
          )
        })
      ];
      const candidate = await this.actions.update(client, {
        current,
        next: input.next(current, now),
        historyRef: `next-lesson-action-history:${randomUUID()}`,
        changeKind: input.changeKind,
        historyMetadata: createWriteMetadata(
          writeContext,
          "work",
          `next-lesson-action-${input.changeKind}-history`
        )
      });
      if (!candidate) {
        throw new DomainConflictError(
          "NEXT_LESSON_ACTION_VERSION_CONFLICT",
          "行动候选已变化，请刷新后再操作。"
        );
      }
      receipts.push(createReceipt({
        writeRef: candidate.candidateRef,
        recordType: "NextLessonActionCandidateDecision",
        metadata: createWriteMetadata(
          writeContext,
          "work",
          `next-lesson-action-${input.changeKind}-candidate`
        )
      }));
      receipts.push(await this.actions.insertOutbox(client, {
        outboxRef: `outbox:${randomUUID()}`,
        eventName: input.eventName,
        aggregateRef: candidate.candidateRef,
        payload: {
          sourceReflectionRef: candidate.sourceReflectionRef,
          sourceReflectionRevisionRef: candidate.sourceReflectionRevisionRef,
          candidateType: candidate.candidateType,
          status: candidate.status,
          targetRef: candidate.targetRef
        },
        metadata: createWriteMetadata(
          writeContext,
          "work",
          `next-lesson-action-${input.changeKind}-outbox`
        )
      }));
      const result = NextLessonActionMutationResultSchema.parse({
        replayed: false,
        candidate
      });
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
      throw error;
    } finally {
      client.release();
    }
  }
}

function rootKeyFor(
  tenantRef: string,
  actorRef: string,
  purpose: string,
  idempotencyKey: string
) {
  return [tenantRef, actorRef, purpose, idempotencyKey].join("|");
}

function decisionRefFor(rootKey: string) {
  return `authorization-decision:${sha256(rootKey).slice(0, 32)}`;
}

function writeContextFor(
  actorRef: string,
  purpose: string,
  idempotencyKey: string,
  authorizationDecisionRef: string,
  createdAt: string
): WriteContext {
  return {
    actorRef,
    purpose,
    rootIdempotencyKey: idempotencyKey,
    authorizationDecisionRef,
    createdAt
  };
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

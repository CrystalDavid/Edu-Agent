import { createHash, randomUUID } from "node:crypto";

import {
  DecideLessonBriefResultSchema,
  GenerateLessonBriefResultSchema,
  LessonBriefSnapshotSchema,
  type AuthorizationDecision,
  type FormalWriteReceipt,
  type LessonBriefSnapshot
} from "@edu-agent/contracts";
import type { Pool } from "pg";

import type {
  LessonBriefContext,
  LessonBriefRunStore
} from "../modules/agent-runtime-context/application/lesson-brief-service.js";
import { PostgresRuntimeRepository } from "../modules/agent-runtime-context/infrastructure/postgres-runtime-repository.js";
import { PostgresGate2RuntimeRepository } from "../modules/agent-runtime-context/infrastructure/postgres-gate2-runtime-repository.js";
import { PostgresGovernanceRepository } from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import { PostgresGate25WorkRepository } from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-5-work-repository.js";
import { PostgresWorkRepository } from "../modules/work-assistant-durable-execution/infrastructure/postgres-work-repository.js";
import {
  AuthorizationDeniedError,
  DomainConflictError,
  NotFoundError
} from "../platform/errors.js";
import {
  createReceipt,
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";

export class PostgresLessonBriefStore implements LessonBriefRunStore {
  constructor(
    private readonly pool: Pool,
    private readonly governance = new PostgresGovernanceRepository(),
    private readonly work = new PostgresWorkRepository(),
    private readonly preparation = new PostgresGate25WorkRepository(),
    private readonly runtime = new PostgresRuntimeRepository(),
    private readonly runtimeContext = new PostgresGate2RuntimeRepository(),
    private readonly clock: () => Date = () => new Date()
  ) {}

  async getLatest(context: LessonBriefContext): Promise<LessonBriefSnapshot | null> {
    const result = await this.pool.query<{ lesson_brief: unknown }>(
      `SELECT output -> 'lessonBrief' AS lesson_brief
         FROM runtime.agent_run
        WHERE actor_ref = $1
          AND output ->> 'kind' = 'lesson_brief_candidate'
          AND output ->> 'tenantRef' = $2
          AND output ->> 'lessonRef' = $3
        ORDER BY created_at DESC
        LIMIT 1`,
      [context.actorRef, context.tenantRef, context.lessonRef]
    );
    const value = result.rows[0]?.lesson_brief;
    return value ? LessonBriefSnapshotSchema.parse(value) : null;
  }

  async saveGenerated(
    input: Parameters<LessonBriefRunStore["saveGenerated"]>[0]
  ) {
    const now = this.clock().toISOString();
    const rootKey = [
      input.context.tenantRef,
      input.context.actorRef,
      input.request.purpose,
      input.request.idempotencyKey
    ].join("|");
    const decisionRef = `authorization-decision:${sha256(rootKey).slice(0, 32)}`;
    const writeContext: WriteContext = {
      actorRef: input.context.actorRef,
      purpose: input.request.purpose,
      rootIdempotencyKey: input.request.idempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt: now
    };
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
          "lesson-brief-generate-idempotency"
        )
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return GenerateLessonBriefResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.context.actorRef,
        tenantRef: input.context.tenantRef,
        purpose: input.request.purpose,
        action: input.request.purpose,
        resourceRef: input.context.lessonRef,
        requestedFieldMask: [...input.contextManifest.requestedFieldMask],
        effect: "allow",
        reasonCodes: [
          "authenticated-teacher",
          "authorized-lesson-scope",
          "candidate-only",
          "no-platform-write"
        ],
        policyVersion: "policy:lesson-analysis-context@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "lesson-brief-generate-authorization"
          )
        })
      ];
      receipts.push(
        await this.work.insertQueryRun(client, {
          queryRunRef: input.queryRunRef,
          queryName: "lesson-analysis",
          status: "completed",
          resourceRef: input.context.lessonRef,
          requestedFieldMask: input.contextManifest.requestedFieldMask,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "lesson-brief-query-run"
          )
        })
      );
      const runtimeOutput = {
        kind: "lesson_brief_candidate",
        tenantRef: input.context.tenantRef,
        lessonRef: input.context.lessonRef,
        runtimeStatus: "waiting_for_human",
        skill: input.skill,
        contextManifestHash: input.contextManifest.contentHash,
        evaluation: input.evaluation,
        lessonBrief: input.brief
      };
      receipts.push(
        ...(await this.runtime.insertAgentRunBundle(client, {
          agentRun: {
            agentRunRef: input.agentRunRef,
            runKind: "QueryRun",
            boundRunRef: input.queryRunRef,
            status: "completed",
            modelProvider: "none",
            modelProfile: "deterministic-lesson-analysis@1",
            toolName: "none",
            output: runtimeOutput,
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "lesson-brief-agent-run"
            )
          },
          manifest: {
            manifestRef: `run-manifest:${randomUUID()}`,
            agentRunRef: input.agentRunRef,
            contextManifestRef: input.contextManifestRef,
            promptVersionRef: `${input.skill.promptBundleRef}@${input.skill.promptBundleVersion}`,
            policyVersionRef: "lesson-analysis-context@1",
            capabilityRefs: [input.skill.ref],
            contextRefs: input.contextManifest.resourceRefs,
            contentHash: sha256({
              skill: input.skill,
              contextManifestHash: input.contextManifest.contentHash,
              outputHash: input.brief.contentHash
            }),
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "lesson-brief-run-manifest"
            )
          },
          outbox: {
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "LessonBriefCandidateGenerated",
            aggregateRef: input.agentRunRef,
            payload: {
              lessonRef: input.context.lessonRef,
              skillRef: input.skill.ref,
              contextManifestHash: input.contextManifest.contentHash,
              outputHash: input.brief.contentHash,
              candidateOnly: true
            },
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "lesson-brief-agent-run-outbox"
            )
          }
        }))
      );
      receipts.push(
        await this.runtimeContext.insertContextManifest(client, {
          contextManifestRef: input.contextManifestRef,
          agentRunRef: input.agentRunRef,
          resourceRefs: input.contextManifest.resourceRefs,
          evidenceRefs: input.contextManifest.evidenceRefs,
          unknowns: [
            ...input.contextManifest.missingInformation,
            ...input.contextManifest.excludedInformation
          ],
          requestedFieldMask: input.contextManifest.requestedFieldMask,
          taskRef: input.queryRunRef,
          requestSummary: {
            requestText:
              input.request.teacherAdjustment ?? "生成当前课时教学洞察候选",
            actorRef: input.context.actorRef,
            purpose: input.request.purpose,
            courseRunRef: input.requestSummary.courseRunRef,
            learningObjectiveRefs: [...input.requestSummary.learningObjectiveRefs],
            selectedEvidenceRefs: [...input.contextManifest.evidenceRefs],
            lessonRef: input.context.lessonRef,
            createdAt: now,
            requestVersion: 1
          },
          metadata: createWriteMetadata(
            writeContext,
            "runtime",
            "lesson-brief-context-manifest"
          )
        })
      );
      const result = GenerateLessonBriefResultSchema.parse({
        replayed: false,
        brief: input.brief
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

  async decide(input: Parameters<LessonBriefRunStore["decide"]>[0]) {
    const now = this.clock().toISOString();
    const rootKey = [
      input.context.tenantRef,
      input.context.actorRef,
      input.request.purpose,
      input.request.idempotencyKey
    ].join("|");
    const decisionRef = `authorization-decision:${sha256(rootKey).slice(0, 32)}`;
    const writeContext: WriteContext = {
      actorRef: input.context.actorRef,
      purpose: input.request.purpose,
      rootIdempotencyKey: input.request.idempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt: now
    };
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
          "lesson-brief-decision-idempotency"
        )
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return DecideLessonBriefResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }
      const run = await client.query<{
        output: Record<string, unknown>;
      }>(
        `SELECT output
           FROM runtime.agent_run
          WHERE agent_run_ref = $1
            AND actor_ref = $2
          FOR UPDATE`,
        [input.agentRunRef, input.context.actorRef]
      );
      const output = run.rows[0]?.output;
      if (
        !output ||
        output["kind"] !== "lesson_brief_candidate" ||
        output["tenantRef"] !== input.context.tenantRef ||
        output["lessonRef"] !== input.context.lessonRef
      ) {
        throw new NotFoundError("Lesson Brief 候选不存在或不属于当前工作空间。");
      }
      const current = LessonBriefSnapshotSchema.parse(output["lessonBrief"]);
      if (current.contentHash !== input.request.expectedContentHash) {
        throw new DomainConflictError(
          "LESSON_BRIEF_VERSION_CONFLICT",
          "Lesson Brief 已变化，请刷新后再操作。"
        );
      }
      if (current.disposition) {
        throw new DomainConflictError(
          "LESSON_BRIEF_ALREADY_DECIDED",
          "该 Lesson Brief 已经由教师处置。"
        );
      }
      const allCandidateIds = new Set([
        ...current.teachingFocusCandidates,
        ...current.difficultyCandidates,
        ...current.suggestedAttentionPoints
      ].map((candidate) => candidate.candidateId));
      const selectedCandidateIds = input.request.action === "adopt"
        ? input.request.selectedCandidateIds.length > 0
          ? [...new Set(input.request.selectedCandidateIds)]
          : [...allCandidateIds]
        : [];
      if (selectedCandidateIds.some((id) => !allCandidateIds.has(id))) {
        throw new AuthorizationDeniedError(
          "采用请求包含不属于当前 Lesson Brief 的候选项。"
        );
      }
      let workingSet: {
        taskRef: string;
        version: number;
        sourceResourceRefs: string[];
      } | null = null;
      const receipts: FormalWriteReceipt[] = [reservation.receipt!];
      if (input.request.action === "adopt") {
        if (
          !input.request.preparationTaskRef ||
          input.request.expectedWorkingSetVersion === null
        ) {
          throw new DomainConflictError(
            "LESSON_BRIEF_TASK_REQUIRED",
            "采用教学洞察前需要一个当前课时的备课任务。"
          );
        }
        const task = await this.preparation.lockPreparationTask(
          client,
          input.context.tenantRef,
          input.request.preparationTaskRef,
          input.context.actorRef
        );
        if (!task || task.lessonRef !== input.context.lessonRef) {
          throw new NotFoundError("备课任务不存在或不属于当前课时。");
        }
        if (task.workingSet.version !== input.request.expectedWorkingSetVersion) {
          throw new DomainConflictError(
            "TASK_WORKING_SET_VERSION_CONFLICT",
            "备课上下文已变化，请刷新后再采用。"
          );
        }
        const briefRef = `lesson-brief-run:${input.agentRunRef}`;
        const refs = [...new Set([
          ...(task.workingSet.sourceResourceRefs ?? []),
          briefRef
        ])];
        const changed = await this.preparation.replaceWorkingSetSourceResources(
          client,
          {
            taskRef: task.taskRef,
            expectedVersion: task.workingSet.version,
            sourceResourceRefs: refs,
            revisionRef: `working-set-revision:${randomUUID()}`,
            metadata: createWriteMetadata(
              writeContext,
              "work",
              "lesson-brief-working-set-source"
            )
          }
        );
        receipts.push(changed.receipt);
        workingSet = {
          taskRef: changed.workingSet.taskRef,
          version: changed.workingSet.version,
          sourceResourceRefs: [...(changed.workingSet.sourceResourceRefs ?? [])]
        };
      }
      const brief = LessonBriefSnapshotSchema.parse({
        ...current,
        status: input.request.action === "adopt" ? "adopted" : "deferred",
        disposition: {
          action: input.request.action === "adopt" ? "adopted" : "deferred",
          selectedCandidateIds,
          teacherRef: input.context.actorRef,
          taskRef: input.request.action === "adopt"
            ? input.request.preparationTaskRef
            : null,
          decidedAt: now
        }
      });
      const authorization: AuthorizationDecision = {
        decisionRef,
        actorRef: input.context.actorRef,
        tenantRef: input.context.tenantRef,
        purpose: input.request.purpose,
        action: input.request.action,
        resourceRef: input.agentRunRef,
        requestedFieldMask: input.request.action === "adopt"
          ? ["runtime.lessonBrief.disposition", "taskWorkingSet.sourceResourceRefs"]
          : ["runtime.lessonBrief.disposition"],
        effect: "allow",
        reasonCodes: ["authenticated-teacher", "teacher-final-control"],
        policyVersion: "policy:lesson-brief-decision@1",
        decidedAt: now
      };
      receipts.push(
        await this.governance.saveDecision(client, {
          decision: authorization,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "lesson-brief-decision-authorization"
          )
        })
      );
      await this.runtime.updateAgentRunStatus(client, {
        agentRunRef: input.agentRunRef,
        status: "completed",
        output: {
          ...output,
          runtimeStatus: input.request.action === "adopt" ? "succeeded" : "cancelled",
          lessonBrief: brief
        },
        updatedAt: now
      });
      receipts.push(createReceipt({
        writeRef: input.agentRunRef,
        recordType: "AgentRunLessonBriefDisposition",
        metadata: createWriteMetadata(
          writeContext,
          "runtime",
          "lesson-brief-disposition"
        )
      }));
      const result = DecideLessonBriefResultSchema.parse({
        replayed: false,
        brief,
        workingSet
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

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

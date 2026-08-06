import { createHash, randomUUID } from "node:crypto";

import {
  MaterialContentDraftSchema,
  type AuthorizationDecision,
  type FormalWriteReceipt
} from "@edu-agent/contracts";
import type { Pool } from "pg";

import type { MaterialGenerationRunStore } from "../modules/agent-runtime-context/application/material-generation-service.js";
import { PostgresGate2RuntimeRepository } from "../modules/agent-runtime-context/infrastructure/postgres-gate2-runtime-repository.js";
import { PostgresRuntimeRepository } from "../modules/agent-runtime-context/infrastructure/postgres-runtime-repository.js";
import { PostgresGovernanceRepository } from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import { PostgresWorkRepository } from "../modules/work-assistant-durable-execution/infrastructure/postgres-work-repository.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";

export class PostgresMaterialGenerationStore
  implements MaterialGenerationRunStore
{
  constructor(
    private readonly pool: Pool,
    private readonly governance = new PostgresGovernanceRepository(),
    private readonly work = new PostgresWorkRepository(),
    private readonly runtime = new PostgresRuntimeRepository(),
    private readonly runtimeContext = new PostgresGate2RuntimeRepository(),
    private readonly clock: () => Date = () => new Date()
  ) {}

  async saveGenerated(
    input: Parameters<MaterialGenerationRunStore["saveGenerated"]>[0]
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
          "material-generation-idempotency"
        )
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return parseStoredResult(reservation.result, true);
      }
      const authorization: AuthorizationDecision = {
        decisionRef,
        actorRef: input.context.actorRef,
        tenantRef: input.context.tenantRef,
        purpose: input.request.purpose,
        action: input.request.purpose,
        resourceRef: input.context.lessonRef,
        requestedFieldMask: [...input.runtimeContext.manifest.requestedFieldMask],
        effect: "allow",
        reasonCodes: [
          "authenticated-teacher",
          "current-approved-teaching-plan",
          "authorized-context-only",
          "draft-only"
        ],
        policyVersion: "policy:material-generation-context@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision: authorization,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "material-generation-authorization"
          )
        })
      ];
      receipts.push(
        await this.work.insertQueryRun(client, {
          queryRunRef: input.queryRunRef,
          queryName: "material-generation",
          status: "completed",
          resourceRef: input.context.lessonRef,
          requestedFieldMask: input.runtimeContext.manifest.requestedFieldMask,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "material-generation-query-run"
          )
        })
      );
      const runtimeOutput = {
        kind: "material_content_draft",
        tenantRef: input.context.tenantRef,
        lessonRef: input.context.lessonRef,
        teachingPlanRevisionRef:
          input.runtimeContext.input.approvedTeachingPlan.revisionRef,
        runtimeStatus: "waiting_for_human",
        skill: input.skill,
        contextManifestHash: input.runtimeContext.manifest.contentHash,
        evaluation: input.evaluation,
        drafts: input.drafts
      };
      receipts.push(
        ...(await this.runtime.insertAgentRunBundle(client, {
          agentRun: {
            agentRunRef: input.agentRunRef,
            runKind: "QueryRun",
            boundRunRef: input.queryRunRef,
            status: "completed",
            modelProvider: "none",
            modelProfile: "deterministic-material-generation@1",
            toolName: "none",
            output: runtimeOutput,
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "material-generation-agent-run"
            )
          },
          manifest: {
            manifestRef: `run-manifest:${randomUUID()}`,
            agentRunRef: input.agentRunRef,
            contextManifestRef: input.contextManifestRef,
            promptVersionRef:
              `${input.skill.promptBundleRef}@${input.skill.promptBundleVersion}`,
            policyVersionRef: "material-generation-context@1",
            capabilityRefs: [input.skill.ref],
            contextRefs: input.runtimeContext.manifest.resourceRefs,
            contentHash: sha256({
              skill: input.skill,
              contextManifestHash: input.runtimeContext.manifest.contentHash,
              drafts: input.drafts
            }),
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "material-generation-run-manifest"
            )
          },
          outbox: {
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "MaterialContentDraftGenerated",
            aggregateRef: input.agentRunRef,
            payload: {
              lessonRef: input.context.lessonRef,
              teachingPlanRevisionRef:
                input.runtimeContext.input.approvedTeachingPlan.revisionRef,
              skillRef: input.skill.ref,
              contextManifestHash: input.runtimeContext.manifest.contentHash,
              kinds: input.drafts.map((draft) => draft.kind),
              candidateOnly: true
            },
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "material-generation-outbox"
            )
          }
        }))
      );
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
              input.request.teacherAdjustment ??
              `生成教学材料：${input.request.kinds.join("、")}`,
            actorRef: input.context.actorRef,
            purpose: input.request.purpose,
            courseRunRef: input.runtimeContext.input.lesson.courseRunRef,
            learningObjectiveRefs:
              [...input.runtimeContext.input.lesson.learningObjectiveRefs],
            selectedEvidenceRefs: [...input.runtimeContext.manifest.evidenceRefs],
            curriculumUnitRef: input.runtimeContext.input.lesson.unitRef,
            lessonRef: input.context.lessonRef,
            baselineTeachingPlanRef:
              input.runtimeContext.input.approvedTeachingPlan.revisionRef,
            createdAt: now,
            requestVersion: 1
          },
          metadata: createWriteMetadata(
            writeContext,
            "runtime",
            "material-generation-context-manifest"
          )
        })
      );
      const result = {
        agentRunRef: input.agentRunRef,
        contextManifestRef: input.contextManifestRef,
        contextManifestHash: input.runtimeContext.manifest.contentHash,
        drafts: input.drafts
      };
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: now
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return { replayed: false, ...result };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function parseStoredResult(
  value: Record<string, unknown> | undefined,
  replayed: boolean
) {
  if (!value) throw new Error("Material generation replay result is missing.");
  const agentRunRef = String(value["agentRunRef"] ?? "");
  const contextManifestRef = String(value["contextManifestRef"] ?? "");
  const contextManifestHash = String(value["contextManifestHash"] ?? "");
  if (!agentRunRef || !contextManifestRef || contextManifestHash.length < 16) {
    throw new Error("Material generation replay result is invalid.");
  }
  return {
    replayed,
    agentRunRef,
    contextManifestRef,
    contextManifestHash,
    drafts: MaterialContentDraftSchema.array().parse(value["drafts"])
  };
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

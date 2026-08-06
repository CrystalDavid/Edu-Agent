import { createHash, randomUUID } from "node:crypto";

import {
  ClassroomFeedbackRunViewSchema,
  type AuthorizationDecision,
  type FormalWriteReceipt
} from "@edu-agent/contracts";
import type { Pool } from "pg";

import { ClassroomReflectionSkillOutputSchema } from "../agent/skills/classroom-reflection/output-schema.js";
import type {
  ClassroomFeedbackRunStore
} from "../modules/agent-runtime-context/application/classroom-feedback-service.js";
import { PostgresGate2RuntimeRepository } from "../modules/agent-runtime-context/infrastructure/postgres-gate2-runtime-repository.js";
import { PostgresRuntimeRepository } from "../modules/agent-runtime-context/infrastructure/postgres-runtime-repository.js";
import { PostgresGovernanceRepository } from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import { PostgresWorkRepository } from "../modules/work-assistant-durable-execution/infrastructure/postgres-work-repository.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";

type Clock = () => Date;

export class PostgresClassroomFeedbackRunStore
  implements ClassroomFeedbackRunStore
{
  private readonly governance = new PostgresGovernanceRepository();
  private readonly work = new PostgresWorkRepository();
  private readonly runtime = new PostgresRuntimeRepository();
  private readonly gate2Runtime = new PostgresGate2RuntimeRepository();

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = () => new Date()
  ) {}

  async saveClassroomFeedback(
    input: Parameters<ClassroomFeedbackRunStore["saveClassroomFeedback"]>[0]
  ) {
    const now = this.clock().toISOString();
    const rootKey = [
      input.context.tenantRef,
      input.context.actorRef,
      input.request.purpose,
      input.request.idempotencyKey
    ].join("|");
    const decisionRef = `authorization-decision:${hash(rootKey).slice(0, 32)}`;
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
        idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: input.requestFingerprint,
        metadata: createWriteMetadata(
          writeContext,
          "governance",
          "classroom-feedback-idempotency"
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
        requestedFieldMask: [
          ...input.runtimeContext.manifest.requestedFieldMask
        ],
        effect: "allow",
        reasonCodes: [
          "authenticated-teacher",
          "current-approved-teaching-plan",
          "authorized-context-only",
          "delivery-draft-only",
          "teacher-confirmation-required"
        ],
        policyVersion: "policy:classroom-reflection-context@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision: authorization,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "classroom-feedback-authorization"
          )
        })
      ];
      receipts.push(
        await this.work.insertQueryRun(client, {
          queryRunRef: input.queryRunRef,
          queryName: "classroom-feedback",
          status: "completed",
          resourceRef: input.context.lessonRef,
          requestedFieldMask:
            input.runtimeContext.manifest.requestedFieldMask,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "classroom-feedback-query-run"
          )
        })
      );
      const view = ClassroomFeedbackRunViewSchema.parse({
        agentRunRef: input.agentRunRef,
        contextManifestRef: input.contextManifestRef,
        contextManifestHash: input.runtimeContext.manifest.contentHash,
        skillRef: input.skill.ref,
        lessonRef: input.context.lessonRef,
        teachingPlanRevisionRef:
          input.runtimeContext.input.approvedTeachingPlan.revisionRef,
        deliverySummary: input.output.deliverySummary,
        observationCandidates: input.output.observationCandidates,
        reflectionInput: input.output.reflectionInput,
        knownGaps: input.output.knownGaps,
        createdAt: now
      });
      const runtimeOutput = {
        kind: "classroom_delivery_draft",
        tenantRef: input.context.tenantRef,
        runtimeStatus: "waiting_for_human",
        skill: input.skill,
        evaluation: input.evaluation,
        ...view,
        deliveryDraft: input.output.deliveryDraft,
        schemaVersion: input.output.schemaVersion
      };
      receipts.push(
        ...(await this.runtime.insertAgentRunBundle(client, {
          agentRun: {
            agentRunRef: input.agentRunRef,
            runKind: "QueryRun",
            boundRunRef: input.queryRunRef,
            status: "completed",
            modelProvider: "none",
            modelProfile: "deterministic-classroom-reflection@1",
            toolName: "none",
            output: runtimeOutput,
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "classroom-feedback-agent-run"
            )
          },
          manifest: {
            manifestRef: `run-manifest:${randomUUID()}`,
            agentRunRef: input.agentRunRef,
            contextManifestRef: input.contextManifestRef,
            promptVersionRef:
              `${input.skill.promptBundleRef}@${input.skill.promptBundleVersion}`,
            policyVersionRef: "classroom-reflection-context@1",
            capabilityRefs: [input.skill.ref],
            contextRefs: input.runtimeContext.manifest.resourceRefs,
            contentHash: hash({
              skill: input.skill,
              contextManifestHash: input.runtimeContext.manifest.contentHash,
              output: input.output
            }),
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "classroom-feedback-run-manifest"
            )
          },
          outbox: {
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "ClassroomDeliveryDraftGenerated",
            aggregateRef: input.agentRunRef,
            payload: {
              lessonRef: input.context.lessonRef,
              teachingPlanRevisionRef:
                input.runtimeContext.input.approvedTeachingPlan.revisionRef,
              skillRef: input.skill.ref,
              contextManifestHash: input.runtimeContext.manifest.contentHash,
              candidateOnly: true,
              teacherConfirmationRequired: true
            },
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "classroom-feedback-outbox"
            )
          }
        }))
      );
      receipts.push(
        await this.gate2Runtime.insertContextManifest(client, {
          contextManifestRef: input.contextManifestRef,
          agentRunRef: input.agentRunRef,
          resourceRefs: input.runtimeContext.manifest.resourceRefs,
          evidenceRefs: input.runtimeContext.manifest.evidenceRefs,
          unknowns: [
            ...input.runtimeContext.manifest.missingInformation,
            ...input.runtimeContext.manifest.excludedInformation
          ],
          requestedFieldMask:
            input.runtimeContext.manifest.requestedFieldMask,
          taskRef: input.queryRunRef,
          requestSummary: {
            requestText:
              input.request.note ??
              `课堂快速反馈：${input.request.overall}/${input.request.pace}/${input.request.studentResponse}`,
            actorRef: input.context.actorRef,
            purpose: input.request.purpose,
            courseRunRef: input.runtimeContext.input.lesson.courseRunRef,
            learningObjectiveRefs: [
              ...input.runtimeContext.input.lesson.learningObjectiveRefs
            ],
            selectedEvidenceRefs: [
              ...input.runtimeContext.manifest.evidenceRefs
            ],
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
            "classroom-feedback-context-manifest"
          )
        })
      );
      const result = { view, output: input.output };
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

  async findLatestClassroomFeedback(
    context: Parameters<
      ClassroomFeedbackRunStore["findLatestClassroomFeedback"]
    >[0]
  ) {
    const result = await this.pool.query<{
      output: unknown;
      created_at: string;
    }>(
      `SELECT output, created_at::text
         FROM runtime.agent_run
        WHERE actor_ref = $1
          AND purpose = 'lesson-delivery.quick-feedback.generate'
          AND output->>'kind' = 'classroom_delivery_draft'
          AND output->>'tenantRef' = $2
          AND output->>'lessonRef' = $3
        ORDER BY created_at DESC, agent_run_ref DESC
        LIMIT 1`,
      [context.actorRef, context.tenantRef, context.lessonRef]
    );
    const row = result.rows[0];
    if (!row || typeof row.output !== "object" || row.output === null) {
      return null;
    }
    const output = row.output as Record<string, unknown>;
    return ClassroomFeedbackRunViewSchema.parse({
      ...output,
      createdAt: new Date(row.created_at).toISOString()
    });
  }
}

function parseStoredResult(value: unknown, replayed: boolean) {
  if (!isRecord(value)) {
    throw new Error("Stored classroom feedback result is invalid.");
  }
  return {
    replayed,
    view: ClassroomFeedbackRunViewSchema.parse(value["view"]),
    output: ClassroomReflectionSkillOutputSchema.parse(value["output"])
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

import { createHash, randomUUID } from "node:crypto";

import type {
  AuthorizationDecision,
  FormalWriteReceipt
} from "@edu-agent/contracts";
import type { Pool } from "pg";

import {
  PostgresRuntimeRepository
} from "../modules/agent-runtime-context/infrastructure/postgres-runtime-repository.js";
import {
  buildArtifactContentHash,
  PostgresArtifactRepository
} from "../modules/artifact-collaboration/infrastructure/postgres-artifact-repository.js";
import {
  PostgresCapabilityRepository
} from "../modules/capability-integration/infrastructure/postgres-capability-repository.js";
import {
  PostgresGovernanceRepository
} from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  PostgresWorkRepository
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-work-repository.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";

export interface PostgresWalkingSkeletonResult {
  [key: string]: unknown;
  replayed: boolean;
  authorizationDecisionRef: string;
  taskRef: string;
  taskRunRef: string;
  agentRunRef: string;
  artifactRef: string;
  artifactRevisionRef: string;
  toolExecutionRef: string;
}

export interface PostgresWalkingSkeletonCommand {
  tenantRef: string;
  actorRef: string;
  purpose: string;
  idempotencyKey: string;
  title: string;
  body: string;
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function ref(kind: string): string {
  return `${kind}:${randomUUID()}`;
}

export class PostgresGate1BCommandService {
  constructor(
    private readonly pool: Pool,
    private readonly governance =
      new PostgresGovernanceRepository(),
    private readonly work = new PostgresWorkRepository(),
    private readonly runtime = new PostgresRuntimeRepository(),
    private readonly capability =
      new PostgresCapabilityRepository(),
    private readonly artifacts = new PostgresArtifactRepository()
  ) {}

  async execute(
    command: PostgresWalkingSkeletonCommand,
    options?: {
      failPoint?: "after-task";
    }
  ): Promise<PostgresWalkingSkeletonResult> {
    if (
      command.tenantRef !== "tenant:demo-school" ||
      command.actorRef !== "user:teacher-001" ||
      !command.purpose.startsWith("gate1b.")
    ) {
      throw new Error("Gate 1B synthetic command is not authorized.");
    }

    const rootKey = [
      command.tenantRef,
      command.actorRef,
      command.purpose,
      command.idempotencyKey
    ].join("|");
    const requestFingerprint = hash(command);
    const stableKeyHash = hash(rootKey).slice(0, 32);
    const authorizationDecisionRef =
      `authorization-decision:${stableKeyHash}`;
    const now = new Date().toISOString();
    const writeContext: WriteContext = {
      actorRef: command.actorRef,
      purpose: command.purpose,
      rootIdempotencyKey: command.idempotencyKey,
      authorizationDecisionRef,
      createdAt: now
    };
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const idempotencyMetadata = createWriteMetadata(
        writeContext,
        "governance",
        "idempotency"
      );
      const reservation = await this.governance.reserveIdempotency(
        client,
        {
          idempotencyRef: `idempotency:${stableKeyHash}`,
          rootKey,
          requestFingerprint,
          metadata: idempotencyMetadata
        }
      );
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return {
          ...(reservation.result as unknown as PostgresWalkingSkeletonResult),
          replayed: true
        };
      }

      const decision: AuthorizationDecision = {
        decisionRef: authorizationDecisionRef,
        actorRef: command.actorRef,
        tenantRef: command.tenantRef,
        purpose: command.purpose,
        action: "gate1b.walking-skeleton.execute",
        resourceRef: "artifact:new",
        requestedFieldMask: [],
        effect: "allow",
        reasonCodes: ["synthetic-gate1b-teacher-policy"],
        policyVersion: "gate1b-demo-policy@1",
        decidedAt: now
      };
      const decisionReceipt = await this.governance.saveDecision(
        client,
        {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "authorization"
          )
        }
      );

      const taskRef = ref("task");
      const taskRunRef = ref("task-run");
      const agentRunRef = ref("agent-run");
      const manifestRef = ref("run-manifest");
      const toolExecutionRef = ref("tool-execution");
      const artifactRef = ref("artifact");
      const artifactRevisionRef = ref("artifact-revision");
      const workOutboxRef = ref("outbox");
      const runtimeOutboxRef = ref("outbox");
      const capabilityOutboxRef = ref("outbox");
      const artifactOutboxRef = ref("outbox");
      const mockBody =
        `MockModelProvider: ${command.body}\n` +
        `FakeTool: ${command.body}`;
      const baseResult: PostgresWalkingSkeletonResult = {
        replayed: false,
        authorizationDecisionRef,
        taskRef,
        taskRunRef,
        agentRunRef,
        artifactRef,
        artifactRevisionRef,
        toolExecutionRef
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        decisionReceipt
      ];

      receipts.push(
        ...(await this.work.insertTaskBundle(
          client,
          {
            task: {
              taskRef,
              title: command.title,
              status: "completed",
              metadata: createWriteMetadata(
                writeContext,
                "work",
                "task"
              )
            },
            taskRun: {
              taskRunRef,
              taskRef,
              attempt: 1,
              status: "completed",
              metadata: createWriteMetadata(
                writeContext,
                "work",
                "task-run"
              )
            },
            outbox: {
              outboxRef: workOutboxRef,
              eventName: "TaskRunCompleted",
              aggregateRef: taskRunRef,
              payload: {
                taskRef,
                artifactRef
              },
              metadata: createWriteMetadata(
                writeContext,
                "work",
                "work-outbox"
              )
            }
          },
          options?.failPoint
        ))
      );
      receipts.push(
        ...(await this.capability.insertCapabilityBundle(client, {
          execution: {
            executionRef: toolExecutionRef,
            capabilityRef: "capability:fake.echo@1",
            toolName: "fake.echo",
            input: {
              text: command.body
            },
            output: {
              echoed: command.body
            },
            metadata: createWriteMetadata(
              writeContext,
              "capability",
              "tool-execution"
            )
          },
          outbox: {
            outboxRef: capabilityOutboxRef,
            eventName: "FakeToolExecuted",
            aggregateRef: toolExecutionRef,
            payload: {
              capabilityRef: "capability:fake.echo@1"
            },
            metadata: createWriteMetadata(
              writeContext,
              "capability",
              "capability-outbox"
            )
          }
        }))
      );
      receipts.push(
        ...(await this.runtime.insertAgentRunBundle(client, {
          agentRun: {
            agentRunRef,
            runKind: "TaskRun",
            boundRunRef: taskRunRef,
            status: "completed",
            modelProvider: "mock",
            modelProfile: "mock:deterministic@1",
            toolName: "fake.echo",
            output: {
              title: command.title,
              body: mockBody
            },
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "agent-run"
            )
          },
          manifest: {
            manifestRef,
            agentRunRef,
            promptVersionRef: "prompt:gate1b-walking-skeleton@1",
            policyVersionRef: decision.policyVersion,
            capabilityRefs: ["capability:fake.echo@1"],
            contextRefs: [],
            contentHash: hash({
              prompt: "prompt:gate1b-walking-skeleton@1",
              policy: decision.policyVersion,
              capability: "capability:fake.echo@1"
            }),
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "run-manifest"
            )
          },
          outbox: {
            outboxRef: runtimeOutboxRef,
            eventName: "AgentRunCompleted",
            aggregateRef: agentRunRef,
            payload: {
              taskRunRef,
              manifestRef
            },
            metadata: createWriteMetadata(
              writeContext,
              "runtime",
              "runtime-outbox"
            )
          }
        }))
      );
      receipts.push(
        ...(await this.artifacts.insertArtifactBundle(client, {
          artifact: {
            artifactRef,
            artifactType: "ContentArtifact",
            latestPublishedRevisionRef: artifactRevisionRef,
            metadata: createWriteMetadata(
              writeContext,
              "artifact",
              "artifact"
            )
          },
          revision: {
            revisionRef: artifactRevisionRef,
            artifactRef,
            revisionNumber: 1,
            artifactType: "ContentArtifact",
            title: command.title,
            body: mockBody,
            sourceAgentRunRef: agentRunRef,
            revisionState: "published",
            contentHash: buildArtifactContentHash(
              command.title,
              mockBody
            ),
            metadata: createWriteMetadata(
              writeContext,
              "artifact",
              "artifact-revision"
            )
          },
          outbox: {
            outboxRef: artifactOutboxRef,
            eventName: "ArtifactRevisionPublished",
            aggregateRef: artifactRef,
            payload: {
              artifactRevisionRef
            },
            metadata: createWriteMetadata(
              writeContext,
              "artifact",
              "artifact-outbox"
            )
          }
        }))
      );

      await this.governance.completeIdempotency(client, {
        rootKey,
        result: baseResult,
        completedAt: now
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return baseResult;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

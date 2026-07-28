import {
  ArtifactReadResultSchema,
  WalkingSkeletonCommandSchema,
  WalkingSkeletonQuerySchema,
  WalkingSkeletonResultSchema,
  type ActingContext,
  type ArtifactReadResult,
  type AuditRecord,
  type AuthorizationDecision,
  type FormalWriteReceipt,
  type IngressEnvelope,
  type OutboxRecord,
  type TenantContext,
  type WalkingSkeletonResult
} from "@edu-agent/contracts";

import {
  AuthorizationDeniedError,
  IdempotencyConflictError
} from "../../../platform/errors.js";
import {
  createMetadataFactory,
  type MetadataFactory
} from "../../../platform/metadata.js";
import type { Clock, IdGenerator } from "../../../platform/system.js";
import type {
  IdempotencyRecord,
  QueryIdempotencyRecord,
  QueryRunRecord,
  TaskRecord,
  TaskRunRecord
} from "../domain/records.js";

export interface GovernancePort {
  authorize(input: {
    envelope: IngressEnvelope;
    tenant: TenantContext;
    acting: ActingContext;
    action: string;
    resourceRef: string;
    requestedFieldMask?: readonly string[];
  }): {
    record: {
      decision: AuthorizationDecision;
    };
    receipt: FormalWriteReceipt;
  };
  audit(receipts: readonly FormalWriteReceipt[]): readonly AuditRecord[];
}

export interface RuntimePortResult {
  agentRun: {
    agentRunRef: string;
    output: {
      title: string;
      body: string;
      toolEcho: string;
    };
    modelProvider: "mock";
    toolName: "fake.echo";
  };
  outbox: OutboxRecord;
  receipts: readonly FormalWriteReceipt[];
}

export interface RuntimePort {
  execute(input: {
    binding: {
      runKind: "TaskRun";
      runRef: string;
    };
    purpose: string;
    title: string;
    body: string;
    metadata: MetadataFactory;
  }): Promise<RuntimePortResult>;
}

export interface ArtifactPortResult {
  revision: {
    artifactRef: string;
    revisionRef: string;
    title: string;
    body: string;
    metadata: {
      actorRef: string;
      purpose: string;
      owner: "artifact";
    };
  };
  outbox: OutboxRecord;
  receipts: readonly FormalWriteReceipt[];
}

export interface ArtifactPort {
  createRevision(input: {
    title: string;
    body: string;
    sourceAgentRunRef: string;
    metadata: MetadataFactory;
  }): ArtifactPortResult;
  getLatest(artifactRef: string): {
    artifactRef: string;
    revisionRef: string;
    title: string;
    body: string;
    metadata: {
      actorRef: string;
      purpose: string;
      owner: "artifact";
    };
  };
}

export interface WorkRepository {
  findIdempotency(rootKey: string): IdempotencyRecord | undefined;
  saveCommand(input: {
    task: TaskRecord;
    taskRun: TaskRunRecord;
    idempotency: IdempotencyRecord;
    outbox: OutboxRecord;
  }): void;
  findQueryIdempotency(
    rootKey: string
  ): QueryIdempotencyRecord | undefined;
  saveQuery(input: {
    queryRun: QueryRunRecord;
    idempotency: QueryIdempotencyRecord;
  }): void;
  listTasks(): readonly TaskRecord[];
  listTaskRuns(): readonly TaskRunRecord[];
  listQueryRuns(): readonly QueryRunRecord[];
  listIdempotencyRecords(): readonly IdempotencyRecord[];
  listOutbox(): readonly OutboxRecord[];
}

export class WalkingSkeletonService {
  constructor(
    private readonly governance: GovernancePort,
    private readonly runtime: RuntimePort,
    private readonly artifacts: ArtifactPort,
    private readonly repository: WorkRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator
  ) {}

  async executeCommand(input: {
    rawEnvelope: unknown;
    tenant: TenantContext;
    acting: ActingContext;
  }): Promise<WalkingSkeletonResult> {
    const command = WalkingSkeletonCommandSchema.parse(
      input.rawEnvelope
    );
    const fingerprint = JSON.stringify(command);
    const scopedIdempotencyKey = [
      command.tenantRef,
      command.actorRef,
      command.purpose,
      command.idempotencyKey
    ].join("|");
    const prior = this.repository.findIdempotency(
      scopedIdempotencyKey
    );

    if (prior) {
      if (prior.requestFingerprint !== fingerprint) {
        throw new IdempotencyConflictError(
          "The idempotency key was already used for a different command."
        );
      }
      return WalkingSkeletonResultSchema.parse({
        ...prior.result,
        replayed: true
      });
    }

    const authorization = this.governance.authorize({
      envelope: command,
      tenant: input.tenant,
      acting: input.acting,
      action: "artifact.create",
      resourceRef: "artifact:new"
    });
    if (authorization.record.decision.effect !== "allow") {
      this.governance.audit([authorization.receipt]);
      throw new AuthorizationDeniedError(
        "The walking-skeleton command is not authorized."
      );
    }

    const metadata = createMetadataFactory({
      actorRef: command.actorRef,
      purpose: command.purpose,
      rootIdempotencyKey: command.idempotencyKey,
      authorizationDecision: authorization.record.decision,
      clock: this.clock,
      ids: this.ids
    });
    const taskRef = this.ids.next("task");
    const taskRunRef = this.ids.next("task-run");
    const taskMetadata = metadata.create("work", "task");
    const taskRunMetadata = metadata.create("work", "task-run");
    const task: TaskRecord = {
      taskRef,
      title: command.payload.title,
      status: "completed",
      metadata: taskMetadata
    };
    const taskRun: TaskRunRecord = {
      taskRunRef,
      taskRef,
      attempt: 1,
      status: "completed",
      metadata: taskRunMetadata
    };

    const runtime = await this.runtime.execute({
      binding: {
        runKind: "TaskRun",
        runRef: taskRunRef
      },
      purpose: command.purpose,
      title: command.payload.title,
      body: command.payload.body,
      metadata
    });
    const artifact = this.artifacts.createRevision({
      title: runtime.agentRun.output.title,
      body: `${runtime.agentRun.output.body}\n${runtime.agentRun.output.toolEcho}`,
      sourceAgentRunRef: runtime.agentRun.agentRunRef,
      metadata
    });
    const workOutboxMetadata = metadata.create(
      "work",
      "task-outbox"
    );
    const workOutbox: OutboxRecord = {
      outboxRef: this.ids.next("outbox"),
      eventName: "TaskRunCompleted",
      aggregateRef: taskRunRef,
      payload: {
        taskRef,
        artifactRef: artifact.revision.artifactRef
      },
      metadata: workOutboxMetadata
    };
    const idempotencyMetadata = metadata.create(
      "work",
      "idempotency"
    );
    const idempotencyRef = this.ids.next("idempotency");

    const provisionalReceipts: FormalWriteReceipt[] = [
      authorization.receipt,
      {
        writeRef: taskRef,
        recordType: "Task",
        owner: "work",
        metadata: taskMetadata
      },
      {
        writeRef: taskRunRef,
        recordType: "TaskRun",
        owner: "work",
        metadata: taskRunMetadata
      },
      ...runtime.receipts,
      ...artifact.receipts,
      {
        writeRef: workOutbox.outboxRef,
        recordType: "OutboxRecord",
        owner: "work",
        metadata: workOutboxMetadata
      },
      {
        writeRef: idempotencyRef,
        recordType: "IdempotencyRecord",
        owner: "work",
        metadata: idempotencyMetadata
      }
    ];
    const audits = this.governance.audit(provisionalReceipts);
    const outboxRefs = [
      ...runtime.receipts
        .filter((receipt) => receipt.recordType === "OutboxRecord")
        .map((receipt) => receipt.writeRef),
      ...artifact.receipts
        .filter((receipt) => receipt.recordType === "OutboxRecord")
        .map((receipt) => receipt.writeRef),
      workOutbox.outboxRef
    ];
    const result = WalkingSkeletonResultSchema.parse({
      replayed: false,
      authorizationDecisionRef:
        authorization.record.decision.decisionRef,
      taskRef,
      taskRunRef,
      agentRunRef: runtime.agentRun.agentRunRef,
      artifactRef: artifact.revision.artifactRef,
      artifactRevisionRef: artifact.revision.revisionRef,
      auditRefs: audits.map((audit) => audit.auditRef),
      outboxRefs,
      modelProvider: runtime.agentRun.modelProvider,
      toolName: runtime.agentRun.toolName
    });
    const idempotency: IdempotencyRecord = {
      idempotencyRef,
      rootKey: scopedIdempotencyKey,
      requestFingerprint: fingerprint,
      result,
      metadata: idempotencyMetadata
    };

    this.repository.saveCommand({
      task,
      taskRun,
      idempotency,
      outbox: workOutbox
    });
    return result;
  }

  executeQuery(input: {
    rawEnvelope: unknown;
    tenant: TenantContext;
    acting: ActingContext;
  }): ArtifactReadResult {
    const query = WalkingSkeletonQuerySchema.parse(input.rawEnvelope);
    const fingerprint = JSON.stringify(query);
    const scopedIdempotencyKey = [
      query.tenantRef,
      query.actorRef,
      query.purpose,
      query.idempotencyKey
    ].join("|");
    const prior = this.repository.findQueryIdempotency(
      scopedIdempotencyKey
    );
    if (prior) {
      if (prior.requestFingerprint !== fingerprint) {
        throw new IdempotencyConflictError(
          "The idempotency key was already used for a different query."
        );
      }
      return prior.result;
    }

    const authorization = this.governance.authorize({
      envelope: query,
      tenant: input.tenant,
      acting: input.acting,
      action: "artifact.read",
      resourceRef: query.payload.artifactRef,
      requestedFieldMask: query.requestedFieldMask
    });
    if (authorization.record.decision.effect !== "allow") {
      this.governance.audit([authorization.receipt]);
      throw new AuthorizationDeniedError(
        "The walking-skeleton query is not authorized."
      );
    }

    const metadata = createMetadataFactory({
      actorRef: query.actorRef,
      purpose: query.purpose,
      rootIdempotencyKey: query.idempotencyKey,
      authorizationDecision: authorization.record.decision,
      clock: this.clock,
      ids: this.ids
    });
    const queryRunRef = this.ids.next("query-run");
    const queryRunMetadata = metadata.create("work", "query-run");
    const queryRun: QueryRunRecord = {
      queryRunRef,
      queryName: query.queryName,
      status: "completed",
      resourceRef: query.payload.artifactRef,
      requestedFieldMask: query.requestedFieldMask,
      metadata: queryRunMetadata
    };
    const artifact = this.artifacts.getLatest(
      query.payload.artifactRef
    );
    const result = ArtifactReadResultSchema.parse({
      queryRunRef,
      artifactRef: artifact.artifactRef,
      revisionRef: artifact.revisionRef,
      title: artifact.title,
      body: artifact.body,
      owner: artifact.metadata.owner,
      actorRef: artifact.metadata.actorRef,
      purpose: artifact.metadata.purpose
    });
    const receipt: FormalWriteReceipt = {
      writeRef: queryRunRef,
      recordType: "QueryRun",
      owner: "work",
      metadata: queryRunMetadata
    };
    this.governance.audit([authorization.receipt, receipt]);
    this.repository.saveQuery({
      queryRun,
      idempotency: {
        rootKey: scopedIdempotencyKey,
        requestFingerprint: fingerprint,
        result
      }
    });
    return result;
  }
}

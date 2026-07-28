import request from "supertest";
import { describe, expect, it } from "vitest";

import { apiRoutes } from "@edu-agent/contracts";
import {
  makeWalkingSkeletonCommand,
  makeWalkingSkeletonQuery,
  syntheticTeacher,
  syntheticTenant
} from "@edu-agent/test-fixtures";

import { createApp } from "../../apps/api/src/app.js";
import { createGate1AContainer } from "../../apps/api/src/composition/gate1a-container.js";
import {
  DeterministicIdGenerator,
  FixedClock
} from "../../apps/api/src/platform/system.js";

function setup() {
  const container = createGate1AContainer({
    clock: new FixedClock("2026-07-28T08:00:00.000Z"),
    ids: new DeterministicIdGenerator()
  });
  return {
    container,
    app: createApp(container)
  };
}

const demoHeaders = {
  "x-demo-tenant": syntheticTenant.tenantRef,
  "x-demo-actor": syntheticTeacher.actorRef
};

describe("Gate 1A no-LLM Walking Skeleton", () => {
  it("serves the shared health contract and structured API 404", async () => {
    const { app } = setup();

    await request(app)
      .get(apiRoutes.health)
      .expect(200)
      .expect({
        status: "ok",
        service: "edu-agent-api",
        mode: "mock"
      });

    const missing = await request(app)
      .get("/api/route-that-does-not-exist")
      .expect(404);
    expect(missing.body).toEqual({
      code: "API_ROUTE_NOT_FOUND",
      message: "请求的 API 路由不存在。",
      method: "GET",
      path: "/api/route-that-does-not-exist"
    });
    expect(missing.headers["content-type"]).toMatch(
      /^application\/json/
    );
  });

  it("runs Command → TaskRun → AgentRun → Artifact → Outbox/Audit and reads by QueryRun", async () => {
    const { app, container } = setup();
    const command = makeWalkingSkeletonCommand();
    const created = await request(app)
      .post("/api/v1/commands/walking-skeleton")
      .set(demoHeaders)
      .send(command)
      .expect(201);

    expect(created.body).toMatchObject({
      replayed: false,
      modelProvider: "mock",
      toolName: "fake.echo"
    });
    expect(
      container.repositories.runtime.listAgentRuns()[0]?.binding
    ).toEqual({
      runKind: "TaskRun",
      runRef: created.body.taskRunRef
    });

    const read = await request(app)
      .post("/api/v1/queries/artifact")
      .set(demoHeaders)
      .send(makeWalkingSkeletonQuery(created.body.artifactRef))
      .expect(200);

    expect(read.body).toMatchObject({
      artifactRef: created.body.artifactRef,
      revisionRef: created.body.artifactRevisionRef,
      owner: "artifact",
      actorRef: syntheticTeacher.actorRef
    });
    expect(
      container.repositories.work.listQueryRuns()
    ).toHaveLength(1);

    const decisionRefs = new Set(
      container.repositories.governance
        .listDecisionRecords()
        .map((record) => record.decision.decisionRef)
    );
    const audits = container.repositories.governance.listAudits();
    const auditRefs = new Set(audits.map((audit) => audit.auditRef));
    const formalMetadata = [
      ...container.repositories.governance
        .listDecisionRecords()
        .map((record) => record.metadata),
      ...container.repositories.work
        .listTasks()
        .map((record) => record.metadata),
      ...container.repositories.work
        .listTaskRuns()
        .map((record) => record.metadata),
      ...container.repositories.work
        .listQueryRuns()
        .map((record) => record.metadata),
      ...container.repositories.work
        .listIdempotencyRecords()
        .map((record) => record.metadata),
      ...container.repositories.work
        .listOutbox()
        .map((record) => record.metadata),
      ...container.repositories.runtime
        .listAgentRuns()
        .map((record) => record.metadata),
      ...container.repositories.runtime
        .listOutbox()
        .map((record) => record.metadata),
      ...container.repositories.capability
        .listExecutions()
        .map((record) => record.metadata),
      ...container.repositories.capability
        .listOutbox()
        .map((record) => record.metadata),
      ...container.repositories.artifact
        .listRevisions()
        .map((record) => record.metadata),
      ...container.repositories.artifact
        .listOutbox()
        .map((record) => record.metadata)
    ];

    for (const metadata of formalMetadata) {
      expect(metadata.actorRef).toBe(syntheticTeacher.actorRef);
      expect(metadata.purpose).toBeTruthy();
      expect(metadata.owner).toBeTruthy();
      expect(metadata.idempotencyKey).toBeTruthy();
      expect(
        decisionRefs.has(metadata.authorizationDecisionRef)
      ).toBe(true);
      expect(auditRefs.has(metadata.auditRef)).toBe(true);
    }
    for (const audit of audits) {
      expect(audit.metadata.auditRef).toBe(audit.auditRef);
      expect(audit.metadata.owner).toBe("governance");
      expect(
        decisionRefs.has(audit.metadata.authorizationDecisionRef)
      ).toBe(true);
    }
  });

  it("replays the same idempotency key without duplicate formal writes", async () => {
    const { app, container } = setup();
    const command = makeWalkingSkeletonCommand();
    const first = await request(app)
      .post("/api/v1/commands/walking-skeleton")
      .set(demoHeaders)
      .send(command)
      .expect(201);
    const counts = {
      tasks: container.repositories.work.listTasks().length,
      agents: container.repositories.runtime.listAgentRuns().length,
      artifacts: container.repositories.artifact.listRevisions().length,
      audits: container.repositories.governance.listAudits().length
    };
    const replay = await request(app)
      .post("/api/v1/commands/walking-skeleton")
      .set(demoHeaders)
      .send(command)
      .expect(200);

    expect(replay.body).toMatchObject({
      ...first.body,
      replayed: true
    });
    expect(container.repositories.work.listTasks()).toHaveLength(
      counts.tasks
    );
    expect(container.repositories.runtime.listAgentRuns()).toHaveLength(
      counts.agents
    );
    expect(
      container.repositories.artifact.listRevisions()
    ).toHaveLength(counts.artifacts);
    expect(container.repositories.governance.listAudits()).toHaveLength(
      counts.audits
    );
  });

  it("rejects reuse of an idempotency key for a different payload", async () => {
    const { app } = setup();
    const command = makeWalkingSkeletonCommand();
    await request(app)
      .post("/api/v1/commands/walking-skeleton")
      .set(demoHeaders)
      .send(command)
      .expect(201);

    const conflict = await request(app)
      .post("/api/v1/commands/walking-skeleton")
      .set(demoHeaders)
      .send({
        ...command,
        payload: {
          ...command.payload,
          body: "different"
        }
      })
      .expect(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("isolates DomainEvent, ObservationEvent and WorkflowSignal routing", async () => {
    const { app, container } = setup();
    const common = {
      envelopeId: "envelope:routing",
      tenantRef: syntheticTenant.tenantRef,
      actorRef: syntheticTeacher.actorRef,
      purpose: "gate1a.routing",
      idempotencyKey: "idem:routing:0001",
      occurredAt: "2026-07-28T08:00:00.000Z",
      payload: {}
    };

    await request(app)
      .post("/api/v1/ingress")
      .send({
        ...common,
        kind: "DomainEvent",
        eventName: "ExternalFact",
        aggregateRef: "aggregate:001",
        causationRef: "external:001"
      })
      .expect(403);

    const before = container.repositories.runtime.listAgentRuns().length;
    const observation = await request(app)
      .post("/api/v1/ingress")
      .send({
        ...common,
        idempotencyKey: "idem:routing:0002",
        kind: "ObservationEvent",
        observationName: "Clicked",
        subjectRef: "subject:001",
        sourceRef: "ui:001"
      })
      .expect(202);
    expect(observation.body).toMatchObject({
      status: "candidate-only",
      agentStarted: false,
      formalStateChanged: false
    });
    expect(container.repositories.runtime.listAgentRuns()).toHaveLength(
      before
    );

    await request(app)
      .post("/api/v1/ingress")
      .send({
        ...common,
        idempotencyKey: "idem:routing:0003",
        kind: "WorkflowSignal",
        workflowInstanceRef: "workflow:missing",
        signalName: "Approved"
      })
      .expect(404);

    await request(app)
      .post("/api/v1/ingress")
      .send({
        ...common,
        idempotencyKey: "idem:routing:0004",
        kind: "Schedule",
        scheduleName: "Tomorrow"
      })
      .expect(400);
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import { IngressEnvelopeSchema } from "@edu-agent/contracts";
import {
  makeWalkingSkeletonCommand,
  makeWalkingSkeletonQuery,
  syntheticTeacher,
  syntheticTenant
} from "@edu-agent/test-fixtures";

import { createGate1AContainer } from "../../apps/api/src/composition/gate1a-container.ts";
import {
  DeterministicIdGenerator,
  FixedClock
} from "../../apps/api/src/platform/system.ts";

function setup() {
  return createGate1AContainer({
    clock: new FixedClock("2026-07-28T08:00:00.000Z"),
    ids: new DeterministicIdGenerator()
  });
}

test("actual Gate 1A services complete the no-LLM command/query flow", async () => {
  const container = setup();
  const command = makeWalkingSkeletonCommand();
  const created =
    await container.services.walkingSkeleton.executeCommand({
      rawEnvelope: command,
      tenant: syntheticTenant,
      acting: syntheticTeacher
    });

  assert.equal(created.replayed, false);
  assert.equal(created.modelProvider, "mock");
  assert.equal(created.toolName, "fake.echo");
  assert.deepEqual(
    container.repositories.runtime.listAgentRuns()[0].binding,
    {
      runKind: "TaskRun",
      runRef: created.taskRunRef
    }
  );

  const read = container.services.walkingSkeleton.executeQuery({
    rawEnvelope: makeWalkingSkeletonQuery(created.artifactRef),
    tenant: syntheticTenant,
    acting: syntheticTeacher
  });
  assert.equal(read.artifactRef, created.artifactRef);
  assert.equal(read.owner, "artifact");
  assert.equal(
    container.repositories.work.listQueryRuns().length,
    1
  );
});

test("idempotent replay creates no duplicate task, agent or artifact", async () => {
  const container = setup();
  const command = makeWalkingSkeletonCommand();
  const first =
    await container.services.walkingSkeleton.executeCommand({
      rawEnvelope: command,
      tenant: syntheticTenant,
      acting: syntheticTeacher
    });
  const replay =
    await container.services.walkingSkeleton.executeCommand({
      rawEnvelope: command,
      tenant: syntheticTenant,
      acting: syntheticTeacher
    });

  assert.equal(first.taskRef, replay.taskRef);
  assert.equal(replay.replayed, true);
  assert.equal(container.repositories.work.listTasks().length, 1);
  assert.equal(
    container.repositories.runtime.listAgentRuns().length,
    1
  );
  assert.equal(
    container.repositories.artifact.listRevisions().length,
    1
  );
});

test("every formal record references a matching audit", async () => {
  const container = setup();
  await container.services.walkingSkeleton.executeCommand({
    rawEnvelope: makeWalkingSkeletonCommand(),
    tenant: syntheticTenant,
    acting: syntheticTeacher
  });

  const auditRefs = new Set(
    container.repositories.governance
      .listAudits()
      .map((audit) => audit.auditRef)
  );
  const metadata = [
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

  for (const entry of metadata) {
    assert.equal(entry.actorRef, syntheticTeacher.actorRef);
    assert.ok(entry.purpose);
    assert.ok(entry.owner);
    assert.ok(entry.idempotencyKey);
    assert.ok(auditRefs.has(entry.auditRef));
  }
});

test("Ingress accepts only the five frozen semantic kinds", () => {
  const base = {
    envelopeId: "envelope:node-test",
    tenantRef: syntheticTenant.tenantRef,
    actorRef: syntheticTeacher.actorRef,
    purpose: "gate1a.routing",
    idempotencyKey: "idem:node-routing:0001",
    occurredAt: "2026-07-28T08:00:00.000Z",
    payload: {}
  };
  const envelopes = [
    {
      ...base,
      kind: "Query",
      queryName: "Read",
      requestedFieldMask: []
    },
    { ...base, kind: "Command", commandName: "Write" },
    {
      ...base,
      kind: "DomainEvent",
      eventName: "Committed",
      aggregateRef: "aggregate:001",
      causationRef: "command:001"
    },
    {
      ...base,
      kind: "ObservationEvent",
      observationName: "Clicked",
      subjectRef: "subject:001",
      sourceRef: "ui:001"
    },
    {
      ...base,
      kind: "WorkflowSignal",
      workflowInstanceRef: "workflow:001",
      signalName: "Approved"
    }
  ];
  assert.deepEqual(
    envelopes.map((envelope) =>
      IngressEnvelopeSchema.parse(envelope).kind
    ),
    [
      "Query",
      "Command",
      "DomainEvent",
      "ObservationEvent",
      "WorkflowSignal"
    ]
  );
  assert.throws(() =>
    IngressEnvelopeSchema.parse({
      ...base,
      kind: "Schedule",
      scheduleName: "Tomorrow"
    })
  );
});

test("idempotency collision and unauthorized purpose fail closed", async () => {
  const container = setup();
  const command = makeWalkingSkeletonCommand();
  await container.services.walkingSkeleton.executeCommand({
    rawEnvelope: command,
    tenant: syntheticTenant,
    acting: syntheticTeacher
  });
  await assert.rejects(
    container.services.walkingSkeleton.executeCommand({
      rawEnvelope: {
        ...command,
        payload: {
          ...command.payload,
          body: "different"
        }
      },
      tenant: syntheticTenant,
      acting: syntheticTeacher
    }),
    { name: "IdempotencyConflictError" }
  );

  await assert.rejects(
    container.services.walkingSkeleton.executeCommand({
      rawEnvelope: {
        ...makeWalkingSkeletonCommand("idem:gate1a:unauthorized"),
        purpose: "unscoped-purpose"
      },
      tenant: syntheticTenant,
      acting: syntheticTeacher
    }),
    { name: "AuthorizationDeniedError" }
  );
});

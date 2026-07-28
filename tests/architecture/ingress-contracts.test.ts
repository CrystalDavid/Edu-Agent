import { describe, expect, it } from "vitest";

import { IngressEnvelopeSchema } from "@edu-agent/contracts";

const base = {
  envelopeId: "envelope:test",
  tenantRef: "tenant:demo-school",
  actorRef: "user:teacher-001",
  purpose: "architecture-test",
  idempotencyKey: "idem:architecture:001",
  occurredAt: "2026-07-28T08:00:00.000Z",
  payload: {}
};

describe("IngressEnvelope", () => {
  it.each([
    {
      ...base,
      kind: "Query",
      queryName: "Read",
      requestedFieldMask: []
    },
    {
      ...base,
      kind: "Command",
      commandName: "Write"
    },
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
  ])("accepts $kind as an explicit semantic type", (envelope) => {
    expect(IngressEnvelopeSchema.parse(envelope).kind).toBe(
      envelope.kind
    );
  });

  it("rejects Schedule as a business semantic type", () => {
    expect(() =>
      IngressEnvelopeSchema.parse({
        ...base,
        kind: "Schedule",
        scheduleName: "Tomorrow"
      })
    ).toThrow();
  });
});

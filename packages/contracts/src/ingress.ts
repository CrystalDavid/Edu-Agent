import { z } from "zod";

const EnvelopeBaseSchema = z.object({
  envelopeId: z.string().min(1),
  tenantRef: z.string().min(1),
  actorRef: z.string().min(1),
  purpose: z.string().min(1),
  idempotencyKey: z.string().min(8),
  occurredAt: z.string().datetime()
});

export const QueryEnvelopeSchema = EnvelopeBaseSchema.extend({
  kind: z.literal("Query"),
  queryName: z.string().min(1),
  requestedFieldMask: z.array(z.string().min(1)).default([]),
  payload: z.record(z.string(), z.unknown())
});

export const CommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  kind: z.literal("Command"),
  commandName: z.string().min(1),
  payload: z.record(z.string(), z.unknown())
});

export const DomainEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  kind: z.literal("DomainEvent"),
  eventName: z.string().min(1),
  aggregateRef: z.string().min(1),
  causationRef: z.string().min(1),
  payload: z.record(z.string(), z.unknown())
});

export const ObservationEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  kind: z.literal("ObservationEvent"),
  observationName: z.string().min(1),
  subjectRef: z.string().min(1),
  sourceRef: z.string().min(1),
  payload: z.record(z.string(), z.unknown())
});

export const WorkflowSignalEnvelopeSchema = EnvelopeBaseSchema.extend({
  kind: z.literal("WorkflowSignal"),
  workflowInstanceRef: z.string().min(1),
  signalName: z.string().min(1),
  payload: z.record(z.string(), z.unknown())
});

export const IngressEnvelopeSchema = z.discriminatedUnion("kind", [
  QueryEnvelopeSchema,
  CommandEnvelopeSchema,
  DomainEventEnvelopeSchema,
  ObservationEventEnvelopeSchema,
  WorkflowSignalEnvelopeSchema
]);

export type QueryEnvelope = z.infer<typeof QueryEnvelopeSchema>;
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
export type DomainEventEnvelope = z.infer<typeof DomainEventEnvelopeSchema>;
export type ObservationEventEnvelope = z.infer<
  typeof ObservationEventEnvelopeSchema
>;
export type WorkflowSignalEnvelope = z.infer<
  typeof WorkflowSignalEnvelopeSchema
>;
export type IngressEnvelope = z.infer<typeof IngressEnvelopeSchema>;

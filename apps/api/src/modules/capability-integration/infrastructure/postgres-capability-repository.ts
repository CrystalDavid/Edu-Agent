import type {
  FormalWriteMetadata,
  FormalWriteReceipt
} from "@edu-agent/contracts";

import type { PostgresClient } from "../../../platform/postgres/types.js";
import {
  createReceipt,
  formalMetadataValues,
  toPostgresJson
} from "../../../platform/postgres/write-context.js";

export interface PostgresCapabilityBundle {
  execution: {
    executionRef: string;
    capabilityRef: string;
    toolName: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    metadata: FormalWriteMetadata & { owner: "capability" };
  };
  outbox: {
    outboxRef: string;
    eventName: string;
    aggregateRef: string;
    payload: Record<string, unknown>;
    metadata: FormalWriteMetadata & { owner: "capability" };
  };
}

export class PostgresCapabilityRepository {
  async insertCapabilityBundle(
    client: PostgresClient,
    bundle: PostgresCapabilityBundle
  ): Promise<readonly FormalWriteReceipt[]> {
    await client.query(
      `INSERT INTO capability.tool_execution (
         execution_ref,
         capability_ref,
         tool_name,
         input,
         output,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11, $12
       )`,
      [
        bundle.execution.executionRef,
        bundle.execution.capabilityRef,
        bundle.execution.toolName,
        toPostgresJson(bundle.execution.input),
        toPostgresJson(bundle.execution.output),
        ...formalMetadataValues(bundle.execution.metadata)
      ]
    );
    await client.query(
      `INSERT INTO capability.outbox_record (
         outbox_ref,
         event_name,
         aggregate_ref,
         payload,
         actor_ref,
         purpose,
         owner_module,
         idempotency_key,
         authorization_decision_ref,
         audit_ref,
         created_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8, $9, $10, $11
       )`,
      [
        bundle.outbox.outboxRef,
        bundle.outbox.eventName,
        bundle.outbox.aggregateRef,
        toPostgresJson(bundle.outbox.payload),
        ...formalMetadataValues(bundle.outbox.metadata)
      ]
    );
    return [
      createReceipt({
        writeRef: bundle.execution.executionRef,
        recordType: "ToolExecution",
        metadata: bundle.execution.metadata
      }),
      createReceipt({
        writeRef: bundle.outbox.outboxRef,
        recordType: "OutboxRecord",
        metadata: bundle.outbox.metadata
      })
    ];
  }
}

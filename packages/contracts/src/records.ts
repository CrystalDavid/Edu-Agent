import { z } from "zod";

import {
  FormalWriteMetadataSchema,
  ModuleOwnerSchema
} from "./governance.js";

export const FormalWriteReceiptSchema = z.object({
  writeRef: z.string().min(1),
  recordType: z.string().min(1),
  owner: ModuleOwnerSchema,
  metadata: FormalWriteMetadataSchema
});

export const OutboxRecordSchema = z.object({
  outboxRef: z.string().min(1),
  eventName: z.string().min(1),
  aggregateRef: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  metadata: FormalWriteMetadataSchema
});

export const AuditRecordSchema = z.object({
  auditRef: z.string().min(1),
  writeRef: z.string().min(1),
  recordType: z.string().min(1),
  action: z.string().min(1),
  metadata: FormalWriteMetadataSchema
});

export type FormalWriteReceipt = z.infer<typeof FormalWriteReceiptSchema>;
export type OutboxRecord = z.infer<typeof OutboxRecordSchema>;
export type AuditRecord = z.infer<typeof AuditRecordSchema>;

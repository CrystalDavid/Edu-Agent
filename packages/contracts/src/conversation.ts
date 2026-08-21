import { z } from "zod";

export const ConversationPurposeFamilySchema = z.literal(
  "lesson_preparation"
);

export const ConversationTurnResultRefsSchema = z.object({
  modelExecutionRef: z.string().min(1).optional(),
  proposalRevisionRef: z.string().min(1).optional(),
  candidateRefs: z.array(z.string().trim().min(1).max(240)).max(10).optional(),
  preferenceRefs: z.array(z.string().trim().min(1).max(240)).max(10).optional()
});

export const ConversationTurnViewSchema = z.object({
  turnRef: z.string().min(1),
  conversationRef: z.string().min(1),
  sequence: z.number().int().positive(),
  parentTurnRef: z.string().min(1).nullable(),
  actorKind: z.enum([
    "teacher",
    "assistant_surface",
    "system_event"
  ]),
  contentKind: z.enum([
    "teacher_text",
    "safe_surface_summary",
    "command",
    "result_link"
  ]),
  teacherText: z.string().min(1).max(2000).nullable(),
  surfaceSummary: z.string().min(1).max(1000).nullable(),
  taskRunRef: z.string().min(1).nullable(),
  agentRunRef: z.string().min(1).nullable(),
  resultRefs: ConversationTurnResultRefsSchema,
  contentHash: z.string().min(16),
  createdAt: z.string().datetime()
});

export const WorkingMemoryViewSchema = z.object({
  snapshotRef: z.string().min(1),
  conversationRef: z.string().min(1),
  sourceTurnSequence: z.number().int().positive(),
  activeGoal: z.object({
    text: z.string().min(1).max(2000),
    sourceTurnRef: z.string().min(1)
  }),
  recentTeacherRequests: z
    .array(
      z.object({
        turnRef: z.string().min(1),
        sequence: z.number().int().positive(),
        text: z.string().min(1).max(2000)
      })
    )
    .max(6),
  referents: z.array(
    z.object({
      label: z.string().min(1).max(80),
      targetRef: z.string().min(1),
      sourceTurnRef: z.string().min(1)
    })
  ),
  pendingIntents: z.array(z.string().min(1).max(240)),
  selectedOptions: z.array(z.string().min(1).max(240)),
  temporaryOverrides: z.array(z.string().min(1).max(240)),
  latestAssistantResult: z
    .object({
      turnRef: z.string().min(1),
      surfaceSummary: z.string().min(1).max(1000),
      resultRefs: ConversationTurnResultRefsSchema
    })
    .nullable(),
  rollingSummary: z.string().min(1).max(4000),
  builderVersion: z.literal("working-memory-builder@1"),
  contentHash: z.string().min(16),
  expiresAt: z.string().datetime()
});

export const ConversationThreadViewSchema = z.object({
  conversationRef: z.string().min(1),
  taskRef: z.string().min(1),
  purposeFamily: ConversationPurposeFamilySchema,
  status: z.enum(["active", "closed", "expired"]),
  courseRunRef: z.string().min(1),
  lessonRef: z.string().min(1),
  version: z.number().int().positive(),
  lastTurnSequence: z.number().int().nonnegative(),
  lastTurnRef: z.string().min(1).nullable(),
  retentionUntil: z.string().datetime(),
  policyVersion: z.literal("conversation-retention@1"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  turns: z.array(ConversationTurnViewSchema),
  workingMemory: WorkingMemoryViewSchema.nullable()
});

export const CreateTeacherConversationRequestSchema = z.object({
  taskRef: z.string().min(1),
  purposeFamily: ConversationPurposeFamilySchema.default(
    "lesson_preparation"
  ),
  courseRunRef: z.string().min(1),
  lessonRef: z.string().min(1),
  purpose: z.literal("teacher-copilot.conversation.create"),
  idempotencyKey: z.string().min(8)
});

export const CreateTeacherConversationResultSchema = z.object({
  replayed: z.boolean(),
  conversation: ConversationThreadViewSchema
});

export const AppendTeacherConversationTurnRequestSchema = z.object({
  teacherText: z.string().trim().min(1).max(2000),
  parentTurnRef: z.string().min(1).nullable().default(null),
  expectedConversationVersion: z.number().int().positive(),
  purpose: z.literal("teacher-copilot.conversation.append-turn"),
  idempotencyKey: z.string().min(8)
});

export const AppendTeacherConversationTurnResultSchema = z.object({
  replayed: z.boolean(),
  conversation: ConversationThreadViewSchema,
  turn: ConversationTurnViewSchema,
  workingMemory: WorkingMemoryViewSchema
});

export const AppendTeacherCommandTurnResultSchema = z.object({
  replayed: z.boolean(),
  conversation: ConversationThreadViewSchema,
  turn: ConversationTurnViewSchema,
  workingMemory: WorkingMemoryViewSchema.nullable()
});

export const AppendAssistantCommandReceiptResultSchema = z.object({
  replayed: z.boolean(),
  conversation: ConversationThreadViewSchema,
  turn: ConversationTurnViewSchema,
  workingMemory: WorkingMemoryViewSchema.nullable()
});

export const CloseTeacherConversationRequestSchema = z.object({
  expectedConversationVersion: z.number().int().positive(),
  purpose: z.literal("teacher-copilot.conversation.close"),
  idempotencyKey: z.string().min(8)
});

export const CloseTeacherConversationResultSchema = z.object({
  replayed: z.boolean(),
  conversation: ConversationThreadViewSchema
});

export type ConversationTurnView = z.infer<
  typeof ConversationTurnViewSchema
>;
export type WorkingMemoryView = z.infer<
  typeof WorkingMemoryViewSchema
>;
export type ConversationThreadView = z.infer<
  typeof ConversationThreadViewSchema
>;
export type CreateTeacherConversationRequest = z.infer<
  typeof CreateTeacherConversationRequestSchema
>;
export type CreateTeacherConversationResult = z.infer<
  typeof CreateTeacherConversationResultSchema
>;
export type AppendTeacherConversationTurnRequest = z.infer<
  typeof AppendTeacherConversationTurnRequestSchema
>;
export type AppendTeacherConversationTurnResult = z.infer<
  typeof AppendTeacherConversationTurnResultSchema
>;
export type AppendTeacherCommandTurnResult = z.infer<
  typeof AppendTeacherCommandTurnResultSchema
>;
export type AppendAssistantCommandReceiptResult = z.infer<
  typeof AppendAssistantCommandReceiptResultSchema
>;
export type CloseTeacherConversationRequest = z.infer<
  typeof CloseTeacherConversationRequestSchema
>;
export type CloseTeacherConversationResult = z.infer<
  typeof CloseTeacherConversationResultSchema
>;

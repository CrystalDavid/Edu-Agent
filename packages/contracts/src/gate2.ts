import { z } from "zod";

export const Gate2DemoIdentitySchema = z.object({
  tenantRef: z.literal("tenant:demo-school"),
  schoolName: z.string().min(1),
  teacherRef: z.literal("user:teacher-001"),
  teacherName: z.string().min(1),
  dataMode: z.literal("synthetic"),
  modelMode: z.literal("mock")
});

export const TeachingPlanSchema = z.object({
  objective: z.string().min(1),
  lessonFocus: z.string().min(1),
  openingActivity: z.string().min(1),
  teacherQuestions: z.array(z.string().min(1)).min(1),
  studentActivity: z.string().min(1),
  supportStrategy: z.string().min(1),
  independentCheck: z.string().min(1),
  followUp: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1)
});

export const TeachingPlanFieldSchema = z.enum([
  "objective",
  "lessonFocus",
  "openingActivity",
  "teacherQuestions",
  "studentActivity",
  "supportStrategy",
  "independentCheck",
  "followUp",
  "evidenceRefs"
]);

export const TeachingPlanValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.null()
]);

export const TeachingPlanDiffChangeSchema = z.object({
  field: TeachingPlanFieldSchema,
  kind: z.enum(["added", "removed", "modified"]),
  before: TeachingPlanValueSchema,
  after: TeachingPlanValueSchema,
  reason: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)),
  teacherSelection: z.enum([
    "pending",
    "accepted",
    "rejected",
    "modified"
  ])
});

export const TeachingPlanDiffSchema = z.object({
  parentRevisionRef: z.string().min(1),
  proposalRevisionRef: z.string().min(1),
  strategyId: z.string().min(1),
  changes: z.array(TeachingPlanDiffChangeSchema)
});

export const PedagogicalStrategySchema = z.object({
  strategyId: z.string().min(1),
  title: z.string().min(1),
  rationale: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  knownGaps: z.array(z.string().min(1)).min(1),
  applicability: z.string().min(1),
  unsuitableConditions: z.array(z.string().min(1)).min(1),
  suggestedMoves: z.array(z.string().min(1)).min(1),
  followUpEvidence: z.array(z.string().min(1)).min(1),
  confidenceExplanation: z.string().min(1)
});

export const EvidenceObservationViewSchema = z.object({
  observationRef: z.string().min(1),
  attemptRef: z.string().min(1),
  learnerLabel: z.string().min(1),
  observationType: z.string().min(1),
  summary: z.string().min(1),
  observedAt: z.string().datetime(),
  sourceRef: z.string().min(1),
  assistance: z.object({
    level: z.string().min(1),
    description: z.string().min(1),
    answerReleased: z.boolean()
  }),
  unknowns: z.array(z.string().min(1))
});

export const EvidenceClaimViewSchema = z.object({
  claimRef: z.string().min(1),
  claimType: z.string().min(1),
  summary: z.string().min(1),
  status: z.enum(["candidate", "confirmed", "superseded"]),
  confidenceExplanation: z.string().min(1),
  validFrom: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  supportingObservationRefs: z.array(z.string().min(1))
});

export const TeacherTaskRequestSchema = z.object({
  requestText: z.string().trim().min(1).max(2000),
  actorRef: z.string().min(1),
  purpose: z.string().min(1),
  courseRunRef: z.string().min(1),
  learningObjectiveRefs: z.array(z.string().min(1)).min(1),
  selectedEvidenceRefs: z.array(z.string().min(1)).min(1),
  createdAt: z.string().datetime(),
  requestVersion: z.literal(1)
});

export const TeachingPlanRevisionViewSchema = z.object({
  artifactRef: z.string().min(1),
  revisionRef: z.string().min(1),
  revisionNumber: z.number().int().positive(),
  parentRevisionRef: z.string().min(1).nullable(),
  selectedStrategyId: z.string().min(1).nullable().default(null),
  teacherSelection: z
    .enum(["accepted", "modified"])
    .nullable()
    .default(null),
  state: z.enum([
    "draft",
    "proposal",
    "in_review",
    "approved",
    "published"
  ]),
  title: z.string().min(1),
  content: TeachingPlanSchema,
  createdAt: z.string().datetime()
});

export const SuggestionSummarySchema = z.object({
  proposalArtifactRef: z.string().min(1),
  proposalRevisionRef: z.string().min(1),
  taskRef: z.string().min(1),
  status: z.enum(["pending", "disposed"]),
  requestText: z.string().min(1),
  strategyTitles: z.array(z.string().min(1)).min(1),
  createdAt: z.string().datetime()
});

export const TeacherWorkspaceSchema = z.object({
  identity: Gate2DemoIdentitySchema,
  courseRun: z.object({
    courseRunRef: z.string().min(1),
    subject: z.string().min(1),
    gradeLevel: z.string().min(1),
    className: z.string().min(1),
    academicTerm: z.string().min(1)
  }),
  learningObjective: z.object({
    objectiveRef: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1)
  }),
  teachingImprovementCase: z.object({
    caseRef: z.string().min(1),
    title: z.string().min(1),
    status: z.literal("active")
  }),
  goal: z.object({
    goalRef: z.string().min(1),
    caseRef: z.string().min(1),
    title: z.string().min(1),
    successCriteria: z.array(z.string().min(1)).min(1),
    status: z.literal("active")
  }),
  evidence: z.object({
    observations: z.array(EvidenceObservationViewSchema),
    claims: z.array(EvidenceClaimViewSchema),
    estimateStatus: z.literal("not-computed"),
    estimateExplanation: z.string().min(1)
  }),
  currentTeachingPlan: TeachingPlanRevisionViewSchema,
  currentInReviewPlan:
    TeachingPlanRevisionViewSchema.nullable(),
  pendingSuggestions: z.array(SuggestionSummarySchema),
  generatedAt: z.string().datetime()
});

export const CreateTeacherCopilotTaskRequestSchema = z.object({
  requestText: z.string().trim().min(1).max(2000),
  courseRunRef: z.string().min(1),
  goalRef: z.string().min(1),
  learningObjectiveRefs: z.array(z.string().min(1)).min(1),
  selectedEvidenceRefs: z.array(z.string().min(1)).min(1),
  requestVersion: z.literal(1).default(1),
  purpose: z.string().min(1),
  idempotencyKey: z.string().min(8)
});

export const CreateTeacherCopilotTaskResultSchema = z.object({
  replayed: z.boolean(),
  taskRef: z.string().min(1),
  taskRunRef: z.string().min(1),
  agentRunRef: z.string().min(1),
  contractRef: z.string().min(1),
  request: TeacherTaskRequestSchema,
  proposalArtifactRef: z.string().min(1),
  proposalRevisionRef: z.string().min(1),
  teachingPlanArtifactRef: z.string().min(1),
  draftRevision: TeachingPlanRevisionViewSchema,
  strategies: z.array(PedagogicalStrategySchema).length(2),
  diffsByStrategy: z.record(z.string(), TeachingPlanDiffSchema),
  authorizationDecisionRef: z.string().min(1)
});

export const SuggestionDispositionKindSchema = z.enum([
  "accepted",
  "accepted_with_changes",
  "rejected",
  "deferred"
]);

export const SuggestionDispositionRequestSchema = z
  .object({
    purpose: z.string().min(1),
    idempotencyKey: z.string().min(8),
    disposition: SuggestionDispositionKindSchema,
    selectedStrategyId: z.string().min(1),
    teacherEdits: TeachingPlanSchema.partial().default({}),
    note: z.string().max(500).optional(),
    expectedProposalRevisionNumber: z.number().int().positive()
  })
  .superRefine((value, context) => {
    if (
      value.disposition === "accepted_with_changes" &&
      Object.keys(value.teacherEdits).length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["teacherEdits"],
        message: "accepted_with_changes requires at least one teacher edit"
      });
    }
  });

export const SuggestionDispositionResultSchema = z.object({
  replayed: z.boolean(),
  dispositionRef: z.string().min(1),
  disposition: SuggestionDispositionKindSchema,
  implementationObserved: z.literal(false),
  instructionalDecisionCreated: z.literal(false),
  resultingRevision: TeachingPlanRevisionViewSchema.nullable()
});

export const SuggestionDispositionViewSchema = z.object({
  dispositionRef: z.string().min(1),
  disposition: SuggestionDispositionKindSchema,
  selectedStrategyId: z.string().min(1),
  teacherEdits: TeachingPlanSchema.partial(),
  note: z.string().nullable(),
  resultingRevisionRef: z.string().nullable(),
  implementationObserved: z.literal(false),
  createdAt: z.string().datetime()
});

export const ProposalReviewDetailSchema = z.object({
  proposalArtifactRef: z.string().min(1),
  proposalRevisionRef: z.string().min(1),
  proposalRevisionNumber: z.number().int().positive(),
  status: z.enum(["pending", "disposed"]),
  taskRef: z.string().min(1),
  taskRunRef: z.string().min(1),
  agentRunRef: z.string().min(1),
  contractRef: z.string().min(1),
  teachingPlanArtifactRef: z.string().min(1),
  authorizationDecisionRef: z.string().min(1),
  request: TeacherTaskRequestSchema,
  strategies: z.array(PedagogicalStrategySchema).length(2),
  diffsByStrategy: z.record(z.string(), TeachingPlanDiffSchema),
  evidence: z.object({
    observations: z.array(EvidenceObservationViewSchema),
    claims: z.array(EvidenceClaimViewSchema)
  }),
  baselineRevision: TeachingPlanRevisionViewSchema,
  draftRevision: TeachingPlanRevisionViewSchema,
  disposition: SuggestionDispositionViewSchema.nullable(),
  inReviewRevision: TeachingPlanRevisionViewSchema.nullable()
});

export const PendingProposalListSchema = z.object({
  items: z.array(SuggestionSummarySchema),
  generatedAt: z.string().datetime()
});

export const ApproveTeachingPlanRequestSchema = z.object({
  purpose: z.literal("teacher-copilot.approve-plan"),
  idempotencyKey: z.string().min(8),
  expectedInReviewRevisionRef: z.string().min(1)
});

export const ApproveTeachingPlanResultSchema = z.object({
  replayed: z.boolean(),
  approvedRevision: TeachingPlanRevisionViewSchema,
  previousApprovedRevisionRef: z.string().min(1)
});

export const TeachingPlanStateViewSchema = z.object({
  currentApproved: TeachingPlanRevisionViewSchema,
  currentInReview: TeachingPlanRevisionViewSchema.nullable(),
  drafts: z.array(TeachingPlanRevisionViewSchema),
  history: z.array(TeachingPlanRevisionViewSchema)
});

export const RunExplanationSchema = z.object({
  task: z.object({
    taskRef: z.string().min(1),
    title: z.string().min(1),
    status: z.string().min(1),
    goalRef: z.string().min(1),
    request: TeacherTaskRequestSchema
  }),
  taskRun: z.object({
    taskRunRef: z.string().min(1),
    status: z.string().min(1),
    createdAt: z.string().datetime()
  }),
  agentRun: z.object({
    agentRunRef: z.string().min(1),
    status: z.string().min(1),
    provider: z.literal("mock"),
    modelProfile: z.string().min(1)
  }),
  contract: z.object({
    contractRef: z.string().min(1),
    profileRef: z.string().min(1),
    profileVersion: z.number().int().positive(),
    policyVersionRef: z.string().min(1),
    promptVersionRef: z.string().min(1),
    evidenceRuleVersionRef: z.string().min(1),
    contentHash: z.string().min(1)
  }),
  contextManifest: z.object({
    contextManifestRef: z.string().min(1),
    evidenceRefs: z.array(z.string().min(1)),
    resourceRefs: z.array(z.string().min(1)),
    unknowns: z.array(z.string().min(1)),
    fieldMask: z.array(z.string().min(1)),
    requestSummary: TeacherTaskRequestSchema
  }),
  authorization: z.object({
    decisionRef: z.string().min(1),
    purpose: z.string().min(1),
    action: z.string().min(1),
    effect: z.literal("allow"),
    policyVersion: z.string().min(1),
    reasonCodes: z.array(z.string().min(1))
  }),
  modelExecution: z.object({
    executionRef: z.string().min(1),
    provider: z.literal("mock"),
    promptBundleRef: z.string().min(1),
    externalNetworkUsed: z.literal(false),
    usageLabel: z.string().min(1),
    costLabel: z.literal("¥0.00（Mock）")
  }),
  artifactRevisions: z.array(
    z.object({
      revisionRef: z.string().min(1),
      artifactType: z.string().min(1),
      state: z.string().min(1),
      revisionNumber: z.number().int().positive()
    })
  ),
  disposition: z
    .object({
      dispositionRef: z.string().min(1),
      kind: SuggestionDispositionKindSchema,
      implementationObserved: z.literal(false),
      createdAt: z.string().datetime()
    })
    .nullable(),
  outbox: z.array(
    z.object({
      owner: z.string().min(1),
      eventName: z.string().min(1),
      status: z.string().min(1),
      attemptCount: z.number().int().nonnegative(),
      lastError: z.string().nullable()
    })
  ),
  auditTimeline: z.array(
    z.object({
      auditRef: z.string().min(1),
      recordType: z.string().min(1),
      action: z.string().min(1),
      actorRef: z.string().min(1),
      purpose: z.string().min(1),
      occurredAt: z.string().datetime()
    })
  )
});

export type TeachingPlan = z.infer<typeof TeachingPlanSchema>;
export type TeacherTaskRequest = z.infer<
  typeof TeacherTaskRequestSchema
>;
export type TeachingPlanDiff = z.infer<
  typeof TeachingPlanDiffSchema
>;
export type TeachingPlanDiffChange = z.infer<
  typeof TeachingPlanDiffChangeSchema
>;
export type PedagogicalStrategy = z.infer<
  typeof PedagogicalStrategySchema
>;
export type TeacherWorkspace = z.infer<
  typeof TeacherWorkspaceSchema
>;
export type CreateTeacherCopilotTaskRequest = z.infer<
  typeof CreateTeacherCopilotTaskRequestSchema
>;
export type CreateTeacherCopilotTaskResult = z.infer<
  typeof CreateTeacherCopilotTaskResultSchema
>;
export type SuggestionDispositionKind = z.infer<
  typeof SuggestionDispositionKindSchema
>;
export type SuggestionDispositionRequest = z.infer<
  typeof SuggestionDispositionRequestSchema
>;
export type SuggestionDispositionResult = z.infer<
  typeof SuggestionDispositionResultSchema
>;
export type SuggestionDispositionView = z.infer<
  typeof SuggestionDispositionViewSchema
>;
export type ProposalReviewDetail = z.infer<
  typeof ProposalReviewDetailSchema
>;
export type PendingProposalList = z.infer<
  typeof PendingProposalListSchema
>;
export type ApproveTeachingPlanRequest = z.infer<
  typeof ApproveTeachingPlanRequestSchema
>;
export type ApproveTeachingPlanResult = z.infer<
  typeof ApproveTeachingPlanResultSchema
>;
export type TeachingPlanStateView = z.infer<
  typeof TeachingPlanStateViewSchema
>;
export type RunExplanation = z.infer<typeof RunExplanationSchema>;

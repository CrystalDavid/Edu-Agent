import { createHash } from "node:crypto";

import {
  LessonPreparationSkillInputSchema,
  type LessonPreparationSkillInput
} from "./input-schema.js";

export const lessonPreparationContextBuilderVersion =
  "lesson-preparation-context-builder@1" as const;

export interface LessonPreparationContextPlan {
  readonly purpose: "lesson_preparation";
  readonly actorRef: string;
  readonly tenantRef: string;
  readonly resourceTypes: readonly string[];
  readonly fieldMask: readonly string[];
  readonly authorizationDecisionRef: string;
  readonly authorizedResourceRefs: readonly string[];
  readonly authorizedEvidenceRefs: readonly string[];
  readonly tokenBudget: number;
  readonly timeRange: {
    readonly from: string;
    readonly to: string;
  } | null;
  readonly workingSetVersion: number;
}

export interface LessonPreparationSealedContext {
  readonly contextManifestRef: string;
  readonly resourceRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly missingInformation: readonly string[];
}

export interface ContextResourceManifestEntry {
  readonly resourceRef: string;
  readonly resourceType: string;
  readonly version: string;
  readonly contentHash: string;
  readonly provenance: string;
  readonly estimatedTokens: number;
  readonly compression: "none" | "deterministic_text_limit@1";
}

export interface ExcludedContextInformation {
  readonly informationRef: string;
  readonly reason: "duplicate" | "token_budget" | "field_not_authorized";
}

export interface LessonPreparationContextEvaluation {
  readonly policyVersion: "lesson-preparation-context-evaluation@1";
  readonly passed: boolean;
  readonly authorization: {
    readonly status: "passed" | "failed";
    readonly unauthorizedRefs: readonly string[];
  };
  readonly completeness: {
    readonly status: "passed" | "failed";
    readonly missingResourceKinds: readonly string[];
  };
  readonly minimization: {
    readonly status: "passed" | "needs_review";
    readonly duplicateRefs: readonly string[];
    readonly excludedCount: number;
  };
  readonly budget: {
    readonly status: "passed" | "failed";
    readonly tokenBudget: number;
    readonly estimatedInputTokens: number;
  };
  readonly value: {
    readonly status: "passed" | "failed";
    readonly selectedEvidenceCount: number;
    readonly matchedEvidenceCount: number;
    readonly hitRate: number;
  };
  readonly issues: readonly string[];
  readonly contentHash: string;
}

export interface LessonPreparationEngineeringManifest {
  readonly schemaVersion: 1;
  readonly builderVersion: typeof lessonPreparationContextBuilderVersion;
  readonly purpose: "lesson_preparation";
  readonly contextManifestRef: string;
  readonly authorizationDecisionRef: string;
  readonly workingSetVersion: number;
  readonly fieldMask: readonly string[];
  readonly timeRange: LessonPreparationContextPlan["timeRange"];
  readonly includedResources: readonly ContextResourceManifestEntry[];
  readonly excludedInformation: readonly ExcludedContextInformation[];
  readonly missingInformation: readonly string[];
  readonly tokenUsage: {
    readonly estimator: "unicode-char-estimator@1";
    readonly budget: number;
    readonly estimatedInputTokens: number;
    readonly bySection: Readonly<Record<string, number>>;
  };
  readonly contentHash: string;
}

export interface LessonPreparationContextBuildResult {
  readonly input: LessonPreparationSkillInput;
  readonly manifest: LessonPreparationEngineeringManifest;
  readonly evaluation: LessonPreparationContextEvaluation;
}

export class LessonPreparationContextBuildError extends Error {
  constructor(
    message: string,
    readonly evaluation: LessonPreparationContextEvaluation
  ) {
    super(message);
    this.name = "LessonPreparationContextBuildError";
  }
}

export function buildLessonPreparationContext(input: {
  readonly contextPlan: LessonPreparationContextPlan;
  readonly sealedContext: LessonPreparationSealedContext;
  readonly skillInput: LessonPreparationSkillInput;
  readonly baselineRevisionRef: string;
}): LessonPreparationContextBuildResult {
  const parsed = LessonPreparationSkillInputSchema.parse(input.skillInput);
  const compressed = compressSkillInput(parsed);
  const excludedInformation = compressionExclusions(parsed, compressed);
  const requiredResources = requiredResourceRefs(
    compressed,
    input.baselineRevisionRef
  );
  const duplicateRefs = duplicates([
    ...input.sealedContext.resourceRefs,
    ...input.sealedContext.evidenceRefs
  ]);
  const planResourceSet = new Set(input.contextPlan.authorizedResourceRefs);
  const sealedResourceSet = new Set(input.sealedContext.resourceRefs);
  const unauthorizedRefs = requiredResources
    .map((resource) => resource.resourceRef)
    .filter(
      (resourceRef) =>
        !planResourceSet.has(resourceRef) ||
        !sealedResourceSet.has(resourceRef)
    );
  const evidenceConsistency = compareEvidenceRefs({
    selected: compressed.request.selectedEvidenceRefs,
    authorized: input.contextPlan.authorizedEvidenceRefs,
    sealed: input.sealedContext.evidenceRefs,
    retrieved: compressed.authorizedEvidence.map(
      (evidence) => evidence.evidenceRef
    )
  });
  unauthorizedRefs.push(...evidenceConsistency.unauthorizedRefs);

  const requiredResourceKinds = [
    "course_run",
    "curriculum_unit",
    "lesson",
    "learning_objective",
    "teaching_plan",
    "authorized_evidence"
  ];
  const missingResourceKinds = requiredResourceKinds.filter(
    (kind) => !input.contextPlan.resourceTypes.includes(kind)
  );
  if (!input.contextPlan.authorizationDecisionRef.trim()) {
    missingResourceKinds.push("authorization_decision");
  }
  if (!input.contextPlan.actorRef.trim() || !input.contextPlan.tenantRef.trim()) {
    missingResourceKinds.push("acting_context");
  }
  if (
    input.contextPlan.workingSetVersion !==
    compressed.taskWorkingSet.version
  ) {
    missingResourceKinds.push("current_task_working_set");
  }
  if (
    input.contextPlan.fieldMask.length === 0 ||
    compressed.taskWorkingSet.requestedFieldMask.some(
      (field) => !input.contextPlan.fieldMask.includes(field)
    )
  ) {
    missingResourceKinds.push("authorized_field_mask");
  }

  const includedResources = buildResourceManifest(
    compressed,
    input.baselineRevisionRef
  );
  const bySection = sectionTokenUsage(compressed);
  const estimatedInputTokens = Object.values(bySection).reduce(
    (total, tokens) => total + tokens,
    0
  );
  const issues = [
    ...unique(unauthorizedRefs).map(
      (reference) => `Context resource is not authorized and sealed: ${reference}`
    ),
    ...unique(missingResourceKinds).map(
      (kind) => `Required context resource is missing: ${kind}`
    )
  ];
  if (estimatedInputTokens > input.contextPlan.tokenBudget) {
    issues.push(
      `Estimated context tokens ${estimatedInputTokens} exceed budget ${input.contextPlan.tokenBudget}.`
    );
  }
  const selectedEvidenceCount = compressed.request.selectedEvidenceRefs.length;
  const matchedEvidenceCount = evidenceConsistency.matchedCount;
  if (selectedEvidenceCount > 0 && matchedEvidenceCount !== selectedEvidenceCount) {
    issues.push("Not every teacher-selected Evidence ref reached the model context.");
  }

  const evaluationWithoutHash = {
    policyVersion: "lesson-preparation-context-evaluation@1" as const,
    passed: issues.length === 0,
    authorization: {
      status: unauthorizedRefs.length === 0 ? "passed" as const : "failed" as const,
      unauthorizedRefs: unique(unauthorizedRefs)
    },
    completeness: {
      status: missingResourceKinds.length === 0 ? "passed" as const : "failed" as const,
      missingResourceKinds: unique(missingResourceKinds)
    },
    minimization: {
      status: duplicateRefs.length === 0
        ? "passed" as const
        : "needs_review" as const,
      duplicateRefs,
      excludedCount: excludedInformation.length
    },
    budget: {
      status: estimatedInputTokens <= input.contextPlan.tokenBudget
        ? "passed" as const
        : "failed" as const,
      tokenBudget: input.contextPlan.tokenBudget,
      estimatedInputTokens
    },
    value: {
      status: selectedEvidenceCount === matchedEvidenceCount
        ? "passed" as const
        : "failed" as const,
      selectedEvidenceCount,
      matchedEvidenceCount,
      hitRate: selectedEvidenceCount === 0
        ? 1
        : matchedEvidenceCount / selectedEvidenceCount
    },
    issues: unique(issues)
  };
  const evaluation = deepFreeze({
    ...evaluationWithoutHash,
    contentHash: hashValue(evaluationWithoutHash)
  });
  if (!evaluation.passed) {
    throw new LessonPreparationContextBuildError(
      `Lesson Preparation context evaluation failed: ${evaluation.issues.join(" ")}`,
      evaluation
    );
  }

  const manifestWithoutHash = {
    schemaVersion: 1 as const,
    builderVersion: lessonPreparationContextBuilderVersion,
    purpose: "lesson_preparation" as const,
    contextManifestRef: input.sealedContext.contextManifestRef,
    authorizationDecisionRef: input.contextPlan.authorizationDecisionRef,
    workingSetVersion: input.contextPlan.workingSetVersion,
    fieldMask: unique(input.contextPlan.fieldMask),
    timeRange: input.contextPlan.timeRange,
    includedResources,
    excludedInformation,
    missingInformation: unique([
      ...input.sealedContext.missingInformation,
      ...compressed.evidenceGaps
    ]),
    tokenUsage: {
      estimator: "unicode-char-estimator@1" as const,
      budget: input.contextPlan.tokenBudget,
      estimatedInputTokens,
      bySection
    }
  };
  const manifest = deepFreeze({
    ...manifestWithoutHash,
    contentHash: hashValue(manifestWithoutHash)
  });
  return deepFreeze({ input: compressed, manifest, evaluation });
}

function compressSkillInput(
  input: LessonPreparationSkillInput
): LessonPreparationSkillInput {
  return LessonPreparationSkillInputSchema.parse({
    ...input,
    request: {
      ...input.request,
      requestText: compactText(input.request.requestText, 1_600)
    },
    curriculumUnit: {
      ...input.curriculumUnit,
      description: compactText(input.curriculumUnit.description, 800)
    },
    learningObjectives: input.learningObjectives.map((objective) => ({
      ...objective,
      title: compactText(objective.title, 240),
      description: compactText(objective.description, 600)
    })),
    currentApprovedTeachingPlan: {
      ...input.currentApprovedTeachingPlan,
      objective: compactText(input.currentApprovedTeachingPlan.objective, 1_200),
      lessonFocus: compactText(input.currentApprovedTeachingPlan.lessonFocus, 1_200),
      openingActivity: compactText(input.currentApprovedTeachingPlan.openingActivity, 1_200),
      teacherQuestions: input.currentApprovedTeachingPlan.teacherQuestions.map(
        (question) => compactText(question, 480)
      ),
      studentActivity: compactText(input.currentApprovedTeachingPlan.studentActivity, 1_200),
      supportStrategy: compactText(input.currentApprovedTeachingPlan.supportStrategy, 1_200),
      independentCheck: compactText(input.currentApprovedTeachingPlan.independentCheck, 1_200),
      followUp: compactText(input.currentApprovedTeachingPlan.followUp, 1_200)
    },
    authorizedEvidence: input.authorizedEvidence.map((evidence) => ({
      ...evidence,
      summary: compactText(evidence.summary, 800),
      ...(evidence.unknowns
        ? { unknowns: unique(evidence.unknowns.map((item) => compactText(item, 320))) }
        : {})
    })),
    evidenceGaps: unique(
      input.evidenceGaps.map((gap) => compactText(gap, 320))
    )
  });
}

function requiredResourceRefs(
  input: LessonPreparationSkillInput,
  baselineRevisionRef: string
): readonly { resourceRef: string; resourceType: string }[] {
  return [
    { resourceRef: input.courseRun.courseRunRef, resourceType: "course_run" },
    { resourceRef: input.curriculumUnit.unitRef, resourceType: "curriculum_unit" },
    { resourceRef: input.lesson.lessonRef, resourceType: "lesson" },
    ...input.learningObjectives.map((objective) => ({
      resourceRef: objective.objectiveRef,
      resourceType: "learning_objective"
    })),
    { resourceRef: baselineRevisionRef, resourceType: "teaching_plan" }
  ];
}

function buildResourceManifest(
  input: LessonPreparationSkillInput,
  baselineRevisionRef: string
): readonly ContextResourceManifestEntry[] {
  const resources: Array<ContextResourceManifestEntry & { priority: number }> = [
    entry(input.lesson.lessonRef, "lesson", "read-model@1", "education.lesson", input.lesson, 10),
    ...input.learningObjectives.map((objective) =>
      entry(objective.objectiveRef, "learning_objective", "read-model@1", "education.learning_objective", objective, 20)
    ),
    entry(baselineRevisionRef, "teaching_plan", baselineRevisionRef, "artifact.teaching_plan_revision", input.currentApprovedTeachingPlan, 30),
    ...input.authorizedEvidence.map((evidence, index) =>
      entry(evidence.evidenceRef, "authorized_evidence", evidence.status ?? `selected@${input.taskWorkingSet.version}`, "education.evidence", evidence, 40 + index)
    ),
    entry(input.curriculumUnit.unitRef, "curriculum_unit", "read-model@1", "education.curriculum_unit", input.curriculumUnit, 80),
    entry(input.courseRun.courseRunRef, "course_run", "read-model@1", "education.course_run", input.courseRun, 90),
    entry(`task-run-request:${input.taskRunRef}:${input.request.requestVersion}`, "teacher_request", String(input.request.requestVersion), "work.task_run_request", input.request, 100),
    entry(input.interactionContract.contractRef, "interaction_contract", input.interactionContract.policyVersionRef, "runtime.interaction_contract", input.interactionContract, 110)
  ];
  return resources
    .sort((left, right) => left.priority - right.priority || left.resourceRef.localeCompare(right.resourceRef))
    .map(({ priority: _priority, ...resource }) => resource);
}

function entry(
  resourceRef: string,
  resourceType: string,
  version: string,
  provenance: string,
  value: unknown,
  priority: number
): ContextResourceManifestEntry & { priority: number } {
  return {
    resourceRef,
    resourceType,
    version,
    contentHash: hashValue(value),
    provenance,
    estimatedTokens: estimateTokens(value),
    compression: containsTruncation(value)
      ? "deterministic_text_limit@1"
      : "none",
    priority
  };
}

function sectionTokenUsage(
  input: LessonPreparationSkillInput
): Readonly<Record<string, number>> {
  return Object.freeze({
    teacherRequest: estimateTokens(input.request),
    courseScope: estimateTokens({
      courseRun: input.courseRun,
      curriculumUnit: input.curriculumUnit,
      lesson: input.lesson
    }),
    learningObjectives: estimateTokens(input.learningObjectives),
    approvedTeachingPlan: estimateTokens(input.currentApprovedTeachingPlan),
    authorizedEvidence: estimateTokens(input.authorizedEvidence),
    evidenceGaps: estimateTokens(input.evidenceGaps),
    interactionContract: estimateTokens(input.interactionContract),
    taskWorkingSet: estimateTokens(input.taskWorkingSet)
  });
}

function compressionExclusions(
  before: LessonPreparationSkillInput,
  after: LessonPreparationSkillInput
): readonly ExcludedContextInformation[] {
  const excluded: ExcludedContextInformation[] = [];
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    excluded.push({
      informationRef: `context-compression:${hashValue(before)}`,
      reason: "token_budget"
    });
  }
  const duplicateGaps = duplicates(before.evidenceGaps);
  excluded.push(...duplicateGaps.map((gap) => ({
    informationRef: `duplicate-gap:${hashValue(gap)}`,
    reason: "duplicate" as const
  })));
  return excluded;
}

function compareEvidenceRefs(input: {
  selected: readonly string[];
  authorized: readonly string[];
  sealed: readonly string[];
  retrieved: readonly string[];
}): { readonly unauthorizedRefs: string[]; readonly matchedCount: number } {
  const authorized = new Set(input.authorized);
  const sealed = new Set(input.sealed);
  const retrieved = new Set(input.retrieved);
  const unauthorizedRefs = unique([
    ...input.selected.filter((ref) => !authorized.has(ref) || !sealed.has(ref) || !retrieved.has(ref)),
    ...input.retrieved.filter((ref) => !authorized.has(ref) || !sealed.has(ref))
  ]);
  return {
    unauthorizedRefs,
    matchedCount: unique(input.selected).filter(
      (ref) => authorized.has(ref) && sealed.has(ref) && retrieved.has(ref)
    ).length
  };
}

function compactText(value: string, maxLength: number): string {
  const compacted = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function containsTruncation(value: unknown): boolean {
  return JSON.stringify(value).includes("…");
}

export function estimateContextTokens(value: unknown): number {
  return estimateTokens(value);
}

function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  let units = 0;
  for (const character of text) {
    units += character.codePointAt(0)! <= 0x7f ? 0.25 : 0.5;
  }
  return Math.max(1, Math.ceil(units));
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function hashValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

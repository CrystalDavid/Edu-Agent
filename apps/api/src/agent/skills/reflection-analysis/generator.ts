import { createHash } from "node:crypto";

import {
  StructuredReflectionOutputSchema,
  type StructuredReflectionOutput
} from "@edu-agent/contracts";

import type { ReflectionAnalysisSkillInput } from "./input-schema.js";
import {
  ReflectionAnalysisSkillOutputSchema,
  type ReflectionActionCandidate,
  type ReflectionAnalysisSkillOutput
} from "./output-schema.js";

export function normalizeReflectionAnalysisDraft(input: {
  context: ReflectionAnalysisSkillInput;
  modelOutput: StructuredReflectionOutput;
  knownGaps?: readonly string[];
}): ReflectionAnalysisSkillOutput {
  const modelOutput = StructuredReflectionOutputSchema.parse(input.modelOutput);
  const deliveryRef = input.context.confirmedDelivery.deliveryRevisionRef;
  const planRef = input.context.approvedTeachingPlan.revisionRef;
  const observationRefs = input.context.confirmedObservations.map(
    (item) => item.observationRevisionRef
  );
  const evidenceRefs = input.context.selectedEvidence.map(
    (item) => item.evidenceRef
  );
  const factualBasis = unique([
    deliveryRef,
    planRef,
    ...observationRefs,
    ...evidenceRefs
  ]);
  const interpretationBasis = unique([
    ...factualBasis,
    ...(input.context.lessonBrief ? [input.context.lessonBrief.briefRef] : [])
  ]);
  const facts = [
    {
      text: modelOutput.plannedVsImplemented,
      basisRefs: [planRef, deliveryRef],
      status: "confirmed_source" as const
    },
    ...modelOutput.observationSummary.map((text) => ({
      text,
      basisRefs: observationRefs.length > 0 ? observationRefs : [deliveryRef],
      status: "confirmed_source" as const
    }))
  ];
  const interpretations = [
    {
      text: modelOutput.objectiveAttainment,
      basisRefs: interpretationBasis,
      confidence: "agent_interpretation" as const
    },
    ...modelOutput.effectiveMoves.map((text) => ({
      text,
      basisRefs: [planRef, deliveryRef],
      confidence: "agent_interpretation" as const
    })),
    ...modelOutput.ineffectiveMoves.map((text) => ({
      text,
      basisRefs: [planRef, deliveryRef],
      confidence: "agent_interpretation" as const
    })),
    ...modelOutput.evidenceAlignment.map((text) => ({
      text,
      basisRefs: evidenceRefs.length > 0
        ? unique([deliveryRef, ...evidenceRefs])
        : [deliveryRef],
      confidence: "agent_interpretation" as const
    }))
  ];
  const actionCandidates = createActionCandidates({
    sourceRefs: factualBasis,
    nextLessonSuggestions: modelOutput.nextLessonSuggestions,
    assignmentSuggestions: modelOutput.assignmentSuggestions,
    uncertainties: modelOutput.uncertainties
  });
  const knownGaps = unique([
    ...(input.knownGaps ?? []),
    ...(input.context.lessonBrief
      ? input.context.lessonBrief.knownGaps
      : ["当前课时没有教师已采用的 Lesson Brief"]),
    ...(observationRefs.length === 0
      ? ["本次没有教师明确选择的已确认课堂观察"]
      : []),
    ...(evidenceRefs.length === 0
      ? ["本次没有教师明确选择的 Assignment Evidence"]
      : [])
  ]);
  return ReflectionAnalysisSkillOutputSchema.parse({
    schemaVersion: "reflection-analysis-draft@1",
    whatHappened: { facts },
    whatItMeans: {
      interpretations,
      uncertainties: modelOutput.uncertainties
    },
    whatNext: { actionCandidates },
    reflectionContent: {
      objectiveAttainment: modelOutput.objectiveAttainment,
      plannedVsImplemented: modelOutput.plannedVsImplemented,
      effectiveMoves: modelOutput.effectiveMoves,
      ineffectiveMoves: modelOutput.ineffectiveMoves,
      observationSummary: modelOutput.observationSummary,
      evidenceAlignment: modelOutput.evidenceAlignment,
      uncertainties: modelOutput.uncertainties,
      nextLessonSuggestions: modelOutput.nextLessonSuggestions,
      assignmentSuggestions: modelOutput.assignmentSuggestions,
      teacherNotes: modelOutput.teacherNotes
    },
    knownGaps,
    teacherConfirmationRequired: true
  });
}

function createActionCandidates(input: {
  sourceRefs: readonly string[];
  nextLessonSuggestions: readonly string[];
  assignmentSuggestions: readonly string[];
  uncertainties: readonly string[];
}): ReflectionActionCandidate[] {
  const candidates: ReflectionActionCandidate[] = [];
  if (input.nextLessonSuggestions.length > 0) {
    candidates.push(candidate(
      "lesson_preparation",
      "调整下一课教学重点",
      input.nextLessonSuggestions.join("；"),
      input.sourceRefs
    ));
  }
  if (input.assignmentSuggestions.length > 0) {
    candidates.push(candidate(
      "assignment_draft",
      "生成补充练习草稿",
      input.assignmentSuggestions.join("；"),
      input.sourceRefs
    ));
  }
  if (input.uncertainties.length > 0) {
    candidates.push(candidate(
      "teacher_todo",
      "复核仍不确定的问题",
      input.uncertainties.join("；"),
      input.sourceRefs
    ));
  }
  return candidates.slice(0, 3);
}

function candidate(
  actionType: ReflectionActionCandidate["actionType"],
  title: string,
  rationale: string,
  basisRefs: readonly string[]
): ReflectionActionCandidate {
  return {
    candidateId: `reflection-action:${actionType}:${sha256({ actionType, rationale }).slice(0, 20)}`,
    actionType,
    title,
    rationale: rationale.slice(0, 4_000),
    basisRefs: [...basisRefs],
    status: "candidate",
    teacherConfirmationRequired: true
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

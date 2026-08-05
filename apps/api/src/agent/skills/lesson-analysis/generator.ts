import { createHash } from "node:crypto";

import type { LessonBriefCandidateItem } from "@edu-agent/contracts";

import type { LessonAnalysisSkillInput } from "./input-schema.js";
import {
  LessonAnalysisSkillOutputSchema,
  type LessonAnalysisSkillOutput
} from "./output-schema.js";

export function generateLessonBriefCandidate(
  input: LessonAnalysisSkillInput
): LessonAnalysisSkillOutput {
  const objectiveSummaries = input.objectives.map((objective) => ({
    objectiveRef: objective.objectiveRef,
    title: objective.title,
    summary: objective.description,
    sourceRefs: [objective.objectiveRef]
  }));
  const teachingFocusCandidates: LessonBriefCandidateItem[] = [];
  if (input.approvedTeachingPlan) {
    teachingFocusCandidates.push(candidate({
      prefix: "focus-plan",
      title: input.approvedTeachingPlan.lessonFocus,
      explanation: "来自当前已批准教学计划，可作为本次理解课时的起点，但不表示课堂已经实施。",
      basisRefs: [input.approvedTeachingPlan.revisionRef],
      confidence: "high"
    }));
  }
  for (const objective of input.objectives.slice(0, 3)) {
    teachingFocusCandidates.push(candidate({
      prefix: "focus-objective",
      title: `围绕“${objective.title}”组织本课判断`,
      explanation: objective.description,
      basisRefs: [objective.objectiveRef],
      confidence: "medium"
    }));
  }
  if (input.teacherAdjustment) {
    const adjustmentRef = `teacher-adjustment:${hash(input.teacherAdjustment).slice(0, 24)}`;
    teachingFocusCandidates.unshift(candidate({
      prefix: "focus-adjustment",
      title: "按教师本次调整意图重新聚焦",
      explanation: input.teacherAdjustment,
      basisRefs: [adjustmentRef],
      confidence: "high"
    }));
  }

  const classEvidenceSummary = input.evidence.map((item) => ({
    evidenceRef: item.evidenceRef,
    evidenceType: item.evidenceType,
    summary: item.summary,
    objectiveRefs: item.objectiveRefs,
    observedAt: item.observedAt,
    status: item.status,
    sourceRefs: item.sourceRefs
  }));
  const difficultyCandidates = input.evidence.slice(0, 3).map((item) =>
    candidate({
      prefix: "difficulty-evidence",
      title: `关注：${shorten(item.summary, 42)}`,
      explanation: "该难点候选来自当前课时已授权 Evidence，仍需教师结合课堂情况确认。",
      basisRefs: [item.evidenceRef],
      confidence: item.status === "confirmed" ? "high" : "medium"
    })
  );
  if (difficultyCandidates.length === 0) {
    for (const objective of input.objectives.slice(0, 2)) {
      difficultyCandidates.push(candidate({
        prefix: "difficulty-objective",
        title: `确认学生能否完成“${objective.title}”`,
        explanation: "当前缺少班级 Evidence，此项只根据教学目标形成低置信候选。",
        basisRefs: [objective.objectiveRef],
        confidence: "low"
      }));
    }
  }
  const suggestedAttentionPoints = [
    ...input.evidence.slice(0, 3).map((item) => candidate({
      prefix: "attention-evidence",
      title: shorten(item.summary, 50),
      explanation: "备课时可优先核对该现象是否仍然存在，并设计一个快速检查。",
      basisRefs: [item.evidenceRef],
      confidence: item.status === "confirmed" ? "high" : "medium"
    })),
    ...(input.approvedTeachingPlan
      ? [candidate({
          prefix: "attention-plan",
          title: "核对已批准方案与当前班级 Evidence 是否一致",
          explanation: input.approvedTeachingPlan.supportStrategy,
          basisRefs: [
            input.approvedTeachingPlan.revisionRef,
            ...input.evidence.slice(0, 1).map((item) => item.evidenceRef)
          ],
          confidence: input.evidence.length > 0 ? "medium" : "low"
        })]
      : [])
  ];
  const knownGaps = [
    "尚未接入教材知识源",
    "尚未接入课程标准知识源",
    "尚未接入考点知识源",
    ...(input.evidence.length === 0
      ? ["当前课时没有已授权且可追溯的班级 Evidence"]
      : []),
    ...(input.approvedTeachingPlan
      ? []
      : ["当前课时没有已批准 TeachingPlan 可用于对照"])
  ];
  return LessonAnalysisSkillOutputSchema.parse({
    schemaVersion: "lesson-brief-candidate@1",
    objectiveSummaries,
    teachingFocusCandidates: uniqueCandidates(teachingFocusCandidates),
    difficultyCandidates: uniqueCandidates(difficultyCandidates),
    classEvidenceSummary,
    suggestedAttentionPoints: uniqueCandidates(suggestedAttentionPoints),
    knownGaps
  });
}

function candidate(input: {
  prefix: string;
  title: string;
  explanation: string;
  basisRefs: string[];
  confidence: "high" | "medium" | "low";
}): LessonBriefCandidateItem {
  const basisRefs = [...new Set(input.basisRefs)].filter(Boolean);
  return {
    candidateId: `${input.prefix}:${hash({ title: input.title, basisRefs }).slice(0, 16)}`,
    title: input.title,
    explanation: input.explanation,
    basisRefs,
    confidence: input.confidence,
    candidateOnly: true
  };
}

function uniqueCandidates(items: readonly LessonBriefCandidateItem[]) {
  return [...new Map(items.map((item) => [item.candidateId, item])).values()];
}

function shorten(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

import { createHash } from "node:crypto";

import type {
  ClassroomReflectionSkillInput,
  QuickClassroomSection
} from "./input-schema.js";
import {
  ClassroomReflectionSkillOutputSchema,
  type ClassroomObservationCandidate,
  type ClassroomReflectionSkillOutput
} from "./output-schema.js";

const sectionLabels: Record<QuickClassroomSection, string> = {
  opening: "导入",
  explanation: "讲解",
  activity: "活动",
  practice: "练习",
  summary: "总结"
};

export function generateClassroomReflectionDraft(
  input: ClassroomReflectionSkillInput
): ClassroomReflectionSkillOutput {
  const abnormal = new Set(input.teacherFeedback.abnormalSections);
  if (
    input.teacherFeedback.overall !== "as_planned" &&
    abnormal.size === 0
  ) {
    abnormal.add("summary");
  }
  const feedbackRef = `teacher-feedback:${sha256(input.teacherFeedback).slice(0, 24)}`;
  const planRef = input.approvedTeachingPlan.revisionRef;
  const planned = plannedSegments(input);
  const steps = planned.map((segment, sequence) => {
    const isAbnormal = abnormal.has(segment.key);
    const disposition = dispositionFor(
      input.teacherFeedback.overall,
      isAbnormal
    );
    return {
      stepKey: segment.key,
      sequence,
      title: sectionLabels[segment.key],
      plannedDescription: segment.description,
      actualDescription: actualDescription(
        disposition,
        segment.description,
        input.teacherFeedback.note
      ),
      disposition,
      rationale: rationaleFor(
        disposition,
        input.teacherFeedback.note
      )
    };
  });
  const unresolvedQuestions = unresolvedFor(
    input.teacherFeedback.studentResponse
  );
  const paceNotes = paceFor(input.teacherFeedback.pace);
  const followUpNotes = followUpFor(
    input.teacherFeedback.studentResponse,
    input.teacherFeedback.note
  );
  const observationCandidates = candidatesFor({
    input,
    abnormal,
    feedbackRef,
    planRef
  });
  const actualTime = deliveryTime(input);
  const changed = steps.filter((step) => step.disposition !== "adopted");
  const adopted = steps.filter((step) => step.disposition === "adopted");
  const knownGaps = unique([
    ...(input.evidence.length === 0
      ? ["未使用作业 Evidence，学生反应仅来自教师本次快速反馈"]
      : []),
    ...(input.observationDrafts.length === 0
      ? ["Observation Candidate 尚未成为正式课堂观察"]
      : []),
    "课堂实施草稿必须由教师确认后才成为正式事实",
    "一次课堂反馈不得用于形成长期学生能力标签"
  ]);
  return ClassroomReflectionSkillOutputSchema.parse({
    schemaVersion: "classroom-delivery-draft@1",
    deliveryDraft: {
      teachingPlanRevisionRef: planRef,
      calendarEventRef: null,
      actualStartAt: actualTime.start,
      actualEndAt: actualTime.end,
      steps,
      paceNotes,
      unresolvedQuestions,
      followUpNotes
    },
    deliverySummary: summaryFor(input, changed.map((item) => item.title)),
    observationCandidates,
    reflectionInput: {
      plannedVsImplemented:
        changed.length > 0
          ? changed.map((step) =>
              `${step.title}：${step.actualDescription}`
            )
          : ["教师快速反馈为基本按已批准教学计划实施，仍待教师确认。"],
      effectiveSegments: adopted.map((step) => step.title),
      uncertainQuestions: unresolvedQuestions,
      suggestedNextActions: suggestedActions(input)
    },
    knownGaps
  });
}

function plannedSegments(input: ClassroomReflectionSkillInput) {
  const plan = input.approvedTeachingPlan.content;
  return [
    { key: "opening" as const, description: plan.openingActivity },
    {
      key: "explanation" as const,
      description: `${plan.lessonFocus}；关键提问：${plan.teacherQuestions.join("；")}`
    },
    { key: "activity" as const, description: plan.studentActivity },
    { key: "practice" as const, description: plan.independentCheck },
    { key: "summary" as const, description: plan.followUp }
  ];
}

function dispositionFor(
  overall: ClassroomReflectionSkillInput["teacherFeedback"]["overall"],
  isAbnormal: boolean
) {
  if (!isAbnormal) return "adopted" as const;
  return overall === "incomplete" ? "skipped" as const : "adjusted" as const;
}

function actualDescription(
  disposition: "adopted" | "adjusted" | "skipped",
  plannedDescription: string,
  note: string | null
): string {
  if (disposition === "adopted") {
    return `候选：按已批准计划实施——${plannedDescription}`;
  }
  if (disposition === "skipped") {
    return `候选：本节课未完成该环节；原计划为——${plannedDescription}`;
  }
  return `候选：本环节在原计划基础上有现场调整——${plannedDescription}${note ? `；教师补充：${note}` : ""}`;
}

function rationaleFor(
  disposition: "adopted" | "adjusted" | "skipped",
  note: string | null
): string {
  if (disposition === "adopted") {
    return "来自教师快速反馈“基本按计划/该环节未标记异常”，仍待教师确认。";
  }
  if (disposition === "skipped") {
    return `来自教师快速反馈“未完成”${note ? `；${note}` : ""}，仍待教师确认。`;
  }
  return `来自教师快速反馈“有调整”${note ? `；${note}` : ""}，仍待教师确认。`;
}

function paceFor(
  pace: ClassroomReflectionSkillInput["teacherFeedback"]["pace"]
): string {
  return {
    on_pace: "教师快速反馈：课堂节奏基本正常；这是待确认草稿。",
    slower: "教师快速反馈：课堂节奏比计划慢；具体影响范围待教师确认。",
    faster: "教师快速反馈：课堂节奏比计划快；具体原因待教师确认。"
  }[pace];
}

function unresolvedFor(
  response: ClassroomReflectionSkillInput["teacherFeedback"]["studentResponse"]
): string[] {
  return {
    attained: [],
    partial_difficulty: [
      "部分学生仍有困难；具体概念、题目和影响范围需要教师复核。"
    ],
    needs_review: [
      "本节课内容需要复习；复习范围和学习目标需要教师确认。"
    ]
  }[response];
}

function followUpFor(
  response: ClassroomReflectionSkillInput["teacherFeedback"]["studentResponse"],
  note: string | null
): string {
  const base = {
    attained: "建议教师确认本次目标达成判断，并决定是否进入下一课。",
    partial_difficulty: "建议教师复核困难点，并选择是否补充练习或调整下一课。",
    needs_review: "建议教师明确复习范围，再显式创建后续备课或练习任务。"
  }[response];
  return note ? `${base} 教师补充：${note}` : base;
}

function candidatesFor(input: {
  input: ClassroomReflectionSkillInput;
  abnormal: ReadonlySet<QuickClassroomSection>;
  feedbackRef: string;
  planRef: string;
}): ClassroomObservationCandidate[] {
  const basisRefs = [input.feedbackRef, input.planRef];
  const response = input.input.teacherFeedback.studentResponse;
  const responseCandidate: Omit<ClassroomObservationCandidate, "candidateId"> = {
    status: "candidate",
    scope: "class",
    scopeRef: null,
    observationType:
      response === "attained"
        ? "achievement"
        : response === "partial_difficulty"
          ? "confusion"
          : "unresolved",
    content: {
      attained: "候选观察：教师快速反馈显示，本节课预期目标总体达成。",
      partial_difficulty:
        "候选观察：教师快速反馈显示，部分学生仍存在困难，具体范围待教师复核。",
      needs_review:
        "候选观察：教师快速反馈显示，本节课内容需要复习，具体范围待教师复核。"
    }[response],
    basisRefs,
    confidence: "teacher_signal",
    teacherConfirmationRequired: true
  };
  const candidates: ClassroomObservationCandidate[] = [
    withCandidateId(responseCandidate)
  ];
  if (input.input.teacherFeedback.pace !== "on_pace") {
    candidates.push(withCandidateId({
      status: "candidate",
      scope: "class",
      scopeRef: null,
      observationType: "timing",
      content:
        input.input.teacherFeedback.pace === "slower"
          ? "候选观察：本节课节奏比计划慢，原因和影响范围待教师确认。"
          : "候选观察：本节课节奏比计划快，原因和影响范围待教师确认。",
      basisRefs,
      confidence: "teacher_signal",
      teacherConfirmationRequired: true
    }));
  }
  for (const section of input.abnormal) {
    candidates.push(withCandidateId({
      status: "candidate",
      scope: "activity",
      scopeRef: `delivery-step:${section}`,
      observationType: "activity_effectiveness",
      content: `候选观察：教师标记“${sectionLabels[section]}”环节存在实际差异，具体表现待教师确认。`,
      basisRefs,
      confidence: "teacher_signal",
      teacherConfirmationRequired: true
    }));
  }
  return candidates.slice(0, 8);
}

function withCandidateId(
  value: Omit<ClassroomObservationCandidate, "candidateId">
): ClassroomObservationCandidate {
  return {
    candidateId: `observation-candidate:${sha256(value).slice(0, 24)}`,
    ...value
  };
}

function deliveryTime(input: ClassroomReflectionSkillInput) {
  const durationMs = input.lesson.durationMinutes * 60_000;
  if (input.lesson.plannedAt) {
    const start = new Date(input.lesson.plannedAt);
    return {
      start: start.toISOString(),
      end: new Date(start.getTime() + durationMs).toISOString()
    };
  }
  const end = new Date(input.generatedAt);
  return {
    start: new Date(end.getTime() - durationMs).toISOString(),
    end: end.toISOString()
  };
}

function summaryFor(
  input: ClassroomReflectionSkillInput,
  changedSections: readonly string[]
): string {
  const overall = {
    as_planned: "本节课基本按已批准教学计划进行",
    adjusted: "本节课在已批准教学计划基础上有现场调整",
    incomplete: "本节课未完成全部计划环节"
  }[input.teacherFeedback.overall];
  const pace = {
    on_pace: "节奏正常",
    slower: "节奏比计划慢",
    faster: "节奏比计划快"
  }[input.teacherFeedback.pace];
  const changed = changedSections.length > 0
    ? `；需重点确认：${changedSections.join("、")}`
    : "";
  return `待教师确认：${overall}，${pace}${changed}。`;
}

function suggestedActions(input: ClassroomReflectionSkillInput): string[] {
  const actions = ["教师确认或调整课堂实施草稿"];
  if (input.teacherFeedback.studentResponse === "partial_difficulty") {
    actions.push("复核具体困难点，再决定是否补充练习");
  }
  if (input.teacherFeedback.studentResponse === "needs_review") {
    actions.push("明确复习范围，再决定下一课调整");
  }
  if (input.teacherFeedback.overall !== "as_planned") {
    actions.push("确认计划差异是否需要进入课后反思");
  }
  return actions;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

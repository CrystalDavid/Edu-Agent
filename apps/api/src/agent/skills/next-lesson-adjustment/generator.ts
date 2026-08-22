import { createHash } from "node:crypto";

import type { NextLessonAdjustmentSkillInput } from "./input-schema.js";
import {
  NextLessonAdjustmentSkillOutputSchema,
  type NextLessonAdjustmentSkillOutput
} from "./output-schema.js";

export function generateNextLessonActions(
  input: NextLessonAdjustmentSkillInput
): NextLessonAdjustmentSkillOutput {
  const reflection = input.confirmedReflection.content;
  const basis = [
    input.confirmedReflection.reflectionRevisionRef,
    input.confirmedDelivery.deliveryRevisionRef,
    ...input.selectedEvidence.map((item) => item.evidenceRef)
  ];
  const candidates: NextLessonAdjustmentSkillOutput["candidates"] = [];
  const nextFocus = reflection.nextLessonSuggestions.join("；") ||
    `依据本节课复盘，在“${input.targetLesson.title}”中继续校准目标与课堂节奏。`;
  candidates.push(candidate({
    candidateType: "adjust_next_lesson_focus",
    title: `调整“${input.targetLesson.title}”的教学重点`,
    reason: withAdjustment(nextFocus, input.teacherAdjustment),
    confidence: reflection.nextLessonSuggestions.length > 0 ? "high" : "medium",
    targetLessonRef: input.targetLesson.lessonRef,
    basisRefs: basis
  }));
  if (reflection.assignmentSuggestions.length > 0) {
    candidates.push(candidate({
      candidateType: "create_practice_task",
      title: "创建针对性补充练习草稿",
      reason: reflection.assignmentSuggestions.join("；"),
      confidence: input.selectedEvidence.length > 0 ? "high" : "medium",
      targetLessonRef: input.targetLesson.lessonRef,
      basisRefs: basis
    }));
  }
  if (reflection.uncertainties.length > 0) {
    candidates.push(candidate({
      candidateType: "review_student_issue",
      title: "复查仍不确定的学习现象",
      reason: reflection.uncertainties.join("；"),
      confidence: "medium",
      targetLessonRef: input.targetLesson.lessonRef,
      basisRefs: basis
    }));
  } else if (reflection.teacherNotes.trim()) {
    candidates.push(candidate({
      candidateType: "create_teacher_todo",
      title: "跟进本节课教师补充事项",
      reason: reflection.teacherNotes,
      confidence: "medium",
      targetLessonRef: null,
      basisRefs: basis
    }));
  }
  return NextLessonAdjustmentSkillOutputSchema.parse({
    schemaVersion: "next-lesson-action-candidates@1",
    candidates: candidates.slice(0, 3),
    knownGaps: [
      ...(input.selectedEvidence.length === 0
        ? ["未选择 Assignment Evidence，练习建议仅基于教师已确认 Reflection"]
        : []),
      "尚未接入教材知识源",
      "尚未接入课程标准知识源"
    ],
    teacherConfirmationRequired: true
  });
}

function candidate(input: Omit<
  NextLessonAdjustmentSkillOutput["candidates"][number],
  "candidateKey" | "teacherConfirmationRequired"
>): NextLessonAdjustmentSkillOutput["candidates"][number] {
  return {
    candidateKey: `next-action:${input.candidateType}:${sha256(input).slice(0, 20)}`,
    ...input,
    teacherConfirmationRequired: true
  };
}

function withAdjustment(value: string, adjustment: string | null): string {
  return adjustment ? `${value}；教师补充要求：${adjustment}` : value;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

import type {
  MaterialContentDraft,
  MaterialKind,
  TeachingPlan
} from "@edu-agent/contracts";

import type { MaterialGenerationSkillInput } from "./input-schema.js";
import {
  MaterialGenerationSkillOutputSchema,
  type MaterialGenerationSkillOutput
} from "./output-schema.js";

export function generateMaterialDrafts(
  input: MaterialGenerationSkillInput
): MaterialGenerationSkillOutput {
  return MaterialGenerationSkillOutputSchema.parse({
    schemaVersion: "material-content-draft@1",
    drafts: input.requestedKinds.map((kind) =>
      draftForKind(kind, input)
    )
  });
}

function draftForKind(
  kind: MaterialKind,
  input: MaterialGenerationSkillInput
): MaterialContentDraft {
  const plan = input.approvedTeachingPlan.content;
  const sources = unique([
    input.lesson.source.ref,
    input.approvedTeachingPlan.source.ref,
    ...(input.lessonBrief ? [input.lessonBrief.source.ref] : []),
    ...input.evidence.map((item) => item.source.ref),
    ...input.confirmedPreferences.map((item) => item.source.ref)
  ]);
  const knownGaps = unique([
    ...(input.lessonBrief?.knownGaps ?? []),
    ...(input.evidence.length === 0
      ? ["没有已授权 Evidence 可用于验证练习与分层建议"]
      : []),
    "材料未使用尚未接入的教材或课程标准知识源",
    "材料是待教师确认的 Draft，不表示已经用于课堂"
  ]);
  const content = render(kind, input.lesson.title, plan, input);
  return {
    kind,
    title: `${input.lesson.title} · ${materialLabel(kind)}`,
    contentMarkdown: [
      content,
      input.teacherAdjustment
        ? `\n## 本次教师调整\n\n${input.teacherAdjustment}`
        : "",
      `\n## 使用前确认\n\n- 来源方案：TeachingPlan Revision ${input.approvedTeachingPlan.revisionNumber}\n- 本材料仍需教师预览和采用。\n- ${knownGaps.join("\n- ")}`
    ].filter(Boolean).join("\n"),
    sourceRefs: sources,
    knownGaps
  };
}

function render(
  kind: MaterialKind,
  lessonTitle: string,
  plan: TeachingPlan,
  input: MaterialGenerationSkillInput
): string {
  const focus = selectedBriefSummary(input) || plan.lessonFocus;
  const evidence = input.evidence.length > 0
    ? input.evidence.map((item) => `- ${item.summary}`).join("\n")
    : "- 当前没有已授权的班级 Evidence 摘要。";
  const preferences = input.confirmedPreferences.length > 0
    ? input.confirmedPreferences
        .map((item) => `- ${item.preferenceKey}：${item.preferenceValue}`)
        .join("\n")
    : "- 当前没有已确认的教师表达偏好。";
  switch (kind) {
    case "lesson_plan":
      return `# ${lessonTitle} 教案草稿\n\n## 教学目标\n\n${plan.objective}\n\n## 教学重点\n\n${focus}\n\n## 导入\n\n${plan.openingActivity}\n\n## 课堂流程\n\n1. 教师提问：${plan.teacherQuestions.join("；")}\n2. 学生活动：${plan.studentActivity}\n3. 支持策略：${plan.supportStrategy}\n4. 独立检查：${plan.independentCheck}\n5. 后续安排：${plan.followUp}\n\n## 当前班级依据\n\n${evidence}`;
    case "slide_outline":
      return `# ${lessonTitle} PPT 大纲\n\n> 这是页面内容大纲，不是已生成的 PowerPoint 文件。\n\n1. **课题与目标**：${plan.objective}\n2. **情境导入**：${plan.openingActivity}\n3. **核心概念**：${focus}\n4. **关键提问**：${plan.teacherQuestions.join("；")}\n5. **课堂活动**：${plan.studentActivity}\n6. **独立检查与小结**：${plan.independentCheck}\n7. **课后衔接**：${plan.followUp}`;
    case "exercise_set":
      return `# ${lessonTitle} 课堂练习草稿\n\n## 快速诊断\n\n1. 用一句话说明：${plan.teacherQuestions[0]}\n2. 完成并解释：${plan.independentCheck}\n\n## 分步练习\n\n1. 复述本课目标中的关键条件：${plan.objective}\n2. 按教师提示完成一次同类判断。\n3. 写出容易出错的一步，并说明如何检查。\n\n## 教师参考\n\n- 观察重点：${focus}\n- 支持方式：${plan.supportStrategy}\n\n## Evidence 提醒\n\n${evidence}`;
    case "board_design":
      return `# ${lessonTitle} 板书设计草稿\n\n## 左区：本课目标\n\n${plan.objective}\n\n## 中区：核心结构\n\n1. ${focus}\n2. 关键提问：${plan.teacherQuestions.slice(0, 2).join("；")}\n3. 学生活动结论：${plan.studentActivity}\n\n## 右区：检查与总结\n\n- 独立检查：${plan.independentCheck}\n- 后续任务：${plan.followUp}\n\n> 建议只保留课堂需要持续可见的信息，其余内容通过口头或材料呈现。`;
    case "differentiated_support":
      return `# ${lessonTitle} 分层支持材料草稿\n\n## 基础支架\n\n- 把目标拆成两个可判断步骤：${plan.objective}\n- 使用提示：${plan.supportStrategy}\n\n## 标准任务\n\n- 完成：${plan.independentCheck}\n- 说明使用的依据与检查方式。\n\n## 拓展任务\n\n- 改变一个条件，解释结论会如何变化。\n- 用另一种表示方式说明：${focus}\n\n## 已确认教师偏好\n\n${preferences}\n\n## 当前 Evidence\n\n${evidence}`;
  }
}

function selectedBriefSummary(input: MaterialGenerationSkillInput): string {
  if (!input.lessonBrief) return "";
  return [
    ...input.lessonBrief.teachingFocus,
    ...input.lessonBrief.difficultyFocus,
    ...input.lessonBrief.attentionPoints
  ].map((item) => item.title).slice(0, 3).join("；");
}

function materialLabel(kind: MaterialKind): string {
  return {
    lesson_plan: "教案",
    slide_outline: "PPT 大纲",
    exercise_set: "课堂练习",
    board_design: "板书设计",
    differentiated_support: "分层支持"
  }[kind];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

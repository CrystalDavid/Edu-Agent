import type {
  LessonPreparationStatus,
  ModelExecutionStatus
} from "@edu-agent/contracts";

export function cleanDisplayText(value: string): string {
  return value
    .replace(/合成学生\s*S[-\s]?0*(\d+)/gi, "学生 $1")
    .replace(/\s*[（(]合成[）)]/g, "")
    .replace(/合成样本/g, "示例样本")
    .replace(/合成数据/g, "示例数据")
    .replace(/合成的/g, "示例的")
    .replace(/合成/g, "")
    .replace(/\blearner\b/gi, "学生")
    .replace(/Worked Example/gi, "示例解答")
    .replace(/TeachingPlan Revision\s*\d+/gi, "当前教学方案")
    .replace(/教学计划第\s*\d+\s*版/gu, "当前教学方案")
    .replace(/教学方案第\s*\d+\s*版/gu, "当前教学方案")
    .replace(/\bProposal\b/gi, "候选方案")
    .replace(/\bDraft\b/gi, "待确认内容")
    .replace(/Observation Candidate/gi, "观察建议")
    .replace(/已批准的?教学计划/gu, "老师确认的教学方案")
    .replace(/已批准教学方案/gu, "老师确认的教学方案")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function cleanTeacherPreviewText(value: string): string {
  const withoutFrontMatter = value.replace(
    /^\uFEFF?---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/u,
    ""
  );
  const internalField = /^(?:schema|kind|lesson|teachingPlanRevision|skill|agentRun|contextManifest|sourceRef|revisionRef|assetRef|contentHash|hash)\s*:/iu;
  const technicalPreviewLine = /^(?:[-*]\s*)?(?:来源方案|source\s*ref|artifact|revision|hash|schema)\s*[:：]/iu;

  return withoutFrontMatter
    .split(/\r?\n/u)
    .filter((line) => !internalField.test(line.trim()) && !technicalPreviewLine.test(line.trim()))
    .map((line) => cleanDisplayText(line))
    .join("\n")
    .replace(/已批准/gu, "已确认")
    .replace(/草稿\s*·\s*基于\s+当前教学方案\s*·\s*待教师采用/gu, " · 来自当前教学方案 · 等待确认")
    .replace(/待教师确认的\s*待确认内容/gu, "等待老师确认的内容")
    .replace(/待教师采用/gu, "等待老师确认")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function workProjectionStatusLabel(status: string): string {
  return teacherStatusLabel(status);
}

export type TeacherStatusTone = "incomplete" | "progress" | "complete";

const completeStatuses = new Set([
  "approved",
  "adopted",
  "available",
  "completed",
  "confirmed",
  "current_approved",
  "historical_approved",
  "published",
  "ready_for_use",
  "succeeded"
]);

const incompleteStatuses = new Set([
  "blocked",
  "budget_exceeded",
  "cancelled",
  "failed",
  "missing",
  "needs_attention",
  "not_started",
  "not_submitted",
  "outdated",
  "permanently_failed",
  "retryable_failed",
  "timed_out",
  "validation_failed"
]);

export function teacherStatusTone(status: string): TeacherStatusTone {
  if (completeStatuses.has(status)) return "complete";
  if (incompleteStatuses.has(status)) return "incomplete";
  return "progress";
}

export function teacherStatusLabel(status: string): "未完成" | "进行中" | "已完成" {
  const tone = teacherStatusTone(status);
  if (tone === "complete") return "已完成";
  if (tone === "incomplete") return "未完成";
  return "进行中";
}

export function calendarEventTypeLabel(eventType: string): string {
  return {
    class: "上课",
    meeting: "会议",
    grading: "批改",
    lesson_preparation: "备课",
    duty: "巡班 / 值班",
    school_affair: "学校事务",
    custom_reminder: "个人提醒",
    todo_time_block: "待办时间块",
    assignment_deadline: "作业截止"
  }[eventType] ?? "日程";
}

export function teacherPreferenceLabel(preferenceKey: string): string {
  return {
    lesson_plan_detail: "教案详细程度",
    lesson_plan_style: "教案表达风格",
    example_preference: "案例偏好",
    response_length: "建议篇幅"
  }[preferenceKey] ?? "自定义偏好";
}

export function workSourceLabel(source: string): string {
  return {
    work: "教学任务",
    education: "课程",
    artifact: "教学成果",
    capability: "助手"
  }[source] ?? "待处理";
}

export function roleLabel(role: string): string {
  return {
    ordinary_teacher: "任课教师",
    school_admin: "学校管理员",
    subject_lead: "学科负责人",
    homeroom_teacher: "班主任"
  }[role] ?? "学校成员";
}

export function membershipStatusLabel(status: string): string {
  return status === "active" ? "已完成" : status === "suspended" ? "未完成" : "进行中";
}

export function authenticationMethodLabel(method: string): string {
  return {
    "local-identity": "手机号登录",
    oidc: "统一身份登录",
    "server-session": "安全会话",
    "demo-bypass": "账号登录",
    "test-fixture": "账号登录"
  }[method] ?? "安全会话";
}

export function teachingPlanStateLabel(
  state:
    | "draft"
    | "proposal"
    | "in_review"
    | "superseded"
    | "approved"
    | "published"
): string {
  return teacherStatusLabel(state);
}

export function lessonPreparationStatusLabel(
  status: LessonPreparationStatus | "not_started"
): string {
  return teacherStatusLabel(status);
}

export function modelExecutionStatusLabel(
  status: ModelExecutionStatus | string
): string {
  return teacherStatusLabel(status);
}

export function lessonPlanProjectionStatusLabel(
  status:
    | "active_in_review"
    | "current_approved"
    | "draft"
    | "historical_approved"
    | "superseded"
): string {
  return teacherStatusLabel(status);
}

export function claimStateLabel(
  state: "candidate" | "confirmed" | "superseded"
): string {
  return teacherStatusLabel(state);
}

export function formatDisplayDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function shortReference(reference: string): string {
  const suffix = reference.split(":").at(-1) ?? reference;
  return suffix
    .replace(/^observation-?/i, "观察 ")
    .replace(/^claim-?/i, "解释 ")
    .replace(/^revision-?/i, "版本 ");
}

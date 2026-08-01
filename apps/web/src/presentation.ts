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
    .replace(/Worked Example/gi, "示例解答")
    .replace(/\s{2,}/g, " ")
    .trim();
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
  return {
    draft: "草稿",
    proposal: "建议草稿",
    in_review: "待审核",
    superseded: "已被新版取代",
    approved: "已批准",
    published: "已发布"
  }[state];
}

export function lessonPreparationStatusLabel(
  status: LessonPreparationStatus | "not_started"
): string {
  return {
    not_started: "未开始",
    planned: "已计划",
    in_progress: "备课中",
    awaiting_plan_review: "待审核",
    ready_for_use: "已准备，待完成",
    completed: "已完成",
    cancelled: "已取消"
  }[status];
}

export function modelExecutionStatusLabel(
  status: ModelExecutionStatus | string
): string {
  const labels: Record<ModelExecutionStatus, string> = {
    queued: "等待生成",
    running: "正在生成",
    validating: "正在验证",
    retryable_failed: "正在重试",
    succeeded: "已完成",
    cancel_requested: "正在取消",
    cancelled: "已取消",
    timed_out: "生成超时",
    validation_failed: "验证失败",
    permanently_failed: "暂时不可用",
    budget_exceeded: "预算超限"
  };
  return labels[status as ModelExecutionStatus] ?? status;
}

export function lessonPlanProjectionStatusLabel(
  status:
    | "active_in_review"
    | "current_approved"
    | "draft"
    | "historical_approved"
    | "superseded"
): string {
  return {
    active_in_review: "当前待审核",
    current_approved: "当前已批准",
    draft: "草稿",
    historical_approved: "历史已批准",
    superseded: "已被新版取代"
  }[status];
}

export function claimStateLabel(
  state: "candidate" | "confirmed" | "superseded"
): string {
  return {
    candidate: "待复核",
    confirmed: "已确认",
    superseded: "已更新"
  }[state];
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

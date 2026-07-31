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

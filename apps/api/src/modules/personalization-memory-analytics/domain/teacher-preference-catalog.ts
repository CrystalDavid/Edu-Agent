import { createHash } from "node:crypto";

export const teacherPreferenceCatalogVersion =
  "teacher-preference-catalog@1" as const;

export interface TeacherPreferenceCatalogMatch {
  readonly canonicalKey:
    | "lesson_plan_length"
    | "lesson_plan_detail"
    | "lesson_plan_style"
    | "example_preference"
    | "response_length";
  readonly preferenceKey: string;
  readonly canonicalValue: string;
  readonly safeDisplayValue: string;
  readonly displayLabel: string;
  readonly parsingRuleId: string;
}

type CatalogRule = TeacherPreferenceCatalogMatch & {
  readonly patterns: readonly RegExp[];
};

const rules: readonly CatalogRule[] = Object.freeze([
  rule({
    canonicalKey: "lesson_plan_length",
    preferenceKey: "lesson_plan_length",
    canonicalValue: "一页以内",
    safeDisplayValue: "一页以内",
    displayLabel: "教案长度",
    parsingRuleId: "catalog.lesson-plan-length.one-page@1",
    patterns: [
      /^(?:教案)?(?:控制|保持)(?:在)?一页(?:以内)?$/u,
      /^(?:教案)?(?:不要|不)超过一页$/u
    ]
  }),
  rule({
    canonicalKey: "lesson_plan_detail",
    preferenceKey: "lesson_plan_detail",
    canonicalValue: "简洁",
    safeDisplayValue: "简洁",
    displayLabel: "教案详细程度",
    parsingRuleId: "catalog.lesson-plan-detail.concise@1",
    patterns: [
      /^教案(?:尽量|要|写得|写)?(?:简洁|精简)(?:一些|一点)?$/u
    ]
  }),
  rule({
    canonicalKey: "lesson_plan_detail",
    preferenceKey: "lesson_plan_detail",
    canonicalValue: "详细",
    safeDisplayValue: "详细",
    displayLabel: "教案详细程度",
    parsingRuleId: "catalog.lesson-plan-detail.detailed@1",
    patterns: [
      /^教案(?:尽量|要|写得|写)?详细(?:一些|一点)?$/u
    ]
  }),
  rule({
    canonicalKey: "lesson_plan_style",
    preferenceKey: "lesson_plan_style",
    canonicalValue: "表达自然",
    safeDisplayValue: "表达自然",
    displayLabel: "教案表达风格",
    parsingRuleId: "catalog.lesson-plan-style.natural@1",
    patterns: [
      /^(?:教案)?表达(?:要|尽量)?自然$/u
    ]
  }),
  rule({
    canonicalKey: "lesson_plan_style",
    preferenceKey: "lesson_plan_style",
    canonicalValue: "结构清晰",
    safeDisplayValue: "结构清晰",
    displayLabel: "教案表达风格",
    parsingRuleId: "catalog.lesson-plan-style.structured@1",
    patterns: [
      /^(?:教案)?结构(?:要|尽量)?清晰$/u
    ]
  }),
  rule({
    canonicalKey: "lesson_plan_style",
    preferenceKey: "lesson_plan_style",
    canonicalValue: "少用生硬术语",
    safeDisplayValue: "少用生硬术语",
    displayLabel: "教案表达风格",
    parsingRuleId: "catalog.lesson-plan-style.plain-language@1",
    patterns: [
      /^(?:教案)?少用生硬(?:的)?术语$/u
    ]
  }),
  rule({
    canonicalKey: "example_preference",
    preferenceKey: "example_preference",
    canonicalValue: "优先使用贴近日常生活的案例",
    safeDisplayValue: "优先使用贴近日常生活的案例",
    displayLabel: "案例偏好",
    parsingRuleId: "catalog.example-preference.daily-life@1",
    patterns: [
      /^(?:案例|例子)(?:尽量|优先)?(?:贴近|来自)(?:真实)?日常?生活(?:情境)?$/u,
      /^(?:多用|优先使用)生活化案例$/u
    ]
  }),
  rule({
    canonicalKey: "response_length",
    preferenceKey: "response_length",
    canonicalValue: "简短",
    safeDisplayValue: "简短",
    displayLabel: "建议篇幅",
    parsingRuleId: "catalog.response-length.concise@1",
    patterns: [
      /^(?:给我的)?(?:建议|回复)(?:尽量|要|写得|写)?(?:简短|简洁)(?:一些|一点)?$/u
    ]
  }),
  rule({
    canonicalKey: "response_length",
    preferenceKey: "response_length",
    canonicalValue: "详细",
    safeDisplayValue: "详细",
    displayLabel: "建议篇幅",
    parsingRuleId: "catalog.response-length.detailed@1",
    patterns: [
      /^(?:给我的)?(?:建议|回复)(?:可以|尽量|要|写得|写)?详细(?:一些|一点)?$/u
    ]
  })
]);

const catalogDescriptor = rules.map(
  ({ patterns: _patterns, ...entry }) => Object.freeze(entry)
);
const catalogHashDescriptor = rules.map(({ patterns, ...entry }) => ({
  ...entry,
  patterns: patterns.map((pattern) => ({
    source: pattern.source,
    flags: pattern.flags
  }))
}));

export const teacherPreferenceCatalogContentHash = createHash("sha256")
  .update(JSON.stringify(catalogHashDescriptor))
  .digest("hex");

export const teacherPreferenceCatalog = Object.freeze({
  version: teacherPreferenceCatalogVersion,
  contentHash: teacherPreferenceCatalogContentHash,
  entries: Object.freeze(catalogDescriptor)
});

export function matchTeacherPreferenceCatalog(
  clause: string
): TeacherPreferenceCatalogMatch | null {
  for (const { patterns, ...entry } of rules) {
    if (patterns.some((pattern) => pattern.test(clause))) {
      return Object.freeze(entry);
    }
  }
  return null;
}

export function teacherPreferenceCatalogLabel(canonicalKey: string): string {
  return catalogDescriptor.find((entry) => entry.canonicalKey === canonicalKey)
    ?.displayLabel ?? "教师偏好";
}

function rule(input: CatalogRule): CatalogRule {
  return Object.freeze({ ...input, patterns: Object.freeze(input.patterns) });
}

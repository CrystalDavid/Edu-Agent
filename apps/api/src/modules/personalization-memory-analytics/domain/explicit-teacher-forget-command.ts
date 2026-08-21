import { createHash } from "node:crypto";

import {
  ExplicitTeacherForgetCommandInterpretationSchema,
  type ExplicitForgetInterpretedTarget,
  type ExplicitForgetIntent,
  type ExplicitTeacherForgetCommandInterpretation
} from "@edu-agent/contracts";

import { createMemoryScope } from "./memory-scope.js";
import {
  teacherPreferenceCatalog,
  teacherPreferenceCatalogContentHash,
  teacherPreferenceCatalogVersion
} from "./teacher-preference-catalog.js";
import type { TeacherPreference } from "./memory-candidate.js";

export const explicitForgetCommandInterpreterVersion =
  "explicit-forget-command-interpreter@1" as const;

export interface ExplicitTeacherForgetCommandInput {
  readonly teacherText: string;
  readonly sourceTurnRef: string;
  readonly sourceTurnSequence: number;
  readonly sourceTurnContentHash: string;
  readonly tenantRef: string;
  readonly teacherRef: string;
  readonly taskRef: string;
  readonly courseRunRef: string;
  readonly lessonRef: string;
  readonly skillId: "lesson-preparation";
  readonly flags: {
    readonly explicitForgetEnabled: boolean;
  };
  readonly at: string;
}

export interface ExplicitForgetPreferenceMatch {
  readonly target: ExplicitForgetInterpretedTarget;
  readonly preferences: readonly TeacherPreference[];
}

export interface ExplicitForgetPlan {
  readonly kind:
    | "unique"
    | "selection_required"
    | "nothing_to_forget"
    | "rejected";
  readonly matches: readonly ExplicitForgetPreferenceMatch[];
  readonly preferences: readonly TeacherPreference[];
}

type ForgetDetection = {
  readonly intent: ExplicitForgetIntent;
  readonly issue: string | null;
};

type ForgetAliasRule = {
  readonly canonicalKey:
    | "lesson_plan_length"
    | "lesson_plan_detail"
    | "lesson_plan_style"
    | "example_preference"
    | "response_length";
  readonly parsingRuleId: string;
  readonly patterns: readonly RegExp[];
};

const forgetPattern =
  /忘掉|忘记|不要再记|取消(?:之前的)?|撤销(?:之前的)?|删除(?:我保存的|之前的)?/u;
const negativeRememberPattern = /不要记住|别记住|无需记住|不用记住/u;
const temporaryPattern = /这次|本次|临时|仅本次|当前输出|这节课/u;
const temporaryNegativePattern = /不要(?:再)?使用|不要用|不用|别用/u;
const currentCoursePattern = /这门课|当前课程|这个班|当前这个班/u;
const globalPattern = /所有普通备课|全局|平时的|默认的/u;
const unsupportedNamedScopePattern =
  /(?:[一二三四五六七八九十\d]+年级|语文|数学|英语|物理|化学|生物|历史|地理|政治).{0,10}(?:课程|班|课|偏好)/u;
const highRiskPattern =
  /学生|学员|某同学|learner|成绩|分数|低分|高分|纪律|健康|诊断|家庭|敏感身份|密码|口令|token|secret|cookie|手机号|身份证|电话号码|邮箱|api\s*key|系统提示|system\s*prompt|忽略.{0,12}指令|工具调用|跳过.{0,8}审批|自动审批|Evidence|证据结论|权限|正式教学事实/iu;

const aliasRules: readonly ForgetAliasRule[] = Object.freeze([
  rule({
    canonicalKey: "lesson_plan_length",
    parsingRuleId: "forget-catalog.lesson-plan-length@1",
    patterns: [
      /教案(?:的)?(?:长度|篇幅)/gu,
      /一页(?:以内)?(?:的)?教案(?:要求)?/gu,
      /一页教案/gu
    ]
  }),
  rule({
    canonicalKey: "lesson_plan_detail",
    parsingRuleId: "forget-catalog.lesson-plan-detail@1",
    patterns: [
      /教案(?:的)?详细程度/gu,
      /教案(?:简洁还是详细|简洁或详细)/gu
    ]
  }),
  rule({
    canonicalKey: "lesson_plan_style",
    parsingRuleId: "forget-catalog.lesson-plan-style@1",
    patterns: [
      /教案(?:的)?(?:表达风格|风格)/gu,
      /表达自然/gu,
      /结构清晰/gu
    ]
  }),
  rule({
    canonicalKey: "example_preference",
    parsingRuleId: "forget-catalog.example-preference@1",
    patterns: [
      /生活化案例/gu,
      /案例(?:类型|偏好)?/gu
    ]
  }),
  rule({
    canonicalKey: "response_length",
    parsingRuleId: "forget-catalog.response-length@1",
    patterns: [
      /建议(?:的)?(?:篇幅|长度)/gu,
      /回复(?:的)?(?:长度|篇幅)/gu
    ]
  })
]);

export function detectExplicitTeacherForgetIntent(
  teacherText: string
): ForgetDetection {
  const text = normalize(teacherText);
  const outsideQuotes = removeQuotedText(text);
  if (!outsideQuotes || negativeRememberPattern.test(outsideQuotes)) {
    return { intent: "none", issue: null };
  }
  if (
    temporaryPattern.test(outsideQuotes) &&
    temporaryNegativePattern.test(outsideQuotes) &&
    !forgetPattern.test(outsideQuotes)
  ) {
    return {
      intent: "temporary_override",
      issue: "temporary_override_not_implemented"
    };
  }
  if (!forgetPattern.test(outsideQuotes)) {
    return { intent: "none", issue: null };
  }
  if (highRiskPattern.test(outsideQuotes)) {
    return { intent: "rejected", issue: "unsafe_forget_target" };
  }
  return { intent: "forget", issue: null };
}

export function interpretExplicitTeacherForgetCommand(
  input: ExplicitTeacherForgetCommandInput
): ExplicitTeacherForgetCommandInterpretation {
  const text = normalize(input.teacherText);
  const outsideQuotes = removeQuotedText(text);
  const detection = detectExplicitTeacherForgetIntent(text);
  const base = {
    interpreterVersion: explicitForgetCommandInterpreterVersion,
    catalogVersion: teacherPreferenceCatalogVersion,
    catalogContentHash: teacherPreferenceCatalogContentHash,
    commandContentHash: commandHash(input, text),
    sourceTurnRef: input.sourceTurnRef,
    sourceTurnSequence: input.sourceTurnSequence,
    sourceTurnContentHash: input.sourceTurnContentHash
  };
  if (detection.intent !== "forget") {
    return parse({
      ...base,
      intent: detection.intent,
      fullCoverage:
        detection.intent === "temporary_override" ||
        detection.intent === "rejected",
      targets: [],
      residualText: "",
      issues: detection.issue ? [detection.issue] : []
    });
  }
  if (!input.flags.explicitForgetEnabled) {
    return parse({
      ...base,
      intent: "unsupported",
      fullCoverage: false,
      targets: [],
      residualText: "",
      issues: ["explicit_forget_disabled"]
    });
  }
  if (unsupportedNamedScopePattern.test(outsideQuotes)) {
    return parse({
      ...base,
      intent: "unsupported",
      fullCoverage: false,
      targets: [],
      residualText: outsideQuotes,
      issues: ["unsupported_named_scope"]
    });
  }
  const currentCourse = currentCoursePattern.test(outsideQuotes);
  const global = globalPattern.test(outsideQuotes);
  if (currentCourse && global) {
    return parse({
      ...base,
      intent: "unsupported",
      fullCoverage: false,
      targets: [],
      residualText: outsideQuotes,
      issues: ["conflicting_scope_selector"]
    });
  }
  const requestedScopeKind = currentCourse
    ? "course_run" as const
    : global
      ? "global" as const
      : "unspecified" as const;
  const requestedScopeFingerprint = requestedScopeKind === "unspecified"
    ? null
    : createMemoryScope(requestedScopeKind === "course_run"
      ? {
          kind: "course_run",
          subject: null,
          gradeLevel: null,
          courseRunRef: input.courseRunRef,
          lessonRef: null,
          taskRef: null,
          skillIds: ["lesson-preparation"]
        }
      : {
          kind: "global",
          subject: null,
          gradeLevel: null,
          courseRunRef: null,
          lessonRef: null,
          taskRef: null,
          skillIds: ["lesson-preparation"]
        }).fingerprint;
  const targets = aliasRules.flatMap((alias) =>
    alias.patterns.some((pattern) => matches(pattern, outsideQuotes))
      ? [{
          canonicalKey: alias.canonicalKey,
          canonicalValue: null,
          requestedScopeKind,
          requestedScopeFingerprint,
          parsingRuleId: alias.parsingRuleId
        } satisfies ExplicitForgetInterpretedTarget]
      : []
  ).sort((left, right) =>
    left.canonicalKey.localeCompare(right.canonicalKey)
  );
  const residualText = forgetResidual(outsideQuotes);
  const issues = [
    ...(targets.length === 0 ? ["catalog_target_not_found"] : []),
    ...(residualText ? ["unparsed_residual_text"] : [])
  ];
  const fullCoverage = targets.length > 0 && !residualText;
  return parse({
    ...base,
    intent: fullCoverage ? "forget" : "unsupported",
    fullCoverage,
    targets: fullCoverage ? targets : [],
    residualText,
    issues
  });
}

export function planExplicitTeacherForget(input: {
  readonly command: Extract<
    ExplicitTeacherForgetCommandInterpretation,
    { readonly intent: "forget" }
  >;
  readonly preferences: readonly TeacherPreference[];
  readonly currentCourseRunRef: string;
  readonly maxOptions?: number;
}): ExplicitForgetPlan {
  const matches = input.command.targets.map((target) => Object.freeze({
    target,
    preferences: Object.freeze(input.preferences.filter((preference) =>
      explicitForgetTargetMatchesPreference(
        target,
        preference,
        input.currentCourseRunRef
      )
    ))
  }));
  const preferences = uniquePreferences(
    matches.flatMap((entry) => entry.preferences)
  );
  const kind = preferences.length > (input.maxOptions ?? 10)
    ? "rejected" as const
    : matches.some((entry) => entry.preferences.length === 0)
      ? "nothing_to_forget" as const
      : matches.some((entry) => entry.preferences.length > 1)
        ? "selection_required" as const
        : "unique" as const;
  return Object.freeze({
    kind,
    matches: Object.freeze(matches),
    preferences: Object.freeze(preferences)
  });
}

export function explicitForgetTargetMatchesPreference(
  target: ExplicitForgetInterpretedTarget,
  preference: TeacherPreference,
  currentCourseRunRef: string
): boolean {
  if (
    preference.status !== "active" ||
    preference.canonicalKey !== target.canonicalKey ||
    (target.canonicalValue !== null &&
      preference.preferenceValue !== target.canonicalValue) ||
    (preference.scope.skillIds.length > 0 &&
      !preference.scope.skillIds.includes("lesson-preparation"))
  ) {
    return false;
  }
  if (target.requestedScopeKind === "global") {
    return preference.scope.kind === "global";
  }
  if (target.requestedScopeKind === "course_run") {
    return preference.scope.kind === "course_run" &&
      preference.scope.courseRunRef === currentCourseRunRef;
  }
  return preference.scope.kind === "global" ||
    (preference.scope.kind === "course_run" &&
      preference.scope.courseRunRef === currentCourseRunRef);
}

function forgetResidual(value: string): string {
  let residual = value;
  for (const alias of aliasRules) {
    for (const pattern of alias.patterns) residual = residual.replace(pattern, " ");
  }
  return normalize(residual
    .replace(/忘掉|忘记|不要再记|取消|撤销|删除/gu, " ")
    .replace(/所有普通备课|当前这个班|当前课程|这门课|这个班|全局|平时的|默认的/gu, " ")
    .replace(/我保存的|我之前|之前的|之前|我|所有|关于|对于|对|已保存的|保存的|那条|这条|要求|偏好|的/gu, " ")
    .replace(/以及|并且|同时|和|与|、|，|,|。|；|;|：|:|请|帮我|麻烦/gu, " "));
}

function matches(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  const matched = pattern.test(value);
  pattern.lastIndex = 0;
  return matched;
}

function uniquePreferences(
  preferences: readonly TeacherPreference[]
): TeacherPreference[] {
  return [...new Map(preferences.map((preference) => [
    preference.preferenceRef,
    preference
  ])).values()].sort((left, right) =>
    left.preferenceRef.localeCompare(right.preferenceRef)
  );
}

function removeQuotedText(value: string): string {
  return value
    .replace(/“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』|"[^"]*"|'[^']*'/gu, " ")
    .trim();
}

function rule(input: ForgetAliasRule): ForgetAliasRule {
  if (!teacherPreferenceCatalog.entries.some(
    (entry) => entry.canonicalKey === input.canonicalKey
  )) {
    throw new Error("Forget alias must reference teacher-preference-catalog@1.");
  }
  return Object.freeze({ ...input, patterns: Object.freeze(input.patterns) });
}

function commandHash(
  input: ExplicitTeacherForgetCommandInput,
  normalizedText: string
): string {
  return hash({
    owner: { tenantRef: input.tenantRef, teacherRef: input.teacherRef },
    sourceTurnRef: input.sourceTurnRef,
    sourceTurnSequence: input.sourceTurnSequence,
    sourceTurnContentHash: input.sourceTurnContentHash,
    taskRef: input.taskRef,
    courseRunRef: input.courseRunRef,
    lessonRef: input.lessonRef,
    skillId: input.skillId,
    flags: input.flags,
    at: new Date(input.at).toISOString(),
    normalizedText,
    interpreterVersion: explicitForgetCommandInterpreterVersion,
    catalogVersion: teacherPreferenceCatalogVersion,
    catalogContentHash: teacherPreferenceCatalogContentHash
  });
}

function parse(value: unknown): ExplicitTeacherForgetCommandInterpretation {
  return Object.freeze(
    ExplicitTeacherForgetCommandInterpretationSchema.parse(value)
  );
}

function normalize(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalize(record[key])])
    );
  }
  return value;
}

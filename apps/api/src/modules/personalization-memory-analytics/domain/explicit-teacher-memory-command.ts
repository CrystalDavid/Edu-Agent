import { createHash } from "node:crypto";

import {
  ExplicitTeacherMemoryCommandInterpretationSchema,
  type ExplicitRememberInterpretedItem,
  type ExplicitTeacherMemoryCommandInterpretation,
  type TeacherMemoryCommandIntent
} from "@edu-agent/contracts";

import { createMemoryScope } from "./memory-scope.js";
import {
  matchTeacherPreferenceCatalog,
  teacherPreferenceCatalogContentHash,
  teacherPreferenceCatalogVersion
} from "./teacher-preference-catalog.js";

export const explicitMemoryCommandInterpreterVersion =
  "explicit-memory-command-interpreter@1" as const;

export interface ExplicitTeacherMemoryCommandInput {
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
    readonly explicitRememberEnabled: boolean;
    readonly scopedPreferencesEnabled: boolean;
  };
  readonly at: string;
}

type IntentDetection = {
  readonly intent: TeacherMemoryCommandIntent;
  readonly durableIntentMarker: string | null;
  readonly issue: string | null;
};

const durableMarkerPattern =
  /请记住|帮我记住|从现在起|以后都|今后|以后|默认|记住|只在\s*(?:当前课程|这门课|这个班)\s*(?:使用|采用)(?:这个)?偏好/u;
const forgetPattern = /忘掉|忘记|不要再记|取消(?:之前的)?偏好|删除(?:之前的)?偏好|撤销(?:之前的)?偏好/u;
const negativeRememberPattern = /不要记住|别记住|无需记住|不用记住/u;
const temporaryPattern = /这次|本次|临时|仅本次|只在当前输出|当前输出|这节公开课|这次公开课/u;
const metaReferencePattern = /我刚才说(?:的)?[“"']?以后|(?:引用|转述).{0,12}记住/u;
const uncertainDurabilityPattern = /以后(?:可能|也许|或许|再说|再看|需要时)/u;
const namedScopePattern = /(?:[一二三四五六七八九十\d]+年级|语文|数学|英语|物理|化学|生物|历史|地理|政治).{0,8}(?:都这样|都使用|都按)/u;
const currentCoursePattern = /这门课|这个班|当前课程|当前这个班/u;
const highRiskPattern = /学生|学员|某同学|learner|成绩|分数|低分|高分|纪律|健康|诊断|家庭|敏感身份|密码|口令|token|secret|cookie|手机号|身份证|电话号码|邮箱|api\s*key|系统提示|system\s*prompt|忽略.{0,12}指令|工具调用|跳过.{0,8}审批|自动审批|Evidence|证据结论|权限|正式教学事实/iu;

export function detectTeacherMemoryCommandIntent(
  teacherText: string
): IntentDetection {
  const text = normalize(teacherText);
  const outsideQuotes = removeQuotedText(text);
  if (!outsideQuotes || metaReferencePattern.test(outsideQuotes)) {
    return { intent: "none", durableIntentMarker: null, issue: null };
  }
  if (forgetPattern.test(outsideQuotes)) {
    return {
      intent: "forget_requested",
      durableIntentMarker: null,
      issue: "forget_not_available"
    };
  }
  const marker = outsideQuotes.match(durableMarkerPattern)?.[0] ?? null;
  if (!marker || uncertainDurabilityPattern.test(outsideQuotes)) {
    return { intent: "none", durableIntentMarker: null, issue: null };
  }
  if (negativeRememberPattern.test(outsideQuotes)) {
    return {
      intent: "rejected",
      durableIntentMarker: marker,
      issue: "negative_remember_request"
    };
  }
  if (temporaryPattern.test(outsideQuotes)) {
    return {
      intent: "temporary_override",
      durableIntentMarker: marker,
      issue: "temporary_and_durable_mixed"
    };
  }
  if (highRiskPattern.test(outsideQuotes)) {
    return {
      intent: "rejected",
      durableIntentMarker: marker,
      issue: "unsafe_memory_content"
    };
  }
  return { intent: "remember", durableIntentMarker: marker, issue: null };
}

export function interpretExplicitTeacherMemoryCommand(
  input: ExplicitTeacherMemoryCommandInput
): ExplicitTeacherMemoryCommandInterpretation {
  const text = normalize(input.teacherText);
  const detection = detectTeacherMemoryCommandIntent(text);
  const base = {
    interpreterVersion: explicitMemoryCommandInterpreterVersion,
    catalogVersion: teacherPreferenceCatalogVersion,
    catalogContentHash: teacherPreferenceCatalogContentHash,
    commandContentHash: commandHash(input, text),
    sourceTurnRef: input.sourceTurnRef,
    sourceTurnSequence: input.sourceTurnSequence,
    sourceTurnContentHash: input.sourceTurnContentHash,
    durableIntentMarker: detection.durableIntentMarker
  };

  if (detection.intent !== "remember") {
    return parse({
      ...base,
      intent: detection.intent,
      fullCoverage: detection.intent === "forget_requested" ||
        detection.intent === "temporary_override" ||
        detection.intent === "rejected",
      items: [],
      residualText: "",
      issues: detection.issue ? [detection.issue] : []
    });
  }
  if (!input.flags.explicitRememberEnabled ||
      !input.flags.scopedPreferencesEnabled) {
    return parse({
      ...base,
      intent: "unsupported",
      fullCoverage: false,
      items: [],
      residualText: "",
      issues: [
        !input.flags.explicitRememberEnabled
          ? "explicit_remember_disabled"
          : "scoped_preferences_disabled"
      ]
    });
  }
  if (namedScopePattern.test(text) && !currentCoursePattern.test(text)) {
    return parse({
      ...base,
      intent: "unsupported",
      fullCoverage: false,
      items: [],
      residualText: "",
      issues: ["ambiguous_named_scope"]
    });
  }

  const courseScoped = currentCoursePattern.test(text);
  const scope = createMemoryScope(courseScoped
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
      });
  const clauses = commandClauses(text);
  const matches: ExplicitRememberInterpretedItem[] = [];
  const residual: string[] = [];
  for (const clause of clauses) {
    const match = matchTeacherPreferenceCatalog(clause);
    if (!match) {
      residual.push(clause);
      continue;
    }
    matches.push({
      canonicalKey: match.canonicalKey,
      preferenceKey: match.preferenceKey,
      canonicalValue: match.canonicalValue,
      safeDisplayValue: match.safeDisplayValue,
      proposedScope: scope,
      consentBasis: "teacher_explicit_command",
      consentVersion: "consent:explicit-remember@1",
      riskLevel: "low",
      parsingRuleId: match.parsingRuleId,
      confidence: 1,
      directActivationEligible: true
    });
  }
  const uniqueItems = deduplicateItems(matches);
  const hasConflictingValues = uniqueItems.some((item, index) =>
    uniqueItems.some((other, otherIndex) =>
      otherIndex !== index &&
      item.canonicalKey === other.canonicalKey &&
      item.canonicalValue !== other.canonicalValue
    )
  );
  const issues = [
    ...(residual.length > 0 ? ["unparsed_residual_text"] : []),
    ...(uniqueItems.length === 0 ? ["catalog_item_not_found"] : []),
    ...(hasConflictingValues ? ["conflicting_command_items"] : [])
  ];
  const fullCoverage = uniqueItems.length > 0 &&
    residual.length === 0 && !hasConflictingValues;
  return parse({
    ...base,
    intent: fullCoverage ? "remember" : "unsupported",
    fullCoverage,
    items: fullCoverage ? uniqueItems : [],
    residualText: residual.join("；"),
    issues
  });
}

function commandClauses(text: string): string[] {
  const cleaned = text
    .replace(/^[：:，,。；;\s]+/u, "")
    .replace(/只在\s*(?:当前课程|这门课|这个班)\s*(?:使用|采用)?(?:这个)?偏好/gu, " ")
    .replace(/请记住|帮我记住|记住|从现在起|以后都|今后|以后|默认/gu, " ")
    .replace(/这门课|这个班|当前课程|当前这个班/gu, " ")
    .replace(/所有普通备课(?:都|中)?(?:使用|采用)?(?:这个)?偏好?/gu, " ")
    .replace(/[：:]/gu, " ");
  return cleaned
    .split(/(?:，|,|；|;|。|以及|并且|同时|、)/u)
    .flatMap((part) => part.split(/(?<=一页)和(?=案例|例子)|(?<=一点)和(?=教案|建议|回复|案例|例子)/u))
    .map((part) => normalizeClause(part))
    .filter(Boolean);
}

function normalizeClause(value: string): string {
  return normalize(value)
    .replace(/^(?:请|麻烦|希望|我希望|偏好是)\s*/u, "")
    .replace(/(?:都这样|作为偏好)$/u, "")
    .trim();
}

function deduplicateItems(
  items: readonly ExplicitRememberInterpretedItem[]
): ExplicitRememberInterpretedItem[] {
  const byKey = new Map<string, ExplicitRememberInterpretedItem>();
  for (const item of items) {
    byKey.set(`${item.canonicalKey}|${item.canonicalValue}|${item.proposedScope.fingerprint}`, item);
  }
  return [...byKey.values()].sort((left, right) =>
    left.canonicalKey.localeCompare(right.canonicalKey) ||
    left.canonicalValue.localeCompare(right.canonicalValue)
  );
}

function removeQuotedText(value: string): string {
  return value
    .replace(/“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』|"[^"]*"|'[^']*'/gu, " ")
    .trim();
}

function commandHash(
  input: ExplicitTeacherMemoryCommandInput,
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
    interpreterVersion: explicitMemoryCommandInterpreterVersion,
    catalogVersion: teacherPreferenceCatalogVersion,
    catalogContentHash: teacherPreferenceCatalogContentHash
  });
}

function parse(value: unknown): ExplicitTeacherMemoryCommandInterpretation {
  return Object.freeze(
    ExplicitTeacherMemoryCommandInterpretationSchema.parse(value)
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim();
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

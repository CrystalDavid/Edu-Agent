import { createHash } from "node:crypto";

import {
  TemporaryPreferenceOverrideInterpretationSchema,
  TemporaryPreferenceOverrideSchema,
  type TemporaryPreferenceOverride,
  type TemporaryPreferenceOverrideInterpretation,
  type WorkingMemoryViewV2
} from "@edu-agent/contracts";

import type {
  TemporaryPreferenceCatalogKey,
  TemporaryPreferenceCatalogPort
} from "../application/temporary-preference-catalog-port.js";

export const temporaryPreferenceOverrideInterpreterVersion =
  "temporary-preference-override-interpreter@1" as const;
export const temporaryPreferenceOverridePolicyVersion =
  "temporary-preference-override-policy@1" as const;

const temporaryMarkerPattern =
  /(?:这次|本次|这节(?:公开)?课|当前(?:这次)?会话)/u;
const durableMarkerPattern =
  /(?:记住|请记住|以后|今后|往后|默认|长期|一直)/u;
const unsafePattern =
  /(?:学生.{0,12}(?:能力|差|标签|健康|疾病|身份)|成绩|分数|处分|纪律|密码|口令|token|secret|api[ _-]?key|手机号|身份证|忽略.{0,12}(?:系统|提示)|系统提示|开发者提示|调用工具|跳过.{0,8}(?:审批|确认)|证据结论|evidence)/iu;

type Match = {
  readonly canonicalKey: TemporaryPreferenceCatalogKey;
  readonly effect: "replace_value" | "suppress_preference";
  readonly canonicalValue: string | null;
};

export interface TemporaryOverrideIntentDetection {
  readonly intent: "none" | "temporary_override" | "clear" | "rejected";
}

export function detectExplicitTemporaryOverrideIntent(
  teacherText: string
): TemporaryOverrideIntentDetection {
  const text = normalize(teacherText);
  if (clearAllPattern(text) || clearKeys(text).length > 0) {
    return { intent: "clear" };
  }
  if (!temporaryMarkerPattern.test(text)) return { intent: "none" };
  if (unsafePattern.test(text)) return { intent: "rejected" };
  return findMatches(text).length > 0
    ? { intent: "temporary_override" }
    : { intent: "none" };
}

export function interpretExplicitTemporaryPreferenceOverride(input: {
  readonly teacherText: string;
  readonly sourceTurnRef: string;
  readonly sourceTurnSequence: number;
  readonly sourceTurnContentHash: string;
  readonly owner: {
    readonly tenantRef: string;
    readonly teacherRef: string;
  };
  readonly conversationRef: string;
  readonly taskRef: string;
  readonly courseRunRef: string;
  readonly lessonRef: string;
  readonly skillId: "lesson-preparation";
  readonly activeWorkingMemory: WorkingMemoryViewV2 | null;
  readonly catalog: TemporaryPreferenceCatalogPort;
  readonly enabled: boolean;
  readonly at: string;
  readonly expiresAt: string;
}): TemporaryPreferenceOverrideInterpretation {
  const base = {
    interpreterVersion: temporaryPreferenceOverrideInterpreterVersion,
    catalogVersion: input.catalog.version,
    catalogContentHash: input.catalog.contentHash,
    policyVersion: temporaryPreferenceOverridePolicyVersion,
    sourceTurnRef: input.sourceTurnRef,
    sourceTurnSequence: input.sourceTurnSequence,
    sourceTurnContentHash: input.sourceTurnContentHash,
    fullCoverageOfOverrideClause: false,
    overrideItems: [] as TemporaryPreferenceOverride[],
    clearCanonicalKeys: [] as string[],
    clearAll: false,
    residualInstructionText: normalize(input.teacherText),
    temporaryMarker: marker(input.teacherText),
    issues: [] as string[]
  };
  if (!input.enabled) {
    return parse({
      ...base,
      status: "none",
      issues: ["temporary_overrides_disabled"]
    });
  }
  if (!validBinding(input)) {
    return parse({
      ...base,
      status: "rejected",
      issues: ["temporary_override_binding_invalid"]
    });
  }
  if (
    input.activeWorkingMemory &&
    input.activeWorkingMemory.temporaryOverrides.some((override) =>
      override.owner.tenantRef !== input.owner.tenantRef ||
      override.owner.teacherRef !== input.owner.teacherRef ||
      override.conversationRef !== input.conversationRef ||
      override.taskRef !== input.taskRef ||
      override.courseRunRef !== input.courseRunRef ||
      override.lessonRef !== input.lessonRef ||
      override.skillId !== input.skillId
    )
  ) {
    return parse({
      ...base,
      status: "rejected",
      issues: ["temporary_override_owner_mismatch"]
    });
  }
  const text = normalize(input.teacherText);
  const keysToClear = clearKeys(text);
  if (clearAllPattern(text) || keysToClear.length > 0) {
    return parse({
      ...base,
      status: "clear",
      fullCoverageOfOverrideClause: true,
      clearCanonicalKeys: keysToClear,
      clearAll: clearAllPattern(text),
      residualInstructionText: residualInstruction(text, []),
      temporaryMarker: marker(text) ?? "恢复平时习惯"
    });
  }
  if (!temporaryMarkerPattern.test(text)) {
    return parse({ ...base, status: "none", temporaryMarker: null });
  }
  if (unsafePattern.test(text)) {
    return parse({
      ...base,
      status: "rejected",
      issues: ["unsafe_temporary_override_content"]
    });
  }
  if (durableMarkerPattern.test(text)) {
    return parse({
      ...base,
      status: "unsupported",
      issues: ["mixed_durable_temporary_intent"]
    });
  }
  const matches = deduplicateMatches(findMatches(text));
  if (matches.length === 0) {
    return parse({
      ...base,
      status: "none",
      issues: ["no_catalog_temporary_override"]
    });
  }
  const items: TemporaryPreferenceOverride[] = [];
  for (const match of matches) {
    const catalogEntry = match.effect === "replace_value"
      ? input.catalog.find({
          canonicalKey: match.canonicalKey,
          canonicalValue: match.canonicalValue!
        })
      : input.catalog.hasCanonicalKey(match.canonicalKey)
        ? firstCatalogEntry(input.catalog, match.canonicalKey)
        : null;
    if (!catalogEntry) {
      return parse({
        ...base,
        status: "unsupported",
        issues: ["catalog_value_not_available"]
      });
    }
    const identityPayload = {
      owner: input.owner,
      conversationRef: input.conversationRef,
      sourceTurnRef: input.sourceTurnRef,
      canonicalKey: match.canonicalKey,
      effect: match.effect,
      canonicalValue: match.canonicalValue,
      interpreterVersion: temporaryPreferenceOverrideInterpreterVersion,
      catalogContentHash: input.catalog.contentHash
    };
    const overrideRef = `temporary-override:${hash(identityPayload)}`;
    const payload = {
      overrideRef,
      owner: { ...input.owner },
      canonicalKey: match.canonicalKey,
      preferenceKey: catalogEntry.preferenceKey,
      effect: match.effect,
      canonicalValue: match.canonicalValue,
      displayValue: catalogEntry.safeDisplayValue,
      sourceTurnRef: input.sourceTurnRef,
      sourceTurnSequence: input.sourceTurnSequence,
      sourceTurnContentHash: input.sourceTurnContentHash,
      conversationRef: input.conversationRef,
      taskRef: input.taskRef,
      courseRunRef: input.courseRunRef,
      lessonRef: input.lessonRef,
      skillId: input.skillId,
      lifetime: "current_conversation" as const,
      validFromTurnSequence: input.sourceTurnSequence,
      expiresAt: input.expiresAt,
      eligibleForConsolidation: false as const,
      interpreterVersion: temporaryPreferenceOverrideInterpreterVersion,
      catalogVersion: input.catalog.version,
      catalogContentHash: input.catalog.contentHash,
      policyVersion: temporaryPreferenceOverridePolicyVersion
    };
    items.push(TemporaryPreferenceOverrideSchema.parse({
      ...payload,
      contentHash: hash(payload)
    }));
  }
  return parse({
    ...base,
    status: "apply",
    fullCoverageOfOverrideClause: true,
    overrideItems: items,
    residualInstructionText: residualInstruction(text, matches),
    issues: []
  });
}

function findMatches(text: string): Match[] {
  const matches: Match[] = [];
  addReplace(matches, text, "lesson_plan_detail", "详细",
    /教案[^，。；;!?！？]{0,16}(?:写|保持|要|做得)?详细(?:一些|一点)?/u);
  addReplace(matches, text, "lesson_plan_detail", "简洁",
    /教案[^，。；;!?！？]{0,16}(?:写|保持|要|做得)?(?:简洁|精简)(?:一些|一点)?/u);
  if (/(?:教案[^，。；;!?！？]{0,16})?(?:可以超过一页|不限制(?:为|在)?一页|不用控制在一页|无需控制在一页)/u.test(text)) {
    matches.push({
      canonicalKey: "lesson_plan_length",
      effect: "suppress_preference",
      canonicalValue: null
    });
  }
  if (/(?:不要使用|不用|不使用|不要再用)(?:贴近)?(?:日常生活|生活化)(?:的)?(?:案例|例子)/u.test(text)) {
    matches.push({
      canonicalKey: "example_preference",
      effect: "suppress_preference",
      canonicalValue: null
    });
  } else if (/(?:优先使用生活化案例|案例(?:尽量|优先)?贴近日常生活)/u.test(text)) {
    matches.push({
      canonicalKey: "example_preference",
      effect: "replace_value",
      canonicalValue: "优先使用贴近日常生活的案例"
    });
  }
  addReplace(matches, text, "response_length", "简短",
    /(?:回复|建议)[^，。；;!?！？]{0,12}(?:简短|简洁)(?:一些|一点)?/u);
  addReplace(matches, text, "response_length", "详细",
    /(?:回复|建议)[^，。；;!?！？]{0,12}详细(?:一些|一点)?/u);
  addReplace(matches, text, "lesson_plan_style", "结构清晰",
    /(?:教案)?结构(?:更|要|尽量)?清晰(?:一些|一点)?/u);
  addReplace(matches, text, "lesson_plan_style", "少用生硬术语",
    /(?:教案)?少用生硬(?:的)?术语/u);
  addReplace(matches, text, "lesson_plan_style", "表达自然",
    /(?:教案)?表达(?:更|要|尽量)?自然(?:一些|一点)?/u);
  return matches;
}

function addReplace(
  matches: Match[],
  text: string,
  canonicalKey: TemporaryPreferenceCatalogKey,
  canonicalValue: string,
  pattern: RegExp
): void {
  if (pattern.test(text)) {
    matches.push({ canonicalKey, effect: "replace_value", canonicalValue });
  }
}

function clearAllPattern(text: string): boolean {
  return /(?:恢复|改回|还是按)(?:我)?平时(?:的)?(?:习惯|教案要求)|取消本次所有临时覆盖/u.test(text);
}

function clearKeys(text: string): TemporaryPreferenceCatalogKey[] {
  if (!/(?:取消|清除|恢复).{0,12}(?:本次|这次).{0,12}(?:覆盖|要求|偏好)/u.test(text)) {
    return [];
  }
  const keys: TemporaryPreferenceCatalogKey[] = [];
  if (/教案(?:详细程度|详略|简洁|详细)/u.test(text)) {
    keys.push("lesson_plan_detail");
  }
  if (/教案(?:长度|篇幅|一页)/u.test(text)) keys.push("lesson_plan_length");
  if (/(?:案例|例子)/u.test(text)) keys.push("example_preference");
  if (/(?:回复|建议)(?:长度|篇幅|详略)?/u.test(text)) keys.push("response_length");
  if (/(?:风格|表达|术语|结构)/u.test(text)) keys.push("lesson_plan_style");
  return [...new Set(keys)].sort();
}

function firstCatalogEntry(
  catalog: TemporaryPreferenceCatalogPort,
  canonicalKey: TemporaryPreferenceCatalogKey
) {
  const knownValues: Record<TemporaryPreferenceCatalogKey, string> = {
    lesson_plan_length: "一页以内",
    lesson_plan_detail: "简洁",
    lesson_plan_style: "表达自然",
    example_preference: "优先使用贴近日常生活的案例",
    response_length: "简短"
  };
  return catalog.find({
    canonicalKey,
    canonicalValue: knownValues[canonicalKey]
  });
}

function deduplicateMatches(matches: readonly Match[]): Match[] {
  const byKey = new Map<TemporaryPreferenceCatalogKey, Match>();
  for (const match of matches) byKey.set(match.canonicalKey, match);
  return [...byKey.values()].sort((left, right) =>
    left.canonicalKey.localeCompare(right.canonicalKey)
  );
}

function residualInstruction(text: string, matches: readonly Match[]): string {
  if (clearAllPattern(text) || clearKeys(text).length > 0) return "";
  const recognizedKeys = new Set(matches.map((entry) => entry.canonicalKey));
  return text
    .split(/[，,。；;!?！？]+/u)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .filter((clause) => {
      if (/^(?:这次|本次)(?:是)?公开课$/u.test(clause)) return false;
      if (/(?:别|不要)改我平时(?:的)?(?:习惯|偏好|要求)/u.test(clause)) return false;
      const clauseKeys = new Set(findMatches(clause).map((entry) => entry.canonicalKey));
      return ![...clauseKeys].some((key) => recognizedKeys.has(key));
    })
    .map((clause) => clause.replace(/^(?:这次|本次|这节(?:公开)?课)[，,:：]?/u, "").trim())
    .filter(Boolean)
    .join("，");
}

function marker(text: string): string | null {
  return normalize(text).match(temporaryMarkerPattern)?.[0] ?? null;
}

function validBinding(input: {
  readonly sourceTurnRef: string;
  readonly sourceTurnSequence: number;
  readonly sourceTurnContentHash: string;
  readonly owner: { readonly tenantRef: string; readonly teacherRef: string };
  readonly conversationRef: string;
  readonly taskRef: string;
  readonly courseRunRef: string;
  readonly lessonRef: string;
  readonly at: string;
  readonly expiresAt: string;
}): boolean {
  return Boolean(
    input.sourceTurnRef && input.sourceTurnSequence > 0 &&
    input.sourceTurnContentHash.length >= 16 &&
    input.owner.tenantRef && input.owner.teacherRef &&
    input.conversationRef && input.taskRef && input.courseRunRef &&
    input.lessonRef && Number.isFinite(Date.parse(input.at)) &&
    Date.parse(input.expiresAt) > Date.parse(input.at)
  );
}

function parse(
  input: Parameters<
    typeof TemporaryPreferenceOverrideInterpretationSchema.parse
  >[0]
): TemporaryPreferenceOverrideInterpretation {
  return TemporaryPreferenceOverrideInterpretationSchema.parse(input);
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
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [
      key,
      canonicalize(record[key])
    ]));
  }
  return value;
}

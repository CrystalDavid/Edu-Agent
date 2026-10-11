import type { MaterialKind } from "@edu-agent/contracts";

import type { MaterialContextSourceRef } from "./context-builder.js";
import {
  MaterialGenerationSkillOutputSchema,
  type MaterialGenerationSkillOutput
} from "./output-schema.js";

const unsupportedAuthorityPatterns = [
  /教育部(?:要求|规定|明确)/u,
  /课程标准(?:要求|规定|明确)/u,
  /考试(?:要求|规定|明确)/u,
  /教材明确/u
];

export type MaterialGenerationValidationResult =
  | { valid: true; output: MaterialGenerationSkillOutput }
  | {
      valid: false;
      category: "schema" | "scope" | "policy" | "completeness";
      issues: string[];
    };

export function validateMaterialGenerationOutput(input: {
  output: unknown;
  requestedKinds: readonly MaterialKind[];
  sources: readonly MaterialContextSourceRef[];
}): MaterialGenerationValidationResult {
  const parsed = MaterialGenerationSkillOutputSchema.safeParse(input.output);
  if (!parsed.success) {
    return {
      valid: false,
      category: "schema",
      issues: parsed.error.issues.map((issue) =>
        `${issue.path.join(".") || "output"}: ${issue.message}`
      )
    };
  }
  const expected = [...new Set(input.requestedKinds)].sort();
  const actual = [...new Set(parsed.data.drafts.map((item) => item.kind))].sort();
  if (
    expected.length !== actual.length ||
    expected.some((kind, index) => kind !== actual[index])
  ) {
    return {
      valid: false,
      category: "completeness",
      issues: [
        `材料类型必须与请求完全一致；requested=${expected.join(",")}; actual=${actual.join(",")}`
      ]
    };
  }
  const allowedRefs = new Set(
    input.sources.filter((source) => source.included).map((source) => source.ref)
  );
  const outside = parsed.data.drafts
    .flatMap((draft) => draft.sourceRefs)
    .filter((ref) => !allowedRefs.has(ref));
  if (outside.length > 0) {
    return {
      valid: false,
      category: "scope",
      issues: [
        `材料引用了未进入 ContextManifest 的来源：${[...new Set(outside)].join("、")}`
      ]
    };
  }
  const text = JSON.stringify(parsed.data);
  if (unsupportedAuthorityPatterns.some((pattern) => pattern.test(text))) {
    return {
      valid: false,
      category: "policy",
      issues: [
        "当前未接入权威知识源，材料不得声称教育部、课程标准、教材或考试作出明确规定。"
      ]
    };
  }
  return { valid: true, output: parsed.data };
}

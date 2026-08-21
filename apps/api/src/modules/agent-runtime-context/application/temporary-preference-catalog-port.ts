export type TemporaryPreferenceCatalogKey =
  | "lesson_plan_length"
  | "lesson_plan_detail"
  | "lesson_plan_style"
  | "example_preference"
  | "response_length";

export interface TemporaryPreferenceCatalogEntry {
  readonly canonicalKey: TemporaryPreferenceCatalogKey;
  readonly preferenceKey: string;
  readonly canonicalValue: string;
  readonly safeDisplayValue: string;
  readonly displayLabel: string;
  readonly parsingRuleId: string;
}

/**
 * Runtime receives a sealed, read-only Catalog view through Composition. It
 * never imports Personalization Domain or queries its repository.
 */
export interface TemporaryPreferenceCatalogPort {
  readonly version: "teacher-preference-catalog@1";
  readonly contentHash: string;
  find(input: {
    readonly canonicalKey: TemporaryPreferenceCatalogKey;
    readonly canonicalValue: string;
  }): TemporaryPreferenceCatalogEntry | null;
  hasCanonicalKey(canonicalKey: TemporaryPreferenceCatalogKey): boolean;
}

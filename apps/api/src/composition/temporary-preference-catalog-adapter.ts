import {
  matchTeacherPreferenceCatalog,
  teacherPreferenceCatalog
} from "../modules/personalization-memory-analytics/domain/teacher-preference-catalog.js";
import type {
  TemporaryPreferenceCatalogEntry,
  TemporaryPreferenceCatalogKey,
  TemporaryPreferenceCatalogPort
} from "../modules/agent-runtime-context/application/temporary-preference-catalog-port.js";

export class TemporaryPreferenceCatalogAdapter
  implements TemporaryPreferenceCatalogPort
{
  readonly version = teacherPreferenceCatalog.version;
  readonly contentHash = teacherPreferenceCatalog.contentHash;

  find(input: {
    readonly canonicalKey: TemporaryPreferenceCatalogKey;
    readonly canonicalValue: string;
  }): TemporaryPreferenceCatalogEntry | null {
    return teacherPreferenceCatalog.entries.find((entry) =>
      entry.canonicalKey === input.canonicalKey &&
      entry.canonicalValue === input.canonicalValue
    ) ?? null;
  }

  hasCanonicalKey(canonicalKey: TemporaryPreferenceCatalogKey): boolean {
    return teacherPreferenceCatalog.entries.some((entry) =>
      entry.canonicalKey === canonicalKey
    );
  }

  /** Used only to prove this adapter delegates canonical matching to Catalog. */
  match(clause: string): TemporaryPreferenceCatalogEntry | null {
    return matchTeacherPreferenceCatalog(clause);
  }
}

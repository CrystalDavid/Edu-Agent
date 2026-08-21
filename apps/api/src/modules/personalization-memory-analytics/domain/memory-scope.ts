import { createHash } from "node:crypto";

import {
  MemoryScopeDefinitionSchema,
  MemoryScopeSchema,
  MemoryScopeQuerySchema,
  memoryScopeSpecificity,
  type MemoryScope,
  type MemoryScopeDefinition,
  type MemoryScopeQuery
} from "@edu-agent/contracts";

export class MemoryScopeDomainError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "MemoryScopeDomainError";
  }
}

export function createMemoryScope(
  input: MemoryScopeDefinition | MemoryScope
): MemoryScope {
  const { fingerprint: _ignoredFingerprint, ...definition } = input as MemoryScope;
  const result = MemoryScopeDefinitionSchema.safeParse(definition);
  if (!result.success) {
    throw new MemoryScopeDomainError(
      "MEMORY_SCOPE_INVALID",
      result.error.issues.map((issue) => issue.message).join(" ")
    );
  }
  const parsed = result.data;
  const scope = {
    kind: parsed.kind,
    subject: normalizeNullable(parsed.subject),
    gradeLevel: normalizeNullable(parsed.gradeLevel),
    courseRunRef: normalizeNullable(parsed.courseRunRef),
    lessonRef: normalizeNullable(parsed.lessonRef),
    taskRef: normalizeNullable(parsed.taskRef),
    skillIds: [...new Set(parsed.skillIds.map(normalizeText))].sort()
  };
  assertScopeShape(scope);
  return Object.freeze(MemoryScopeSchema.parse({
    ...scope,
    skillIds: Object.freeze(scope.skillIds),
    fingerprint: hashCanonical(scope)
  }));
}

export function createGlobalMemoryScope(): MemoryScope {
  return createMemoryScope({
    kind: "global",
    subject: null,
    gradeLevel: null,
    courseRunRef: null,
    lessonRef: null,
    taskRef: null,
    skillIds: []
  });
}

export function normalizeMemoryScopeQuery(
  input: MemoryScopeQuery
): MemoryScopeQuery {
  const parsed = MemoryScopeQuerySchema.parse(input);
  return Object.freeze({
    subject: normalizeNullable(parsed.subject),
    gradeLevel: normalizeNullable(parsed.gradeLevel),
    courseRunRef: normalizeNullable(parsed.courseRunRef),
    lessonRef: normalizeNullable(parsed.lessonRef),
    taskRef: normalizeNullable(parsed.taskRef)
  });
}

export function memoryScopeQueryHash(input: {
  readonly owner: { readonly tenantRef: string; readonly teacherRef: string };
  readonly query: MemoryScopeQuery;
  readonly skillId: string;
  readonly useCase: string;
}): string {
  return hashCanonical({
    owner: {
      tenantRef: normalizeText(input.owner.tenantRef),
      teacherRef: normalizeText(input.owner.teacherRef)
    },
    query: normalizeMemoryScopeQuery(input.query),
    skillId: normalizeText(input.skillId),
    useCase: normalizeText(input.useCase)
  });
}

export function memoryScopeMatches(
  scope: MemoryScope,
  queryInput: MemoryScopeQuery
): boolean {
  const query = normalizeMemoryScopeQuery(queryInput);
  switch (scope.kind) {
    case "global":
      return true;
    case "subject":
      return scope.subject === query.subject;
    case "subject_grade":
      return scope.subject === query.subject &&
        scope.gradeLevel === query.gradeLevel;
    case "course_run":
      return scope.courseRunRef === query.courseRunRef;
    case "lesson":
      return scope.courseRunRef === query.courseRunRef &&
        scope.lessonRef === query.lessonRef;
    case "task":
      return scope.taskRef === query.taskRef &&
        (scope.courseRunRef === null ||
          scope.courseRunRef === query.courseRunRef) &&
        (scope.lessonRef === null || scope.lessonRef === query.lessonRef);
  }
}

export function memoryScopeRank(scope: MemoryScope): number {
  return memoryScopeSpecificity[scope.kind];
}

export function normalizeCanonicalPreferenceKey(value: string): string {
  const normalized = normalizeText(value).toLocaleLowerCase("en-US");
  if (!normalized) {
    throw new MemoryScopeDomainError(
      "MEMORY_CANONICAL_KEY_REQUIRED",
      "TeacherPreference canonicalKey is required."
    );
  }
  return normalized;
}

function assertScopeShape(scope: Omit<MemoryScope, "fingerprint">): void {
  const absent = (value: string | null) => value === null;
  const fail = (message: string): never => {
    throw new MemoryScopeDomainError("MEMORY_SCOPE_INVALID", message);
  };
  if (scope.skillIds.some((skillId) => skillId.includes("@"))) {
    fail("Memory scope skillIds must not contain a Skill version.");
  }
  switch (scope.kind) {
    case "global":
      if (![scope.subject, scope.gradeLevel, scope.courseRunRef,
        scope.lessonRef, scope.taskRef].every(absent)) {
        fail("Global scope cannot contain subject or business refs.");
      }
      return;
    case "subject":
      if (!scope.subject || ![
        scope.gradeLevel,
        scope.courseRunRef,
        scope.lessonRef,
        scope.taskRef
      ].every(absent)) {
        fail("Subject scope requires only subject.");
      }
      return;
    case "subject_grade":
      if (!scope.subject || !scope.gradeLevel || ![
        scope.courseRunRef,
        scope.lessonRef,
        scope.taskRef
      ].every(absent)) {
        fail("Subject-grade scope requires subject and gradeLevel only.");
      }
      return;
    case "course_run":
      if (!scope.courseRunRef || ![
        scope.subject,
        scope.gradeLevel,
        scope.lessonRef,
        scope.taskRef
      ].every(absent)) {
        fail("Course-run scope requires only courseRunRef.");
      }
      return;
    case "lesson":
      if (!scope.courseRunRef || !scope.lessonRef || ![
        scope.subject,
        scope.gradeLevel,
        scope.taskRef
      ].every(absent)) {
        fail("Lesson scope requires courseRunRef and lessonRef only.");
      }
      return;
    case "task":
      if (!scope.taskRef || ![scope.subject, scope.gradeLevel].every(absent)) {
        fail("Task scope requires taskRef and may bind courseRunRef/lessonRef.");
      }
  }
}

function normalizeNullable(value: string | null): string | null {
  return value === null ? null : normalizeText(value);
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function hashCanonical(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

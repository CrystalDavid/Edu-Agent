import { describe, expect, it } from "vitest";

import {
  MemoryScopeDomainError,
  createMemoryScope,
  memoryScopeQueryHash,
  resolveTeacherPreferences,
  type TeacherPreference
} from "../../apps/api/src/modules/personalization-memory-analytics/domain/index.js";

const owner = {
  tenantRef: "school:synthetic",
  teacherRef: "teacher:synthetic"
};
const at = "2026-08-20T08:00:00.000Z";

describe("scoped TeacherPreference resolution", () => {
  it.each([
    ["global", scope("global")],
    ["subject", scope("subject", { subject: "数学" })],
    ["subject_grade", scope("subject_grade", {
      subject: "数学",
      gradeLevel: "八年级"
    })],
    ["course_run", scope("course_run", {
      courseRunRef: "course-run:math-8-3"
    })],
    ["lesson", scope("lesson", {
      courseRunRef: "course-run:math-8-3",
      lessonRef: "lesson:quadratic"
    })],
    ["task", scope("task", {
      courseRunRef: "course-run:math-8-3",
      lessonRef: "lesson:quadratic",
      taskRef: "task:prepare-quadratic"
    })]
  ])("accepts a valid %s scope", (_kind, definition) => {
    expect(createMemoryScope(definition).kind).toBe(_kind);
  });

  it("rejects invalid field combinations and versioned Skill refs", () => {
    expect(() => createMemoryScope(scope("global", {
      courseRunRef: "course-run:forbidden"
    }))).toThrow(MemoryScopeDomainError);
    expect(() => createMemoryScope(scope("lesson", {
      lessonRef: "lesson:missing-course"
    }))).toThrow(MemoryScopeDomainError);
    expect(() => createMemoryScope({
      ...scope("global"),
      skillIds: ["lesson-preparation@6"]
    })).toThrow(MemoryScopeDomainError);
  });

  it("canonicalizes Unicode and Skill array order into one fingerprint", () => {
    const first = createMemoryScope({
      ...scope("subject", { subject: " 数学 " }),
      skillIds: ["material-generation", "lesson-preparation"]
    });
    const second = createMemoryScope({
      ...scope("subject", { subject: "数学" }),
      skillIds: ["lesson-preparation", "material-generation",
        "lesson-preparation"]
    });
    expect(first).toEqual(second);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("uses task > lesson > course > subject-grade > subject > global", () => {
    const preferences = [
      preference("global", "global", scope("global")),
      preference("subject", "subject", scope("subject", {
        subject: "数学"
      })),
      preference("subject-grade", "subject-grade", scope("subject_grade", {
        subject: "数学",
        gradeLevel: "八年级"
      })),
      preference("course", "course", scope("course_run", {
        courseRunRef: "course-run:math-8-3"
      })),
      preference("lesson", "lesson", scope("lesson", {
        courseRunRef: "course-run:math-8-3",
        lessonRef: "lesson:quadratic"
      })),
      preference("task", "task", scope("task", {
        taskRef: "task:prepare-quadratic"
      }))
    ];
    const result = resolve(preferences);
    expect(result.selected.map((entry) => entry.preference.preferenceValue))
      .toEqual(["task"]);
    expect(result.excluded.filter((entry) =>
      entry.reasonCode === "more_specific_scope"
    )).toHaveLength(5);
  });

  it("prefers Skill-specific over unrestricted at the same scope", () => {
    const result = resolve([
      preference("unrestricted", "global", scope("global")),
      preference("skill", "lesson only", {
        ...scope("global"),
        skillIds: ["lesson-preparation"]
      })
    ]);
    expect(result.selected[0]?.preference.preferenceRef)
      .toBe("preference:skill");
    expect(result.excluded[0]?.reasonCode)
      .toBe("more_specific_skill_scope");
  });

  it("does not make different canonical keys override each other", () => {
    const result = resolve([
      preference("detail", "简洁", scope("global"), "lesson_plan_detail"),
      preference("examples", "生活化", scope("global"), "example_preference")
    ]);
    expect(result.selected).toHaveLength(2);
    expect(result.excluded).toHaveLength(0);
  });

  it("excludes not-yet-valid, expired, scope-mismatched and Skill-mismatched rows", () => {
    const result = resolve([
      preference("future", "future", scope("global"), "future", {
        validFrom: "2026-08-21T00:00:00.000Z"
      }),
      preference("expired", "expired", scope("global"), "expired", {
        validUntil: at
      }),
      preference("other-course", "other", scope("course_run", {
        courseRunRef: "course-run:other"
      }), "course"),
      preference("other-skill", "other", {
        ...scope("global"),
        skillIds: ["material-generation"]
      }, "skill")
    ]);
    expect(result.selected).toHaveLength(0);
    expect(result.excluded.map((entry) => entry.reasonCode).sort()).toEqual([
      "expired",
      "not_yet_valid",
      "scope_mismatch",
      "skill_not_allowed"
    ]);
  });

  it("returns stable ordering and a deterministic owner/query hash", () => {
    const preferences = [
      preference("b", "B", scope("global"), "b"),
      preference("a", "A", scope("global"), "a")
    ];
    expect(resolve(preferences)).toEqual(resolve([...preferences].reverse()));
    const query = queryInput();
    expect(memoryScopeQueryHash({
      owner,
      query,
      skillId: "lesson-preparation",
      useCase: "lesson_preparation"
    })).toBe(memoryScopeQueryHash({
      owner,
      query,
      skillId: "lesson-preparation",
      useCase: "lesson_preparation"
    }));
  });
});

function resolve(preferences: readonly TeacherPreference[]) {
  return resolveTeacherPreferences({
    owner,
    preferences,
    memoryEpoch: 7,
    useCase: "lesson_preparation",
    skillId: "lesson-preparation",
    query: queryInput(),
    at
  });
}

function queryInput() {
  return {
    subject: "数学",
    gradeLevel: "八年级",
    courseRunRef: "course-run:math-8-3",
    lessonRef: "lesson:quadratic",
    taskRef: "task:prepare-quadratic"
  };
}

function preference(
  ref: string,
  value: string,
  definition: ReturnType<typeof scope>,
  canonicalKey = "lesson_plan_detail",
  validity: { validFrom?: string; validUntil?: string | null } = {}
): TeacherPreference {
  const resolvedScope = createMemoryScope(definition);
  return {
    preferenceRef: `preference:${ref}`,
    owner,
    preferenceKey: canonicalKey,
    preferenceValue: value,
    canonicalKey,
    scope: resolvedScope,
    scopeFingerprint: resolvedScope.fingerprint,
    validFrom: validity.validFrom ?? "2026-08-19T00:00:00.000Z",
    validUntil: validity.validUntil ?? null,
    explicitness: "teacher_declared",
    consentBasis: "teacher_settings_confirmed",
    consentVersion: "consent:teacher-settings@1",
    policyVersion: "teacher-preference-scope@1",
    sourceCandidateRef: `candidate:${ref}`,
    sourceCandidateHash: "a".repeat(64),
    status: "active",
    version: 1,
    confirmedByRef: owner.teacherRef,
    confirmedAt: "2026-08-19T00:00:00.000Z",
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
    revokedAt: null,
    contentHash: ref.padEnd(64, "f").slice(0, 64)
  };
}

function scope(
  kind: "global" | "subject" | "subject_grade" |
    "course_run" | "lesson" | "task",
  patch: Partial<{
    subject: string | null;
    gradeLevel: string | null;
    courseRunRef: string | null;
    lessonRef: string | null;
    taskRef: string | null;
  }> = {}
) {
  return {
    kind,
    subject: null,
    gradeLevel: null,
    courseRunRef: null,
    lessonRef: null,
    taskRef: null,
    skillIds: [] as string[],
    ...patch
  };
}

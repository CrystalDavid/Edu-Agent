import { describe, expect, it } from "vitest";

import {
  confirmMemoryCandidate,
  createMemoryCandidate,
  createMemoryScope,
  detectExplicitTeacherForgetIntent,
  interpretExplicitTeacherForgetCommand,
  planExplicitTeacherForget,
  type TeacherPreference
} from "../../apps/api/src/modules/personalization-memory-analytics/domain/index.js";

describe("explicit teacher forget command", () => {
  it.each([
    ["忘掉案例偏好", "example_preference"],
    ["忘记一页教案要求", "lesson_plan_length"],
    ["取消建议篇幅偏好", "response_length"],
    ["撤销关于教案表达风格的偏好", "lesson_plan_style"],
    ["不要再记教案详细程度", "lesson_plan_detail"]
  ])("parses %s through teacher-preference-catalog@1", (text, key) => {
    const result = interpret(text);
    expect(result.intent).toBe("forget");
    expect(result.fullCoverage).toBe(true);
    expect(result.targets).toEqual([
      expect.objectContaining({ canonicalKey: key })
    ]);
  });

  it("routes long-form safe aliases independently from the sealed remember detector", () => {
    expect(interpret("取消之前的建议篇幅偏好").intent).toBe("forget");
    expect(interpret("撤销关于教案表达风格的偏好").intent).toBe("forget");
    expect(interpret("删除我保存的生活化案例偏好").intent).toBe("forget");
  });

  it("parses current-course, global and unspecified selectors", () => {
    expect(interpret("这门课忘掉教案详细程度").targets[0])
      .toMatchObject({
        requestedScopeKind: "course_run",
        requestedScopeFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u)
      });
    expect(interpret("所有普通备课忘掉案例偏好").targets[0])
      .toMatchObject({
        requestedScopeKind: "global",
        requestedScopeFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u)
      });
    expect(interpret("忘掉案例偏好").targets[0])
      .toMatchObject({
        requestedScopeKind: "unspecified",
        requestedScopeFingerprint: null
      });
  });

  it("parses two canonical targets atomically and deterministically", () => {
    const first = interpret("忘掉教案长度和案例偏好");
    const second = interpret("  忘掉 教案长度，与案例偏好。 ");
    expect(first.intent).toBe("forget");
    expect(first.targets.map((target) => target.canonicalKey)).toEqual([
      "example_preference",
      "lesson_plan_length"
    ]);
    expect(second.targets).toEqual(first.targets);
  });

  it("distinguishes quotes, negative remember, temporary and ordinary instructions", () => {
    expect(interpret("你刚才说‘忘掉案例偏好’是什么意思？").intent)
      .toBe("none");
    expect(interpret("不要记住这次要求").intent).toBe("none");
    expect(interpret("这次不要使用生活化案例").intent)
      .toBe("temporary_override");
    expect(interpret("不要安排小组讨论").intent).toBe("none");
    expect(detectExplicitTeacherForgetIntent("忘掉案例偏好").intent)
      .toBe("forget");
  });

  it("rejects student, secret and authorization targets", () => {
    expect(interpret("忘掉某学生的长期标签").intent).toBe("rejected");
    expect(interpret("删除我保存的密码偏好").intent).toBe("rejected");
    expect(interpret("撤销权限审批偏好").intent).toBe("rejected");
  });

  it("keeps command hashes stable and raw text out of the typed targets", () => {
    const text = "忘掉我之前关于案例类型的偏好";
    const first = interpret(text);
    const second = interpret(text);
    expect(first.commandContentHash).toBe(second.commandContentHash);
    expect(JSON.stringify(first.targets)).not.toContain(text);
  });

  it("plans unique, multiple, no-match and explicit-scope outcomes", () => {
    const global = preference("preference:global", "global", "生活化");
    const course = preference("preference:course", "course_run", "工程化");
    const unique = plan(interpret("所有普通备课忘掉案例偏好"), [
      global,
      course
    ]);
    expect(unique.kind).toBe("unique");
    expect(unique.preferences.map((entry) => entry.preferenceRef))
      .toEqual([global.preferenceRef]);

    const currentCourse = plan(interpret("这门课忘掉案例偏好"), [
      global,
      course
    ]);
    expect(currentCourse.kind).toBe("unique");
    expect(currentCourse.preferences[0]?.preferenceRef)
      .toBe(course.preferenceRef);

    const multiple = plan(interpret("忘掉案例偏好"), [global, course]);
    expect(multiple.kind).toBe("selection_required");
    expect(multiple.preferences).toHaveLength(2);

    expect(plan(interpret("忘掉案例偏好"), []).kind)
      .toBe("nothing_to_forget");
  });

  it("uses a conservative multi-target atomic plan", () => {
    const command = interpret("忘掉教案长度和案例偏好");
    const onlyExample = preference(
      "preference:example",
      "global",
      "生活化",
      "example_preference"
    );
    expect(plan(command, [onlyExample]).kind).toBe("nothing_to_forget");

    const length = preference(
      "preference:length",
      "global",
      "一页以内",
      "lesson_plan_length"
    );
    expect(plan(command, [onlyExample, length]).kind).toBe("unique");
  });

  it("fails closed when the server feature flag is disabled", () => {
    const result = interpretWith({
      flags: { explicitForgetEnabled: false }
    });
    expect(result.intent).toBe("unsupported");
    expect(result.issues).toContain("explicit_forget_disabled");
    expect(result.targets).toEqual([]);
  });
});

function interpret(teacherText: string) {
  return interpretWith({ teacherText });
}

function interpretWith(overrides: Partial<Parameters<
  typeof interpretExplicitTeacherForgetCommand
>[0]>) {
  return interpretExplicitTeacherForgetCommand({
    teacherText: "忘掉案例偏好",
    sourceTurnRef: "turn:synthetic-forget",
    sourceTurnSequence: 3,
    sourceTurnContentHash: "a".repeat(64),
    tenantRef: "tenant:synthetic",
    teacherRef: "teacher:synthetic",
    taskRef: "task:synthetic",
    courseRunRef: "course-run:synthetic",
    lessonRef: "lesson:synthetic",
    skillId: "lesson-preparation",
    flags: { explicitForgetEnabled: true },
    at: "2026-08-21T00:00:00.000Z",
    ...overrides
  });
}

function plan(
  command: ReturnType<typeof interpret>,
  preferences: readonly TeacherPreference[]
) {
  if (command.intent !== "forget") {
    throw new Error("Synthetic command must be a forget interpretation.");
  }
  return planExplicitTeacherForget({
    command,
    preferences,
    currentCourseRunRef: "course-run:synthetic"
  });
}

function preference(
  preferenceRef: string,
  scopeKind: "global" | "course_run",
  preferenceValue: string,
  canonicalKey = "example_preference"
): TeacherPreference {
  const scope = createMemoryScope(scopeKind === "global"
    ? {
        kind: "global",
        subject: null,
        gradeLevel: null,
        courseRunRef: null,
        lessonRef: null,
        taskRef: null,
        skillIds: ["lesson-preparation"]
      }
    : {
        kind: "course_run",
        subject: null,
        gradeLevel: null,
        courseRunRef: "course-run:synthetic",
        lessonRef: null,
        taskRef: null,
        skillIds: ["lesson-preparation"]
      });
  const candidate = createMemoryCandidate({
    candidateRef: `candidate:${preferenceRef}`,
    owner: {
      tenantRef: "tenant:synthetic",
      teacherRef: "teacher:synthetic"
    },
    type: "preference",
    content: {
      summary: "合成偏好",
      preferenceKey: canonicalKey,
      preferenceValue,
      canonicalKey,
      proposedScope: scope
    },
    sources: [{
      sourceRef: `source:${preferenceRef}`,
      sourceType: "teacher_action",
      version: "1",
      contentHash: "b".repeat(64),
      provenance: "synthetic_test"
    }],
    confidence: 1,
    proposedBy: "teacher",
    createdByRef: "teacher:synthetic",
    createdAt: "2026-08-20T00:00:00.000Z",
    expiresAt: "2026-12-01T00:00:00.000Z"
  });
  return confirmMemoryCandidate({
    candidate,
    actorRef: "teacher:synthetic",
    expectedVersion: 1,
    confirmedAt: "2026-08-21T00:00:00.000Z",
    preferenceRef
  }).preference!;
}

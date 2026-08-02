import { gate2DemoRefs } from "@edu-agent/demo-fixtures";

import { gate25DemoRefs } from "./gate2-5-demo-fixture.js";

export const gate27DemoRefs = {
  nextLessonObjectiveRef:
    "learning-objective:coefficient-method-demo",
  sourceLessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
  nextLessonRef: gate25DemoRefs.lessonRefs.coefficientMethod,
  enrollmentRefs: Array.from(
    { length: 12 },
    (_, index) => `enrollment:gate2-7-${String(index + 1).padStart(2, "0")}`
  ),
  learnerRefs: Array.from(
    { length: 12 },
    (_, index) => `learner:anonymous-${String(index + 1).padStart(2, "0")}`
  )
} as const;

export const gate27SyntheticEnrollments = gate27DemoRefs.learnerRefs.map(
  (learnerRef, index) => ({
    enrollmentRef: gate27DemoRefs.enrollmentRefs[index]!,
    courseRunRef: gate2DemoRefs.courseRunRef,
    learnerRef,
    displayName: `匿名学习者 ${String(index + 1).padStart(2, "0")}`,
    enrolledAt: "2026-09-18T08:10:00.000Z"
  })
);

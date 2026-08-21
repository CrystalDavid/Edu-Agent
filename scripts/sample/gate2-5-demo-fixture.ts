export const gate25DemoRefs = {
  unitRef: "curriculum-unit:linear-functions",
  lessonRefs: {
    variablesAndFunctions: "lesson:variables-and-functions",
    linearFunctionConcept: "lesson:linear-function-concept",
    slopeAndGraph: "lesson:slope-and-graph-change",
    coefficientMethod: "lesson:coefficient-method",
    linearFunctionApplication: "lesson:linear-function-application"
  },
  applicationObjectiveRef:
    "learning-objective:linear-function-application",
  seededPreparationTaskRef:
    "task:lesson-preparation:linear-function-application"
} as const;

export const secondaryCourseDemoRefs = {
  courseRunRef: "course-run:grade8-math-class4-2026-fall",
  objectiveRef: "learning-objective:class4-slope-and-graph",
  followUpObjectiveRef: "learning-objective:class4-linear-application",
  profileRef: "learning-interaction-profile:class4-slope",
  attemptRef: "attempt:class4-slope:synthetic-001",
  learnerRef: "learner:class4:synthetic-001",
  observationRef: "evidence-observation:class4-slope:synthetic-001",
  claimRef: "evidence-claim:class4-slope:synthetic-001",
  planArtifactRef: "artifact:teaching-plan:class4-slope",
  planRevisionRef: "artifact-revision:teaching-plan:class4-baseline",
  unitRef: "curriculum-unit:class4-linear-functions",
  lessonRef: "lesson:class4-slope-and-graph"
} as const;

export const gate25CurriculumFixture = {
  unit: {
    unitRef: gate25DemoRefs.unitRef,
    sequence: 1,
    title: "一次函数",
    description:
      "从变量关系、函数概念到斜率、解析式与真实情境应用。",
    status: "active" as const
  },
  lessons: [
    {
      lessonRef: gate25DemoRefs.lessonRefs.variablesAndFunctions,
      sequence: 1,
      title: "变量与函数",
      plannedAt: "2026-09-14T00:30:00.000Z",
      durationMinutes: 45
    },
    {
      lessonRef: gate25DemoRefs.lessonRefs.linearFunctionConcept,
      sequence: 2,
      title: "一次函数的概念",
      plannedAt: "2026-09-16T00:30:00.000Z",
      durationMinutes: 45
    },
    {
      lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
      sequence: 3,
      title: "斜率与图像变化",
      plannedAt: "2026-09-18T00:30:00.000Z",
      durationMinutes: 45
    },
    {
      lessonRef: gate25DemoRefs.lessonRefs.coefficientMethod,
      sequence: 4,
      title: "待定系数法",
      plannedAt: "2026-09-21T00:30:00.000Z",
      durationMinutes: 45
    },
    {
      lessonRef:
        gate25DemoRefs.lessonRefs.linearFunctionApplication,
      sequence: 5,
      title: "一次函数的应用",
      plannedAt: "2026-09-23T00:30:00.000Z",
      durationMinutes: 45
    }
  ]
} as const;

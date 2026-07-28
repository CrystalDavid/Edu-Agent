import type {
  PedagogicalStrategy,
  TeachingPlan
} from "@edu-agent/contracts";

export const gate2DemoRefs = {
  tenantRef: "tenant:demo-school",
  teacherRef: "user:teacher-001",
  courseRunRef: "course-run:grade8-math-class3-2026-fall",
  objectiveRef: "learning-objective:slope-and-graph",
  profileRef: "learning-interaction-profile:teacher-copilot-slope",
  caseRef: "case:teaching-improvement:slope-explanation",
  goalRef: "goal:improve-slope-graph-explanation",
  teachingPlanArtifactRef: "artifact:teaching-plan:slope-next-lesson",
  teachingPlanRevisionRef: "artifact-revision:teaching-plan:baseline",
  observationRefs: [
    "evidence-observation:slope-direction:synthetic-014",
    "evidence-observation:slope-steepness:synthetic-021"
  ],
  claimRefs: [
    "evidence-claim:slope-intercept-confusion",
    "evidence-claim:explanation-gap"
  ]
} as const;

export const baselineTeachingPlan: TeachingPlan = {
  objective:
    "学生能根据一次函数图像判断斜率的正负，并初步描述斜率绝对值与图像陡峭程度的关系。",
  lessonFocus: "回顾斜率正负与图像上升、下降方向。",
  openingActivity:
    "展示两条经过不同截距点的直线，让学生快速判断哪条直线的斜率更大。",
  teacherQuestions: [
    "图像向右上方延伸说明斜率有什么特征？",
    "直线在纵轴上的位置会改变斜率吗？"
  ],
  studentActivity:
    "学生独立判断四幅图像的斜率正负，并与同桌核对答案。",
  supportStrategy:
    "对判断困难的学生提示先观察从左到右的变化方向。",
  independentCheck:
    "学生完成一道图像选择题并写出一句理由。",
  followUp:
    "收集答案，在下一课时开始时公布正确选项。",
  evidenceRefs: [
    "evidence-observation:slope-direction:synthetic-014"
  ]
};

export const gate2PedagogicalStrategies: readonly [
  PedagogicalStrategy,
  PedagogicalStrategy
] = [
  {
    strategyId: "strategy:multiple-representations",
    title: "多重表征：从方向、变化率到图像陡峭程度",
    rationale:
      "现有证据同时出现了截距干扰和“会算但解释不完整”两类问题。先用同截距图像隔离斜率，再连接表格中的变化率，可降低无关变量干扰。",
    evidenceRefs: [...gate2DemoRefs.observationRefs, ...gate2DemoRefs.claimRefs],
    knownGaps: [
      "尚无学生在新情境中迁移解释的证据",
      "当前只覆盖两个合成样本，不能外推到全班每位学生"
    ],
    applicability:
      "适用于班级中同时存在图像判断和概念解释困难，且教师希望先处理共性误解的课堂。",
    unsuitableConditions: [
      "学生尚未理解坐标系和函数图像基本读法",
      "本课只剩少于十分钟且无法完成独立检查"
    ],
    suggestedMoves: [
      "用三条同截距、不同斜率的直线进行无声比较",
      "让学生把图像变化与表格中每增加 1 个单位的变化量配对",
      "先全班澄清截距不决定陡峭程度，再进行个人解释检查"
    ],
    followUpEvidence: [
      "收集每位学生对“为什么更陡”的一句解释",
      "加入一个截距改变但斜率不变的反例检查"
    ],
    confidenceExplanation:
      "有两条直接观察和两条候选主张支持，但缺少迁移任务证据，因此只作为可试用的课堂建议。"
  },
  {
    strategyId: "strategy:worked-example-contrast",
    title: "对比样例：辨析计算正确与解释充分",
    rationale:
      "一个合成样本能正确完成程序性判断，却把陡峭程度归因于截距。对比两个 Worked Example 可以显式暴露推理差异。",
    evidenceRefs: [...gate2DemoRefs.observationRefs, ...gate2DemoRefs.claimRefs],
    knownGaps: [
      "尚不清楚错误来自语言表达还是概念理解",
      "没有课后保持性证据"
    ],
    applicability:
      "适用于多数学生已能计算或判断斜率，但理由表述含混、需要比较推理质量的课堂。",
    unsuitableConditions: [
      "学生仍不能从图像识别上升和下降方向",
      "课堂目标侧重首次探索而非辨析已有方法"
    ],
    suggestedMoves: [
      "并排呈现两个结论相同但解释质量不同的 Worked Example",
      "让学生圈出真正支持结论的证据句",
      "要求学生改写较弱解释，再用新图像进行口头说明"
    ],
    followUpEvidence: [
      "记录学生能否指出截距是无关变量",
      "收集一题不提供坐标数值的图像解释"
    ],
    confidenceExplanation:
      "程序性表现与解释缺口的证据方向一致，但样本有限，建议教师结合课堂观察决定是否采用。"
  }
];

export const strategyTeachingPlans: Record<string, TeachingPlan> = {
  "strategy:multiple-representations": {
    objective:
      "学生能用图像方向、单位变化率和陡峭程度三种表征解释斜率，并说明截距不决定斜率。",
    lessonFocus: "隔离截距干扰，建立斜率绝对值与陡峭程度的可解释联系。",
    openingActivity:
      "展示三条同截距、不同斜率的直线，学生先静默排序陡峭程度，再说明判断依据。",
    teacherQuestions: [
      "如果三条直线的截距相同，哪一个量造成了陡峭程度不同？",
      "当 x 每增加 1 时，y 的变化量怎样体现在图像上？",
      "改变截距但保持斜率不变，图像的方向和陡峭程度会怎样？"
    ],
    studentActivity:
      "小组把三幅图像与三张变化率表格配对，随后每人独立完成一个截距变化的反例解释。",
    supportStrategy:
      "先提供方向提示，再提供单位步长标记；不直接释放答案，最多两级提示。",
    independentCheck:
      "每位学生用一句话解释“直线更陡”的原因，并判断截距变化是否影响斜率。",
    followUp:
      "根据独立解释将结果分为方向正确、变化率解释充分、仍受截距干扰三类，作为下一次备课证据。",
    evidenceRefs: [...gate2DemoRefs.observationRefs, ...gate2DemoRefs.claimRefs]
  },
  "strategy:worked-example-contrast": {
    objective:
      "学生能辨别一次函数斜率解释中的有效证据，并改写只给结论、缺少理由的解释。",
    lessonFocus: "通过对比样例提升对斜率变化的语言解释质量。",
    openingActivity:
      "呈现两个答案相同但理由不同的 Worked Example，请学生判断哪一个解释更有说服力。",
    teacherQuestions: [
      "两份解答的结论相同，证据有什么不同？",
      "哪一句话把图像变化与斜率联系起来？",
      "怎样修改较弱解释，使它不再依赖截距位置？"
    ],
    studentActivity:
      "学生标注两份样例中的结论、证据和无关信息，改写较弱解释，并在新图像上口头复述。",
    supportStrategy:
      "提供“当 x 增加……时，y……”句式支架；完成改写后逐步撤除支架。",
    independentCheck:
      "给出一幅无坐标数值的图像，学生独立写出斜率正负和陡峭程度的解释。",
    followUp:
      "比较有无句式支架时的解释质量，下一次只对仍需支架的学生提供支持。",
    evidenceRefs: [...gate2DemoRefs.observationRefs, ...gate2DemoRefs.claimRefs]
  }
};

export const gate2SyntheticFixture = {
  identity: {
    tenantRef: gate2DemoRefs.tenantRef,
    schoolName: "明远实验中学（合成）",
    teacherRef: gate2DemoRefs.teacherRef,
    teacherName: "林老师（合成）"
  },
  courseRun: {
    courseRunRef: gate2DemoRefs.courseRunRef,
    tenantRef: gate2DemoRefs.tenantRef,
    curriculumFrameworkRef: "curriculum:cn-junior-math:synthetic@1",
    subject: "数学",
    gradeLevel: "八年级",
    className: "八年级 3 班（合成）",
    academicTerm: "2026 秋季学期"
  },
  objective: {
    objectiveRef: gate2DemoRefs.objectiveRef,
    courseRunRef: gate2DemoRefs.courseRunRef,
    title: "解释一次函数斜率与图像方向、陡峭程度的关系",
    description:
      "学生能够比较斜率的正负和绝对值，并用图像变化进行解释。",
    knowledgeConceptRefs: [
      "knowledge-concept:linear-function-slope",
      "knowledge-concept:cartesian-graph"
    ],
    competencyRefs: [
      "competency:mathematical-representation",
      "competency:reasoning"
    ]
  },
  profile: {
    profileRef: gate2DemoRefs.profileRef,
    profileVersion: 1,
    scopeRef: gate2DemoRefs.courseRunRef,
    participationMode: "teacher-copilot-review",
    supportLimit: 2,
    answerReleaseBoundary: "teacher-approval-required",
    policyVersionRef: "policy:teacher-copilot-synthetic@1",
    promptVersionRef: "prompt-bundle:teacher-copilot-slope@1",
    evidenceRuleVersionRef: "evidence-rule:slope-review@1",
    profilePayload: {
      preserveTeacherJudgment: true,
      proposalOnly: true,
      noExternalCommitment: true
    },
    validFrom: "2026-09-18T08:00:00.000Z"
  },
  teachingImprovementCase: {
    caseRef: gate2DemoRefs.caseRef,
    caseType: "TeachingImprovementCase",
    title: "改进一次函数图像解释质量",
    status: "active"
  },
  goal: {
    goalRef: gate2DemoRefs.goalRef,
    caseRef: gate2DemoRefs.caseRef,
    title: "让学生用变化率而不是截距解释图像陡峭程度",
    status: "active",
    successCriteria: [
      "独立检查中能说明斜率绝对值与陡峭程度的关系",
      "能辨别截距变化不等于斜率变化"
    ]
  },
  attempts: [
    {
      attemptRef: "attempt:slope:synthetic-014",
      learnerRef: "learner:synthetic:014",
      submittedAt: "2026-09-17T08:42:00.000Z",
      responseSummary: {
        learnerLabel: "合成学生 S-014",
        response:
          "两条直线都向右上方，所以斜率都是正数；上面的直线斜率更大。",
        assistance: {
          level: "一级提示",
          description: "提示先观察从左到右的方向",
          answerReleased: false
        }
      }
    },
    {
      attemptRef: "attempt:slope:synthetic-021",
      learnerRef: "learner:synthetic:021",
      submittedAt: "2026-09-17T08:44:00.000Z",
      responseSummary: {
        learnerLabel: "合成学生 S-021",
        response:
          "斜率计算正确，但解释只写了‘第二条更陡’，没有说明单位变化率。",
        assistance: {
          level: "无提示",
          description: "学生独立作答",
          answerReleased: false
        }
      }
    }
  ],
  observations: [
    {
      observationRef: gate2DemoRefs.observationRefs[0],
      attemptRef: "attempt:slope:synthetic-014",
      observationType: "intercept-confounded-with-slope",
      observationValue: {
        summary: "能够判断斜率正负，但把直线纵向位置当成斜率大小依据。",
        assistance: {
          level: "一级提示",
          description: "提示先观察从左到右的方向",
          answerReleased: false
        },
        unknowns: [
          "尚不清楚学生在同截距图像中是否仍会混淆",
          "没有迁移到负斜率情境的证据"
        ]
      },
      observedAt: "2026-09-17T08:42:30.000Z",
      sourceRef: "attempt:slope:synthetic-014"
    },
    {
      observationRef: gate2DemoRefs.observationRefs[1],
      attemptRef: "attempt:slope:synthetic-021",
      observationType: "procedural-success-explanation-gap",
      observationValue: {
        summary: "程序性判断正确，但没有用单位变化率解释图像陡峭程度。",
        assistance: {
          level: "无提示",
          description: "学生独立作答",
          answerReleased: false
        },
        unknowns: [
          "尚不清楚缺口来自概念理解还是语言表达",
          "没有延迟保持性证据"
        ]
      },
      observedAt: "2026-09-17T08:44:30.000Z",
      sourceRef: "attempt:slope:synthetic-021"
    }
  ],
  claims: [
    {
      claimRef: gate2DemoRefs.claimRefs[0],
      claimType: "possible-misconception",
      claimValue: {
        summary: "部分学生可能把截距位置误当作斜率大小的决定因素。"
      },
      confidence: 0.74,
      confidenceExplanation:
        "有直接作答观察支持，但只有合成样本，仍需用同截距反例复核。",
      validFrom: "2026-09-17T08:42:30.000Z",
      expiresAt: "2026-10-17T08:42:30.000Z",
      status: "candidate"
    },
    {
      claimRef: gate2DemoRefs.claimRefs[1],
      claimType: "explanation-gap",
      claimValue: {
        summary: "程序性判断与概念解释之间可能存在缺口。"
      },
      confidence: 0.68,
      confidenceExplanation:
        "作答结果与解释文本方向一致，但不足以判断是语言还是概念问题。",
      validFrom: "2026-09-17T08:44:30.000Z",
      expiresAt: "2026-10-17T08:44:30.000Z",
      status: "candidate"
    }
  ]
} as const;

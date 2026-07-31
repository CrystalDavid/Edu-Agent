import type { ModelRequestV2 } from "@edu-agent/contracts";

import {
  assembleLessonPreparationModelRequest
} from "../modules/capability-integration/application/lesson-preparation-prompt-bundle.js";

export const LIVE_SYNTHETIC_SCOPE = {
  courseRunRef: "course-run:live-synthetic",
  curriculumUnitRef: "unit:live-synthetic-linear-function",
  lessonRef: "lesson:live-synthetic-slope",
  preparationTaskRef: "task:live-synthetic-lesson-preparation",
  learningObjectiveRef: "objective:live-synthetic-slope-direction",
  evidenceRef: "evidence:live-synthetic-slope-observation"
} as const;

export function createSyntheticLiveModelRequest(
  responseFormat: ModelRequestV2["responseFormat"]
): ModelRequestV2 {
  return assembleLessonPreparationModelRequest({
    invocationRef: `live:model-execution:${Date.now()}`,
    taskRunRef: "live:task-run:synthetic",
    agentRunRef: "live:agent-run:synthetic",
    contextManifestRef: "live:context-manifest:synthetic",
    timeoutMs: 120_000,
    maxOutputTokens: 2_048,
    responseFormat,
    request: {
      requestText:
        "请为八年级一次函数中‘斜率与图像变化’设计一节 40 分钟的教学方案。重点帮助学生区分斜率正负与图像变化方向，所有依据仅限当前提供的合成 Evidence。",
      actorRef: "user:teacher-001",
      purpose: "teacher-copilot.adjust-next-lesson",
      courseRunRef: LIVE_SYNTHETIC_SCOPE.courseRunRef,
      learningObjectiveRefs: [
        LIVE_SYNTHETIC_SCOPE.learningObjectiveRef
      ],
      selectedEvidenceRefs: [
        LIVE_SYNTHETIC_SCOPE.evidenceRef
      ],
      curriculumUnitRef:
        LIVE_SYNTHETIC_SCOPE.curriculumUnitRef,
      lessonRef: LIVE_SYNTHETIC_SCOPE.lessonRef,
      preparationTaskRef:
        LIVE_SYNTHETIC_SCOPE.preparationTaskRef,
      workingSetVersion: 1,
      createdAt: new Date().toISOString(),
      requestVersion: 1
    },
    courseRun: {
      courseRunRef: LIVE_SYNTHETIC_SCOPE.courseRunRef,
      subject: "数学",
      gradeLevel: "八年级",
      className: "合成八年级 3 班",
      academicTerm: "合成当前学期"
    },
    curriculumUnit: {
      unitRef: LIVE_SYNTHETIC_SCOPE.curriculumUnitRef,
      title: "一次函数",
      description: "仅用于 Live Acceptance 的合成数学单元"
    },
    lesson: {
      lessonRef: LIVE_SYNTHETIC_SCOPE.lessonRef,
      title: "斜率与图像变化",
      sequence: 3,
      durationMinutes: 40
    },
    learningObjectives: [
      {
        objectiveRef:
          LIVE_SYNTHETIC_SCOPE.learningObjectiveRef,
        title: "区分斜率正负与图像变化方向",
        description:
          "根据合成图像与变化率信息，解释斜率正负对应的图像上升或下降方向。"
      }
    ],
    currentApprovedTeachingPlan: {
      objective: "识别斜率正负与图像变化方向",
      lessonFocus: "斜率符号、方向与单位变化率",
      openingActivity: "比较三条合成直线的变化方向",
      teacherQuestions: [
        "横坐标增加 1 时，纵坐标如何变化？"
      ],
      studentActivity: "比较合成图像并用变化率语言说明",
      supportStrategy:
        "提供单位变化率句式支架，不直接给出答案",
      independentCheck: "独立解释一条新合成直线",
      followUp: "收集合成解释并标记未知项",
      evidenceRefs: [LIVE_SYNTHETIC_SCOPE.evidenceRef]
    },
    authorizedEvidence: [
      {
        evidenceRef: LIVE_SYNTHETIC_SCOPE.evidenceRef,
        kind: "observation",
        summary:
          "合成观察显示，学习者需要建立斜率符号、单位变化率与图像方向之间的联系。",
        status: "current",
        unknowns: ["课堂实施后的独立迁移表现未知"]
      }
    ],
    evidenceGaps: ["课堂实施后的独立迁移证据尚不存在"],
    interactionContract: {
      contractRef: "contract:live-synthetic",
      profileRef: "profile:live-synthetic",
      policyVersionRef: "policy:live-synthetic",
      evidenceRuleVersionRef: "evidence-rule:live-synthetic",
      supportLimit: 2,
      answerReleaseBoundary: "教师审批后释放"
    },
    taskWorkingSet: {
      version: 1,
      purpose: "lesson-preparation",
      requestedFieldMask: [
        "courseRun",
        "curriculumUnit",
        "lesson",
        "learningObjectives",
        "currentApprovedTeachingPlan",
        "authorizedEvidence"
      ]
    }
  });
}

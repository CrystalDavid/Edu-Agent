import {
  ModelRequestSchema,
  ModelRequestSchemaV2,
  ModelResponseSchema,
  ModelResultSchema,
  PedagogicalStrategySchema,
  StructuredReflectionOutputSchema,
  StructuredTeachingSuggestionOutputSchema,
  TeachingPlanSchema,
  type PedagogicalStrategy,
  type ModelRequest,
  type ModelRequestV2,
  type ModelResponse
} from "@edu-agent/contracts";

export function teachingPlanForMockStrategy(
  strategy: PedagogicalStrategy
) {
  const moves = [...strategy.suggestedMoves];
  const followUp = [...strategy.followUpEvidence];
  return TeachingPlanSchema.parse({
    objective: `教师审阅后，学生能够围绕“${strategy.title}”完成解释与独立检查。`,
    lessonFocus: strategy.rationale,
    openingActivity: moves[0] ?? `用“${strategy.title}”导入本课。`,
    teacherQuestions: [
      `这项活动中的关键证据是什么？`,
      `你如何用自己的语言解释“${strategy.title}”？`
    ],
    studentActivity:
      moves.slice(1).join("；") || "学生完成比较、解释和独立检查。",
    supportStrategy:
      "按教师确认的证据提供分层提示，不直接释放答案。",
    independentCheck:
      followUp[0] ?? "收集一项独立表现，确认学生能否迁移解释。",
    followUp:
      followUp.join("；") || "由教师记录仍未知的问题并决定后续教学。",
    evidenceRefs: [...strategy.evidenceRefs]
  });
}

import type {
  CapabilityDescriptor,
  ExecutionContract,
  GovernanceProfile,
  LegacyModelProvider
} from "../domain/capability.js";

export class MockModelProvider implements LegacyModelProvider {
  readonly descriptor: CapabilityDescriptor = {
    capabilityRef: "capability:model:mock",
    name: "MockModelProvider",
    kind: "model",
    description: "Gate 1A deterministic model fixture; performs no network call."
  };

  readonly executionContract: ExecutionContract = {
    contractRef: "execution-contract:model:mock@1",
    inputSchemaRef: "ModelRequestSchema@1",
    outputSchemaRef: "ModelResponseSchema@1",
    sideEffect: "none",
    idempotent: true,
    preconditions: ["validated synthetic input"],
    postconditions: ["validated deterministic output"]
  };

  readonly governanceProfile: GovernanceProfile = {
    profileRef: "governance-profile:model:mock@1",
    risk: "read-only",
    requiresAuthorization: true,
    destructive: false,
    maxConcurrency: 8
  };

  async generate(rawRequest: ModelRequest): Promise<ModelResponse> {
    const request = ModelRequestSchema.parse(rawRequest);
    return ModelResponseSchema.parse({
      provider: "mock",
      modelProfile: "deterministic-fixture",
      output: {
        title: `Mock: ${request.promptKey}`,
        body: String(request.input["body"] ?? "empty")
      },
      usage: {
        inputUnits: JSON.stringify(request.input).length,
        outputUnits: String(request.input["body"] ?? "").length
      }
    });
  }

  async invoke(
    rawRequest: ModelRequestV2,
    options?: { signal?: AbortSignal }
  ) {
    const request = ModelRequestSchemaV2.parse(rawRequest);
    if (options?.signal?.aborted) {
      return ModelResultSchema.parse({
        status: "failed",
        category: "REQUEST_CANCELLED",
        retryable: false,
        safeMessage: "模型调用已取消。"
      });
    }
    const evidenceRefs = [...request.scope.evidenceRefs];
    const objectiveRefs = [
      ...request.scope.learningObjectiveRefs
    ];
    if (request.expectedOutputSchema === "lesson-reflection@1") {
      const userMessage = [...request.messages].reverse().find(
        (message) => message.role === "user"
      );
      const payload = userMessage
        ? (JSON.parse(userMessage.content) as Record<string, any>)
        : {};
      const delivery = (payload["confirmedDelivery"] ?? {}) as Record<string, any>;
      const plan = (payload["approvedTeachingPlan"] ?? {}) as Record<string, any>;
      const observations = Array.isArray(payload["confirmedObservations"])
        ? payload["confirmedObservations"] as Array<Record<string, any>>
        : [];
      const output = StructuredReflectionOutputSchema.parse({
        schemaVersion: "lesson-reflection@1",
        courseRunRef: request.scope.courseRunRef,
        lessonRef: request.scope.lessonRef,
        teachingPlanRevisionRef: String(plan["revisionRef"] ?? ""),
        deliveryRevisionRef: String(delivery["deliveryRevisionRef"] ?? ""),
        observationRevisionRefs: observations.map((item) => String(item["observationRevisionRef"])),
        evidenceRefs,
        teacherApprovalRequired: true,
        objectiveAttainment: "根据教师已确认的课堂实施与观察，核心目标得到部分达成；具体迁移表现仍需后续证据确认。",
        plannedVsImplemented: "课堂保留了核心目标与独立检查，并根据现场节奏调整了活动顺序；这里只描述教师确认的差异。",
        effectiveMoves: ["对比图像与语言解释相结合的活动得到教师确认"],
        ineffectiveMoves: ["部分概念辨析耗时超过计划，尚不能确认其长期效果"],
        observationSummary: observations.map((item) => String(item["content"] ?? "已确认课堂观察")),
        evidenceAlignment: evidenceRefs.length > 0
          ? ["所选作业 Evidence 与课堂观察方向基本一致，仍需教师复核。"]
          : ["本次未选择作业 Evidence，不能形成作业表现结论。"],
        uncertainties: ["尚缺少下一次独立迁移任务的确认结果"],
        nextLessonSuggestions: ["下一课用一个新情境检查斜率正负与图像变化方向的迁移"],
        assignmentSuggestions: ["可由教师决定是否增加一题简短解释题"],
        teacherNotes: String(payload["teacherNotes"] ?? "")
      });
      const outputText = JSON.stringify(output);
      return ModelResultSchema.parse({
        status: "succeeded",
        provider: "mock",
        modelId: "deterministic-fixture",
        outputText,
        inputTokens: JSON.stringify(request).length,
        outputTokens: outputText.length,
        latencyMs: 0,
        finishReason: "stop"
      });
    }
    const output = StructuredTeachingSuggestionOutputSchema.parse({
      schemaVersion: "teacher-copilot-suggestions@1",
      suggestions: [
        {
          strategyId: "strategy:multiple-representations",
          title: "多重表征：从方向、变化率到图像陡峭程度",
          summary:
            "用同截距图像、单位变化率和个人解释检查连接斜率概念。",
          rationale:
            "现有合成证据同时显示图像判断与解释缺口，先隔离截距变量能减少无关干扰。",
          evidenceRefs,
          knownGaps: ["缺少独立迁移任务证据"],
          applicability:
            "适用于需要同时处理图像判断和概念解释困难的合成班级。",
          unsuitableConditions: [
            "学生尚未理解坐标系和函数图像基本读法"
          ],
          teachingMoves: [
            "比较三条同截距、不同斜率的直线",
            "把图像变化与单位变化率配对",
            "用个人解释检查理解"
          ],
          proposedPlanChanges: {
            objective: "解释斜率与一次函数图像变化的关系",
            lessonFocus: "斜率、方向和图像陡峭程度",
            openingActivity: "比较同截距的三条合成直线",
            teacherQuestions: [
              "横坐标增加 1 时，纵坐标怎样变化？",
              "截距改变会改变斜率吗？"
            ],
            studentActivity:
              "完成图像、表格和语言描述的配对并独立解释",
            supportStrategy:
              "提供单位变化率句式支架，不提供答案",
            independentCheck:
              "解释一条新直线的方向和陡峭程度",
            followUp: "收集解释并标记仍未知的迁移表现",
            evidenceRefs
          },
          followUpEvidence: ["收集每位学生的一句解释"],
          uncertaintyNote:
            "当前只有合成观察与候选主张，迁移效果仍未知。",
          courseRunRef: request.scope.courseRunRef,
          lessonRef: request.scope.lessonRef,
          learningObjectiveRefs: objectiveRefs
        },
        {
          strategyId: "strategy:worked-example-contrast",
          title: "对比样例：辨析计算正确与解释充分",
          summary:
            "对比结论相同但解释质量不同的样例，突出证据句。",
          rationale:
            "合成证据显示程序性判断与概念解释质量不一致。",
          evidenceRefs,
          knownGaps: ["缺少不同难度任务上的稳定性证据"],
          applicability:
            "适用于多数学生已能判断斜率但理由含混的合成情境。",
          unsuitableConditions: ["学生仍不能识别图像上升与下降方向"],
          teachingMoves: [
            "并排呈现两个解释质量不同的样例",
            "圈出真正支持结论的证据句",
            "改写较弱解释"
          ],
          proposedPlanChanges: {
            objective: "用单位变化率证据解释图像变化",
            lessonFocus: "计算正确与解释充分的区别",
            openingActivity: "比较两个结论相同的合成样例",
            teacherQuestions: [
              "哪句话真正支持这个结论？",
              "截距在这里是不是相关证据？"
            ],
            studentActivity:
              "标注证据句并改写较弱解释",
            supportStrategy:
              "提供解释质量检查表，不提供标准答案",
            independentCheck: "对新图像给出证据充分的解释",
            followUp: "记录学生是否能排除截距干扰",
            evidenceRefs
          },
          followUpEvidence: ["收集一题无坐标数值的解释"],
          uncertaintyNote:
            "样本有限，教师仍需结合课堂观察决定是否采用。",
          courseRunRef: request.scope.courseRunRef,
          lessonRef: request.scope.lessonRef,
          learningObjectiveRefs: objectiveRefs
        }
      ]
    });
    const outputText = JSON.stringify(output);
    return ModelResultSchema.parse({
      status: "succeeded",
      provider: "mock",
      modelId: "deterministic-fixture",
      outputText,
      inputTokens: JSON.stringify(request).length,
      outputTokens: outputText.length,
      latencyMs: 0,
      finishReason: "stop"
    });
  }

  async generateTeacherStrategies(input: {
    requestText: string;
    evidenceRefs: readonly string[];
    knownGaps: readonly string[];
  }): Promise<{
    provider: "mock";
    modelProfile: "teacher-copilot-deterministic@1";
    promptBundleRef: "prompt-bundle:teacher-copilot-slope@2";
    externalNetworkUsed: false;
    strategies: readonly [
      PedagogicalStrategy,
      PedagogicalStrategy
    ];
    usage: {
      inputUnits: number;
      outputUnits: number;
    };
  }> {
    const strategies = PedagogicalStrategySchema.array()
      .length(2)
      .parse([
        {
          strategyId: "strategy:multiple-representations",
          title: "多重表征：从方向、变化率到图像陡峭程度",
          rationale:
            "现有证据同时出现截距干扰和解释不完整。先用同截距图像隔离斜率，再连接单位变化率，能够减少无关变量干扰。",
          evidenceRefs: [...input.evidenceRefs],
          knownGaps: [...input.knownGaps],
          applicability:
            "适用于班级中同时存在图像判断和概念解释困难，且教师希望先处理共性误解的课堂。",
          unsuitableConditions: [
            "学生尚未理解坐标系和函数图像基本读法",
            "本课只剩少于十分钟且无法完成独立检查"
          ],
          suggestedMoves: [
            "用三条同截距、不同斜率的直线进行无声比较",
            "把图像变化与表格中每增加 1 个单位的变化量配对",
            "先澄清截距不决定陡峭程度，再进行个人解释检查"
          ],
          followUpEvidence: [
            "收集每位学生对“为什么更陡”的一句解释",
            "加入截距改变但斜率不变的反例检查"
          ],
          confidenceExplanation:
            "有直接观察与候选主张支持，但缺少迁移任务证据，因此只作为可试用的课堂建议。"
        },
        {
          strategyId: "strategy:worked-example-contrast",
          title: "对比样例：辨析计算正确与解释充分",
          rationale:
            "一个合成样本能正确完成程序性判断，却没有给出单位变化率解释。对比两个 Worked Example 可以显式呈现推理质量差异。",
          evidenceRefs: [...input.evidenceRefs],
          knownGaps: [...input.knownGaps],
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
      ]) as [PedagogicalStrategy, PedagogicalStrategy];

    const inputUnits = JSON.stringify(input).length;
    const outputUnits = JSON.stringify(strategies).length;
    return {
      provider: "mock",
      modelProfile: "teacher-copilot-deterministic@1",
      promptBundleRef: "prompt-bundle:teacher-copilot-slope@2",
      externalNetworkUsed: false,
      strategies,
      usage: {
        inputUnits,
        outputUnits
      }
    };
  }
}

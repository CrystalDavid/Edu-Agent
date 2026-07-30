import {
  ModelRequestSchema,
  ModelResponseSchema,
  PedagogicalStrategySchema,
  type PedagogicalStrategy,
  type ModelRequest,
  type ModelResponse
} from "@edu-agent/contracts";

import type {
  CapabilityDescriptor,
  ExecutionContract,
  GovernanceProfile,
  ModelProvider
} from "../domain/capability.js";

export class MockModelProvider implements ModelProvider {
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

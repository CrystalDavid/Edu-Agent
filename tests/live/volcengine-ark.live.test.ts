import { describe, expect, it } from "vitest";

import {
  assembleLessonPreparationModelRequest
} from "../../apps/api/src/modules/capability-integration/application/lesson-preparation-prompt-bundle.js";
import {
  validateModelOutput
} from "../../apps/api/src/modules/capability-integration/application/model-output-validation.js";
import {
  ProviderCapabilityProbe
} from "../../apps/api/src/modules/capability-integration/application/provider-capability-probe.js";
import {
  readModelProviderSettings
} from "../../apps/api/src/modules/capability-integration/infrastructure/model-provider-config.js";
import {
  VolcengineArkProvider
} from "../../apps/api/src/modules/capability-integration/infrastructure/volcengine-ark-provider.js";

const liveEnabled =
  process.env.ENABLE_LIVE_MODEL_TESTS === "true" &&
  process.env.MODEL_PROVIDER_MODE === "ark";

describe.skipIf(!liveEnabled)(
  "Volcengine Ark live synthetic integration",
  () => {
    const settings = readModelProviderSettings();
    if (!settings.ark) {
      throw new Error(
        "Live Ark test was enabled but provider configuration is incomplete."
      );
    }
    const provider = new VolcengineArkProvider(settings.ark);

    it("verifies the safe capability summary including a public image URL", async () => {
      const summary =
        await new ProviderCapabilityProbe(provider).run();
      expect(summary).toMatchObject({
        provider: "volcengine-ark",
        supportsText: true,
        reportsUsage: true,
        reportsRequestId: true,
        reportedModelMatches: true
      });
      expect(summary.modelIdHash).toHaveLength(64);
      expect(typeof summary.supportsImageUrl).toBe("boolean");
      expect(typeof summary.supportsJsonObject).toBe("boolean");
      expect(typeof summary.supportsJsonSchema).toBe("boolean");
      expect(typeof summary.supportsFunctionCalling).toBe(
        "boolean"
      );
      expect(typeof summary.supportsStreaming).toBe("boolean");
    });

    it("returns a validated Chinese lesson-preparation Proposal candidate without approving it", async () => {
      const request = liveModelRequest();
      const result = await provider.invoke(request);
      expect(result.status).toBe("succeeded");
      if (result.status !== "succeeded") return;
      expect(result.modelId).toBe(settings.ark?.modelId);
      expect(result.inputTokens).toBeTypeOf("number");
      expect(result.outputTokens).toBeTypeOf("number");
      expect(result.providerRequestId).toBeTruthy();
      const validation = validateModelOutput({
        outputText: result.outputText,
        request
      });
      expect(validation.valid).toBe(true);
      if (!validation.valid) return;
      expect(validation.strategies.length).toBeGreaterThan(0);
      expect(
        JSON.stringify(validation.output)
      ).not.toMatch(/"state"\s*:\s*"approved"/u);
    });
  }
);

function liveModelRequest() {
  return assembleLessonPreparationModelRequest({
    invocationRef: "live:model-execution:synthetic",
    taskRunRef: "live:task-run:synthetic",
    agentRunRef: "live:agent-run:synthetic",
    contextManifestRef: "live:context-manifest:synthetic",
    timeoutMs: 120_000,
    maxOutputTokens: 2_048,
    responseFormat: "json_object",
    request: {
      requestText:
        "请围绕合成课时提出一项斜率与图像变化的教学建议，并明确证据缺口。",
      actorRef: "user:teacher-001",
      purpose: "teacher-copilot.adjust-next-lesson",
      courseRunRef: "course-run:synthetic",
      learningObjectiveRefs: ["objective:synthetic"],
      selectedEvidenceRefs: ["evidence:synthetic"],
      curriculumUnitRef: "unit:synthetic",
      lessonRef: "lesson:synthetic",
      preparationTaskRef: "task:synthetic",
      workingSetVersion: 1,
      createdAt: "2026-07-31T10:00:00.000Z",
      requestVersion: 1
    },
    courseRun: {
      courseRunRef: "course-run:synthetic",
      subject: "数学",
      gradeLevel: "八年级",
      className: "合成八年级班级",
      academicTerm: "合成学期"
    },
    curriculumUnit: {
      unitRef: "unit:synthetic",
      title: "一次函数",
      description: "合成数学单元"
    },
    lesson: {
      lessonRef: "lesson:synthetic",
      title: "斜率与图像变化",
      sequence: 3,
      durationMinutes: 45
    },
    learningObjectives: [
      {
        objectiveRef: "objective:synthetic",
        title: "解释斜率",
        description: "解释斜率与一次函数图像变化"
      }
    ],
    currentApprovedTeachingPlan: {
      objective: "识别斜率方向",
      lessonFocus: "斜率与方向",
      openingActivity: "观察三条合成直线",
      teacherQuestions: ["横坐标增加 1 时怎样变化？"],
      studentActivity: "比较合成图像",
      supportStrategy: "提供单位变化率句式支架",
      independentCheck: "独立解释一条合成直线",
      followUp: "收集解释并标记未知项",
      evidenceRefs: ["evidence:synthetic"]
    },
    authorizedEvidence: [
      {
        evidenceRef: "evidence:synthetic",
        kind: "observation",
        summary: "合成观察显示需要连接变化率与图像。",
        unknowns: ["独立迁移表现未知"]
      }
    ],
    evidenceGaps: ["课堂实施后的迁移证据缺失"],
    interactionContract: {
      contractRef: "contract:synthetic",
      profileRef: "profile:synthetic",
      policyVersionRef: "policy:synthetic",
      evidenceRuleVersionRef: "evidence-rule:synthetic",
      supportLimit: 2,
      answerReleaseBoundary: "教师审批后释放"
    },
    taskWorkingSet: {
      version: 1,
      purpose: "lesson-preparation",
      requestedFieldMask: ["lesson", "evidence"]
    }
  });
}

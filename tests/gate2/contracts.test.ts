import {
  LocalCredentialLoginRequestSchema,
  LocalSmsChallengeSchema,
  PedagogicalStrategySchema,
  SuggestionDispositionRequestSchema,
  TeachingPlanSchema
} from "@edu-agent/contracts";
import {
  baselineTeachingPlan
} from "@edu-agent/sample-data";
import { describe, expect, it } from "vitest";

import {
  MockModelProvider
} from "../../apps/api/src/modules/capability-integration/infrastructure/mock-model-provider.js";
import {
  applyDiffToPlan
} from "../../apps/web/src/teaching-plan.js";
import { appRoutes } from "../../apps/web/src/route.js";

describe("Gate 2 UI and domain contracts", () => {
  it("keeps local password and SMS login requests explicit and typed", () => {
    expect(
      LocalCredentialLoginRequestSchema.parse({
        method: "password",
        phone: "13900000001",
        password: "SyntheticDemo123!",
        returnTo: "/overview"
      }).method
    ).toBe("password");
    expect(() =>
      LocalCredentialLoginRequestSchema.parse({
        method: "sms",
        phone: "123",
        challengeRef: "challenge:1",
        code: "123456"
      })
    ).toThrow();
    expect(
      LocalSmsChallengeSchema.parse({
        challengeRef: "challenge:1",
        phoneMasked: "139****0001",
        expiresAt: new Date().toISOString(),
        retryAfterSeconds: 60,
        demoCode: "123456"
      }).demoCode
    ).toBe("123456");
  });

  it("freezes teacher-task routes and preserves detail routes", () => {
    expect(appRoutes).toEqual([
      "/",
      "/overview",
      "/schedule",
      "/teaching",
      "/courses",
      "/students",
      "/assignments",
      "/files",
      "/agent",
      "/settings",
      "/goals",
      "/evidence",
      "/copilot",
      "/teaching-plan",
      "/runs",
      "/style-guide"
    ]);
  });

  it("returns exactly two distinct, evidence-linked Mock strategies", async () => {
    const response =
      await new MockModelProvider().generateTeacherStrategies({
        requestText: "根据当前证据调整下一课时",
        evidenceRefs: ["observation:1", "claim:1"],
        knownGaps: ["缺少迁移证据"]
      });

    expect(response.externalNetworkUsed).toBe(false);
    expect(response.strategies).toHaveLength(2);
    expect(
      new Set(response.strategies.map((item) => item.strategyId)).size
    ).toBe(2);
    for (const strategy of response.strategies) {
      expect(() =>
        PedagogicalStrategySchema.parse(strategy)
      ).not.toThrow();
      expect(strategy.evidenceRefs).toEqual([
        "observation:1",
        "claim:1"
      ]);
      expect(strategy.confidenceExplanation).not.toMatch(/^\d+(\.\d+)?%$/);
    }
  });

  it("applies only typed TeachingPlan fields", () => {
    const next = applyDiffToPlan(baselineTeachingPlan, {
      parentRevisionRef: "revision:1",
      proposalRevisionRef: "proposal:1",
      strategyId: "strategy:typed",
      changes: [
        {
          field: "followUp",
          kind: "modified",
          before: baselineTeachingPlan.followUp,
          after: "收集独立解释作为下一次备课证据。",
          reason: "建立证据闭环",
          evidenceRefs: ["observation:1"],
          teacherSelection: "pending"
        }
      ]
    });

    expect(next.followUp).toBe(
      "收集独立解释作为下一次备课证据。"
    );
    expect(() => TeachingPlanSchema.parse(next)).not.toThrow();
  });

  it("requires explicit edits for accepted_with_changes", () => {
    expect(() =>
      SuggestionDispositionRequestSchema.parse({
        purpose: "teacher-copilot.review-suggestion",
        idempotencyKey: "idempotency:one",
        disposition: "accepted_with_changes",
        selectedStrategyId: "strategy:one",
        teacherEdits: {}
      })
    ).toThrow();
  });
});

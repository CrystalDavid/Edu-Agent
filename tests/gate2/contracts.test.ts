import {
  PedagogicalStrategySchema,
  SuggestionDispositionRequestSchema,
  TeachingPlanSchema
} from "@edu-agent/contracts";
import {
  baselineTeachingPlan
} from "@edu-agent/test-fixtures";
import { describe, expect, it } from "vitest";

import {
  MockModelProvider
} from "../../apps/api/src/modules/capability-integration/infrastructure/mock-model-provider.js";
import {
  applyDiffToPlan
} from "../../apps/web/src/teaching-plan.js";
import { appRoutes } from "../../apps/web/src/route.js";

describe("Gate 2 UI and domain contracts", () => {
  it("freezes teacher-task routes and preserves detail routes", () => {
    expect(appRoutes).toEqual([
      "/",
      "/schedule",
      "/courses",
      "/students",
      "/assignments",
      "/files",
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

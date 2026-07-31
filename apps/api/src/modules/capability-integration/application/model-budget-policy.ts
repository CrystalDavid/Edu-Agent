import { randomUUID } from "node:crypto";

import {
  ModelBudgetDecisionSchema,
  type ModelBudgetDecision
} from "@edu-agent/contracts";

import type {
  ModelBudgetConfig
} from "../infrastructure/model-provider-config.js";

export interface ModelBudgetUsageSnapshot {
  dailyCost: number;
  teacherDailyCost: number;
  runningExecutions: number;
}

export class ModelBudgetPolicy {
  constructor(
    private readonly config: ModelBudgetConfig,
    private readonly clock: () => Date = () => new Date()
  ) {}

  evaluate(input: {
    modelId: string;
    promptText: string;
    requestedOutputTokens: number;
    queuedAt: string;
    usage: ModelBudgetUsageSnapshot;
  }): ModelBudgetDecision {
    const estimatedInputTokens = estimateInputTokens(
      input.promptText
    );
    const maximumCost = estimateCost({
      inputTokens: estimatedInputTokens,
      outputTokens: input.requestedOutputTokens,
      inputPricePerMillion:
        this.config.inputPricePerMillion,
      outputPricePerMillion:
        this.config.outputPricePerMillion
    });
    const now = this.clock();
    const queueAge = Math.max(
      0,
      now.getTime() - new Date(input.queuedAt).getTime()
    );
    const reasonCode =
      !this.config.allowedModelIds.includes(input.modelId)
        ? "MODEL_NOT_ALLOWED"
        : estimatedInputTokens > this.config.maxInputTokens
          ? "INPUT_LIMIT_EXCEEDED"
          : input.requestedOutputTokens >
              this.config.maxOutputTokens
            ? "OUTPUT_LIMIT_EXCEEDED"
            : maximumCost > this.config.maxSingleCost
              ? "SINGLE_COST_LIMIT_EXCEEDED"
              : input.usage.dailyCost + maximumCost >
                  this.config.dailyBudget
                ? "DAILY_BUDGET_EXCEEDED"
                : input.usage.teacherDailyCost + maximumCost >
                    this.config.teacherDailyBudget
                  ? "TEACHER_DAILY_BUDGET_EXCEEDED"
                  : input.usage.runningExecutions >=
                      this.config.maxConcurrency
                    ? "CONCURRENCY_LIMIT_EXCEEDED"
                    : queueAge > this.config.maxQueueWaitMs
                      ? "QUEUE_WAIT_EXCEEDED"
                      : "ALLOWED";
    return ModelBudgetDecisionSchema.parse({
      decisionRef: `model-budget-decision:${randomUUID()}`,
      allowed: reasonCode === "ALLOWED",
      reasonCode,
      estimatedInputTokens,
      requestedOutputTokens: input.requestedOutputTokens,
      estimatedMaximumCost: maximumCost,
      checkedAt: now.toISOString()
    });
  }
}

export function estimateInputTokens(text: string): number {
  if (text.length === 0) return 0;
  let weightedUnits = 0;
  for (const character of text) {
    weightedUnits += /[\u3400-\u9fff]/u.test(character) ? 1.2 : 0.3;
  }
  return Math.max(1, Math.ceil(weightedUnits));
}

export function estimateCost(input: {
  inputTokens: number;
  outputTokens: number;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}): number {
  const value =
    (input.inputTokens / 1_000_000) *
      input.inputPricePerMillion +
    (input.outputTokens / 1_000_000) *
      input.outputPricePerMillion;
  return Number(value.toFixed(8));
}

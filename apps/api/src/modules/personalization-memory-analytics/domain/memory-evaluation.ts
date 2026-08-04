import {
  assertCandidateIntegrity,
  type MemoryCandidate
} from "./memory-candidate.js";

export interface MemoryCandidateEvaluation {
  readonly policyVersion: "memory-candidate-evaluation@1";
  readonly passed: boolean;
  readonly source: {
    readonly status: "passed" | "failed";
    readonly count: number;
    readonly issues: readonly string[];
  };
  readonly lifecycle: {
    readonly status: "passed" | "failed";
    readonly candidateStatus: MemoryCandidate["status"];
    readonly issues: readonly string[];
  };
  readonly boundary: {
    readonly status: "passed" | "failed";
    readonly issues: readonly string[];
  };
  readonly confidence: {
    readonly status: "passed" | "needs_review";
    readonly value: number;
  };
  readonly issues: readonly string[];
}

export function evaluateMemoryCandidate(input: {
  readonly candidate: MemoryCandidate;
  readonly at: string;
}): MemoryCandidateEvaluation {
  assertCandidateIntegrity(input.candidate);
  const sourceIssues = input.candidate.sources.flatMap((source) => {
    const issues: string[] = [];
    if (!source.sourceRef.trim()) issues.push("sourceRef is missing");
    if (!source.version.trim()) issues.push(`${source.sourceRef} has no version`);
    if (source.contentHash.length < 16) {
      issues.push(`${source.sourceRef} has no trustworthy content hash`);
    }
    if (!source.provenance.trim()) {
      issues.push(`${source.sourceRef} has no provenance`);
    }
    return issues;
  });
  const lifecycleIssues: string[] = [];
  if (
    input.candidate.status === "draft" &&
    Date.parse(input.at) >= Date.parse(input.candidate.expiresAt)
  ) {
    lifecycleIssues.push("draft candidate has reached expiresAt");
  }
  const boundaryIssues: string[] = [];
  if (/learner|student/iu.test(input.candidate.owner.teacherRef)) {
    boundaryIssues.push("learner-owned memory is forbidden in Phase 6");
  }
  if (
    input.candidate.type === "preference" &&
    (!input.candidate.content.preferenceKey ||
      !input.candidate.content.preferenceValue)
  ) {
    boundaryIssues.push("preference candidate lacks structured preference data");
  }
  if (
    input.candidate.type === "episodic" &&
    (input.candidate.content.preferenceKey !== undefined ||
      input.candidate.content.preferenceValue !== undefined)
  ) {
    boundaryIssues.push("episodic candidate contains preference fields");
  }
  const issues = [...sourceIssues, ...lifecycleIssues, ...boundaryIssues];
  return Object.freeze({
    policyVersion: "memory-candidate-evaluation@1" as const,
    passed: issues.length === 0,
    source: {
      status: sourceIssues.length === 0 ? "passed" as const : "failed" as const,
      count: input.candidate.sources.length,
      issues: Object.freeze(sourceIssues)
    },
    lifecycle: {
      status: lifecycleIssues.length === 0 ? "passed" as const : "failed" as const,
      candidateStatus: input.candidate.status,
      issues: Object.freeze(lifecycleIssues)
    },
    boundary: {
      status: boundaryIssues.length === 0 ? "passed" as const : "failed" as const,
      issues: Object.freeze(boundaryIssues)
    },
    confidence: {
      status: input.candidate.confidence >= 0.6
        ? "passed" as const
        : "needs_review" as const,
      value: input.candidate.confidence
    },
    issues: Object.freeze(issues)
  });
}

import type {
  TeachingPlan,
  TeachingPlanDiff
} from "@edu-agent/contracts";

export function applyDiffToPlan(
  baseline: TeachingPlan,
  diff: TeachingPlanDiff
): TeachingPlan {
  const next: TeachingPlan = {
    ...baseline,
    teacherQuestions: [...baseline.teacherQuestions],
    evidenceRefs: [...baseline.evidenceRefs]
  };
  for (const change of diff.changes) {
    if (change.after === null) continue;
    if (
      change.field === "teacherQuestions" ||
      change.field === "evidenceRefs"
    ) {
      next[change.field] = Array.isArray(change.after)
        ? [...change.after]
        : [change.after];
    } else {
      next[change.field] = Array.isArray(change.after)
        ? change.after.join("\n")
        : change.after;
    }
  }
  return next;
}

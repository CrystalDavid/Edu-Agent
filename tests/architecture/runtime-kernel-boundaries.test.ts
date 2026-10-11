import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const runtimeRoot = join(
  root,
  "apps/api/src/modules/agent-runtime-context"
);

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function source(projectPath: string): string {
  return readFileSync(join(root, projectPath), "utf8");
}

describe("Phase 4 Runtime Kernel boundaries", () => {
  it("keeps Runtime domain and application independent from Platform repositories and adapters", () => {
    const kernelFiles = filesUnder(runtimeRoot).filter(
      (path) =>
        path.endsWith(".ts") &&
        (/[\\/]domain[\\/]/u.test(path) || /[\\/]application[\\/]/u.test(path))
    );
    const forbidden =
      /(?:education-domain|artifact-collaboration|work-assistant-durable-execution)[\\/]infrastructure|platform[\\/]postgres|from\s+["'](?:pg|openai)["']/u;

    for (const path of kernelFiles) {
      expect(readFileSync(path, "utf8"), relative(root, path)).not.toMatch(
        forbidden
      );
    }
  });

  it("exposes capability and Platform actions only as Runtime ports", () => {
    const service = source(
      "apps/api/src/modules/agent-runtime-context/application/runtime-kernel-service.ts"
    );
    for (const port of [
      "RuntimeCheckpointStore",
      "ContextProvider",
      "ModelExecutor",
      "ProposalCreator",
      "ToolExecutor"
    ]) {
      expect(service).toContain(`interface ${port}`);
    }
    expect(service).not.toContain("Postgres");
    expect(service).not.toContain("ModelProvider");
  });

  it("prevents Runtime from owning formal education state transitions", () => {
    const kernel = [
      source(
        "apps/api/src/modules/agent-runtime-context/domain/runtime-kernel.ts"
      ),
      source(
        "apps/api/src/modules/agent-runtime-context/application/runtime-kernel-service.ts"
      )
    ].join("\n");

    expect(kernel).not.toMatch(
      /(?:approveTeachingPlan|confirmGradeDecision|confirmLessonDelivery|createEvidenceObservation|UPDATE\s+(?:artifact|education|work)\.)/u
    );
    expect(kernel).toContain("ProposalCreator");
    expect(kernel).toContain("humanApprovalRequired");
  });

  it("limits checkpoint persistence to the Runtime schema", () => {
    const adapter = source(
      "apps/api/src/modules/agent-runtime-context/infrastructure/postgres-runtime-checkpoint-adapter.ts"
    );
    const schemaReferences = [
      ...adapter.matchAll(/\b(?:FROM|INTO|UPDATE)\s+([a-z_]+)\./giu)
    ].map((match) => match[1]);

    expect(new Set(schemaReferences)).toEqual(new Set(["runtime"]));
    expect(adapter).toContain("AgentRunCheckpointed");
    expect(adapter).toContain("FOR UPDATE");
    expect(adapter).not.toMatch(
      /(?:education|artifact|work|governance|capability)\./u
    );
  });

  it("maps Lesson Preparation to checkpoints without changing HTTP or provider boundaries", () => {
    const orchestration = source(
      "apps/api/src/composition/postgres-model-invocation-service.ts"
    );
    const worker = source(
      "apps/api/src/composition/local-copilot-outbox-worker.ts"
    );

    expect(orchestration).toContain("createLessonPreparationRun");
    expect(orchestration).toContain("updateAgentRunLifecycle");
    expect(orchestration).toContain('type: "recovered"');
    expect(orchestration).not.toContain('from "openai"');
    expect(worker).toContain("AgentRunCheckpointed");
  });
});

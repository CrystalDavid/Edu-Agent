import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function source(projectPath: string): string {
  return readFileSync(resolve(root, projectPath), "utf8");
}

describe("first-round conversation memory boundaries", () => {
  it("keeps platform conversation truth in Work and derived snapshots in Runtime", () => {
    const workMigration = source(
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0012_conversation_thread_turn.sql"
    );
    const runtimeMigration = source(
      "apps/api/src/modules/agent-runtime-context/infrastructure/migrations/0007_working_memory_snapshot.sql"
    );

    expect(workMigration).toContain("work.conversation_thread");
    expect(workMigration).toContain("work.conversation_turn");
    expect(workMigration).toContain("conversation_turn_no_update");
    expect(workMigration).not.toContain("runtime.working_memory_snapshot");
    expect(runtimeMigration).toContain("runtime.working_memory_snapshot");
    expect(runtimeMigration).toContain("working_memory_snapshot_protect");
    expect(runtimeMigration).not.toContain("work.conversation_turn");
  });

  it("stores only teacher text, safe surface summaries, and result references", () => {
    const migration = source(
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0012_conversation_thread_turn.sql"
    );
    expect(migration).toContain("teacher_text");
    expect(migration).toContain("surface_summary");
    expect(migration).toContain("model_execution_ref");
    expect(migration).not.toMatch(
      /raw_(?:provider_)?(?:request|response)|hidden_(?:reasoning|thought)|chain_of_thought/iu
    );
    const service = source(
      "apps/api/src/composition/postgres-conversation-service.ts"
    );
    expect(service).not.toMatch(
      /(?:fullPrompt|rawProvider|providerResponse|hiddenReasoning|chainOfThought)/u
    );
  });

  it("requires owner scope and sealed snapshot hashes before model use", () => {
    const service = source(
      "apps/api/src/composition/postgres-conversation-service.ts"
    );
    const workRepository = source(
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/postgres-conversation-repository.ts"
    );
    const invocation = source(
      "apps/api/src/composition/postgres-model-invocation-service.ts"
    );

    expect(workRepository).toMatch(
      /tenant_ref = \$1 AND teacher_ref = \$2 AND conversation_ref = \$3/u
    );
    expect(service).toContain("expectedContentHash");
    expect(service).toContain("expectedSourceTurnSequence");
    expect(invocation).toContain("workingMemorySnapshotRef");
    expect(invocation).toContain("workingMemoryContentHash");
  });

  it("keeps working-memory construction deterministic and repository-free", () => {
    const builder = source(
      "apps/api/src/modules/agent-runtime-context/domain/working-memory.ts"
    );
    expect(builder).toContain("recentTeacherTurns = teacherTurns.slice(-6)");
    expect(builder).toContain("working-memory-builder@1");
    expect(builder).not.toMatch(
      /(?:postgres|repository|\.query\(|\bSELECT\s+.+\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+[a-z_]+\.|\bDELETE\s+FROM\b)/iu
    );
  });

  it("makes retention configurable, excludes expired state, and never outlives source turns", () => {
    const retention = source(
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/conversation-retention-config.ts"
    );
    const service = source(
      "apps/api/src/composition/postgres-conversation-service.ts"
    );
    const repository = source(
      "apps/api/src/modules/agent-runtime-context/infrastructure/postgres-working-memory-repository.ts"
    );
    expect(retention).toContain("CONVERSATION_RETENTION_DAYS");
    expect(service).toContain("CONVERSATION_EXPIRED");
    expect(service).toContain("sourceRetentionUntil");
    expect(repository).toContain("expires_at >");
    expect(repository).toContain(
      "WorkingMemorySnapshot retention cannot outlive its source ConversationTurn."
    );
  });

  it("records Work/Runtime ownership and rejects Provider continuation as platform truth", () => {
    const adr = source(
      "docs/architecture/decisions/conversation-working-memory-ownership-and-retention.md"
    );
    expect(adr).toContain("`work` 拥有 `ConversationThread`");
    expect(adr).toContain("`runtime` 拥有版本化 `WorkingMemorySnapshot`");
    expect(adr).toContain("Provider continuation 不是平台真值");
    expect(adr).toContain("完整 Prompt");
    expect(adr).toContain("待产品确认");
  });

  it("versions the Skill and gives the current request precedence", () => {
    const manifest = source(
      "apps/api/src/agent/skills/lesson-preparation/manifest.ts"
    );
    const prompt = source(
      "apps/api/src/agent/skills/lesson-preparation/prompt.ts"
    );
    expect(manifest).toContain('ref: "lesson-preparation@5"');
    expect(manifest).toContain('ref: "lesson-preparation@6"');
    expect(manifest).toContain(
      'inputSchemaRef: lessonPreparationInputSchemaRefV4'
    );
    expect(prompt).toContain("当前 teacherRequest 优先级最高");
    expect(prompt).toContain("不能当作教师长期偏好");
    expect(prompt).toContain("隐藏思维链");
  });
});

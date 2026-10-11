import { PostgresGate2RuntimeRepository } from "./postgres-gate2-runtime-repository.js";
import { PostgresRuntimeRepository } from "./postgres-runtime-repository.js";

/** Runtime-owned transaction operations for one next-Lesson AgentRun. */
export class PostgresNextLessonActionRuntimePort {
  constructor(
    private readonly runtime = new PostgresRuntimeRepository(),
    private readonly context = new PostgresGate2RuntimeRepository()
  ) {}

  insertAgentRunBundle(
    ...args: Parameters<PostgresRuntimeRepository["insertAgentRunBundle"]>
  ) {
    return this.runtime.insertAgentRunBundle(...args);
  }

  insertContextManifest(
    ...args: Parameters<PostgresGate2RuntimeRepository["insertContextManifest"]>
  ) {
    return this.context.insertContextManifest(...args);
  }
}

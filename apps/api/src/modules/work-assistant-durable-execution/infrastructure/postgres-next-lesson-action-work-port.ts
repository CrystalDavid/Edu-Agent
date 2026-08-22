import { PostgresNextLessonActionRepository } from "./postgres-next-lesson-action-repository.js";
import { PostgresWorkRepository } from "./postgres-work-repository.js";

/** Work-owned transaction operations for candidates and their query boundary. */
export class PostgresNextLessonActionWorkPort {
  constructor(
    private readonly actions = new PostgresNextLessonActionRepository(),
    private readonly work = new PostgresWorkRepository()
  ) {}

  insertQueryRun(
    ...args: Parameters<PostgresWorkRepository["insertQueryRun"]>
  ) {
    return this.work.insertQueryRun(...args);
  }

  lockGenerationScope(
    ...args: Parameters<PostgresNextLessonActionRepository["lockGenerationScope"]>
  ) {
    return this.actions.lockGenerationScope(...args);
  }

  insertCandidate(
    ...args: Parameters<PostgresNextLessonActionRepository["insertCandidate"]>
  ) {
    return this.actions.insertCandidate(...args);
  }

  listByReflection(
    ...args: Parameters<PostgresNextLessonActionRepository["listByReflection"]>
  ) {
    return this.actions.listByReflection(...args);
  }

  get(...args: Parameters<PostgresNextLessonActionRepository["get"]>) {
    return this.actions.get(...args);
  }

  update(...args: Parameters<PostgresNextLessonActionRepository["update"]>) {
    return this.actions.update(...args);
  }

  insertOutbox(
    ...args: Parameters<PostgresNextLessonActionRepository["insertOutbox"]>
  ) {
    return this.actions.insertOutbox(...args);
  }
}

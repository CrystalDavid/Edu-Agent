import type { MemoryScope } from "@edu-agent/contracts";

import type {
  TeacherPreferenceScopeAuthorizationPort
} from "../modules/personalization-memory-analytics/application/index.js";
import { NotFoundError } from "../platform/errors.js";
import type {
  PostgresLessonPreparationService
} from "./postgres-lesson-preparation-service.js";

export class TeacherPreferenceScopeAuthorizationAdapter
  implements TeacherPreferenceScopeAuthorizationPort
{
  constructor(
    private readonly lessons: PostgresLessonPreparationService
  ) {}

  async assertAuthorized(input: {
    readonly tenantRef: string;
    readonly teacherRef: string;
    readonly scope: MemoryScope;
    readonly allowedCourseRunRefs: readonly string[];
    readonly purpose: string;
  }): Promise<void> {
    if (input.scope.kind === "global" ||
      input.scope.kind === "subject" ||
      input.scope.kind === "subject_grade") {
      return;
    }
    if (input.scope.kind === "task") {
      const task = await this.lessons.getTask({
        tenantRef: input.tenantRef,
        actorRef: input.teacherRef,
        taskRef: input.scope.taskRef!
      });
      this.assertAllowedCourseRun(
        task.courseRunRef,
        input.allowedCourseRunRefs
      );
      if (
        (input.scope.courseRunRef !== null &&
          input.scope.courseRunRef !== task.courseRunRef) ||
        (input.scope.lessonRef !== null &&
          input.scope.lessonRef !== task.lessonRef)
      ) {
        throw safeNotFound();
      }
      return;
    }
    this.assertAllowedCourseRun(
      input.scope.courseRunRef!,
      input.allowedCourseRunRefs
    );
    if (input.scope.kind === "course_run") {
      await this.lessons.getCourseRun({
        tenantRef: input.tenantRef,
        actorRef: input.teacherRef,
        courseRunRef: input.scope.courseRunRef!
      });
      return;
    }
    const lesson = await this.lessons.getLesson({
      tenantRef: input.tenantRef,
      actorRef: input.teacherRef,
      lessonRef: input.scope.lessonRef!
    });
    if (lesson.courseRunRef !== input.scope.courseRunRef) {
      throw safeNotFound();
    }
  }

  private assertAllowedCourseRun(
    courseRunRef: string,
    allowedCourseRunRefs: readonly string[]
  ): void {
    if (!allowedCourseRunRefs.includes(courseRunRef)) throw safeNotFound();
  }
}

function safeNotFound(): NotFoundError {
  return new NotFoundError("偏好作用范围不存在或当前无权访问。");
}

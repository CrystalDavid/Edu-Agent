import type {
  NextLessonActionTargetPort
} from "../modules/agent-runtime-context/application/next-lesson-optimization-service.js";
import { DomainConflictError } from "../platform/errors.js";
import type { PostgresClassroomReflectionService } from "./postgres-classroom-reflection-service.js";
import type { PostgresLessonPreparationService } from "./postgres-lesson-preparation-service.js";

export class NextLessonActionTargetAdapter
  implements NextLessonActionTargetPort
{
  constructor(
    private readonly classroom: PostgresClassroomReflectionService,
    private readonly lessons: PostgresLessonPreparationService
  ) {}

  async create(
    input: Parameters<NextLessonActionTargetPort["create"]>[0]
  ) {
    if (input.candidate.status !== "candidate") {
      throw new DomainConflictError(
        "NEXT_LESSON_ACTION_ALREADY_DECIDED",
        "该下一课行动候选已经由教师处置。"
      );
    }
    const base = {
      reflectionRevisionRef: input.candidate.sourceReflectionRevisionRef,
      purpose: "lesson-reflection.create-follow-up" as const,
      idempotencyKey: input.stableIdempotencyKey
    };
    if (input.candidate.candidateType === "adjust_next_lesson_focus") {
      if (!input.candidate.targetLessonRef) {
        throw new DomainConflictError(
          "NEXT_LESSON_TARGET_REQUIRED",
          "调整下一课前需要选择目标课时。"
        );
      }
      return this.classroom.createFollowUp({
        tenantRef: input.context.tenantRef,
        actorRef: input.context.actorRef,
        reflectionRef: input.context.reflectionRef,
        request: {
          ...base,
          actionType: "lesson_preparation",
          targetLessonRef: input.candidate.targetLessonRef,
          priority: "normal",
          dueAt: null
        }
      });
    }
    if (input.candidate.candidateType === "create_practice_task") {
      if (!input.candidate.targetLessonRef) {
        throw new DomainConflictError(
          "NEXT_LESSON_TARGET_REQUIRED",
          "创建补充练习前需要选择目标课时。"
        );
      }
      const lesson = await this.lessons.getLesson({
        tenantRef: input.context.tenantRef,
        actorRef: input.context.actorRef,
        lessonRef: input.candidate.targetLessonRef
      });
      return this.classroom.createFollowUp({
        tenantRef: input.context.tenantRef,
        actorRef: input.context.actorRef,
        reflectionRef: input.context.reflectionRef,
        request: {
          ...base,
          actionType: "assignment_draft",
          targetLessonRef: lesson.lessonRef,
          title: input.candidate.title,
          instructions: input.candidate.reason,
          dueAt: null,
          items: [{
            sequence: 1,
            itemType: "short_answer",
            prompt: input.candidate.reason.slice(0, 1_000),
            maxScore: 5,
            options: [],
            answerKey: {
              referenceAnswer: "答案需由教师结合目标课时和班级情况审核。"
            },
            gradingCriteria: "概念表达清楚，并能说明判断依据。",
            objectiveRef:
              lesson.learningObjectives[0]?.objectiveRef ?? lesson.lessonRef
          }]
        }
      });
    }
    return this.classroom.createFollowUp({
      tenantRef: input.context.tenantRef,
      actorRef: input.context.actorRef,
      reflectionRef: input.context.reflectionRef,
      request: {
        ...base,
        actionType: "teacher_todo",
        title: input.candidate.title,
        description: [input.candidate.reason, input.candidate.teacherNote]
          .filter(Boolean)
          .join("\n"),
        priority:
          input.candidate.candidateType === "review_student_issue"
            ? "high"
            : "normal",
        dueAt: null
      }
    });
  }
}

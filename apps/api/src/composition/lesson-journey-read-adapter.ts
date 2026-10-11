import type {
  LessonJourneyReadContext,
  LessonJourneySourceReader,
  LessonJourneySourceSnapshot
} from "../modules/work-assistant-durable-execution/application/lesson-journey-read-service.js";
import { NotFoundError } from "../platform/errors.js";
import type { PostgresClassroomReflectionService } from "./postgres-classroom-reflection-service.js";
import type { PostgresFileArtifactService } from "./postgres-file-artifact-service.js";
import type { PostgresGate2ReadService } from "./postgres-gate2-read-service.js";
import type { PostgresLessonPreparationService } from "./postgres-lesson-preparation-service.js";
import type { LessonBriefService } from "../modules/agent-runtime-context/application/lesson-brief-service.js";
import type { NextLessonOptimizationService } from "../modules/agent-runtime-context/application/next-lesson-optimization-service.js";

export class LessonJourneyReadAdapter
  implements LessonJourneySourceReader
{
  constructor(
    private readonly preparation: PostgresLessonPreparationService,
    private readonly read: PostgresGate2ReadService,
    private readonly files: PostgresFileArtifactService,
    private readonly classroom: PostgresClassroomReflectionService,
    private readonly lessonBrief: LessonBriefService,
    private readonly nextLessonOptimization: NextLessonOptimizationService
  ) {}

  async loadAuthorizedSnapshot(
    context: LessonJourneyReadContext
  ): Promise<LessonJourneySourceSnapshot> {
    const lesson = await this.preparation.getLesson(context);
    const [taskList, teachingPlans, materialBundle, implementation, proposals, briefState] =
      await Promise.all([
        this.preparation.listTasks({
          tenantRef: context.tenantRef,
          actorRef: context.actorRef,
          allowedCourseRunRefs: context.allowedCourseRunRefs
        }),
        this.preparation.getLessonTeachingPlans(context),
        this.files.getMaterialBundle({
          tenantRef: context.tenantRef,
          actorRef: context.actorRef,
          lessonRef: context.lessonRef
        }),
        this.classroom.getLessonSummary(context),
        this.read.listPendingProposals({
          tenantRef: context.tenantRef,
          actorRef: context.actorRef
        }),
        this.lessonBrief.get({
          tenantRef: context.tenantRef,
          actorRef: context.actorRef,
          lessonRef: context.lessonRef
        })
      ]);
    const tasks = taskList.items.filter(
      (task) => task.lessonRef === context.lessonRef
    );
    const activeTask = [...tasks]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .find(
        (task) => task.status !== "completed" && task.status !== "cancelled"
      ) ?? tasks[0] ?? null;

    return {
      lesson,
      tasks,
      teachingPlans,
      materialBundle,
      implementation,
      pendingProposals: proposals.items.filter(
        (proposal) =>
          proposal.lessonRef === context.lessonRef ||
          proposal.preparationTaskRef === activeTask?.taskRef
      ),
      agentExecution: activeTask
        ? await this.loadAgentExecution(context, activeTask.taskRef)
        : null,
      lessonBrief: briefState.current,
      nextLessonActions: implementation.reflection
        ? (await this.nextLessonOptimization.list({
            tenantRef: context.tenantRef,
            actorRef: context.actorRef,
            reflectionRef: implementation.reflection.reflectionRef
          })).items
        : []
    };
  }

  private async loadAgentExecution(
    context: LessonJourneyReadContext,
    taskRef: string
  ): Promise<LessonJourneySourceSnapshot["agentExecution"]> {
    const task = await this.preparation.getTask({
      tenantRef: context.tenantRef,
      actorRef: context.actorRef,
      taskRef
    });
    if (!task.latestTaskRunRef) return null;
    try {
      const explanation = await this.read.getRunExplanation({
        tenantRef: context.tenantRef,
        actorRef: context.actorRef,
        taskRef
      });
      return {
        agentRunRef: explanation.agentRun.agentRunRef,
        agentStatus: explanation.agentRun.status,
        modelExecutionRef: explanation.modelExecution.executionRef,
        modelStatus: explanation.modelExecution.status
      };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }
}

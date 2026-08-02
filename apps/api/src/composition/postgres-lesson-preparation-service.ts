import { createHash, randomUUID } from "node:crypto";

import {
  AuthorizedContextPlanSchema,
  CourseRunListSchema,
  CourseRunViewSchema,
  CreateLessonPreparationTaskRequestSchema,
  CurriculumUnitListSchema,
  CurriculumUnitViewSchema,
  LessonListSchema,
  LessonPreparationHistoryEntrySchema,
  LessonPreparationSummarySchema,
  LessonPreparationTaskActionRequestSchema,
  LessonPreparationTaskDetailSchema,
  LessonPreparationTaskListSchema,
  LessonPreparationTaskResultSchema,
  LessonTeachingPlanStateSchema,
  LessonViewSchema,
  SealedContextManifestSchema,
  TaskResourceSelectionRequestSchema,
  TaskWorkingSetSchema,
  TaskWorkingSetResultSchema,
  type AuthorizationDecision,
  type CreateLessonPreparationTaskRequest,
  type FormalWriteReceipt,
  type LessonPreparationStatus,
  type LessonPreparationTaskActionRequest,
  type LessonPreparationTaskDetail,
  type TaskResourceSelectionRequest
} from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/demo-fixtures";
import type { Pool } from "pg";

import {
  PostgresGate2RuntimeRepository
} from "../modules/agent-runtime-context/infrastructure/postgres-gate2-runtime-repository.js";
import {
  PostgresGate2ArtifactRepository
} from "../modules/artifact-collaboration/infrastructure/postgres-gate2-artifact-repository.js";
import {
  PostgresGate25EducationRepository
} from "../modules/education-domain/infrastructure/postgres-gate2-5-education-repository.js";
import {
  PostgresEducationRepository
} from "../modules/education-domain/infrastructure/postgres-education-repository.js";
import {
  PostgresGovernanceRepository
} from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  PostgresGate2WorkRepository
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-work-repository.js";
import {
  PostgresGate25WorkRepository,
  type StoredLessonPreparationTask
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-5-work-repository.js";
import {
  AuthorizationDeniedError,
  DomainConflictError,
  NotFoundError
} from "../platform/errors.js";
import type { SqlExecutor } from "../platform/postgres/types.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function stableDecisionRef(rootKey: string): string {
  return `authorization-decision:${hash(rootKey).slice(0, 32)}`;
}

const actionConfiguration = {
  start: {
    purpose: "lesson-preparation.start",
    allowed: ["planned"],
    toStatus: "in_progress",
    reason: "教师开始备课",
    eventName: "LessonPreparationStarted"
  },
  reopen: {
    purpose: "lesson-preparation.reopen",
    allowed: ["completed", "cancelled", "ready_for_use"],
    toStatus: "in_progress",
    reason: "教师显式重新打开备课任务",
    eventName: "LessonPreparationReopened"
  },
  complete: {
    purpose: "lesson-preparation.complete",
    allowed: ["ready_for_use"],
    toStatus: "completed",
    reason: "教师显式标记备课完成",
    eventName: "LessonPreparationCompleted"
  },
  cancel: {
    purpose: "lesson-preparation.cancel",
    allowed: [
      "planned",
      "in_progress",
      "awaiting_plan_review",
      "ready_for_use"
    ],
    toStatus: "cancelled",
    reason: "教师取消备课任务",
    eventName: "LessonPreparationCancelled"
  }
} as const;

export class PostgresLessonPreparationService {
  constructor(
    private readonly pool: Pool,
    private readonly governance =
      new PostgresGovernanceRepository(),
    private readonly work = new PostgresGate25WorkRepository(),
    private readonly gate2Work =
      new PostgresGate2WorkRepository(),
    private readonly education =
      new PostgresGate25EducationRepository(),
    private readonly gate2Education =
      new PostgresEducationRepository(),
    private readonly runtime =
      new PostgresGate2RuntimeRepository(),
    private readonly artifacts =
      new PostgresGate2ArtifactRepository()
  ) {}

  async listCourseRuns(input: {
    tenantRef: string;
    actorRef: string;
    allowedCourseRunRefs?: readonly string[];
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    return CourseRunListSchema.parse({
      items: await this.education.listCourseRuns(
        this.pool,
        input.tenantRef,
        input.allowedCourseRunRefs
      )
    });
  }

  async getCourseRun(input: {
    tenantRef: string;
    actorRef: string;
    courseRunRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const course = await this.education.getCourseRun(
      this.pool,
      input.tenantRef,
      input.courseRunRef
    );
    if (!course) throw new NotFoundError("CourseRun 不存在。");
    return CourseRunViewSchema.parse(course);
  }

  async listUnits(input: {
    tenantRef: string;
    actorRef: string;
    courseRunRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    return CurriculumUnitListSchema.parse({
      items: await this.education.listUnits(
        this.pool,
        input.tenantRef,
        input.courseRunRef
      )
    });
  }

  async getUnit(input: {
    tenantRef: string;
    actorRef: string;
    unitRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const unit = await this.education.getUnit(
      this.pool,
      input.tenantRef,
      input.unitRef
    );
    if (!unit) throw new NotFoundError("CurriculumUnit 不存在。");
    return CurriculumUnitViewSchema.parse(unit);
  }

  async listLessons(input: {
    tenantRef: string;
    actorRef: string;
    unitRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    return LessonListSchema.parse({
      items: await this.education.listLessons(
        this.pool,
        input.tenantRef,
        input.unitRef
      )
    });
  }

  async getLesson(input: {
    tenantRef: string;
    actorRef: string;
    lessonRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const lesson = await this.education.getLesson(
      this.pool,
      input.tenantRef,
      input.lessonRef
    );
    if (!lesson) throw new NotFoundError("Lesson 不存在。");
    return LessonViewSchema.parse(lesson);
  }

  async listTasks(input: {
    tenantRef: string;
    actorRef: string;
    allowedCourseRunRefs?: readonly string[];
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const tasks = await this.work.listPreparationTasks(
      this.pool,
      input.tenantRef,
      input.actorRef,
      input.allowedCourseRunRefs
    );
    return LessonPreparationTaskListSchema.parse({
      items: await Promise.all(
        tasks.map(async (task) => {
          const lesson = await this.education.getLesson(
            this.pool,
            input.tenantRef,
            task.lessonRef
          );
          return this.toTaskSummary(
            task,
            lesson?.title ?? "未知课时"
          );
        })
      )
    });
  }

  async getTask(input: {
    tenantRef: string;
    actorRef: string;
    taskRef: string;
  }): Promise<LessonPreparationTaskDetail> {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const task = await this.work.getPreparationTask(
      this.pool,
      input.tenantRef,
      input.taskRef,
      input.actorRef
    );
    if (!task) throw new NotFoundError("备课 Task 不存在。");
    return this.toTaskDetail(input.tenantRef, task);
  }

  async findOpenTaskForLesson(input: {
    tenantRef: string;
    actorRef: string;
    lessonRef: string;
  }): Promise<LessonPreparationTaskDetail | null> {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const task = await this.work.findOpenTaskForLesson(
      this.pool,
      input.tenantRef,
      input.lessonRef
    );
    if (!task) return null;
    if (task.createdBy !== input.actorRef) {
      throw new AuthorizationDeniedError(
        "当前课时的未关闭备课 Task 不属于当前教师。"
      );
    }
    return this.toTaskDetail(input.tenantRef, task);
  }

  async getSummary(input: {
    tenantRef: string;
    actorRef: string;
    allowedCourseRunRefs?: readonly string[];
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const taskList = await this.listTasks(input);
    const courses = await this.education.listCourseRuns(
      this.pool,
      input.tenantRef,
      input.allowedCourseRunRefs
    );
    const lessons = [];
    for (const course of courses) {
      const units = await this.education.listUnits(
        this.pool,
        input.tenantRef,
        course.courseRunRef
      );
      for (const unit of units) {
        lessons.push(
          ...(await this.education.listLessons(
            this.pool,
            input.tenantRef,
            unit.unitRef
          ))
        );
      }
    }
    return LessonPreparationSummarySchema.parse({
      incompleteTasks: taskList.items.filter(
        (task) =>
          task.status !== "completed" &&
          task.status !== "cancelled"
      ),
      awaitingPlanReview: taskList.items.filter(
        (task) => task.status === "awaiting_plan_review"
      ),
      readyForUse: taskList.items.filter(
        (task) => task.status === "ready_for_use"
      ),
      recentLessons: lessons
        .sort((left, right) =>
          (right.plannedAt ?? "").localeCompare(
            left.plannedAt ?? ""
          )
        )
        .slice(0, 5),
      generatedAt: new Date().toISOString()
    });
  }

  async createTask(input: {
    tenantRef: string;
    actorRef: string;
    request: CreateLessonPreparationTaskRequest;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request =
      CreateLessonPreparationTaskRequestSchema.parse(input.request);
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      request.purpose,
      request.idempotencyKey
    ].join("|");
    const decisionRef = stableDecisionRef(rootKey);
    const now = new Date().toISOString();
    const writeContext: WriteContext = {
      actorRef: input.actorRef,
      purpose: request.purpose,
      rootIdempotencyKey: request.idempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt: now
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(
        client,
        {
          idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
          rootKey,
          requestFingerprint: hash(request),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "lesson-preparation-create-idempotency"
          )
        }
      );
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return LessonPreparationTaskResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }

      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        [request.lessonRef]
      );
      const lessonContext =
        await this.education.getLessonContext(
          client,
          input.tenantRef,
          request.lessonRef
        );
      if (!lessonContext) {
        throw new NotFoundError("备课课时不存在。");
      }
      if (lessonContext.lesson.learningObjectives.length === 0) {
        throw new DomainConflictError(
          "LESSON_HAS_NO_LEARNING_OBJECTIVE",
          "该课时尚未关联教学目标，不能创建备课任务。"
        );
      }
      const existing = await this.work.findOpenTaskForLesson(
        client,
        input.tenantRef,
        request.lessonRef
      );
      if (existing) {
        throw new DomainConflictError(
          "OPEN_LESSON_PREPARATION_TASK_EXISTS",
          "该课时已有未关闭的备课任务。",
          { taskRef: existing.taskRef, status: existing.status }
        );
      }
      const courseContext =
        await this.gate2Education.getTeacherCopilotContext(
          client,
          {
            tenantRef: input.tenantRef,
            courseRunRef: lessonContext.lesson.courseRunRef
          }
        );
      if (!courseContext) {
        throw new NotFoundError("课程 Evidence 上下文不存在。");
      }
      const goal = await this.gate2Work.getDemoCaseAndGoal(
        client,
        input.tenantRef,
        gate2DemoRefs.goalRef
      );
      if (!goal) {
        throw new NotFoundError("备课 Goal 不存在。");
      }
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: request.purpose,
        action: "lesson-preparation.create",
        resourceRef: request.lessonRef,
        requestedFieldMask: [
          "courseRun",
          "curriculumUnit",
          "lesson",
          "learningObjectives",
          "evidence",
          "baselineTeachingPlan"
        ],
        effect: "allow",
        reasonCodes: [
          "synthetic-teacher-role",
          "lesson-in-assigned-course"
        ],
        policyVersion: "policy:lesson-preparation-local@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "lesson-preparation-create-authorization"
          )
        })
      ];
      const taskRef = `task:${randomUUID()}`;
      const availableCourseEvidence = new Set([
        ...courseContext.observations.map(
          (item) => item.observationRef
        ),
        ...courseContext.claims.map((item) => item.claimRef)
      ]);
      const evidenceRefs =
        lessonContext.lesson.currentEvidenceRefs.filter(
          (reference) => availableCourseEvidence.has(reference)
        );
      if (
        evidenceRefs.length !==
        lessonContext.lesson.currentEvidenceRefs.length
      ) {
        throw new DomainConflictError(
          "LESSON_EVIDENCE_OUTSIDE_COURSE_CONTEXT",
          "课时关联了当前课程授权范围以外的 Evidence。"
        );
      }
      if (evidenceRefs.length === 0) {
        throw new DomainConflictError(
          "LESSON_HAS_NO_CURRENT_EVIDENCE",
          "该课时尚未关联当前 Evidence，不能创建备课任务。"
        );
      }
      receipts.push(
        ...(await this.work.insertLessonPreparationTask(client, {
          taskRef,
          tenantRef: input.tenantRef,
          title: `备课：${lessonContext.lesson.title}`,
          caseRef: goal.caseRef,
          goalRef: goal.goalRef,
          courseRunRef: lessonContext.lesson.courseRunRef,
          curriculumUnitRef: lessonContext.lesson.unitRef,
          lessonRef: lessonContext.lesson.lessonRef,
          dueAt: request.dueAt,
          priority: request.priority,
          createdBy: input.actorRef,
          workingSet: {
            courseRunRef: lessonContext.lesson.courseRunRef,
            curriculumUnitRef: lessonContext.lesson.unitRef,
            lessonRef: lessonContext.lesson.lessonRef,
            learningObjectiveRefs:
              lessonContext.lesson.learningObjectives.map(
                (objective) => objective.objectiveRef
              ),
            evidenceRefs,
            baselineTeachingPlanRef:
              lessonContext.lesson.currentApprovedPlanRef,
            purpose: "teacher-copilot.adjust-next-lesson",
            requestedFieldMask:
              decision.requestedFieldMask
          },
          metadata: {
            task: createWriteMetadata(
              writeContext,
              "work",
              "lesson-preparation-task"
            ),
            details: createWriteMetadata(
              writeContext,
              "work",
              "lesson-preparation-details"
            ),
            workingSetRevision: createWriteMetadata(
              writeContext,
              "work",
              "lesson-preparation-working-set-v1"
            ),
            history: createWriteMetadata(
              writeContext,
              "work",
              "lesson-preparation-history-v1"
            ),
            outbox: createWriteMetadata(
              writeContext,
              "work",
              "lesson-preparation-created-outbox"
            )
          },
          outboxRef: `outbox:${randomUUID()}`,
          historyRef: `preparation-history:${randomUUID()}`
        }))
      );
      receipts.push(
        await this.education.updatePreparationProjection(client, {
          lessonRef: lessonContext.lesson.lessonRef,
          state: "planned",
          activePreparationTaskRef: taskRef,
          metadata: createWriteMetadata(
            writeContext,
            "education",
            "lesson-preparation-created-projection"
          )
        })
      );
      const task = await this.work.getPreparationTask(
        client,
        input.tenantRef,
        taskRef,
        input.actorRef
      );
      if (!task) throw new Error("Created Task cannot be read.");
      const result = LessonPreparationTaskResultSchema.parse({
        replayed: false,
        task: await this.toTaskDetail(
          input.tenantRef,
          task,
          client
        )
      });
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: now
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async transitionTask(input: {
    tenantRef: string;
    actorRef: string;
    taskRef: string;
    action: keyof typeof actionConfiguration;
    request: LessonPreparationTaskActionRequest;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request =
      LessonPreparationTaskActionRequestSchema.parse(input.request);
    const configuration = actionConfiguration[input.action];
    if (request.purpose !== configuration.purpose) {
      throw new AuthorizationDeniedError(
        "命令用途与备课状态转换不匹配。"
      );
    }
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      request.purpose,
      request.idempotencyKey
    ].join("|");
    const decisionRef = stableDecisionRef(rootKey);
    const now = new Date().toISOString();
    const writeContext: WriteContext = {
      actorRef: input.actorRef,
      purpose: request.purpose,
      rootIdempotencyKey: request.idempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt: now
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(
        client,
        {
          idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
          rootKey,
          requestFingerprint: hash({
            taskRef: input.taskRef,
            action: input.action,
            ...request
          }),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            `lesson-preparation-${input.action}-idempotency`
          )
        }
      );
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return LessonPreparationTaskResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }
      const task = await this.work.lockPreparationTask(
        client,
        input.tenantRef,
        input.taskRef,
        input.actorRef
      );
      if (!task) throw new NotFoundError("备课 Task 不存在。");
      if (task.version !== request.expectedVersion) {
        throw new DomainConflictError(
          "LESSON_PREPARATION_VERSION_CONFLICT",
          "备课 Task 版本已变化。",
          {
            expectedVersion: request.expectedVersion,
            actualVersion: task.version,
            status: task.status
          }
        );
      }
      if (
        !configuration.allowed.includes(
          task.status as never
        )
      ) {
        throw new DomainConflictError(
          "LESSON_PREPARATION_INVALID_TRANSITION",
          "当前状态不允许执行该备课命令。",
          {
            action: input.action,
            fromStatus: task.status,
            allowedStatuses: configuration.allowed
          }
        );
      }
      if (
        input.action === "complete" &&
        task.approvedPlanRef === null
      ) {
        throw new DomainConflictError(
          "APPROVED_TEACHING_PLAN_REQUIRED",
          "没有 current approved TeachingPlan，不能完成备课。"
        );
      }
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: request.purpose,
        action: request.purpose,
        resourceRef: input.taskRef,
        requestedFieldMask: [
          "task.status",
          "lesson.preparationState"
        ],
        effect: "allow",
        reasonCodes: [
          "synthetic-teacher-role",
          "expected-version-matched"
        ],
        policyVersion: "policy:lesson-preparation-local@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            `lesson-preparation-${input.action}-authorization`
          )
        })
      ];
      const transition = await this.work.transition(client, {
        taskRef: task.taskRef,
        fromStatus: task.status,
        toStatus: configuration.toStatus,
        expectedVersion: task.version,
        reason: configuration.reason,
        historyRef: `preparation-history:${randomUUID()}`,
        outboxRef: `outbox:${randomUUID()}`,
        eventName: configuration.eventName,
        metadata: {
          transition: createWriteMetadata(
            writeContext,
            "work",
            `lesson-preparation-${input.action}-transition`
          ),
          history: createWriteMetadata(
            writeContext,
            "work",
            `lesson-preparation-${input.action}-history`
          ),
          outbox: createWriteMetadata(
            writeContext,
            "work",
            `lesson-preparation-${input.action}-outbox`
          )
        }
      });
      receipts.push(...transition.receipts);
      receipts.push(
        await this.education.updatePreparationProjection(client, {
          lessonRef: task.lessonRef,
          state: configuration.toStatus,
          activePreparationTaskRef:
            configuration.toStatus === "completed" ||
            configuration.toStatus === "cancelled"
              ? null
              : task.taskRef,
          metadata: createWriteMetadata(
            writeContext,
            "education",
            `lesson-preparation-${input.action}-projection`
          )
        })
      );
      const updated = await this.work.getPreparationTask(
        client,
        input.tenantRef,
        input.taskRef,
        input.actorRef
      );
      if (!updated) throw new Error("Updated Task cannot be read.");
      const result = LessonPreparationTaskResultSchema.parse({
        replayed: false,
        task: await this.toTaskDetail(
          input.tenantRef,
          updated,
          client
        )
      });
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: now
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateResourceSelection(input: {
    tenantRef: string;
    actorRef: string;
    taskRef: string;
    operation: "add" | "remove";
    request: TaskResourceSelectionRequest;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = TaskResourceSelectionRequestSchema.parse(
      input.request
    );
    const expectedPurpose =
      `lesson-preparation.context.${input.operation}`;
    if (request.purpose !== expectedPurpose) {
      throw new AuthorizationDeniedError(
        "资源选择命令用途不匹配。"
      );
    }
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      request.purpose,
      request.idempotencyKey
    ].join("|");
    const decisionRef = stableDecisionRef(rootKey);
    const now = new Date().toISOString();
    const writeContext: WriteContext = {
      actorRef: input.actorRef,
      purpose: request.purpose,
      rootIdempotencyKey: request.idempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt: now
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(
        client,
        {
          idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
          rootKey,
          requestFingerprint: hash({
            taskRef: input.taskRef,
            operation: input.operation,
            ...request
          }),
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "task-working-set-idempotency"
          )
        }
      );
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return TaskWorkingSetResultSchema.parse({
          ...reservation.result,
          replayed: true
        });
      }
      const task = await this.work.lockPreparationTask(
        client,
        input.tenantRef,
        input.taskRef,
        input.actorRef
      );
      if (!task) throw new NotFoundError("备课 Task 不存在。");
      if (
        task.status === "completed" ||
        task.status === "cancelled"
      ) {
        throw new DomainConflictError(
          "LESSON_PREPARATION_TASK_CLOSED",
          "已关闭 Task 必须先显式 reopen，才能修改上下文。"
        );
      }
      if (
        task.workingSet.version !==
        request.expectedWorkingSetVersion
      ) {
        throw new DomainConflictError(
          "TASK_WORKING_SET_VERSION_CONFLICT",
          "TaskWorkingSet 版本已变化。",
          {
            expectedVersion:
              request.expectedWorkingSetVersion,
            actualVersion: task.workingSet.version
          }
        );
      }
      const educationContext =
        await this.gate2Education.getTeacherCopilotContext(
          client,
          {
            tenantRef: input.tenantRef,
            courseRunRef: task.courseRunRef
          }
        );
      if (!educationContext) {
        throw new NotFoundError("课程 Evidence 上下文不存在。");
      }
      const availableEvidence = new Set([
        ...educationContext.observations.map(
          (item) => item.observationRef
        ),
        ...educationContext.claims.map((item) => item.claimRef)
      ]);
      if (!availableEvidence.has(request.resourceRef)) {
        throw new NotFoundError(
          "该 Evidence 不属于当前授权课程上下文。"
        );
      }
      const selected = new Set(task.workingSet.evidenceRefs);
      const alreadySelected = selected.has(request.resourceRef);
      if (
        (input.operation === "add" && alreadySelected) ||
        (input.operation === "remove" && !alreadySelected)
      ) {
        throw new DomainConflictError(
          "TASK_RESOURCE_SELECTION_NO_CHANGE",
          "该资源选择不会产生变化。",
          { resourceRef: request.resourceRef, operation: input.operation }
        );
      }
      if (input.operation === "add") {
        selected.add(request.resourceRef);
      } else {
        selected.delete(request.resourceRef);
      }
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: request.purpose,
        action: request.purpose,
        resourceRef: request.resourceRef,
        requestedFieldMask: ["taskWorkingSet.evidenceRefs"],
        effect: "allow",
        reasonCodes: [
          "synthetic-teacher-role",
          "optional-evidence-selection"
        ],
        policyVersion: "policy:lesson-preparation-context@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "task-working-set-authorization"
          )
        })
      ];
      const changed = await this.work.replaceWorkingSet(client, {
        taskRef: task.taskRef,
        expectedVersion: task.workingSet.version,
        evidenceRefs: [...selected],
        revisionRef: `working-set-revision:${randomUUID()}`,
        metadata: createWriteMetadata(
          writeContext,
          "work",
          "task-working-set-revision"
        )
      });
      receipts.push(changed.receipt);
      const result = TaskWorkingSetResultSchema.parse({
        replayed: false,
        workingSet: changed.workingSet
      });
      await this.governance.completeIdempotency(client, {
        rootKey,
        result,
        completedAt: now
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getHistory(input: {
    tenantRef: string;
    actorRef: string;
    taskRef: string;
  }) {
    await this.getTask(input);
    return LessonPreparationHistoryEntrySchema.array().parse(
      await this.work.listHistory(this.pool, input.taskRef)
    );
  }

  async getWorkingSet(input: {
    tenantRef: string;
    actorRef: string;
    taskRef: string;
  }) {
    return TaskWorkingSetSchema.parse(
      (await this.getTask(input)).workingSet
    );
  }

  async getLatestAuthorizedContextPlan(input: {
    tenantRef: string;
    actorRef: string;
    taskRef: string;
  }) {
    await this.getTask(input);
    const plan = await this.runtime.getLatestAuthorizedContextPlan(
      this.pool,
      input.taskRef
    );
    if (!plan) {
      throw new NotFoundError(
        "该 Task 尚无已解析的 AuthorizedContextPlan。"
      );
    }
    return AuthorizedContextPlanSchema.parse(plan);
  }

  async getLatestContextManifest(input: {
    tenantRef: string;
    actorRef: string;
    taskRef: string;
  }) {
    await this.getTask(input);
    const manifest = await this.runtime.getLatestContextManifest(
      this.pool,
      input.taskRef
    );
    if (!manifest) {
      throw new NotFoundError(
        "该 Task 尚无 sealed ContextManifest。"
      );
    }
    return SealedContextManifestSchema.parse(manifest);
  }

  async getLessonTeachingPlans(input: {
    tenantRef: string;
    actorRef: string;
    lessonRef: string;
  }) {
    await this.getLesson(input);
    const scoped =
      await this.artifacts.listLessonTeachingPlanRevisions(
        this.pool,
        input.lessonRef
      );
    return LessonTeachingPlanStateSchema.parse({
      lessonRef: input.lessonRef,
      preparationTaskRef:
        scoped.find((item) => item.preparationTaskRef)
          ?.preparationTaskRef ?? null,
      currentApproved:
        scoped.find(
          (item) =>
            item.lifecycleStatus === "current_approved"
        )?.revision ?? null,
      activeInReview:
        scoped.find(
          (item) =>
            item.lifecycleStatus === "active_in_review"
        )?.revision ?? null,
      drafts: scoped
        .filter((item) => item.lifecycleStatus === "draft")
        .map((item) => item.revision),
      superseded: scoped
        .filter(
          (item) => item.lifecycleStatus === "superseded"
        )
        .map((item) => item.revision),
      history: scoped.map((item) => item.revision)
    });
  }

  private async toTaskDetail(
    tenantRef: string,
    task: StoredLessonPreparationTask,
    executor: SqlExecutor = this.pool
  ): Promise<LessonPreparationTaskDetail> {
    const [lesson, history] = await Promise.all([
      this.education.getLesson(
        executor,
        tenantRef,
        task.lessonRef
      ),
      this.work.listHistory(executor, task.taskRef)
    ]);
    return LessonPreparationTaskDetailSchema.parse({
      ...this.toTaskSummary(
        task,
        lesson?.title ?? "未知课时"
      ),
      workingSet: task.workingSet,
      history,
      latestProposalRevisionRef:
        task.latestProposalRevisionRef,
      latestTaskRunRef: task.latestTaskRunRef
    });
  }

  private toTaskSummary(
    task: StoredLessonPreparationTask,
    lessonTitle: string
  ) {
    return {
      taskRef: task.taskRef,
      taskType: "lesson_preparation" as const,
      title: task.title,
      status: task.status,
      version: task.version,
      courseRunRef: task.courseRunRef,
      curriculumUnitRef: task.curriculumUnitRef,
      lessonRef: task.lessonRef,
      lessonTitle,
      dueAt: task.dueAt,
      priority: task.priority,
      approvedPlanRef: task.approvedPlanRef,
      createdBy: task.createdBy,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    };
  }

  private assertDemoActor(
    tenantRef: string,
    actorRef: string
  ): void {
    if (!tenantRef.trim() || !actorRef.trim()) {
      throw new AuthorizationDeniedError(
        "本地演示身份无权访问该备课上下文。"
      );
    }
  }
}

export const lessonPreparationPurposes = {
  create: "lesson-preparation.create",
  start: "lesson-preparation.start",
  reopen: "lesson-preparation.reopen",
  complete: "lesson-preparation.complete",
  cancel: "lesson-preparation.cancel"
} as const;

import { createHash, randomUUID } from "node:crypto";

import {
  AdjustmentTaskResultSchema,
  AssignmentActionRequestSchema,
  AssignmentAnalyticsSchema,
  AssignmentDetailSchema,
  AssignmentListSchema,
  AssignmentResultSchema,
  ConfirmGradeRequestSchema,
  CourseRunEnrollmentListSchema,
  CreateAdjustmentTaskRequestSchema,
  CreateAssignmentRequestSchema,
  EvidenceObservationSourceListSchema,
  GradeDecisionHistorySchema,
  GradeDecisionResultSchema,
  GradingQueueSchema,
  LearnerRecentEvidenceSchema,
  ReopenGradeRequestSchema,
  SaveGradeDraftRequestSchema,
  SubmissionDetailSchema,
  SubmissionListSchema,
  SyntheticSubmissionImportRequestSchema,
  SyntheticSubmissionImportResultSchema,
  TeacherAssignmentOverviewSchema,
  UpdateAssignmentDraftRequestSchema,
  type AssignmentAnalytics,
  type AssignmentDetail,
  type AssignmentItemInput,
  type AssignmentSummary,
  type AuthorizationDecision,
  type EvidenceObservationSource,
  type FormalWriteReceipt,
  type SubmissionSummary,
  type TeacherGradeDecisionView
} from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/test-fixtures";
import type { Pool } from "pg";

import { PostgresGate25EducationRepository } from "../modules/education-domain/infrastructure/postgres-gate2-5-education-repository.js";
import {
  PostgresGate27EducationRepository,
  type AssignmentVersionWrite
} from "../modules/education-domain/infrastructure/postgres-gate2-7-education-repository.js";
import { PostgresGovernanceRepository } from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import { PostgresGate25WorkRepository } from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-5-work-repository.js";
import { PostgresGate27WorkRepository } from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-7-work-repository.js";
import { PostgresGate2WorkRepository } from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-work-repository.js";
import {
  AuthorizationDeniedError,
  DomainConflictError,
  NotFoundError
} from "../platform/errors.js";
import type { PostgresClient } from "../platform/postgres/types.js";
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

type CommandContext = {
  client: PostgresClient;
  writeContext: WriteContext;
  receipts: FormalWriteReceipt[];
};

export class PostgresAssignmentLearningService {
  constructor(
    private readonly pool: Pool,
    private readonly governance = new PostgresGovernanceRepository(),
    private readonly education = new PostgresGate27EducationRepository(),
    private readonly lessonEducation = new PostgresGate25EducationRepository(),
    private readonly work = new PostgresGate27WorkRepository(),
    private readonly lessonWork = new PostgresGate25WorkRepository(),
    private readonly gate2Work = new PostgresGate2WorkRepository()
  ) {}

  async listAssignments(input: {
    tenantRef: string;
    actorRef: string;
    lessonRef?: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    return AssignmentListSchema.parse({
      items: await this.education.listAssignments(
        this.pool,
        input.tenantRef,
        input.lessonRef
      )
    });
  }

  async getAssignment(input: {
    tenantRef: string;
    actorRef: string;
    assignmentRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const assignment = await this.education.getAssignment(
      this.pool,
      input.tenantRef,
      input.assignmentRef
    );
    if (!assignment) throw new NotFoundError("作业不存在。");
    return AssignmentDetailSchema.parse(assignment);
  }

  async listEnrollments(input: {
    tenantRef: string;
    actorRef: string;
    courseRunRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    return CourseRunEnrollmentListSchema.parse({
      items: await this.education.listEnrollments(
        this.pool,
        input.tenantRef,
        input.courseRunRef
      )
    });
  }

  async createAssignment(input: {
    tenantRef: string;
    actorRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = CreateAssignmentRequestSchema.parse(input.request);
    this.validateItems(request.items);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash(request),
      action: "assignment.create",
      resourceRef: request.lessonRef,
      requestedFieldMask: [
        "assignment.content",
        "assignment.objectives",
        "assignment.lifecycle"
      ],
      operation: async ({ client, writeContext, receipts }) => {
        const lesson = await this.lessonEducation.getLessonContext(
          client,
          input.tenantRef,
          request.lessonRef
        );
        if (!lesson) throw new NotFoundError("课时不存在。");
        if (
          lesson.lesson.courseRunRef !== request.courseRunRef ||
          lesson.lesson.unitRef !== request.curriculumUnitRef
        ) {
          throw new DomainConflictError(
            "ASSIGNMENT_LESSON_SCOPE_CONFLICT",
            "作业的课程、单元和课时不属于同一范围。"
          );
        }
        this.assertItemObjectives(
          request.items,
          lesson.lesson.learningObjectives.map(
            (objective) => objective.objectiveRef
          )
        );
        const assignmentRef = `assignment:${randomUUID()}`;
        const version = this.buildVersion({
          assignmentRef,
          versionNumber: 1,
          title: request.title,
          instructions: request.instructions,
          dueAt: request.dueAt,
          items: request.items,
          createdBy: input.actorRef
        });
        receipts.push(
          ...(await this.education.insertAssignment(client, {
            assignmentRef,
            tenantRef: input.tenantRef,
            courseRunRef: request.courseRunRef,
            curriculumUnitRef: request.curriculumUnitRef,
            lessonRef: request.lessonRef,
            createdBy: input.actorRef,
            version,
            assignmentMetadata: createWriteMetadata(
              writeContext,
              "education",
              "assignment-create"
            ),
            versionMetadata: createWriteMetadata(
              writeContext,
              "education",
              "assignment-version-1"
            ),
            itemMetadata: (index) =>
              createWriteMetadata(
                writeContext,
                "education",
                `assignment-item-${index + 1}`
              ),
            objectiveMetadata: (objectiveRef) =>
              createWriteMetadata(
                writeContext,
                "education",
                `assignment-objective-${hash(objectiveRef).slice(0, 8)}`
              )
          }))
        );
        receipts.push(
          await this.education.insertOutbox(client, {
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "AssignmentDraftCreated",
            aggregateRef: assignmentRef,
            payload: {
              assignmentRef,
              lessonRef: request.lessonRef,
              versionNumber: 1
            },
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "assignment-created-outbox"
            )
          })
        );
        const assignment = await this.education.getAssignment(
          client,
          input.tenantRef,
          assignmentRef
        );
        if (!assignment) throw new Error("Created Assignment cannot be read.");
        return { replayed: false, assignment };
      }
    });
    return AssignmentResultSchema.parse(result);
  }

  async updateDraft(input: {
    tenantRef: string;
    actorRef: string;
    assignmentRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = UpdateAssignmentDraftRequestSchema.parse(input.request);
    this.validateItems(request.items);
    try {
      const result = await this.executeCommand({
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        purpose: request.purpose,
        idempotencyKey: request.idempotencyKey,
        requestFingerprint: hash({ assignmentRef: input.assignmentRef, ...request }),
        action: "assignment.update-draft",
        resourceRef: input.assignmentRef,
        requestedFieldMask: ["assignment.content", "assignment.objectives"],
        operation: async ({ client, writeContext, receipts }) => {
          await this.lock(client, input.assignmentRef);
          const current = await this.requiredAssignment(
            client,
            input.tenantRef,
            input.assignmentRef
          );
          if (current.status !== "draft") {
            throw new DomainConflictError(
              "PUBLISHED_ASSIGNMENT_IMMUTABLE",
              "已发布作业内容不可原地修改；请创建明确的新修订。"
            );
          }
          if (current.version !== request.expectedVersion) {
            throw this.versionConflict(current, request.expectedVersion);
          }
          const lesson = await this.lessonEducation.getLessonContext(
            client,
            input.tenantRef,
            current.lessonRef
          );
          if (!lesson) throw new NotFoundError("课时不存在。");
          this.assertItemObjectives(
            request.items,
            lesson.lesson.learningObjectives.map(
              (objective) => objective.objectiveRef
            )
          );
          const nextVersionNumber = current.currentVersionNumber + 1;
          const version = this.buildVersion({
            assignmentRef: current.assignmentRef,
            versionNumber: nextVersionNumber,
            title: request.title,
            instructions: request.instructions,
            dueAt: request.dueAt,
            items: request.items,
            createdBy: input.actorRef
          });
          receipts.push(
            ...(await this.education.insertAssignmentVersion(client, {
              version,
              versionMetadata: createWriteMetadata(
                writeContext,
                "education",
                `assignment-version-${nextVersionNumber}`
              ),
              itemMetadata: (index) =>
                createWriteMetadata(
                  writeContext,
                  "education",
                  `assignment-v${nextVersionNumber}-item-${index + 1}`
                ),
              objectiveMetadata: (objectiveRef) =>
                createWriteMetadata(
                  writeContext,
                  "education",
                  `assignment-v${nextVersionNumber}-objective-${hash(
                    objectiveRef
                  ).slice(0, 8)}`
                )
            }))
          );
          receipts.push(
            await this.education.updateDraftPointer(client, {
              tenantRef: input.tenantRef,
              assignmentRef: input.assignmentRef,
              expectedVersion: request.expectedVersion,
              nextVersionNumber,
              updatedAt: writeContext.createdAt,
              metadata: createWriteMetadata(
                writeContext,
                "education",
                "assignment-draft-pointer"
              )
            })
          );
          const assignment = await this.requiredAssignment(
            client,
            input.tenantRef,
            input.assignmentRef
          );
          return { replayed: false, assignment };
        }
      });
      return AssignmentResultSchema.parse(result);
    } catch (error) {
      this.translateRepositoryConflict(error);
    }
  }

  async transitionAssignment(input: {
    tenantRef: string;
    actorRef: string;
    assignmentRef: string;
    action: "publish" | "close" | "archive";
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = AssignmentActionRequestSchema.parse(input.request);
    const configuration = {
      publish: {
        purpose: "assignment.publish",
        from: "draft" as const,
        to: "published" as const,
        event: "AssignmentPublished"
      },
      close: {
        purpose: "assignment.close",
        from: "published" as const,
        to: "closed" as const,
        event: "AssignmentClosed"
      },
      archive: {
        purpose: "assignment.archive",
        from: "closed" as const,
        to: "archived" as const,
        event: "AssignmentArchived"
      }
    }[input.action];
    if (request.purpose !== configuration.purpose) {
      throw new AuthorizationDeniedError("命令用途与作业状态转换不匹配。");
    }
    try {
      const result = await this.executeCommand({
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        purpose: request.purpose,
        idempotencyKey: request.idempotencyKey,
        requestFingerprint: hash({ assignmentRef: input.assignmentRef, action: input.action, ...request }),
        action: request.purpose,
        resourceRef: input.assignmentRef,
        requestedFieldMask: ["assignment.lifecycle"],
        operation: async ({ client, writeContext, receipts }) => {
          await this.lock(client, input.assignmentRef);
          const current = await this.requiredAssignment(
            client,
            input.tenantRef,
            input.assignmentRef
          );
          if (
            current.version !== request.expectedVersion ||
            current.status !== configuration.from
          ) {
            throw new DomainConflictError(
              "ASSIGNMENT_VERSION_OR_STATE_CONFLICT",
              "作业版本或生命周期已变化。",
              {
                expectedVersion: request.expectedVersion,
                actualVersion: current.version,
                expectedStatus: configuration.from,
                actualStatus: current.status
              }
            );
          }
          receipts.push(
            await this.education.transitionAssignment(client, {
              tenantRef: input.tenantRef,
              assignmentRef: input.assignmentRef,
              expectedVersion: request.expectedVersion,
              fromStatus: configuration.from,
              toStatus: configuration.to,
              occurredAt: writeContext.createdAt,
              metadata: createWriteMetadata(
                writeContext,
                "education",
                `assignment-${input.action}`
              )
            })
          );
          if (input.action === "publish") {
            receipts.push(
              ...(await this.work.insertGradingTask(client, {
                taskRef: `task:assignment-grading:${randomUUID()}`,
                tenantRef: input.tenantRef,
                assignmentRef: current.assignmentRef,
                assignmentVersionRef:
                  current.currentVersion.assignmentVersionRef,
                title: `批改作业：${current.title}`,
                createdBy: input.actorRef,
                taskMetadata: createWriteMetadata(
                  writeContext,
                  "work",
                  "assignment-grading-task"
                ),
                detailsMetadata: createWriteMetadata(
                  writeContext,
                  "work",
                  "assignment-grading-details"
                ),
                outboxMetadata: createWriteMetadata(
                  writeContext,
                  "work",
                  "assignment-published-work-outbox"
                ),
                outboxRef: `outbox:${randomUUID()}`
              }))
            );
          } else {
            receipts.push(
              await this.education.insertOutbox(client, {
                outboxRef: `outbox:${randomUUID()}`,
                eventName: configuration.event,
                aggregateRef: current.assignmentRef,
                payload: {
                  assignmentRef: current.assignmentRef,
                  fromStatus: current.status,
                  toStatus: configuration.to
                },
                metadata: createWriteMetadata(
                  writeContext,
                  "education",
                  `assignment-${input.action}-outbox`
                )
              })
            );
          }
          const assignment = await this.requiredAssignment(
            client,
            input.tenantRef,
            input.assignmentRef
          );
          return { replayed: false, assignment };
        }
      });
      return AssignmentResultSchema.parse(result);
    } catch (error) {
      this.translateRepositoryConflict(error);
    }
  }

  async importSyntheticSubmissions(input: {
    tenantRef: string;
    actorRef: string;
    assignmentRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = SyntheticSubmissionImportRequestSchema.parse(input.request);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ assignmentRef: input.assignmentRef, ...request }),
      action: request.purpose,
      resourceRef: input.assignmentRef,
      requestedFieldMask: ["submission.synthetic", "assignment.grading"],
      operation: async ({ client, writeContext, receipts }) => {
        await this.lock(client, input.assignmentRef);
        const assignment = await this.requiredAssignment(
          client,
          input.tenantRef,
          input.assignmentRef
        );
        if (assignment.status !== "published") {
          throw new DomainConflictError(
            "ASSIGNMENT_NOT_OPEN_FOR_SUBMISSION",
            "只有已发布作业可以载入合成提交。"
          );
        }
        const existing = await this.education.listSubmissions(
          client,
          input.tenantRef,
          input.assignmentRef
        );
        if (existing.some((submission) => submission.attemptCount > 0)) {
          throw new DomainConflictError(
            "SYNTHETIC_SUBMISSIONS_ALREADY_IMPORTED",
            "该作业已经存在提交，不能重复载入演示提交。"
          );
        }
        const enrollments = await this.education.listEnrollments(
          client,
          input.tenantRef,
          assignment.courseRunRef
        );
        const submitted = enrollments.slice(0, Math.max(0, enrollments.length - 2));
        const primaryObjective = assignment.currentVersion.objectiveRefs[0];
        if (!primaryObjective) {
          throw new DomainConflictError(
            "ASSIGNMENT_HAS_NO_OBJECTIVE",
            "作业没有可追溯教学目标。"
          );
        }
        for (const [learnerIndex, enrollment] of submitted.entries()) {
          const submissionRef = `submission:${randomUUID()}`;
          const attemptRef = `attempt:${randomUUID()}`;
          const responses = assignment.currentVersion.items.map(
            (item, itemIndex) => ({
              responseRef: `item-response:${randomUUID()}`,
              itemRef: item.itemRef,
              responseValue: this.syntheticResponse(
                item,
                learnerIndex,
                itemIndex
              )
            })
          );
          receipts.push(
            ...(await this.education.insertSyntheticAttempt(client, {
              submissionRef,
              enrollmentRef: enrollment.enrollmentRef,
              learnerRef: enrollment.learnerRef,
              attemptRef,
              assignmentRef: assignment.assignmentRef,
              assignmentVersionRef:
                assignment.currentVersion.assignmentVersionRef,
              attemptNumber: 1,
              courseRunRef: assignment.courseRunRef,
              primaryObjectiveRef: primaryObjective,
              submittedAt: new Date(
                Date.parse(writeContext.createdAt) + learnerIndex * 60_000
              ).toISOString(),
              durationSeconds: 900 + learnerIndex * 37,
              responses,
              submissionMetadata: createWriteMetadata(
                writeContext,
                "education",
                `synthetic-submission-${learnerIndex + 1}`
              ),
              attemptMetadata: createWriteMetadata(
                writeContext,
                "education",
                `synthetic-attempt-${learnerIndex + 1}`
              ),
              detailMetadata: createWriteMetadata(
                writeContext,
                "education",
                `synthetic-attempt-detail-${learnerIndex + 1}`
              ),
              responseMetadata: (itemIndex) =>
                createWriteMetadata(
                  writeContext,
                  "education",
                  `synthetic-response-${learnerIndex + 1}-${itemIndex + 1}`
                )
            }))
          );
        }
        const progressReceipt = await this.work.syncGradingProgress(client, {
          tenantRef: input.tenantRef,
          assignmentRef: assignment.assignmentRef,
          pendingCount: submitted.length,
          confirmedCount: 0,
          updatedAt: writeContext.createdAt,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "assignment-grading-import-progress"
          )
        });
        if (progressReceipt) receipts.push(progressReceipt);
        receipts.push(
          await this.education.insertOutbox(client, {
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "SyntheticSubmissionsImported",
            aggregateRef: assignment.assignmentRef,
            payload: {
              assignmentRef: assignment.assignmentRef,
              submittedCount: submitted.length,
              notSubmittedCount: enrollments.length - submitted.length
            },
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "synthetic-submissions-outbox"
            )
          })
        );
        return {
          replayed: false,
          assignmentRef: assignment.assignmentRef,
          enrolledCount: enrollments.length,
          submittedCount: submitted.length,
          notSubmittedCount: enrollments.length - submitted.length
        };
      }
    });
    return SyntheticSubmissionImportResultSchema.parse(result);
  }

  async listSubmissions(input: {
    tenantRef: string;
    actorRef: string;
    assignmentRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    await this.requiredAssignment(this.pool, input.tenantRef, input.assignmentRef);
    return SubmissionListSchema.parse({
      items: await this.education.listSubmissions(
        this.pool,
        input.tenantRef,
        input.assignmentRef
      )
    });
  }

  async getSubmission(input: {
    tenantRef: string;
    actorRef: string;
    submissionRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const submission = await this.education.getSubmission(
      this.pool,
      input.tenantRef,
      input.submissionRef
    );
    if (!submission) throw new NotFoundError("提交不存在。");
    return SubmissionDetailSchema.parse(submission);
  }

  async getGradingQueue(input: {
    tenantRef: string;
    actorRef: string;
    assignmentRef: string;
  }) {
    const submissions = (
      await this.listSubmissions(input)
    ).items;
    const submitted = submissions.filter(
      (item) => item.submissionState !== "not_submitted"
    );
    return GradingQueueSchema.parse({
      items: submitted,
      pendingCount: submitted.filter(
        (item) => item.gradeStatus !== "confirmed"
      ).length,
      confirmedCount: submitted.filter(
        (item) => item.gradeStatus === "confirmed"
      ).length
    });
  }

  async saveGradeDraft(input: {
    tenantRef: string;
    actorRef: string;
    submissionRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = SaveGradeDraftRequestSchema.parse(input.request);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ submissionRef: input.submissionRef, ...request }),
      action: request.purpose,
      resourceRef: input.submissionRef,
      requestedFieldMask: ["grade.items", "grade.feedback", "grade.status"],
      operation: async ({ client, writeContext, receipts }) => {
        await this.lock(client, input.submissionRef);
        const submission = await this.requiredSubmission(
          client,
          input.tenantRef,
          input.submissionRef
        );
        if (submission.latestAttemptRef !== request.expectedAttemptRef) {
          throw new DomainConflictError(
            "SUBMISSION_ATTEMPT_VERSION_CONFLICT",
            "提交已产生新的 Attempt，请刷新后再批改。"
          );
        }
        const active = await this.education.getActiveDecisionForAttempt(
          client,
          request.expectedAttemptRef
        );
        if (active?.status === "confirmed") {
          throw new DomainConflictError(
            "CONFIRMED_GRADE_REOPEN_REQUIRED",
            "已确认批改必须先显式重新打开。"
          );
        }
        const actualVersion = active?.version ?? 0;
        if (actualVersion !== request.expectedDecisionVersion) {
          throw new DomainConflictError(
            "GRADE_DECISION_VERSION_CONFLICT",
            "批改草稿版本已变化。",
            {
              expectedVersion: request.expectedDecisionVersion,
              actualVersion
            }
          );
        }
        const assignment = await this.requiredAssignment(
          client,
          input.tenantRef,
          submission.assignmentRef
        );
        const latestAttempt = submission.attempts.find(
          (attempt) => attempt.attemptRef === request.expectedAttemptRef
        );
        if (!latestAttempt) throw new NotFoundError("SubmissionAttempt 不存在。");
        const itemByRef = new Map(
          assignment.currentVersion.items.map((item) => [item.itemRef, item])
        );
        const responseByRef = new Map(
          latestAttempt.itemResponses.map((response) => [response.responseRef, response])
        );
        if (
          request.itemGrades.length !== responseByRef.size ||
          new Set(request.itemGrades.map((grade) => grade.responseRef)).size !==
            responseByRef.size
        ) {
          throw new DomainConflictError(
            "INCOMPLETE_ITEM_GRADING",
            "必须逐题保存批改结果。"
          );
        }
        let totalScore = 0;
        for (const grade of request.itemGrades) {
          const response = responseByRef.get(grade.responseRef);
          const item = response ? itemByRef.get(response.itemRef) : undefined;
          if (!response || !item || grade.awardedScore > item.maxScore) {
            throw new DomainConflictError(
              "INVALID_ITEM_GRADE",
              "逐题得分与当前提交或题目上限不一致。"
            );
          }
          totalScore += grade.awardedScore;
        }
        const maxScore = assignment.currentVersion.items.reduce(
          (sum, item) => sum + item.maxScore,
          0
        );
        const gradeDecisionRef = `grade-decision:${randomUUID()}`;
        receipts.push(
          ...(await this.education.insertGradeDraft(client, {
            gradeDecisionRef,
            attemptRef: request.expectedAttemptRef,
            version: actualVersion + 1,
            totalScore,
            maxScore,
            feedback: request.feedback,
            previousDecisionRef: active?.gradeDecisionRef ?? null,
            previousDecisionStatus:
              active?.status === "draft" ? "draft" : null,
            createdBy: input.actorRef,
            itemGrades: request.itemGrades.map((grade) => ({
              ...grade,
              itemGradeRef: `item-grade:${randomUUID()}`,
              suggestionSource: "teacher" as const
            })),
            decisionMetadata: createWriteMetadata(
              writeContext,
              "education",
              `grade-draft-v${actualVersion + 1}`
            ),
            itemMetadata: (index) =>
              createWriteMetadata(
                writeContext,
                "education",
                `grade-draft-v${actualVersion + 1}-item-${index + 1}`
              )
          }))
        );
        receipts.push(
          await this.education.insertOutbox(client, {
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "TeacherGradeDraftSaved",
            aggregateRef: gradeDecisionRef,
            payload: {
              assignmentRef: assignment.assignmentRef,
              submissionRef: submission.submissionRef,
              gradeDecisionRef,
              version: actualVersion + 1
            },
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "grade-draft-outbox"
            )
          })
        );
        const decision = await this.education.getGradeDecision(
          client,
          gradeDecisionRef
        );
        if (!decision) throw new Error("Saved GradeDecision cannot be read.");
        return { replayed: false, decision };
      }
    });
    return GradeDecisionResultSchema.parse(result);
  }

  async confirmGrade(input: {
    tenantRef: string;
    actorRef: string;
    gradeDecisionRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = ConfirmGradeRequestSchema.parse(input.request);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ gradeDecisionRef: input.gradeDecisionRef, ...request }),
      action: request.purpose,
      resourceRef: input.gradeDecisionRef,
      requestedFieldMask: ["grade.status", "evidence.observation"],
      operation: async ({ client, writeContext, receipts }) => {
        await this.lock(client, input.gradeDecisionRef);
        const decision = await this.education.getGradeDecision(
          client,
          input.gradeDecisionRef
        );
        if (!decision) throw new NotFoundError("批改决定不存在。");
        if (
          decision.status !== "draft" ||
          decision.version !== request.expectedDecisionVersion
        ) {
          throw new DomainConflictError(
            "GRADE_DECISION_VERSION_OR_STATE_CONFLICT",
            "批改决定版本或状态已变化。",
            {
              expectedVersion: request.expectedDecisionVersion,
              actualVersion: decision.version,
              actualStatus: decision.status
            }
          );
        }
        const submission = await this.education.getSubmissionByAttempt(
          client,
          input.tenantRef,
          decision.attemptRef
        );
        if (!submission) throw new NotFoundError("批改关联提交不存在。");
        const assignment = await this.requiredAssignment(
          client,
          input.tenantRef,
          submission.assignmentRef
        );
        receipts.push(
          await this.education.confirmGrade(client, {
            gradeDecisionRef: input.gradeDecisionRef,
            expectedVersion: request.expectedDecisionVersion,
            confirmedAt: writeContext.createdAt,
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "grade-decision-confirm"
            )
          })
        );
        const confirmed = await this.education.getGradeDecision(
          client,
          input.gradeDecisionRef
        );
        if (!confirmed || confirmed.status !== "confirmed") {
          throw new Error("Confirmed GradeDecision cannot be read.");
        }
        const attempt = submission.attempts.find(
          (item) => item.attemptRef === decision.attemptRef
        );
        if (!attempt) throw new NotFoundError("SubmissionAttempt 不存在。");
        const responseByRef = new Map(
          attempt.itemResponses.map((response) => [response.responseRef, response])
        );
        const itemByRef = new Map(
          assignment.currentVersion.items.map((item) => [item.itemRef, item])
        );
        const observations = [];
        for (const [index, grade] of confirmed.itemGrades.entries()) {
          const response = responseByRef.get(grade.responseRef);
          const item = response ? itemByRef.get(response.itemRef) : undefined;
          if (!response || !item) {
            throw new DomainConflictError(
              "GRADE_SOURCE_CHAIN_BROKEN",
              "批改结果无法追溯到当前题目与作答。"
            );
          }
          observations.push({
            observationRef: `evidence-observation:${randomUUID()}`,
            itemRef: item.itemRef,
            responseRef: response.responseRef,
            objectiveRef: item.objectiveRef,
            outcome: grade.outcome,
            awardedScore: grade.awardedScore,
            maxScore: item.maxScore,
            supersedesObservationRef:
              await this.education.findCurrentEvidenceForItemLearner(
                client,
                assignment.assignmentRef,
                item.itemRef,
                submission.learnerRef
              ),
            metadata: createWriteMetadata(
              writeContext,
              "education",
              `grade-evidence-${index + 1}`
            ),
            sourceMetadata: createWriteMetadata(
              writeContext,
              "education",
              `grade-evidence-source-${index + 1}`
            )
          });
        }
        receipts.push(
          ...(await this.education.insertEvidenceForDecision(client, {
            decision: confirmed,
            assignment,
            learnerRef: submission.learnerRef,
            observations
          }))
        );
        const submissions = await this.education.listSubmissions(
          client,
          input.tenantRef,
          assignment.assignmentRef
        );
        const submitted = submissions.filter(
          (item) => item.submissionState !== "not_submitted"
        );
        const confirmedCount = submitted.filter(
          (item) => item.gradeStatus === "confirmed"
        ).length;
        const progressReceipt = await this.work.syncGradingProgress(client, {
          tenantRef: input.tenantRef,
          assignmentRef: assignment.assignmentRef,
          pendingCount: submitted.length - confirmedCount,
          confirmedCount,
          updatedAt: writeContext.createdAt,
          metadata: createWriteMetadata(
            writeContext,
            "work",
            "assignment-grading-confirm-progress"
          )
        });
        if (progressReceipt) receipts.push(progressReceipt);
        receipts.push(
          await this.education.insertOutbox(client, {
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "TeacherGradeDecisionConfirmed",
            aggregateRef: confirmed.gradeDecisionRef,
            payload: {
              assignmentRef: assignment.assignmentRef,
              submissionRef: submission.submissionRef,
              gradeDecisionRef: confirmed.gradeDecisionRef,
              evidenceRefs: observations.map(
                (observation) => observation.observationRef
              )
            },
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "grade-confirmed-outbox"
            )
          })
        );
        return { replayed: false, decision: confirmed };
      }
    });
    return GradeDecisionResultSchema.parse(result);
  }

  async reopenGrade(input: {
    tenantRef: string;
    actorRef: string;
    gradeDecisionRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = ReopenGradeRequestSchema.parse(input.request);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ gradeDecisionRef: input.gradeDecisionRef, ...request }),
      action: request.purpose,
      resourceRef: input.gradeDecisionRef,
      requestedFieldMask: ["grade.status", "grade.revision"],
      operation: async ({ client, writeContext, receipts }) => {
        await this.lock(client, input.gradeDecisionRef);
        const previous = await this.education.getGradeDecision(
          client,
          input.gradeDecisionRef
        );
        if (!previous) throw new NotFoundError("批改决定不存在。");
        if (
          previous.status !== "confirmed" ||
          previous.version !== request.expectedDecisionVersion
        ) {
          throw new DomainConflictError(
            "GRADE_DECISION_VERSION_OR_STATE_CONFLICT",
            "只有当前已确认批改可以重新打开。"
          );
        }
        const existingDraft = await this.education.getActiveDecisionForAttempt(
          client,
          previous.attemptRef
        );
        if (existingDraft?.status === "draft") {
          throw new DomainConflictError(
            "GRADE_DRAFT_ALREADY_EXISTS",
            "该提交已有重新打开的批改草稿。"
          );
        }
        const nextRef = `grade-decision:${randomUUID()}`;
        receipts.push(
          ...(await this.education.insertGradeDraft(client, {
            gradeDecisionRef: nextRef,
            attemptRef: previous.attemptRef,
            version: previous.version + 1,
            totalScore: previous.totalScore,
            maxScore: previous.maxScore,
            feedback: previous.feedback,
            previousDecisionRef: previous.gradeDecisionRef,
            previousDecisionStatus: "confirmed",
            createdBy: input.actorRef,
            itemGrades: previous.itemGrades.map((grade) => ({
              responseRef: grade.responseRef,
              outcome: grade.outcome,
              awardedScore: grade.awardedScore,
              feedback: grade.feedback,
              itemGradeRef: `item-grade:${randomUUID()}`,
              suggestionSource: "teacher" as const
            })),
            decisionMetadata: createWriteMetadata(
              writeContext,
              "education",
              `grade-reopen-v${previous.version + 1}`
            ),
            itemMetadata: (index) =>
              createWriteMetadata(
                writeContext,
                "education",
                `grade-reopen-v${previous.version + 1}-item-${index + 1}`
              )
          }))
        );
        receipts.push(
          await this.education.insertOutbox(client, {
            outboxRef: `outbox:${randomUUID()}`,
            eventName: "TeacherGradeDecisionReopened",
            aggregateRef: nextRef,
            payload: {
              previousDecisionRef: previous.gradeDecisionRef,
              gradeDecisionRef: nextRef
            },
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "grade-reopened-outbox"
            )
          })
        );
        const decision = await this.education.getGradeDecision(client, nextRef);
        if (!decision) throw new Error("Reopened grade draft cannot be read.");
        return { replayed: false, decision };
      }
    });
    return GradeDecisionResultSchema.parse(result);
  }

  async getGradeHistory(input: {
    tenantRef: string;
    actorRef: string;
    submissionRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    await this.requiredSubmission(this.pool, input.tenantRef, input.submissionRef);
    return GradeDecisionHistorySchema.parse({
      items: await this.education.listGradeHistory(
        this.pool,
        input.submissionRef
      )
    });
  }

  async getAnalytics(input: {
    tenantRef: string;
    actorRef: string;
    assignmentRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const assignment = await this.requiredAssignment(
      this.pool,
      input.tenantRef,
      input.assignmentRef
    );
    const submissions = await this.education.listSubmissions(
      this.pool,
      input.tenantRef,
      input.assignmentRef
    );
    const evidence = (
      await this.education.listAssignmentEvidence(
        this.pool,
        input.tenantRef,
        input.assignmentRef
      )
    ).filter((item) => item.isCurrent);
    return AssignmentAnalyticsSchema.parse(
      this.buildAnalytics(assignment, submissions, evidence)
    );
  }

  async listAssignmentEvidence(input: {
    tenantRef: string;
    actorRef: string;
    assignmentRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    await this.requiredAssignment(this.pool, input.tenantRef, input.assignmentRef);
    return EvidenceObservationSourceListSchema.parse({
      items: await this.education.listAssignmentEvidence(
        this.pool,
        input.tenantRef,
        input.assignmentRef
      )
    });
  }

  async getLearnerEvidence(input: {
    tenantRef: string;
    actorRef: string;
    courseRunRef: string;
    learnerRef: string;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const enrollments = await this.education.listEnrollments(
      this.pool,
      input.tenantRef,
      input.courseRunRef
    );
    const enrollment = enrollments.find(
      (item) => item.learnerRef === input.learnerRef
    );
    if (!enrollment) throw new NotFoundError("当前课程中不存在该匿名 learner。");
    const assignments = await this.education.listAssignments(
      this.pool,
      input.tenantRef
    );
    const recentAssignments: SubmissionSummary[] = [];
    for (const assignment of assignments.filter(
      (item) => item.courseRunRef === input.courseRunRef
    )) {
      const submission = (
        await this.education.listSubmissions(
          this.pool,
          input.tenantRef,
          assignment.assignmentRef
        )
      ).find((item) => item.learnerRef === input.learnerRef);
      if (submission) recentAssignments.push(submission);
    }
    const evidence = await this.education.listLearnerEvidence(
      this.pool,
      input.tenantRef,
      input.courseRunRef,
      input.learnerRef
    );
    const needsTeacherReview: string[] = [];
    if (recentAssignments.some((item) => item.submissionState === "not_submitted")) {
      needsTeacherReview.push("本次作业尚未提交");
    }
    if (
      evidence.filter(
        (item) => item.isCurrent && item.outcome === "incorrect"
      ).length >= 2
    ) {
      needsTeacherReview.push("最近作业中出现重复错误，当前需要教师复核");
    }
    return LearnerRecentEvidenceSchema.parse({
      enrollment,
      recentAssignments,
      evidence,
      needsTeacherReview
    });
  }

  async getOverview(input: { tenantRef: string; actorRef: string }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const assignments = await this.education.listAssignments(
      this.pool,
      input.tenantRef
    );
    let pendingGradingCount = 0;
    let notSubmittedCount = 0;
    const recentlyConfirmed: SubmissionSummary[] = [];
    const adjustmentCandidates = [];
    for (const assignment of assignments) {
      if (!['published', 'closed'].includes(assignment.status)) {
        continue;
      }
      const submissions = await this.education.listSubmissions(
        this.pool,
        input.tenantRef,
        assignment.assignmentRef
      );
      pendingGradingCount += submissions.filter(
        (item) =>
          item.submissionState !== "not_submitted" &&
          item.gradeStatus !== "confirmed"
      ).length;
      notSubmittedCount += submissions.filter(
        (item) => item.submissionState === "not_submitted"
      ).length;
      recentlyConfirmed.push(
        ...submissions.filter((item) => item.gradeStatus === "confirmed")
      );
      if (assignment.confirmedGradeCount > 0) {
        adjustmentCandidates.push(
          ...(await this.getAnalytics({
            ...input,
            assignmentRef: assignment.assignmentRef
          })).commonErrors
        );
      }
    }
    return TeacherAssignmentOverviewSchema.parse({
      draftCount: assignments.filter((item) => item.status === "draft").length,
      publishedCount: assignments.filter((item) => item.status === "published").length,
      pendingGradingCount,
      notSubmittedCount,
      recentlyConfirmed: recentlyConfirmed.slice(0, 5),
      adjustmentCandidates: adjustmentCandidates.slice(0, 5),
      generatedAt: new Date().toISOString()
    });
  }

  async createAdjustmentTask(input: {
    tenantRef: string;
    actorRef: string;
    request: unknown;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = CreateAdjustmentTaskRequestSchema.parse(input.request);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash(request),
      action: request.purpose,
      resourceRef: request.targetLessonRef,
      requestedFieldMask: [
        "courseRun",
        "curriculumUnit",
        "lesson",
        "sourceAssignment",
        "sourceAssignmentItems",
        "learningObjectives",
        "selectedEvidence",
        "baselineTeachingPlan"
      ],
      operation: async ({ client, writeContext, receipts }) => {
        await this.lock(client, request.targetLessonRef);
        const assignment = await this.requiredAssignment(
          client,
          input.tenantRef,
          request.assignmentRef
        );
        if (assignment.lessonRef !== request.sourceLessonRef) {
          throw new DomainConflictError(
            "ADJUSTMENT_SOURCE_LESSON_CONFLICT",
            "作业与来源课时不一致。"
          );
        }
        const selected = await this.education.validateSelectedEvidence(
          client,
          input.tenantRef,
          request.assignmentRef,
          request.selectedEvidenceRefs,
          request.selectedItemRefs
        );
        if (
          selected.length !== new Set(request.selectedEvidenceRefs).size ||
          new Set(selected.map((item) => item.itemRef)).size !==
            new Set(request.selectedItemRefs).size
        ) {
          throw new DomainConflictError(
            "EVIDENCE_SELECTION_NOT_AUTHORIZED",
            "所选 Evidence 不是该作业当前、教师已确认且可授权的证据。"
          );
        }
        const target = await this.lessonEducation.getLessonContext(
          client,
          input.tenantRef,
          request.targetLessonRef
        );
        if (!target) throw new NotFoundError("下一课不存在。");
        if (target.lesson.courseRunRef !== assignment.courseRunRef) {
          throw new DomainConflictError(
            "ADJUSTMENT_TARGET_COURSE_CONFLICT",
            "下一课不属于当前 CourseRun。"
          );
        }
        if (target.lesson.learningObjectives.length === 0) {
          throw new DomainConflictError(
            "LESSON_HAS_NO_LEARNING_OBJECTIVE",
            "下一课尚未关联教学目标。"
          );
        }
        const source = await this.lessonEducation.getLessonContext(
          client,
          input.tenantRef,
          request.sourceLessonRef
        );
        if (!source) throw new NotFoundError("来源课时不存在。");
        const existing = await this.lessonWork.findOpenTaskForLesson(
          client,
          input.tenantRef,
          request.targetLessonRef
        );
        if (existing) {
          throw new DomainConflictError(
            "OPEN_LESSON_PREPARATION_TASK_EXISTS",
            "下一课已有未关闭的备课 Task。",
            { taskRef: existing.taskRef, status: existing.status }
          );
        }
        const goal = await this.gate2Work.getDemoCaseAndGoal(
          client,
          input.tenantRef,
          gate2DemoRefs.goalRef
        );
        if (!goal) throw new NotFoundError("备课 Goal 不存在。");
        const taskRef = `task:${randomUUID()}`;
        const workingSet = {
          courseRunRef: target.lesson.courseRunRef,
          curriculumUnitRef: target.lesson.unitRef,
          lessonRef: target.lesson.lessonRef,
          learningObjectiveRefs: target.lesson.learningObjectives.map(
            (objective) => objective.objectiveRef
          ),
          evidenceRefs: [...new Set(request.selectedEvidenceRefs)],
          baselineTeachingPlanRef:
            target.lesson.currentApprovedPlanRef ??
            source.lesson.currentApprovedPlanRef,
          sourceLessonRef: request.sourceLessonRef,
          sourceAssignmentRef: request.assignmentRef,
          sourceAssignmentItemRefs: [...new Set(request.selectedItemRefs)],
          purpose: "teacher-copilot.adjust-next-lesson",
          requestedFieldMask: [
            "lesson.title",
            "lesson.learningObjectives",
            "assignment.sourceItems",
            "evidence.summary",
            "teachingPlan.content"
          ]
        };
        receipts.push(
          ...(await this.lessonWork.insertLessonPreparationTask(client, {
            taskRef,
            tenantRef: input.tenantRef,
            title: `根据作业 Evidence 调整：${target.lesson.title}`,
            caseRef: goal.caseRef,
            goalRef: goal.goalRef,
            courseRunRef: target.lesson.courseRunRef,
            curriculumUnitRef: target.lesson.unitRef,
            lessonRef: target.lesson.lessonRef,
            dueAt: request.dueAt,
            priority: request.priority,
            createdBy: input.actorRef,
            workingSet,
            metadata: {
              task: createWriteMetadata(
                writeContext,
                "work",
                "adjustment-preparation-task"
              ),
              details: createWriteMetadata(
                writeContext,
                "work",
                "adjustment-preparation-details"
              ),
              workingSetRevision: createWriteMetadata(
                writeContext,
                "work",
                "adjustment-working-set-v1"
              ),
              history: createWriteMetadata(
                writeContext,
                "work",
                "adjustment-preparation-history-v1"
              ),
              outbox: createWriteMetadata(
                writeContext,
                "work",
                "adjustment-preparation-outbox"
              )
            },
            outboxRef: `outbox:${randomUUID()}`,
            historyRef: `preparation-history:${randomUUID()}`
          }))
        );
        receipts.push(
          await this.lessonEducation.updatePreparationProjection(client, {
            lessonRef: target.lesson.lessonRef,
            state: "planned",
            activePreparationTaskRef: taskRef,
            metadata: createWriteMetadata(
              writeContext,
              "education",
              "adjustment-lesson-projection"
            )
          })
        );
        const task = {
          taskRef,
          taskType: "lesson_preparation" as const,
          title: `根据作业 Evidence 调整：${target.lesson.title}`,
          status: "planned" as const,
          version: 1,
          courseRunRef: target.lesson.courseRunRef,
          curriculumUnitRef: target.lesson.unitRef,
          lessonRef: target.lesson.lessonRef,
          lessonTitle: target.lesson.title,
          dueAt: request.dueAt,
          priority: request.priority,
          approvedPlanRef: null,
          createdBy: input.actorRef,
          createdAt: writeContext.createdAt,
          updatedAt: writeContext.createdAt,
          workingSet: {
            taskRef,
            version: 1,
            ...workingSet,
            updatedAt: writeContext.createdAt
          },
          history: [
            {
              historyRef: `preparation-history:${taskRef}:created`,
              taskRef,
              fromStatus: null,
              toStatus: "planned" as const,
              taskVersion: 1,
              reason: "根据教师选择的作业 Evidence 创建调整下一课任务",
              actorRef: input.actorRef,
              occurredAt: writeContext.createdAt
            }
          ],
          latestProposalRevisionRef: null,
          latestTaskRunRef: null
        };
        return { replayed: false, task };
      }
    });
    return AdjustmentTaskResultSchema.parse(result);
  }

  private async executeCommand<T extends Record<string, unknown>>(input: {
    tenantRef: string;
    actorRef: string;
    purpose: string;
    idempotencyKey: string;
    requestFingerprint: string;
    action: string;
    resourceRef: string;
    requestedFieldMask: string[];
    operation: (context: CommandContext) => Promise<T>;
  }): Promise<T | Record<string, unknown>> {
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      input.purpose,
      input.idempotencyKey
    ].join("|");
    const decisionRef = stableDecisionRef(rootKey);
    const now = new Date().toISOString();
    const writeContext: WriteContext = {
      actorRef: input.actorRef,
      purpose: input.purpose,
      rootIdempotencyKey: input.idempotencyKey,
      authorizationDecisionRef: decisionRef,
      createdAt: now
    };
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.governance.reserveIdempotency(client, {
        idempotencyRef: `idempotency:${hash(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: input.requestFingerprint,
        metadata: createWriteMetadata(
          writeContext,
          "governance",
          "gate2-7-command-idempotency"
        )
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return { ...reservation.result, replayed: true };
      }
      const decision: AuthorizationDecision = {
        decisionRef,
        actorRef: input.actorRef,
        tenantRef: input.tenantRef,
        purpose: input.purpose,
        action: input.action,
        resourceRef: input.resourceRef,
        requestedFieldMask: input.requestedFieldMask,
        effect: "allow",
        reasonCodes: [
          "synthetic-teacher-role",
          "tenant-and-course-scope-validated"
        ],
        policyVersion: "policy:gate2-7-teacher-local@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(
            writeContext,
            "governance",
            "gate2-7-command-authorization"
          )
        })
      ];
      const result = await input.operation({
        client,
        writeContext,
        receipts
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

  private buildVersion(input: {
    assignmentRef: string;
    versionNumber: number;
    title: string;
    instructions: string;
    dueAt: string | null;
    items: AssignmentItemInput[];
    createdBy: string;
  }): AssignmentVersionWrite {
    return {
      assignmentVersionRef: `assignment-version:${randomUUID()}`,
      assignmentRef: input.assignmentRef,
      versionNumber: input.versionNumber,
      title: input.title,
      instructions: input.instructions,
      dueAt: input.dueAt,
      createdBy: input.createdBy,
      items: input.items.map((item) => ({
        ...item,
        itemRef: `assignment-item:${randomUUID()}`
      }))
    };
  }

  private validateItems(items: AssignmentItemInput[]): void {
    if (
      new Set(items.map((item) => item.sequence)).size !== items.length
    ) {
      throw new DomainConflictError(
        "ASSIGNMENT_ITEM_SEQUENCE_CONFLICT",
        "题目序号必须唯一。"
      );
    }
    for (const item of items) {
      if (
        item.itemType === "multiple_choice" &&
        (item.options.length < 2 ||
          !item.answerKey.choiceKey ||
          !item.options.some(
            (option) => option.key === item.answerKey.choiceKey
          ))
      ) {
        throw new DomainConflictError(
          "INVALID_MULTIPLE_CHOICE_ITEM",
          "单选题必须有至少两个选项和有效答案。"
        );
      }
      if (
        item.itemType === "numeric" &&
        item.answerKey.numericValue === undefined
      ) {
        throw new DomainConflictError(
          "INVALID_NUMERIC_ITEM",
          "数值题必须提供确定性参考值。"
        );
      }
    }
  }

  private assertItemObjectives(
    items: AssignmentItemInput[],
    allowedObjectiveRefs: string[]
  ): void {
    const allowed = new Set(allowedObjectiveRefs);
    const invalid = items
      .map((item) => item.objectiveRef)
      .filter((objectiveRef) => !allowed.has(objectiveRef));
    if (invalid.length > 0) {
      throw new DomainConflictError(
        "ASSIGNMENT_OBJECTIVE_OUTSIDE_LESSON",
        "题目只能关联当前课时的教学目标。",
        { invalidObjectiveRefs: [...new Set(invalid)] }
      );
    }
  }

  private syntheticResponse(
    item: AssignmentDetail["currentVersion"]["items"][number],
    learnerIndex: number,
    itemIndex: number
  ): Record<string, unknown> {
    const correct = (learnerIndex + itemIndex) % 4 !== 0;
    if (item.itemType === "multiple_choice") {
      const correctKey = item.answerKey.choiceKey!;
      const fallback = item.options.find(
        (option) => option.key !== correctKey
      )?.key;
      return { choiceKey: correct ? correctKey : fallback ?? correctKey };
    }
    if (item.itemType === "numeric") {
      const value = item.answerKey.numericValue!;
      return { numericValue: correct ? value : value + learnerIndex + 1 };
    }
    return {
      text: correct
        ? "图像随自变量增大而上升，因为斜率为正。"
        : "图像变化方向只看截距，斜率正负不影响。"
    };
  }

  private buildAnalytics(
    assignment: AssignmentDetail,
    submissions: SubmissionSummary[],
    evidence: EvidenceObservationSource[]
  ): AssignmentAnalytics {
    const confirmedScores = submissions
      .filter(
        (item): item is SubmissionSummary & { score: number; maxScore: number } =>
          item.gradeStatus === "confirmed" &&
          item.score !== null &&
          item.maxScore !== null
      )
      .map((item) => item.score)
      .sort((left, right) => left - right);
    const assignmentMaxScore = assignment.currentVersion.items.reduce(
      (sum, item) => sum + item.maxScore,
      0
    );
    const itemPerformance = assignment.currentVersion.items.map((item) => {
      const itemEvidence = evidence.filter(
        (observation) => observation.itemRef === item.itemRef
      );
      const scoreRates = itemEvidence.map(
        (observation) => observation.awardedScore / observation.maxScore
      );
      return {
        itemRef: item.itemRef,
        sequence: item.sequence,
        prompt: item.prompt,
        objectiveRef: item.objectiveRef,
        confirmedCount: itemEvidence.length,
        correctCount: itemEvidence.filter(
          (observation) => observation.outcome === "correct"
        ).length,
        partialCount: itemEvidence.filter(
          (observation) => observation.outcome === "partial"
        ).length,
        incorrectCount: itemEvidence.filter(
          (observation) => observation.outcome === "incorrect"
        ).length,
        averageScoreRate:
          scoreRates.length === 0
            ? null
            : scoreRates.reduce((sum, rate) => sum + rate, 0) /
              scoreRates.length,
        evidenceRefs: itemEvidence.map(
          (observation) => observation.observationRef
        )
      };
    });
    const objectivePerformance = assignment.currentVersion.objectiveRefs.map(
      (objectiveRef) => {
        const objectiveEvidence = evidence.filter(
          (observation) => observation.objectiveRef === objectiveRef
        );
        return {
          objectiveRef,
          objectiveTitle:
            assignment.currentVersion.items.find(
              (item) => item.objectiveRef === objectiveRef
            )?.prompt.slice(0, 80) ?? objectiveRef,
          confirmedResponseCount: objectiveEvidence.length,
          averageScoreRate:
            objectiveEvidence.length === 0
              ? null
              : objectiveEvidence.reduce(
                    (sum, observation) =>
                      sum + observation.awardedScore / observation.maxScore,
                    0
                  ) / objectiveEvidence.length,
          evidenceRefs: objectiveEvidence.map(
            (observation) => observation.observationRef
          )
        };
      }
    );
    const commonErrors = itemPerformance
      .filter((item) => item.incorrectCount + item.partialCount > 0)
      .map((item) => ({
        errorRef: `common-error:${assignment.assignmentRef}:${item.itemRef}`,
        itemRef: item.itemRef,
        itemSequence: item.sequence,
        objectiveRef: item.objectiveRef,
        summary: `第 ${item.sequence} 题有 ${
          item.incorrectCount + item.partialCount
        } 名 learner 的作答需要教师关注`,
        affectedLearnerCount: item.incorrectCount + item.partialCount,
        evidenceRefs: item.evidenceRefs.filter((reference) =>
          evidence.some(
            (observation) =>
              observation.observationRef === reference &&
              observation.outcome !== "correct"
          )
        )
      }));
    return {
      assignmentRef: assignment.assignmentRef,
      enrolledCount: submissions.length,
      submittedCount: submissions.filter(
        (item) => item.submissionState !== "not_submitted"
      ).length,
      notSubmittedCount: submissions.filter(
        (item) => item.submissionState === "not_submitted"
      ).length,
      confirmedGradeCount: confirmedScores.length,
      averageScore:
        confirmedScores.length === 0
          ? null
          : confirmedScores.reduce((sum, score) => sum + score, 0) /
            confirmedScores.length,
      medianScore:
        confirmedScores.length === 0
          ? null
          : confirmedScores.length % 2 === 1
            ? confirmedScores[Math.floor(confirmedScores.length / 2)]!
            : (confirmedScores[confirmedScores.length / 2 - 1]! +
                confirmedScores[confirmedScores.length / 2]!) /
              2,
      maxScore: assignmentMaxScore || null,
      itemPerformance,
      objectivePerformance,
      commonErrors,
      generatedAt: new Date().toISOString()
    };
  }

  private async requiredAssignment(
    executor: Parameters<PostgresGate27EducationRepository["getAssignment"]>[0],
    tenantRef: string,
    assignmentRef: string
  ): Promise<AssignmentDetail> {
    const assignment = await this.education.getAssignment(
      executor,
      tenantRef,
      assignmentRef
    );
    if (!assignment) throw new NotFoundError("作业不存在。");
    return assignment;
  }

  private async requiredSubmission(
    executor: Parameters<PostgresGate27EducationRepository["getSubmission"]>[0],
    tenantRef: string,
    submissionRef: string
  ) {
    const submission = await this.education.getSubmission(
      executor,
      tenantRef,
      submissionRef
    );
    if (!submission) throw new NotFoundError("提交不存在。");
    return submission;
  }

  private async lock(client: PostgresClient, ref: string): Promise<void> {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [ref]);
  }

  private versionConflict(
    assignment: AssignmentSummary,
    expectedVersion: number
  ): DomainConflictError {
    return new DomainConflictError(
      "ASSIGNMENT_VERSION_CONFLICT",
      "作业版本已变化。",
      {
        expectedVersion,
        actualVersion: assignment.version,
        status: assignment.status
      }
    );
  }

  private translateRepositoryConflict(error: unknown): never {
    if (
      error instanceof Error &&
      error.message === "ASSIGNMENT_VERSION_OR_STATE_CONFLICT"
    ) {
      throw new DomainConflictError(
        "ASSIGNMENT_VERSION_OR_STATE_CONFLICT",
        "作业版本或状态已变化。"
      );
    }
    throw error;
  }

  private assertDemoActor(tenantRef: string, actorRef: string): void {
    if (
      tenantRef !== gate2DemoRefs.tenantRef ||
      actorRef !== gate2DemoRefs.teacherRef
    ) {
      throw new AuthorizationDeniedError(
        "当前教师无权访问该 tenant 的作业或学习证据。"
      );
    }
  }
}

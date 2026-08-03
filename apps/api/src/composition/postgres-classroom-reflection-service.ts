import { createHash, randomUUID } from "node:crypto";

import {
  AmendLessonDeliveryRequestSchema,
  ClassroomObservationMutationResultSchema,
  ClassroomObservationListQuerySchema,
  ClassroomObservationListSchema,
  ConfirmClassroomObservationRequestSchema,
  ConfirmLessonDeliveryRequestSchema,
  ConfirmReflectionRequestSchema,
  CreateClassroomObservationRequestSchema,
  CreateLessonDeliveryRequestSchema,
  CreateReflectionDraftRequestSchema,
  CreateReflectionFollowUpRequestSchema,
  LessonDeliveryMutationResultSchema,
  LessonImplementationSummarySchema,
  PendingReflectionQueueSchema,
  ReflectionDetailSchema,
  ReflectionFollowUpResultSchema,
  ReflectionMutationResultSchema,
  SupersedeClassroomObservationRequestSchema,
  UpdateClassroomObservationDraftRequestSchema,
  UpdateLessonDeliveryDraftRequestSchema,
  UpdateReflectionDraftRequestSchema,
  type AuthorizationDecision,
  type CreateReflectionFollowUpRequest,
  type FormalWriteReceipt,
  type ReflectionDetail,
  type ReflectionRevisionView
} from "@edu-agent/contracts";
import type { Pool } from "pg";

import { PostgresGate2ArtifactRepository } from "../modules/artifact-collaboration/infrastructure/postgres-gate2-artifact-repository.js";
import { PostgresGate29ArtifactRepository } from "../modules/artifact-collaboration/infrastructure/postgres-gate2-9-artifact-repository.js";
import { PostgresGate25EducationRepository } from "../modules/education-domain/infrastructure/postgres-gate2-5-education-repository.js";
import { PostgresGate29EducationRepository } from "../modules/education-domain/infrastructure/postgres-gate2-9-education-repository.js";
import { PostgresGovernanceRepository } from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import { PostgresGate29WorkRepository } from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-9-work-repository.js";
import {
  AuthorizationDeniedError,
  DomainConflictError,
  IdempotencyConflictError,
  NotFoundError
} from "../platform/errors.js";
import type { PostgresClient } from "../platform/postgres/types.js";
import { createWriteMetadata, type WriteContext } from "../platform/postgres/write-context.js";
import type { PostgresAssignmentLearningService } from "./postgres-assignment-learning-service.js";
import type { PostgresLessonPreparationService } from "./postgres-lesson-preparation-service.js";
import type { PostgresTeacherWorkbenchService } from "./postgres-teacher-workbench-service.js";

type CommandContext = {
  client: PostgresClient;
  writeContext: WriteContext;
  receipts: FormalWriteReceipt[];
};

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableDecisionRef(rootKey: string): string {
  return `authorization-decision:${hash(rootKey).slice(0, 32)}`;
}

export class PostgresClassroomReflectionService {
  constructor(
    private readonly pool: Pool,
    private readonly lessonPreparation: PostgresLessonPreparationService,
    private readonly assignments: PostgresAssignmentLearningService,
    private readonly workbench: PostgresTeacherWorkbenchService,
    private readonly governance = new PostgresGovernanceRepository(),
    private readonly education = new PostgresGate29EducationRepository(),
    private readonly lessonEducation = new PostgresGate25EducationRepository(),
    private readonly artifacts = new PostgresGate29ArtifactRepository(),
    private readonly teachingPlans = new PostgresGate2ArtifactRepository(),
    private readonly work = new PostgresGate29WorkRepository()
  ) {}

  async createDelivery(input: { tenantRef: string; actorRef: string; request: unknown }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = CreateLessonDeliveryRequestSchema.parse(input.request);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash(request),
      action: "lesson-delivery.create",
      resourceRef: request.lessonRef,
      requestedFieldMask: ["lesson", "approvedTeachingPlan", "actualDelivery", "calendarEvent"],
      operation: async ({ client, writeContext, receipts }) => {
        const context = await this.requireLessonContext(client, input.tenantRef, request.lessonRef);
        if (context.lesson.courseRunRef !== request.courseRunRef) {
          throw new DomainConflictError("LESSON_DELIVERY_COURSE_SCOPE_CONFLICT", "课堂记录的 CourseRun 与 Lesson 不一致。");
        }
        await this.requireApprovedPlan(client, request.teachingPlanRevisionRef, request.lessonRef);
        if (request.calendarEventRef) {
          await this.requireCalendarEvent(client, input.tenantRef, input.actorRef, request.calendarEventRef, request.lessonRef);
        }
        const sessionKey = request.calendarEventRef
          ? `calendar:${request.calendarEventRef}`
          : `start:${request.actualStartAt}`;
        await this.lockBusinessKey(
          client,
          `lesson-delivery:${input.tenantRef}:${request.lessonRef}:${sessionKey}`
        );
        const existingDeliveryRef = await this.education.findDeliveryBySession(
          client,
          input.tenantRef,
          request.lessonRef,
          sessionKey
        );
        if (existingDeliveryRef) {
          throw new DomainConflictError(
            "LESSON_DELIVERY_SESSION_EXISTS",
            "该课时场次已经存在课堂实施记录，请继续原记录或创建修订。",
            { deliveryRef: existingDeliveryRef }
          );
        }
        const deliveryRef = `lesson-delivery:${randomUUID()}`;
        const revisionRef = `lesson-delivery-revision:${randomUUID()}`;
        receipts.push(...await this.education.insertDelivery(client, {
          deliveryRef,
          tenantRef: input.tenantRef,
          courseRunRef: request.courseRunRef,
          lessonRef: request.lessonRef,
          sessionKey,
          teacherRef: input.actorRef,
          revision: {
            deliveryRevisionRef: revisionRef,
            deliveryRef,
            revisionNumber: 1,
            teachingPlanRevisionRef: request.teachingPlanRevisionRef,
            calendarEventRef: request.calendarEventRef,
            actualStartAt: request.actualStartAt,
            actualEndAt: request.actualEndAt,
            steps: request.steps,
            paceNotes: request.paceNotes,
            unresolvedQuestions: request.unresolvedQuestions,
            followUpNotes: request.followUpNotes,
            parentRevisionRef: null
          },
          deliveryMetadata: createWriteMetadata(writeContext, "education", "lesson-delivery"),
          revisionMetadata: createWriteMetadata(writeContext, "education", "lesson-delivery-draft-v1")
        }));
        receipts.push(await this.education.insertOutbox(client, {
          outboxRef: `outbox:${randomUUID()}`,
          eventName: "LessonDeliveryDraftCreated",
          aggregateRef: deliveryRef,
          payload: { deliveryRevisionRef: revisionRef, lessonRef: request.lessonRef },
          metadata: createWriteMetadata(writeContext, "education", "lesson-delivery-draft-outbox")
        }));
        const delivery = await this.education.getDelivery(client, input.tenantRef, input.actorRef, deliveryRef);
        if (!delivery) throw new Error("LessonDelivery was not persisted.");
        return { replayed: false, delivery };
      }
    });
    return LessonDeliveryMutationResultSchema.parse(result);
  }

  async getDelivery(input: { tenantRef: string; actorRef: string; deliveryRef: string }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const delivery = await this.education.getDelivery(this.pool, input.tenantRef, input.actorRef, input.deliveryRef);
    if (!delivery) throw new NotFoundError("课堂实施记录不存在。");
    return delivery;
  }

  async updateDeliveryDraft(input: { tenantRef: string; actorRef: string; deliveryRef: string; request: unknown }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = UpdateLessonDeliveryDraftRequestSchema.parse(input.request);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ deliveryRef: input.deliveryRef, ...request }),
      action: "lesson-delivery.update-draft",
      resourceRef: input.deliveryRef,
      requestedFieldMask: ["actualDelivery"],
      operation: async ({ client, writeContext, receipts }) => {
        const current = await this.requireDelivery(client, input.tenantRef, input.actorRef, input.deliveryRef);
        const draft = current.currentDraft;
        if (!draft) throw new DomainConflictError("LESSON_DELIVERY_DRAFT_REQUIRED", "课堂记录已经确认；请创建修订草稿。");
        await this.requireApprovedPlan(client, request.teachingPlanRevisionRef, draft.lessonRef);
        const metadata = createWriteMetadata(writeContext, "education", "lesson-delivery-draft-update");
        const changed = await this.education.updateDeliveryDraft(client, {
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          deliveryRef: input.deliveryRef,
          revisionRef: draft.deliveryRevisionRef,
          expectedRevisionVersion: request.expectedRevisionVersion,
          content: request,
          metadata
        });
        if (!changed) this.versionConflict("LESSON_DELIVERY_VERSION_CONFLICT", request.expectedRevisionVersion);
        receipts.push({
          writeRef: draft.deliveryRevisionRef,
          recordType: "LessonDeliveryRevision",
          owner: "education",
          metadata
        });
        const delivery = await this.requireDelivery(client, input.tenantRef, input.actorRef, input.deliveryRef);
        return { replayed: false, delivery };
      }
    });
    return LessonDeliveryMutationResultSchema.parse(result);
  }

  async amendDelivery(input: { tenantRef: string; actorRef: string; deliveryRef: string; request: unknown }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = AmendLessonDeliveryRequestSchema.parse(input.request);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ deliveryRef: input.deliveryRef, ...request }),
      action: "lesson-delivery.amend",
      resourceRef: input.deliveryRef,
      requestedFieldMask: ["confirmedDelivery", "amendmentDraft"],
      operation: async ({ client, writeContext, receipts }) => {
        const current = await this.requireDelivery(client, input.tenantRef, input.actorRef, input.deliveryRef);
        if (!current.currentConfirmed || current.currentConfirmed.deliveryRevisionRef !== request.parentRevisionRef) {
          throw new DomainConflictError("LESSON_DELIVERY_CONFIRMED_PARENT_REQUIRED", "修订必须以当前已确认课堂记录为父版本。");
        }
        await this.requireApprovedPlan(client, request.teachingPlanRevisionRef, current.currentConfirmed.lessonRef);
        const revisionRef = `lesson-delivery-revision:${randomUUID()}`;
        const metadata = createWriteMetadata(writeContext, "education", "lesson-delivery-amendment");
        const changed = await this.education.insertDeliveryAmendment(client, {
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          deliveryRef: input.deliveryRef,
          expectedAggregateVersion: request.expectedAggregateVersion,
          revision: {
            deliveryRevisionRef: revisionRef,
            deliveryRef: input.deliveryRef,
            revisionNumber: Math.max(...current.history.map((item) => item.revisionNumber)) + 1,
            teachingPlanRevisionRef: request.teachingPlanRevisionRef,
            calendarEventRef: request.calendarEventRef,
            actualStartAt: request.actualStartAt,
            actualEndAt: request.actualEndAt,
            steps: request.steps,
            paceNotes: request.paceNotes,
            unresolvedQuestions: request.unresolvedQuestions,
            followUpNotes: request.followUpNotes,
            parentRevisionRef: request.parentRevisionRef
          },
          metadata
        });
        if (!changed) this.versionConflict("LESSON_DELIVERY_VERSION_CONFLICT", request.expectedAggregateVersion);
        receipts.push({
          writeRef: revisionRef,
          recordType: "LessonDeliveryRevision",
          owner: "education",
          metadata
        });
        return { replayed: false, delivery: await this.requireDelivery(client, input.tenantRef, input.actorRef, input.deliveryRef) };
      }
    });
    return LessonDeliveryMutationResultSchema.parse(result);
  }

  async confirmDelivery(input: { tenantRef: string; actorRef: string; deliveryRef: string; request: unknown }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = ConfirmLessonDeliveryRequestSchema.parse(input.request);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ deliveryRef: input.deliveryRef, ...request }),
      action: "lesson-delivery.confirm",
      resourceRef: input.deliveryRef,
      requestedFieldMask: ["delivery.confirmation", "observedPedagogicalMoves", "instructionalDecisions"],
      operation: async ({ client, writeContext, receipts }) => {
        const delivery = await this.requireDelivery(client, input.tenantRef, input.actorRef, input.deliveryRef);
        const draft = delivery.currentDraft;
        if (!draft) throw new DomainConflictError("LESSON_DELIVERY_DRAFT_REQUIRED", "没有可确认的课堂记录草稿。");
        const factReceipts = await this.education.confirmDelivery(client, {
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          deliveryRef: input.deliveryRef,
          revisionRef: draft.deliveryRevisionRef,
          expectedRevisionVersion: request.expectedRevisionVersion,
          moveRef: (stepKey) => `observed-move:${hash([draft.deliveryRevisionRef, stepKey]).slice(0, 32)}`,
          decisionRef: (stepKey) => `instructional-decision:${hash([draft.deliveryRevisionRef, stepKey]).slice(0, 32)}`,
          confirmationMetadata: createWriteMetadata(writeContext, "education", "lesson-delivery-confirmation"),
          moveMetadata: (stepKey) => createWriteMetadata(writeContext, "education", `observed-move-${hash(stepKey).slice(0, 10)}`),
          decisionMetadata: (stepKey) => createWriteMetadata(writeContext, "education", `instructional-decision-${hash(stepKey).slice(0, 10)}`)
        });
        if (!factReceipts) this.versionConflict("LESSON_DELIVERY_VERSION_CONFLICT", request.expectedRevisionVersion);
        receipts.push(...factReceipts!);
        receipts.push(await this.education.insertOutbox(client, {
          outboxRef: `outbox:${randomUUID()}`,
          eventName: "LessonDeliveryConfirmed",
          aggregateRef: input.deliveryRef,
          payload: { deliveryRevisionRef: draft.deliveryRevisionRef, lessonRef: draft.lessonRef },
          metadata: createWriteMetadata(writeContext, "education", "lesson-delivery-confirmed-outbox")
        }));
        return { replayed: false, delivery: await this.requireDelivery(client, input.tenantRef, input.actorRef, input.deliveryRef) };
      }
    });
    return LessonDeliveryMutationResultSchema.parse(result);
  }

  async createObservation(input: { tenantRef: string; actorRef: string; request: unknown }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = CreateClassroomObservationRequestSchema.parse(input.request);
    const result = await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash(request),
      action: "classroom-observation.create",
      resourceRef: request.lessonRef,
      requestedFieldMask: ["confirmedDelivery", "observation.scope", "observation.content"],
      operation: async ({ client, writeContext, receipts }) => {
        const delivery = await this.education.getDeliveryByRevision(client, input.tenantRef, input.actorRef, request.deliveryRevisionRef);
        if (!delivery || delivery.status !== "confirmed" || delivery.lessonRef !== request.lessonRef || delivery.courseRunRef !== request.courseRunRef) {
          throw new DomainConflictError("CONFIRMED_DELIVERY_REQUIRED", "课堂观察必须关联当前教师已确认且范围一致的实施记录。");
        }
        await this.validateObservationScope(client, input.tenantRef, input.actorRef, request.courseRunRef, request.lessonRef, request.scope, request.scopeRef, request.deliveryRevisionRef);
        const observationRef = `classroom-observation:${randomUUID()}`;
        const revisionRef = `classroom-observation-revision:${randomUUID()}`;
        receipts.push(...await this.education.insertObservation(client, {
          observationRef,
          tenantRef: input.tenantRef,
          courseRunRef: request.courseRunRef,
          lessonRef: request.lessonRef,
          deliveryRef: delivery.deliveryRef,
          teacherRef: input.actorRef,
          revision: {
            observationRevisionRef: revisionRef,
            observationRef,
            revisionNumber: 1,
            deliveryRevisionRef: request.deliveryRevisionRef,
            scope: request.scope,
            scopeRef: request.scopeRef,
            observationType: request.observationType,
            content: request.content,
            observedAt: request.observedAt,
            parentRevisionRef: null
          },
          observationMetadata: createWriteMetadata(writeContext, "education", "classroom-observation"),
          revisionMetadata: createWriteMetadata(writeContext, "education", "classroom-observation-draft-v1")
        }));
        receipts.push(await this.education.insertOutbox(client, {
          outboxRef: `outbox:${randomUUID()}`,
          eventName: "ClassroomObservationDraftCreated",
          aggregateRef: observationRef,
          payload: { observationRevisionRef: revisionRef, lessonRef: request.lessonRef },
          metadata: createWriteMetadata(writeContext, "education", "classroom-observation-draft-outbox")
        }));
        const observation = await this.education.getObservation(client, input.tenantRef, input.actorRef, observationRef);
        if (!observation) throw new Error("ClassroomObservation was not persisted.");
        return { replayed: false, observation };
      }
    });
    return ClassroomObservationMutationResultSchema.parse(result);
  }

  async getObservation(input: { tenantRef: string; actorRef: string; observationRef: string }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const observation = await this.education.getObservation(this.pool, input.tenantRef, input.actorRef, input.observationRef);
    if (!observation) throw new NotFoundError("课堂观察不存在。");
    return observation;
  }

  async listObservations(input: { tenantRef: string; actorRef: string; query: unknown }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const query = ClassroomObservationListQuerySchema.parse(input.query);
    await this.requireLessonContext(this.pool, input.tenantRef, query.lessonRef);
    const items = await this.education.listObservationsForLesson(
      this.pool,
      input.tenantRef,
      input.actorRef,
      query.lessonRef
    );
    return ClassroomObservationListSchema.parse({
      items: items.filter((item) =>
        (!query.objectiveRef ||
          (item.scope === "learning_objective" && item.scopeRef === query.objectiveRef)) &&
        (!query.learnerRef ||
          (item.scope === "learner" && item.scopeRef === query.learnerRef))
      )
    });
  }

  async updateObservationDraft(input: { tenantRef: string; actorRef: string; observationRef: string; request: unknown }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = UpdateClassroomObservationDraftRequestSchema.parse(input.request);
    return ClassroomObservationMutationResultSchema.parse(await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ observationRef: input.observationRef, ...request }),
      action: "classroom-observation.update-draft",
      resourceRef: input.observationRef,
      requestedFieldMask: ["observation.draft"],
      operation: async ({ client, writeContext, receipts }) => {
        const current = await this.requireObservation(client, input.tenantRef, input.actorRef, input.observationRef);
        const draft = current.currentDraft;
        if (!draft) throw new DomainConflictError("CLASSROOM_OBSERVATION_DRAFT_REQUIRED", "课堂观察已确认；请创建替代修订。");
        await this.validateObservationScope(client, input.tenantRef, input.actorRef, draft.courseRunRef, draft.lessonRef, request.scope, request.scopeRef, request.deliveryRevisionRef);
        const metadata = createWriteMetadata(writeContext, "education", "classroom-observation-draft-update");
        const changed = await this.education.updateObservationDraft(client, {
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          observationRef: input.observationRef,
          revisionRef: draft.observationRevisionRef,
          expectedRevisionVersion: request.expectedRevisionVersion,
          content: request,
          metadata
        });
        if (!changed) this.versionConflict("CLASSROOM_OBSERVATION_VERSION_CONFLICT", request.expectedRevisionVersion);
        receipts.push({ writeRef: draft.observationRevisionRef, recordType: "ClassroomObservationRevision", owner: "education", metadata });
        return { replayed: false, observation: await this.requireObservation(client, input.tenantRef, input.actorRef, input.observationRef) };
      }
    }));
  }

  async supersedeObservation(input: { tenantRef: string; actorRef: string; observationRef: string; request: unknown }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = SupersedeClassroomObservationRequestSchema.parse(input.request);
    return ClassroomObservationMutationResultSchema.parse(await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ observationRef: input.observationRef, ...request }),
      action: "classroom-observation.supersede",
      resourceRef: input.observationRef,
      requestedFieldMask: ["confirmedObservation", "replacementDraft"],
      operation: async ({ client, writeContext, receipts }) => {
        const current = await this.requireObservation(client, input.tenantRef, input.actorRef, input.observationRef);
        if (!current.currentConfirmed || current.currentConfirmed.observationRevisionRef !== request.parentRevisionRef) {
          throw new DomainConflictError("CLASSROOM_OBSERVATION_CONFIRMED_PARENT_REQUIRED", "替代修订必须以当前已确认观察为父版本。");
        }
        await this.validateObservationScope(client, input.tenantRef, input.actorRef, current.currentConfirmed.courseRunRef, current.currentConfirmed.lessonRef, request.scope, request.scopeRef, request.deliveryRevisionRef);
        const revisionRef = `classroom-observation-revision:${randomUUID()}`;
        const metadata = createWriteMetadata(writeContext, "education", "classroom-observation-supersession");
        const changed = await this.education.insertObservationSupersession(client, {
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          observationRef: input.observationRef,
          expectedAggregateVersion: request.expectedAggregateVersion,
          revision: {
            observationRevisionRef: revisionRef,
            observationRef: input.observationRef,
            revisionNumber: Math.max(...current.history.map((item) => item.revisionNumber)) + 1,
            deliveryRevisionRef: request.deliveryRevisionRef,
            scope: request.scope,
            scopeRef: request.scopeRef,
            observationType: request.observationType,
            content: request.content,
            observedAt: request.observedAt,
            parentRevisionRef: request.parentRevisionRef
          },
          metadata
        });
        if (!changed) this.versionConflict("CLASSROOM_OBSERVATION_VERSION_CONFLICT", request.expectedAggregateVersion);
        receipts.push({ writeRef: revisionRef, recordType: "ClassroomObservationRevision", owner: "education", metadata });
        return { replayed: false, observation: await this.requireObservation(client, input.tenantRef, input.actorRef, input.observationRef) };
      }
    }));
  }

  async confirmObservation(input: { tenantRef: string; actorRef: string; observationRef: string; request: unknown }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = ConfirmClassroomObservationRequestSchema.parse(input.request);
    return ClassroomObservationMutationResultSchema.parse(await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ observationRef: input.observationRef, ...request }),
      action: "classroom-observation.confirm",
      resourceRef: input.observationRef,
      requestedFieldMask: ["observation.confirmation"],
      operation: async ({ client, writeContext, receipts }) => {
        const current = await this.requireObservation(client, input.tenantRef, input.actorRef, input.observationRef);
        const draft = current.currentDraft;
        if (!draft) throw new DomainConflictError("CLASSROOM_OBSERVATION_DRAFT_REQUIRED", "没有可确认的课堂观察草稿。");
        const metadata = createWriteMetadata(writeContext, "education", "classroom-observation-confirmation");
        const changed = await this.education.confirmObservation(client, {
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          observationRef: input.observationRef,
          revisionRef: draft.observationRevisionRef,
          expectedRevisionVersion: request.expectedRevisionVersion,
          metadata
        });
        if (!changed) this.versionConflict("CLASSROOM_OBSERVATION_VERSION_CONFLICT", request.expectedRevisionVersion);
        receipts.push({ writeRef: draft.observationRevisionRef, recordType: "ClassroomObservationRevisionConfirmed", owner: "education", metadata });
        receipts.push(await this.education.insertOutbox(client, {
          outboxRef: `outbox:${randomUUID()}`,
          eventName: "ClassroomObservationConfirmed",
          aggregateRef: input.observationRef,
          payload: { observationRevisionRef: draft.observationRevisionRef, lessonRef: draft.lessonRef },
          metadata: createWriteMetadata(writeContext, "education", "classroom-observation-confirmed-outbox")
        }));
        return { replayed: false, observation: await this.requireObservation(client, input.tenantRef, input.actorRef, input.observationRef) };
      }
    }));
  }

  async createReflectionDraft(input: { tenantRef: string; actorRef: string; request: unknown }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = CreateReflectionDraftRequestSchema.parse(input.request);
    return ReflectionMutationResultSchema.parse(await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash(request),
      action: "lesson-reflection.create-draft",
      resourceRef: request.deliveryRevisionRef,
      requestedFieldMask: ["approvedTeachingPlan", "confirmedDelivery", "selectedObservations", "selectedAssignmentEvidence", "reflectionDraft"],
      operation: async ({ client, writeContext, receipts }) => {
        await this.lockBusinessKey(
          client,
          `lesson-reflection:${input.tenantRef}:${request.deliveryRevisionRef}`
        );
        const scope = await this.validateReflectionScope(client, input.tenantRef, input.actorRef, request);
        const existing = await this.artifacts.findReflectionForDelivery(client, input.tenantRef, request.deliveryRevisionRef);
        if (existing) throw new DomainConflictError("REFLECTION_ALREADY_EXISTS", "该已确认课堂记录已经有课后反思。", { reflectionRef: existing });
        const reflectionRef = `artifact:lesson-reflection:${randomUUID()}`;
        const revisionRef = `artifact-revision:${randomUUID()}`;
        receipts.push(...await this.artifacts.insertInitialDraft(client, {
          reflectionRef,
          revisionRef,
          title: `${scope.lessonTitle}｜课后反思（草稿）`,
          content: request.content,
          scope: {
            tenantRef: input.tenantRef,
            courseRunRef: request.courseRunRef,
            lessonRef: request.lessonRef,
            teachingPlanRevisionRef: request.teachingPlanRevisionRef,
            deliveryRevisionRef: request.deliveryRevisionRef,
            observationRevisionRefs: request.observationRevisionRefs,
            assignmentEvidenceRefs: request.assignmentEvidenceRefs
          },
          sourceAgentRunRef: null,
          artifactMetadata: createWriteMetadata(writeContext, "artifact", "lesson-reflection-artifact"),
          revisionMetadata: createWriteMetadata(writeContext, "artifact", "lesson-reflection-draft-v1"),
          scopeMetadata: createWriteMetadata(writeContext, "artifact", "lesson-reflection-scope-v1"),
          eventRef: `reflection-event:${randomUUID()}`,
          eventMetadata: createWriteMetadata(writeContext, "artifact", "lesson-reflection-created-event"),
          outboxRef: `outbox:${randomUUID()}`,
          outboxMetadata: createWriteMetadata(writeContext, "artifact", "lesson-reflection-created-outbox"),
          eventName: "LessonReflectionDraftCreated"
        }));
        const taskRef = `task:${randomUUID()}`;
        receipts.push(...await this.work.insertReflectionTask(client, {
          taskRef,
          tenantRef: input.tenantRef,
          reflectionRef,
          lessonRef: request.lessonRef,
          title: `${scope.lessonTitle}｜生成并确认课后反思`,
          actorRef: input.actorRef,
          workingSet: {
            courseRunRef: request.courseRunRef,
            curriculumUnitRef: scope.curriculumUnitRef,
            lessonRef: request.lessonRef,
            learningObjectiveRefs: scope.learningObjectiveRefs,
            evidenceRefs: request.assignmentEvidenceRefs,
            baselineTeachingPlanRef: request.teachingPlanRevisionRef,
            sourceLessonRef: request.lessonRef,
            sourceAssignmentRef: null,
            sourceAssignmentItemRefs: [],
            sourceTodoRef: null,
            sourceResourceRefs: [reflectionRef, request.deliveryRevisionRef, ...request.observationRevisionRefs],
            sourceReflectionRef: reflectionRef,
            sourceDeliveryRevisionRef: request.deliveryRevisionRef,
            sourceObservationRevisionRefs: request.observationRevisionRefs,
            purpose: "lesson-reflection.generate",
            requestedFieldMask: [
              "lesson.learningObjectives",
              "teachingPlan.content",
              "delivery.confirmedSteps",
              "observations.confirmedContent",
              "assignmentEvidence.summary",
              "teacherNotes"
            ]
          },
          taskMetadata: createWriteMetadata(writeContext, "work", "lesson-reflection-task"),
          detailsMetadata: createWriteMetadata(writeContext, "work", "lesson-reflection-task-details"),
          workingSetMetadata: createWriteMetadata(writeContext, "work", "lesson-reflection-working-set-v1"),
          outboxRef: `outbox:${randomUUID()}`,
          outboxMetadata: createWriteMetadata(writeContext, "work", "lesson-reflection-task-outbox")
        }));
        return { replayed: false, reflection: await this.requireReflection(client, input.tenantRef, input.actorRef, reflectionRef) };
      }
    }));
  }

  async getReflection(input: { tenantRef: string; actorRef: string; reflectionRef: string }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    return this.requireReflection(this.pool, input.tenantRef, input.actorRef, input.reflectionRef);
  }

  async updateReflectionDraft(input: { tenantRef: string; actorRef: string; reflectionRef: string; request: unknown }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = UpdateReflectionDraftRequestSchema.parse(input.request);
    return ReflectionMutationResultSchema.parse(await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ reflectionRef: input.reflectionRef, ...request }),
      action: "lesson-reflection.update-draft",
      resourceRef: input.reflectionRef,
      requestedFieldMask: ["reflection.draft"],
      operation: async ({ client, writeContext, receipts }) => {
        const reflectionTask = await this.work.getReflectionTask(
          client,
          input.tenantRef,
          input.reflectionRef
        );
        if (reflectionTask?.status === "generating") {
          throw new DomainConflictError(
            "LESSON_REFLECTION_GENERATION_IN_PROGRESS",
            "模型正在生成新的反思草稿；请等待完成或取消后再编辑。"
          );
        }
        const reflection = await this.requireReflection(client, input.tenantRef, input.actorRef, input.reflectionRef);
        const draft = reflection.currentDraft;
        if (!draft || draft.revisionNumber !== request.expectedRevisionNumber) {
          this.versionConflict("LESSON_REFLECTION_VERSION_CONFLICT", request.expectedRevisionNumber);
        }
        const revisionRef = `artifact-revision:${randomUUID()}`;
        const inserted = await this.artifacts.insertDraftRevision(client, {
          reflectionRef: input.reflectionRef,
          revisionRef,
          parentRevisionRef: draft!.reflectionRevisionRef,
          title: `课后反思（教师编辑草稿 v${draft!.revisionNumber + 1}）`,
          content: request.content,
          scope: this.scopeFromReflection(draft!),
          sourceAgentRunRef: draft!.sourceAgentRunRef,
          revisionMetadata: createWriteMetadata(writeContext, "artifact", "lesson-reflection-edited-revision"),
          scopeMetadata: createWriteMetadata(writeContext, "artifact", "lesson-reflection-edited-scope"),
          eventRef: `reflection-event:${randomUUID()}`,
          eventMetadata: createWriteMetadata(writeContext, "artifact", "lesson-reflection-edited-event"),
          outboxRef: `outbox:${randomUUID()}`,
          outboxMetadata: createWriteMetadata(writeContext, "artifact", "lesson-reflection-edited-outbox"),
          eventName: "LessonReflectionDraftEdited"
        });
        receipts.push(...inserted.receipts);
        return { replayed: false, reflection: await this.requireReflection(client, input.tenantRef, input.actorRef, input.reflectionRef) };
      }
    }));
  }

  async confirmReflection(input: { tenantRef: string; actorRef: string; reflectionRef: string; request: unknown }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = ConfirmReflectionRequestSchema.parse(input.request);
    return ReflectionMutationResultSchema.parse(await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash({ reflectionRef: input.reflectionRef, ...request }),
      action: "lesson-reflection.confirm",
      resourceRef: input.reflectionRef,
      requestedFieldMask: ["reflection.confirmation"],
      operation: async ({ client, writeContext, receipts }) => {
        const reflectionTask = await this.work.getReflectionTask(
          client,
          input.tenantRef,
          input.reflectionRef
        );
        if (reflectionTask?.status === "generating") {
          throw new DomainConflictError(
            "LESSON_REFLECTION_GENERATION_IN_PROGRESS",
            "模型正在生成新的反思草稿；不能确认旧版本。"
          );
        }
        const reflection = await this.requireReflection(client, input.tenantRef, input.actorRef, input.reflectionRef);
        const draft = reflection.currentDraft;
        if (!draft) throw new DomainConflictError("LESSON_REFLECTION_DRAFT_REQUIRED", "没有可确认的反思草稿。");
        const confirmedRevisionRef = `artifact-revision:${randomUUID()}`;
        const confirmed = await this.artifacts.confirmDraft(client, {
          reflectionRef: input.reflectionRef,
          draftRevisionRef: draft.reflectionRevisionRef,
          expectedRevisionNumber: request.expectedRevisionNumber,
          confirmedRevisionRef,
          confirmedBy: input.actorRef,
          revisionMetadata: createWriteMetadata(writeContext, "artifact", "lesson-reflection-confirmed-revision"),
          scopeMetadata: createWriteMetadata(writeContext, "artifact", "lesson-reflection-confirmed-scope"),
          eventRef: `reflection-event:${randomUUID()}`,
          eventMetadata: createWriteMetadata(writeContext, "artifact", "lesson-reflection-confirmed-event"),
          outboxRef: `outbox:${randomUUID()}`,
          outboxMetadata: createWriteMetadata(writeContext, "artifact", "lesson-reflection-confirmed-outbox")
        });
        if (!confirmed) this.versionConflict("LESSON_REFLECTION_VERSION_CONFLICT", request.expectedRevisionNumber);
        receipts.push(...confirmed!.receipts);
        const task = await this.work.getReflectionTask(client, input.tenantRef, input.reflectionRef);
        if (task) {
          await this.work.setReflectionTaskStatus(client, {
            taskRef: task.taskRef,
            fromStatuses: ["draft", "draft_ready", "generating"],
            toStatus: "confirmed",
            updatedAt: writeContext.createdAt
          });
        }
        return { replayed: false, reflection: await this.requireReflection(client, input.tenantRef, input.actorRef, input.reflectionRef) };
      }
    }));
  }

  async getLessonSummary(input: { tenantRef: string; actorRef: string; lessonRef: string }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    await this.requireLessonContext(this.pool, input.tenantRef, input.lessonRef);
    const deliveries = await this.education.listDeliveriesForLesson(this.pool, input.tenantRef, input.actorRef, input.lessonRef);
    const delivery = deliveries[0] ?? null;
    const currentDelivery = deliveries.flatMap((item) => item.currentConfirmed ? [item.currentConfirmed] : []).sort((a, b) => b.confirmedAt!.localeCompare(a.confirmedAt!))[0] ?? null;
    const [moves, decisions, observationHistory, reflectionRevision] = currentDelivery
      ? await Promise.all([
          this.education.listMoves(this.pool, currentDelivery.deliveryRevisionRef),
          this.education.listDecisions(this.pool, currentDelivery.deliveryRevisionRef),
          this.education.listObservationsForLesson(this.pool, input.tenantRef, input.actorRef, input.lessonRef),
          this.artifacts.findReflectionForDelivery(this.pool, input.tenantRef, currentDelivery.deliveryRevisionRef)
        ])
      : [[], [], [], undefined] as const;
    const observations = observationHistory.filter(
      (item) => item.deliveryRevisionRef === currentDelivery?.deliveryRevisionRef
    );
    const reflection = reflectionRevision
      ? await this.requireReflection(this.pool, input.tenantRef, input.actorRef, reflectionRevision)
      : null;
    return LessonImplementationSummarySchema.parse({
      lessonRef: input.lessonRef,
      delivery,
      currentDelivery,
      observedMoves: moves,
      instructionalDecisions: decisions,
      observations,
      reflection,
      implementationPending: !currentDelivery,
      reflectionPending: Boolean(currentDelivery && !reflection?.currentConfirmed)
    });
  }

  async getPendingReflectionQueue(input: { tenantRef: string; actorRef: string }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const result = await this.pool.query<{
      lesson_ref: string;
      lesson_title: string;
      delivery_ref: string;
      delivery_revision_ref: string;
      confirmed_at: Date;
      reflection_ref: string | null;
      reflection_status: string | null;
    }>(
      `SELECT delivery.lesson_ref, lesson.title AS lesson_title,
              delivery.delivery_ref, revision.delivery_revision_ref,
              revision.confirmed_at,
              scope.artifact_ref AS reflection_ref,
              scope.lifecycle_status AS reflection_status
         FROM education.lesson_delivery AS delivery
         JOIN education.lesson_delivery_revision AS revision
           ON revision.delivery_revision_ref = delivery.current_confirmed_revision_ref
         JOIN education.lesson AS lesson ON lesson.lesson_ref = delivery.lesson_ref
         LEFT JOIN LATERAL (
           SELECT artifact_ref, lifecycle_status
             FROM artifact.lesson_reflection_scope
            WHERE tenant_ref = delivery.tenant_ref
              AND delivery_revision_ref = revision.delivery_revision_ref
            ORDER BY updated_at DESC LIMIT 1
         ) AS scope ON true
        WHERE delivery.tenant_ref = $1 AND delivery.teacher_ref = $2
          AND (scope.lifecycle_status IS NULL OR scope.lifecycle_status = 'draft')
        ORDER BY revision.confirmed_at DESC`,
      [input.tenantRef, input.actorRef]
    );
    return PendingReflectionQueueSchema.parse({
      items: result.rows.map((row) => ({
        lessonRef: row.lesson_ref,
        lessonTitle: row.lesson_title,
        deliveryRef: row.delivery_ref,
        deliveryRevisionRef: row.delivery_revision_ref,
        deliveryConfirmedAt: row.confirmed_at.toISOString(),
        reflectionRef: row.reflection_ref,
        reflectionStatus: row.reflection_status,
        deepLink: `/teaching/lessons/${encodeURIComponent(row.lesson_ref)}`
      }))
    });
  }

  async createFollowUp(input: { tenantRef: string; actorRef: string; reflectionRef?: string; request: unknown }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = CreateReflectionFollowUpRequestSchema.parse(input.request);
    const reflection = await this.artifacts.getReflectionByRevision(this.pool, input.tenantRef, request.reflectionRevisionRef);
    if (!reflection || reflection.status !== "confirmed" || reflection.confirmedBy !== input.actorRef) {
      throw new DomainConflictError("CONFIRMED_REFLECTION_REQUIRED", "只有教师已确认的 Reflection Revision 才能创建后续行动。");
    }
    if (input.reflectionRef && reflection.reflectionRef !== input.reflectionRef) {
      throw new DomainConflictError("REFLECTION_ROUTE_MISMATCH", "Reflection route and revision do not match.");
    }
    const replay = await this.findCompletedFollowUpCommand(
      input.tenantRef,
      input.actorRef,
      request
    );
    if (replay) return replay;
    const target = await this.createFollowUpTarget(input, request, reflection);
    return ReflectionFollowUpResultSchema.parse(await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: hash(request),
      action: "lesson-reflection.create-follow-up",
      resourceRef: request.reflectionRevisionRef,
      requestedFieldMask: ["reflection.source", `followUp.${request.actionType}`],
      operation: async ({ client, writeContext, receipts }) => {
        const followUpRef = `reflection-follow-up:${randomUUID()}`;
        receipts.push(...await this.work.insertFollowUp(client, {
          followUpRef,
          tenantRef: input.tenantRef,
          teacherRef: input.actorRef,
          reflectionRevisionRef: request.reflectionRevisionRef,
          actionType: request.actionType,
          targetRef: target.targetRef,
          targetStatus: target.targetStatus,
          deepLink: target.deepLink,
          metadata: createWriteMetadata(writeContext, "work", "reflection-follow-up-link"),
          outboxRef: `outbox:${randomUUID()}`,
          outboxMetadata: createWriteMetadata(writeContext, "work", "reflection-follow-up-outbox")
        }));
        return { replayed: false, followUpRef, actionType: request.actionType, targetRef: target.targetRef, deepLink: target.deepLink };
      }
    }));
  }

  private async createFollowUpTarget(
    input: { tenantRef: string; actorRef: string },
    request: CreateReflectionFollowUpRequest,
    reflection: ReflectionRevisionView
  ): Promise<{ targetRef: string; targetStatus: string; deepLink: string }> {
    if (request.actionType === "teacher_todo") {
      const created = await this.workbench.createTodo({
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        request: {
          title: request.title,
          description: request.description,
          priority: request.priority,
          dueAt: request.dueAt,
          purpose: "teacher-todo.create",
          idempotencyKey: `${request.idempotencyKey}:target`
        }
      });
      await this.workbench.linkTodoResource({
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        todoRef: created.todo.todoRef,
        request: {
          expectedVersion: created.todo.version,
          resourceKind: "lesson_reflection",
          resourceRef: request.reflectionRevisionRef,
          purpose: "teacher-todo.resource.link",
          idempotencyKey: `${request.idempotencyKey}:target-link`
        }
      });
      return { targetRef: created.todo.todoRef, targetStatus: created.todo.status, deepLink: "/schedule" };
    }
    if (request.actionType === "assignment_draft") {
      const context = await this.requireLessonContext(this.pool, input.tenantRef, request.targetLessonRef);
      const created = await this.assignments.createAssignment({
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        request: {
          courseRunRef: context.lesson.courseRunRef,
          curriculumUnitRef: context.lesson.unitRef,
          lessonRef: request.targetLessonRef,
          title: request.title,
          instructions: request.instructions,
          dueAt: request.dueAt,
          items: request.items,
          purpose: "assignment.create",
          idempotencyKey: `${request.idempotencyKey}:target`
        }
      });
      return { targetRef: created.assignment.assignmentRef, targetStatus: "draft", deepLink: "/assignments" };
    }
    let task = await this.lessonPreparation.findOpenTaskForLesson({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      lessonRef: request.targetLessonRef
    });
    if (!task) {
      try {
        const created = await this.lessonPreparation.createTask({
          tenantRef: input.tenantRef,
          actorRef: input.actorRef,
          request: {
            lessonRef: request.targetLessonRef,
            dueAt: request.dueAt,
            priority: request.priority,
            purpose: "lesson-preparation.create",
            idempotencyKey: `${request.idempotencyKey}:target`
          }
        });
        task = created.task;
      } catch (error) {
        if (!(error instanceof DomainConflictError) || error.code !== "OPEN_LESSON_PREPARATION_TASK_EXISTS") {
          throw error;
        }
        task = await this.lessonPreparation.findOpenTaskForLesson({
          tenantRef: input.tenantRef,
          actorRef: input.actorRef,
          lessonRef: request.targetLessonRef
        });
        if (!task) throw error;
      }
    }
    if (task.workingSet.sourceReflectionRef === reflection.reflectionRef) {
      return {
        targetRef: task.taskRef,
        targetStatus: task.status,
        deepLink: `/agent/tasks/${encodeURIComponent(task.taskRef)}`
      };
    }
    if (task.status === "awaiting_plan_review") {
      throw new DomainConflictError(
        "LESSON_PREPARATION_REVIEW_IN_PROGRESS",
        "下一课已有待审核方案；请先完成或处置当前审核，再追加 Reflection 上下文。",
        { taskRef: task.taskRef, status: task.status }
      );
    }
    if (task.status === "ready_for_use") {
      const reopened = await this.lessonPreparation.transitionTask({
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        taskRef: task.taskRef,
        action: "reopen",
        request: {
          expectedVersion: task.version,
          purpose: "lesson-preparation.reopen",
          idempotencyKey: `${request.idempotencyKey}:target-reopen`
        }
      });
      task = reopened.task;
    }
    await this.attachReflectionContext({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      taskRef: task.taskRef,
      expectedWorkingSetVersion: task.workingSet.version,
      currentEvidenceRefs: task.workingSet.evidenceRefs,
      currentSourceResourceRefs: task.workingSet.sourceResourceRefs ?? [],
      reflection,
      idempotencyKey: `${request.idempotencyKey}:target-context`
    });
    return {
      targetRef: task.taskRef,
      targetStatus: task.status,
      deepLink: `/agent/tasks/${encodeURIComponent(task.taskRef)}`
    };
  }

  private async attachReflectionContext(input: {
    tenantRef: string;
    actorRef: string;
    taskRef: string;
    expectedWorkingSetVersion: number;
    currentEvidenceRefs: string[];
    currentSourceResourceRefs: string[];
    reflection: ReflectionRevisionView;
    idempotencyKey: string;
  }): Promise<void> {
    await this.executeCommand({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      purpose: "lesson-reflection.create-follow-up",
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: hash(input),
      action: "lesson-preparation.attach-reflection-context",
      resourceRef: input.taskRef,
      requestedFieldMask: ["taskWorkingSet.reflection", "taskWorkingSet.observations", "taskWorkingSet.evidence"],
      operation: async ({ client, writeContext, receipts }) => {
        const receipt = await this.work.attachReflectionContextToPreparationTask(client, {
          taskRef: input.taskRef,
          expectedWorkingSetVersion: input.expectedWorkingSetVersion,
          reflectionRef: input.reflection.reflectionRef,
          deliveryRevisionRef: input.reflection.deliveryRevisionRef,
          observationRevisionRefs: input.reflection.observationRevisionRefs,
          evidenceRefs: [...new Set([
            ...input.currentEvidenceRefs,
            ...input.reflection.assignmentEvidenceRefs
          ])],
          sourceResourceRefs: [
            ...input.currentSourceResourceRefs,
            input.reflection.reflectionRevisionRef,
            input.reflection.deliveryRevisionRef,
            ...input.reflection.observationRevisionRefs
          ].filter((item, index, items) => items.indexOf(item) === index),
          revisionRef: `working-set-revision:${randomUUID()}`,
          metadata: createWriteMetadata(writeContext, "work", "reflection-follow-up-working-set")
        });
        if (!receipt) this.versionConflict("TASK_WORKING_SET_VERSION_CONFLICT", input.expectedWorkingSetVersion);
        receipts.push(receipt!);
        return { attached: true };
      }
    });
  }

  private async findCompletedFollowUpCommand(
    tenantRef: string,
    actorRef: string,
    request: CreateReflectionFollowUpRequest
  ) {
    const rootKey = [tenantRef, actorRef, request.purpose, request.idempotencyKey].join("|");
    const result = await this.pool.query<{
      request_fingerprint: string;
      status: "processing" | "completed";
      result: Record<string, unknown> | null;
    }>(
      `SELECT request_fingerprint, status, result
         FROM governance.idempotency_record
        WHERE root_key = $1`,
      [rootKey]
    );
    const record = result.rows[0];
    if (!record) return null;
    if (record.request_fingerprint !== hash(request)) {
      throw new IdempotencyConflictError(
        "The idempotency key was used for a different payload."
      );
    }
    if (record.status !== "completed" || !record.result) {
      throw new DomainConflictError(
        "REFLECTION_FOLLOW_UP_COMMAND_IN_PROGRESS",
        "同一后续行动命令正在处理中，请稍后刷新。"
      );
    }
    return ReflectionFollowUpResultSchema.parse({
      ...record.result,
      replayed: true
    });
  }

  private async validateReflectionScope(
    executor: PostgresClient,
    tenantRef: string,
    actorRef: string,
    request: {
      courseRunRef: string;
      lessonRef: string;
      teachingPlanRevisionRef: string;
      deliveryRevisionRef: string;
      observationRevisionRefs: string[];
      assignmentEvidenceRefs: string[];
    }
  ) {
    const lesson = await this.requireLessonContext(executor, tenantRef, request.lessonRef);
    if (lesson.lesson.courseRunRef !== request.courseRunRef) {
      throw new DomainConflictError("REFLECTION_COURSE_SCOPE_CONFLICT", "Reflection 的 CourseRun 与 Lesson 不一致。");
    }
    await this.requireApprovedPlan(executor, request.teachingPlanRevisionRef, request.lessonRef);
    const delivery = await this.education.getDeliveryByRevision(executor, tenantRef, actorRef, request.deliveryRevisionRef);
    if (!delivery || delivery.status !== "confirmed" || delivery.lessonRef !== request.lessonRef || delivery.teachingPlanRevisionRef !== request.teachingPlanRevisionRef) {
      throw new DomainConflictError("REFLECTION_CONFIRMED_DELIVERY_REQUIRED", "Reflection 必须使用与已批准计划一致的 confirmed LessonDelivery。");
    }
    const observations = await this.education.validateConfirmedObservations(
      executor,
      tenantRef,
      actorRef,
      request.lessonRef,
      request.observationRevisionRefs
    );
    if (
      observations.length !== new Set(request.observationRevisionRefs).size ||
      observations.some(
        (item) => item.deliveryRevisionRef !== request.deliveryRevisionRef
      )
    ) {
      throw new DomainConflictError("REFLECTION_OBSERVATION_NOT_AUTHORIZED", "Reflection 只能使用教师明确选择的已确认课堂观察。");
    }
    const evidence = await this.education.validateAssignmentEvidence(executor, tenantRef, request.lessonRef, request.assignmentEvidenceRefs);
    if (evidence.length !== new Set(request.assignmentEvidenceRefs).size) {
      throw new DomainConflictError("REFLECTION_EVIDENCE_NOT_AUTHORIZED", "Reflection 只能使用当前课时中教师已确认且未被替代的 Assignment Evidence。");
    }
    return {
      lessonTitle: lesson.lesson.title,
      curriculumUnitRef: lesson.lesson.unitRef,
      learningObjectiveRefs: lesson.lesson.learningObjectives.map((item) => item.objectiveRef)
    };
  }

  private async validateObservationScope(
    executor: PostgresClient,
    tenantRef: string,
    actorRef: string,
    courseRunRef: string,
    lessonRef: string,
    scope: string,
    scopeRef: string | null,
    deliveryRevisionRef: string
  ): Promise<void> {
    if (scope === "class") return;
    if (!scopeRef) throw new DomainConflictError("OBSERVATION_SCOPE_REF_REQUIRED", "非班级范围的课堂观察必须选择明确对象。");
    if (scope === "learning_objective") {
      const result = await executor.query(
        `SELECT 1 FROM education.lesson_learning_objective_link
          WHERE lesson_ref = $1 AND objective_ref = $2`,
        [lessonRef, scopeRef]
      );
      if (!result.rows[0]) throw new DomainConflictError("OBSERVATION_OBJECTIVE_SCOPE_INVALID", "教学目标不属于当前课时。");
      return;
    }
    if (scope === "learner") {
      const result = await executor.query(
        `SELECT 1 FROM education.course_run_enrollment
          WHERE course_run_ref = $1 AND learner_ref = $2
            AND enrollment_status = 'active' AND synthetic = true`,
        [courseRunRef, scopeRef]
      );
      if (!result.rows[0]) throw new AuthorizationDeniedError("匿名学习者不属于当前 CourseRun 或未被授权。");
      return;
    }
    if (scope === "activity") {
      const delivery = await this.education.getDeliveryByRevision(
        executor,
        tenantRef,
        actorRef,
        deliveryRevisionRef
      );
      if (!delivery?.steps.some((step) => step.stepKey === scopeRef)) {
        throw new DomainConflictError("OBSERVATION_ACTIVITY_SCOPE_INVALID", "课堂活动不属于已确认实施记录。");
      }
      return;
    }
    const result = await executor.query(
      `SELECT 1
         FROM education.assignment_item AS item
         JOIN education.assignment_version AS version ON version.assignment_version_ref = item.assignment_version_ref
         JOIN education.assignment AS assignment ON assignment.assignment_ref = version.assignment_ref
        WHERE assignment.lesson_ref = $1 AND item.item_ref = $2`,
      [lessonRef, scopeRef]
    );
    if (!result.rows[0]) throw new DomainConflictError("OBSERVATION_ASSIGNMENT_ITEM_SCOPE_INVALID", "作业题目不属于当前课时。");
  }

  private async requireApprovedPlan(executor: PostgresClient | Pool, revisionRef: string, lessonRef: string) {
    const [revision, scope] = await Promise.all([
      this.teachingPlans.getTeachingPlanRevision(executor, revisionRef),
      this.teachingPlans.getTeachingPlanRevisionScope(executor, revisionRef)
    ]);
    if (!revision || revision.state !== "approved" || !scope || scope.lessonRef !== lessonRef || !["current_approved", "historical_approved"].includes(scope.lifecycleStatus)) {
      throw new DomainConflictError("APPROVED_TEACHING_PLAN_REQUIRED", "课堂实施只能引用该 Lesson 的不可变 approved TeachingPlan Revision。");
    }
    return revision;
  }

  private async requireCalendarEvent(executor: PostgresClient, tenantRef: string, actorRef: string, eventRef: string, lessonRef: string) {
    const result = await executor.query<{ related_lesson: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM work.teacher_todo_resource_link AS link
          WHERE link.todo_ref = event.related_todo_ref
            AND link.resource_kind = 'lesson'
            AND link.resource_ref = $4
       ) AS related_lesson
         FROM work.calendar_event AS event
        WHERE event.event_ref = $3 AND event.tenant_ref = $1
          AND event.teacher_ref = $2 AND event.status <> 'cancelled'`,
      [tenantRef, actorRef, eventRef, lessonRef]
    );
    if (!result.rows[0]) throw new NotFoundError("日历事件不存在或不属于当前教师。");
    if (!result.rows[0].related_lesson) {
      throw new DomainConflictError(
        "CALENDAR_EVENT_LESSON_SCOPE_CONFLICT",
        "课堂实施只能关联通过 Todo 资源关系明确绑定当前 Lesson 的日历事件。"
      );
    }
  }

  private async requireLessonContext(executor: PostgresClient | Pool, tenantRef: string, lessonRef: string) {
    const context = await this.lessonEducation.getLessonContext(executor, tenantRef, lessonRef);
    if (!context) throw new NotFoundError("课时不存在。");
    return context;
  }

  private async requireDelivery(executor: PostgresClient | Pool, tenantRef: string, actorRef: string, deliveryRef: string) {
    const delivery = await this.education.getDelivery(executor, tenantRef, actorRef, deliveryRef);
    if (!delivery) throw new NotFoundError("课堂实施记录不存在。");
    return delivery;
  }

  private async requireObservation(executor: PostgresClient | Pool, tenantRef: string, actorRef: string, observationRef: string) {
    const observation = await this.education.getObservation(executor, tenantRef, actorRef, observationRef);
    if (!observation) throw new NotFoundError("课堂观察不存在。");
    return observation;
  }

  private async requireReflection(executor: PostgresClient | Pool, tenantRef: string, actorRef: string, reflectionRef: string): Promise<ReflectionDetail> {
    this.assertDemoActor(tenantRef, actorRef);
    const stored = await this.artifacts.getReflection(executor, tenantRef, reflectionRef);
    if (!stored) throw new NotFoundError("课后反思不存在。");
    const [reflectionTask, followUps] = await Promise.all([
      this.work.getReflectionTask(executor, tenantRef, reflectionRef),
      this.work.listFollowUps(
        executor,
        tenantRef,
        actorRef,
        stored.revisions.map((item) => item.reflectionRevisionRef)
      )
    ]);
    if (!reflectionTask || reflectionTask.actorRef !== actorRef) {
      throw new NotFoundError("课后反思任务不存在。");
    }
    return ReflectionDetailSchema.parse({
      reflectionRef,
      reflectionTaskRef: reflectionTask.taskRef,
      generationStatus: reflectionTask.status,
      currentModelExecutionRef: reflectionTask.currentModelExecutionRef,
      currentDraft: stored.revisions.find((item) => item.status === "draft") ?? null,
      currentConfirmed: stored.revisions.find((item) => item.status === "confirmed") ?? null,
      history: stored.revisions,
      followUps: followUps.map(({ reflectionRevisionRef: _ignored, ...item }) => item)
    });
  }

  private scopeFromReflection(reflection: ReflectionRevisionView) {
    return {
      tenantRef: reflection.tenantRef,
      courseRunRef: reflection.courseRunRef,
      lessonRef: reflection.lessonRef,
      teachingPlanRevisionRef: reflection.teachingPlanRevisionRef,
      deliveryRevisionRef: reflection.deliveryRevisionRef,
      observationRevisionRefs: reflection.observationRevisionRefs,
      assignmentEvidenceRefs: reflection.assignmentEvidenceRefs
    };
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
    const rootKey = [input.tenantRef, input.actorRef, input.purpose, input.idempotencyKey].join("|");
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
        metadata: createWriteMetadata(writeContext, "governance", "gate2-9-command-idempotency")
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
        reasonCodes: ["synthetic-teacher-role", "tenant-course-lesson-scope-validated", "teacher-confirmation-required"],
        policyVersion: "policy:gate2-9-classroom-reflection-local@1",
        decidedAt: now
      };
      const receipts: FormalWriteReceipt[] = [
        reservation.receipt!,
        await this.governance.saveDecision(client, {
          decision,
          metadata: createWriteMetadata(writeContext, "governance", "gate2-9-command-authorization")
        })
      ];
      const result = await input.operation({ client, writeContext, receipts });
      await this.governance.completeIdempotency(client, { rootKey, result, completedAt: now });
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

  private versionConflict(code: string, expectedVersion: number): never {
    throw new DomainConflictError(code, "记录版本或状态已经变化，请刷新后继续。", { expectedVersion });
  }

  private async lockBusinessKey(client: PostgresClient, key: string): Promise<void> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
  }

  private assertDemoActor(tenantRef: string, actorRef: string): void {
    if (!tenantRef.trim() || !actorRef.trim()) {
      throw new AuthorizationDeniedError("当前教师无权访问其他 tenant 或教师的课堂实施与反思数据。");
    }
  }
}

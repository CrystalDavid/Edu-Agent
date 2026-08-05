import { randomUUID } from "node:crypto";

import {
  DecideLessonBriefResultSchema,
  GenerateLessonBriefResultSchema,
  LessonJourneyProjectionSchema,
  LessonTeachingPlanStateSchema,
  ModelExecutionViewSchema,
  ProposalReviewDetailSchema,
  apiRoutes
} from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/sample-data";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import { createProductContainer } from "../../apps/api/src/composition/product-container.js";
import { gate25DemoRefs } from "../../scripts/sample/gate2-5-demo-fixture.js";
import { seedSampleData } from "../../scripts/sample/seed-sample-data.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData
} from "./support/database.js";

const adminPool = poolFor("admin");
const product = createProductContainer(postgresEnvironment);
const app = createApp({ product });
const demoHeaders = {
  "x-demo-tenant": gate2DemoRefs.tenantRef,
  "x-demo-actor": gate2DemoRefs.teacherRef
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await seedSampleData(postgresEnvironment, {
    includeGate25: true,
    includeGate27: true
  });
});

afterAll(async () => {
  await Promise.all([product.close(), adminPool.end()]);
});

describe("Phase 8A-2 Lesson Brief → Lesson Preparation journey", () => {
  it("binds adopted Brief context to v4, preserves rejection, and requires explicit approval", async () => {
    const lessonRef = gate25DemoRefs.lessonRefs.slopeAndGraph;
    const initialPlanState = LessonTeachingPlanStateSchema.parse((
      await request(app)
        .get(apiRoutes.teacher.lessonTeachingPlans(lessonRef))
        .set(demoHeaders)
        .expect(200)
    ).body);
    expect(initialPlanState.currentApproved).not.toBeNull();

    const generated = GenerateLessonBriefResultSchema.parse((
      await request(app)
        .post(apiRoutes.teacher.generateLessonBrief(lessonRef))
        .set(demoHeaders)
        .send({
          purpose: "lesson-brief.generate",
          idempotencyKey: `phase8a2:brief:${randomUUID()}`,
          teacherAdjustment: null
        })
        .expect(201)
    ).body);
    const createdTask = (
      await request(app)
        .post(apiRoutes.teacher.preparationTasks)
        .set(demoHeaders)
        .send({
          lessonRef,
          dueAt: null,
          priority: "normal",
          purpose: "lesson-preparation.create",
          idempotencyKey: `phase8a2:task:${randomUUID()}`
        })
        .expect(201)
    ).body.task;
    const selectedCandidateIds = [
      generated.brief.teachingFocusCandidates[0]?.candidateId,
      generated.brief.difficultyCandidates[0]?.candidateId
    ].filter((value): value is string => Boolean(value));
    const adopted = DecideLessonBriefResultSchema.parse((
      await request(app)
        .post(apiRoutes.teacher.decideLessonBrief(
          lessonRef,
          generated.brief.agentRunRef
        ))
        .set(demoHeaders)
        .send({
          purpose: "lesson-brief.decide",
          idempotencyKey: `phase8a2:adopt:${randomUUID()}`,
          expectedContentHash: generated.brief.contentHash,
          action: "adopt",
          selectedCandidateIds,
          preparationTaskRef: createdTask.taskRef,
          expectedWorkingSetVersion: createdTask.workingSet.version
        })
        .expect(200)
    ).body);
    expect(adopted.workingSet?.sourceResourceRefs).toContain(
      `lesson-brief-run:${generated.brief.agentRunRef}`
    );

    const readyJourney = LessonJourneyProjectionSchema.parse((
      await request(app)
        .get(apiRoutes.teacher.lessonJourney(lessonRef))
        .set(demoHeaders)
        .expect(200)
    ).body);
    expect(readyJourney).toMatchObject({
      currentStage: "plan",
      status: "ready",
      nextBestAction: { kind: "generate_teaching_plan" }
    });

    const taskAfterBrief = (
      await request(app)
        .get(apiRoutes.teacher.preparationTask(createdTask.taskRef))
        .set(demoHeaders)
        .expect(200)
    ).body;
    const startedTask = (
      await request(app)
        .post(apiRoutes.teacher.preparationTaskStart(createdTask.taskRef))
        .set(demoHeaders)
        .send({
          expectedVersion: taskAfterBrief.version,
          purpose: "lesson-preparation.start",
          idempotencyKey: `phase8a2:start:${randomUUID()}`
        })
        .expect(201)
    ).body.task;

    const first = await generateProposal(startedTask, "先生成一版基础强化方案");
    const executionRow = await adminPool.query<{
      input_summary: Record<string, unknown>;
    }>(
      `SELECT input_summary
         FROM capability.model_execution
        WHERE execution_ref = $1`,
      [first.execution.modelExecutionRef]
    );
    expect(executionRow.rows[0]?.input_summary).toMatchObject({
      skillRef: "lesson-preparation@4",
      lessonBriefRef: `lesson-brief-run:${generated.brief.agentRunRef}`,
      lessonBriefAgentRunRef: generated.brief.agentRunRef,
      lessonBriefContentHash: generated.brief.contentHash,
      lessonBriefContextManifestHash: generated.brief.contextManifestHash
    });
    const runtimeRow = await adminPool.query<{
      output: Record<string, unknown>;
    }>(
      `SELECT output
         FROM runtime.agent_run
        WHERE agent_run_ref = $1`,
      [first.execution.agentRunRef]
    );
    const checkpoint = runtimeRow.rows[0]?.output["runtimeCheckpoint"] as
      | Record<string, unknown>
      | undefined;
    const contextEngineering = runtimeRow.rows[0]?.output[
      "contextEngineering"
    ] as Record<string, unknown> | undefined;
    expect(checkpoint).toMatchObject({
      agentDefinitionVersion: "4",
      skillVersion: "4",
      skillRef: "lesson-preparation@4",
      status: "waiting_for_human"
    });
    expect(contextEngineering?.["lessonBriefManifest"]).toMatchObject({
      briefRef: `lesson-brief-run:${generated.brief.agentRunRef}`,
      selectedCandidateIds: [...selectedCandidateIds].sort()
    });
    expect(contextEngineering?.["lessonBriefEvaluation"]).toMatchObject({
      passed: true,
      authorization: { status: "passed", unauthorizedRefs: [] },
      lifecycle: { inputKind: "teacher_adopted_only" }
    });

    await request(app)
      .post(apiRoutes.demo.suggestionDisposition(
        first.proposal.proposalRevisionRef
      ))
      .set(demoHeaders)
      .send({
        purpose: "teacher-copilot.review-suggestion",
        idempotencyKey: `phase8a2:reject:${randomUUID()}`,
        disposition: "rejected",
        selectedStrategyId: first.proposal.strategies[0]!.strategyId,
        teacherEdits: {},
        expectedProposalRevisionNumber:
          first.proposal.proposalRevisionNumber
      })
      .expect(201);
    const afterRejection = LessonTeachingPlanStateSchema.parse((
      await request(app)
        .get(apiRoutes.teacher.lessonTeachingPlans(lessonRef))
        .set(demoHeaders)
        .expect(200)
    ).body);
    expect(afterRejection.activeInReview).toBeNull();
    expect(afterRejection.currentApproved?.revisionRef).toBe(
      initialPlanState.currentApproved?.revisionRef
    );

    const taskAfterRejection = (
      await request(app)
        .get(apiRoutes.teacher.preparationTask(createdTask.taskRef))
        .set(demoHeaders)
        .expect(200)
    ).body;
    expect(taskAfterRejection.status).toBe("in_progress");
    const second = await generateProposal(
      taskAfterRejection,
      "根据已确认洞察重新生成，并减少无支架讨论"
    );
    const disposition = (
      await request(app)
        .post(apiRoutes.demo.suggestionDisposition(
          second.proposal.proposalRevisionRef
        ))
        .set(demoHeaders)
        .send({
          purpose: "teacher-copilot.review-suggestion",
          idempotencyKey: `phase8a2:accept:${randomUUID()}`,
          disposition: "accepted",
          selectedStrategyId: second.proposal.strategies[0]!.strategyId,
          teacherEdits: {},
          expectedProposalRevisionNumber:
            second.proposal.proposalRevisionNumber
        })
        .expect(201)
    ).body;
    expect(disposition.resultingRevision.state).toBe("in_review");

    const beforeApproval = LessonTeachingPlanStateSchema.parse((
      await request(app)
        .get(apiRoutes.teacher.lessonTeachingPlans(lessonRef))
        .set(demoHeaders)
        .expect(200)
    ).body);
    expect(beforeApproval.currentApproved?.revisionRef).toBe(
      initialPlanState.currentApproved?.revisionRef
    );
    expect(beforeApproval.activeInReview?.revisionRef).toBe(
      disposition.resultingRevision.revisionRef
    );

    const taskBeforeApproval = (
      await request(app)
        .get(apiRoutes.teacher.preparationTask(createdTask.taskRef))
        .set(demoHeaders)
        .expect(200)
    ).body;
    const approval = (
      await request(app)
      .post(apiRoutes.demo.approveTeachingPlan(
        disposition.resultingRevision.revisionRef
      ))
      .set(demoHeaders)
      .send({
        purpose: "teacher-copilot.approve-plan",
        idempotencyKey: `phase8a2:approve:${randomUUID()}`,
        expectedInReviewRevisionRef:
          disposition.resultingRevision.revisionRef,
        preparationTaskRef: createdTask.taskRef,
        expectedTaskVersion: taskBeforeApproval.version
      })
      .expect(201)
    ).body;
    const approved = LessonTeachingPlanStateSchema.parse((
      await request(app)
        .get(apiRoutes.teacher.lessonTeachingPlans(lessonRef))
        .set(demoHeaders)
        .expect(200)
    ).body);
    expect(approved.currentApproved?.revisionRef).toBe(
      approval.approvedRevision.revisionRef
    );
    expect(approved.activeInReview).toBeNull();
    expect(approved.history.map((revision) => revision.revisionRef)).toContain(
      initialPlanState.currentApproved?.revisionRef
    );
  });
});

async function generateProposal(
  task: {
    taskRef: string;
    version: number;
    courseRunRef: string;
    curriculumUnitRef: string;
    lessonRef: string;
    workingSet: {
      version: number;
      learningObjectiveRefs: string[];
      evidenceRefs: string[];
    };
  },
  requestText: string
) {
  const queued = (
    await request(app)
      .post(apiRoutes.teacher.modelInvocations)
      .set(demoHeaders)
      .send({
        requestText,
        courseRunRef: task.courseRunRef,
        goalRef: gate2DemoRefs.goalRef,
        learningObjectiveRefs: task.workingSet.learningObjectiveRefs,
        selectedEvidenceRefs: task.workingSet.evidenceRefs,
        requestVersion: 1,
        purpose: "teacher-copilot.adjust-next-lesson",
        idempotencyKey: `phase8a2:invoke:${randomUUID()}`,
        preparationTaskRef: task.taskRef,
        curriculumUnitRef: task.curriculumUnitRef,
        lessonRef: task.lessonRef,
        workingSetVersion: task.workingSet.version,
        expectedPreparationTaskVersion: task.version
      })
      .expect(202)
  ).body;
  await expect(
    product.workers.copilotOutbox.processAvailable(50)
  ).resolves.toBeGreaterThan(0);
  const execution = ModelExecutionViewSchema.parse((
    await request(app)
      .get(apiRoutes.teacher.modelInvocation(
        queued.execution.modelExecutionRef
      ))
      .set(demoHeaders)
      .expect(200)
  ).body);
  expect(execution).toMatchObject({
    status: "succeeded",
    proposalRevisionRef: expect.any(String)
  });
  const proposal = ProposalReviewDetailSchema.parse((
    await request(app)
      .get(apiRoutes.demo.proposalDetail(execution.proposalRevisionRef!))
      .set(demoHeaders)
      .expect(200)
  ).body);
  expect(proposal.status).toBe("pending");
  expect(proposal.strategies.length).toBeGreaterThanOrEqual(1);
  return { execution, proposal };
}

import { randomUUID } from "node:crypto";

import { apiRoutes } from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/sample-data";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import { gate25DemoRefs } from "../../scripts/sample/gate2-5-demo-fixture.js";
import { gate27DemoRefs } from "../../scripts/sample/gate2-7-demo-fixture.js";
import { seedSampleData } from "../../scripts/sample/seed-sample-data.js";
import { createProductContainer } from "../../apps/api/src/composition/product-container.js";
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

function assignmentItems() {
  return [
    {
      sequence: 1,
      itemType: "multiple_choice",
      prompt: "当一次函数斜率为正时，图像随 x 增大如何变化？",
      maxScore: 4,
      options: [
        { key: "A", text: "上升" },
        { key: "B", text: "下降" }
      ],
      answerKey: { choiceKey: "A" },
      gradingCriteria: "选择 A 得满分。",
      objectiveRef: gate2DemoRefs.objectiveRef
    },
    {
      sequence: 2,
      itemType: "numeric",
      prompt: "直线经过 (0,1) 和 (2,5)，斜率是多少？",
      maxScore: 4,
      options: [],
      answerKey: { numericValue: 2, tolerance: 0.001 },
      gradingCriteria: "斜率为 2。",
      objectiveRef: gate2DemoRefs.objectiveRef
    },
    {
      sequence: 3,
      itemType: "short_answer",
      prompt: "说明斜率正负与图像变化方向的关系。",
      maxScore: 7,
      options: [],
      answerKey: {
        referenceAnswer: "斜率为正时图像上升，斜率为负时图像下降。"
      },
      gradingCriteria: "教师确认解释是否完整。",
      objectiveRef: gate2DemoRefs.objectiveRef
    }
  ] as const;
}

async function createDraft(idempotencyKey = `gate27:create:${randomUUID()}`) {
  return request(app)
    .post(apiRoutes.teacher.assignments)
    .set(demoHeaders)
    .send({
      courseRunRef: gate2DemoRefs.courseRunRef,
      curriculumUnitRef: gate25DemoRefs.unitRef,
      lessonRef: gate27DemoRefs.sourceLessonRef,
      title: "斜率与图像变化课后练习",
      instructions: "请独立完成，简答题说明依据。",
      dueAt: "2026-09-19T10:00:00.000Z",
      items: assignmentItems(),
      purpose: "assignment.create",
      idempotencyKey
    })
    .expect(201);
}

async function publishAndImport() {
  const created = await createDraft();
  const assignmentRef = created.body.assignment.assignmentRef as string;
  const published = await request(app)
    .post(apiRoutes.teacher.assignmentPublish(assignmentRef))
    .set(demoHeaders)
    .send({
      expectedVersion: created.body.assignment.version,
      purpose: "assignment.publish",
      idempotencyKey: `gate27:publish:${randomUUID()}`
    })
    .expect(201);
  await request(app)
    .post(apiRoutes.teacher.assignmentSyntheticSubmissions(assignmentRef))
    .set(demoHeaders)
    .send({
      purpose: "assignment.synthetic-submissions.import",
      idempotencyKey: `gate27:import:${randomUUID()}`
    })
    .expect(201);
  return { assignmentRef, published: published.body.assignment };
}

async function saveAndConfirmFirstSubmission(assignmentRef: string) {
  const submissions = await request(app)
    .get(apiRoutes.teacher.assignmentSubmissions(assignmentRef))
    .set(demoHeaders)
    .expect(200);
  const summary = submissions.body.items.find(
    (item: { submissionRef: string | null }) => item.submissionRef
  );
  const detail = await request(app)
    .get(apiRoutes.teacher.submission(summary.submissionRef))
    .set(demoHeaders)
    .expect(200);
  const attempt = detail.body.attempts.find(
    (item: { isCurrent: boolean }) => item.isCurrent
  );
  const assignment = await request(app)
    .get(apiRoutes.teacher.assignment(assignmentRef))
    .set(demoHeaders)
    .expect(200);
  const itemByRef = new Map(
    assignment.body.currentVersion.items.map(
      (item: { itemRef: string; maxScore: number }) => [item.itemRef, item]
    )
  );
  const itemGrades = attempt.itemResponses.map(
    (response: { responseRef: string; itemRef: string }, index: number) => ({
      responseRef: response.responseRef,
      outcome: index < 2 ? "correct" : "partial",
      awardedScore:
        index < 2
          ? (itemByRef.get(response.itemRef) as { maxScore: number }).maxScore
          : 4,
      feedback: index < 2 ? "教师已复核。" : "解释方向正确，需补充变化条件。"
    })
  );
  const saved = await request(app)
    .post(apiRoutes.teacher.submissionGradeDraft(summary.submissionRef))
    .set(demoHeaders)
    .send({
      expectedAttemptRef: attempt.attemptRef,
      expectedDecisionVersion: 0,
      feedback: "批改草稿：先核对简答题依据。",
      itemGrades,
      purpose: "assignment.grading.save-draft",
      idempotencyKey: `gate27:grade-draft:${randomUUID()}`
    })
    .expect(201);
  const confirmCommand = {
    expectedDecisionVersion: saved.body.decision.version,
    purpose: "assignment.grading.confirm",
    idempotencyKey: `gate27:grade-confirm:${randomUUID()}`
  } as const;
  const confirmed = await request(app)
    .post(apiRoutes.teacher.gradeDecisionConfirm(saved.body.decision.gradeDecisionRef))
    .set(demoHeaders)
    .send(confirmCommand)
    .expect(201);
  return {
    summary,
    attempt,
    itemGrades,
    saved: saved.body.decision,
    confirmed: confirmed.body.decision,
    confirmCommand
  };
}

describe("Gate 2.7 assignment, learning evidence, and adjustment", () => {
  it("persists 12 anonymous enrollments and an idempotent versioned Assignment lifecycle", async () => {
    await request(app)
      .get(apiRoutes.teacher.courseRunEnrollments(gate2DemoRefs.courseRunRef))
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toHaveLength(12);
        expect(body.items.every((item: { synthetic: boolean }) => item.synthetic)).toBe(true);
      });

    const idempotencyKey = `gate27:create-replay:${randomUUID()}`;
    const created = await createDraft(idempotencyKey);
    const assignmentRef = created.body.assignment.assignmentRef as string;
    await request(app)
      .post(apiRoutes.teacher.assignments)
      .set(demoHeaders)
      .send({
        courseRunRef: gate2DemoRefs.courseRunRef,
        curriculumUnitRef: gate25DemoRefs.unitRef,
        lessonRef: gate27DemoRefs.sourceLessonRef,
        title: "斜率与图像变化课后练习",
        instructions: "请独立完成，简答题说明依据。",
        dueAt: "2026-09-19T10:00:00.000Z",
        items: assignmentItems(),
        purpose: "assignment.create",
        idempotencyKey
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
        expect(body.assignment.assignmentRef).toBe(assignmentRef);
      });

    const updated = await request(app)
      .put(apiRoutes.teacher.assignment(assignmentRef))
      .set(demoHeaders)
      .send({
        expectedVersion: created.body.assignment.version,
        title: "斜率与图像变化课后练习（教师修订）",
        instructions: "先独立完成，再标注判断依据。",
        dueAt: null,
        items: assignmentItems(),
        purpose: "assignment.update-draft",
        idempotencyKey: `gate27:update:${randomUUID()}`
      })
      .expect(201);
    expect(updated.body.assignment.currentVersionNumber).toBe(2);
    expect(updated.body.assignment.versionHistory).toHaveLength(2);

    const publishCommand = {
      expectedVersion: updated.body.assignment.version,
      purpose: "assignment.publish",
      idempotencyKey: `gate27:publish:${randomUUID()}`
    };
    const published = await request(app)
      .post(apiRoutes.teacher.assignmentPublish(assignmentRef))
      .set(demoHeaders)
      .send(publishCommand)
      .expect(201);
    expect(published.body.assignment.status).toBe("published");
    await request(app)
      .post(apiRoutes.teacher.assignmentPublish(assignmentRef))
      .set(demoHeaders)
      .send(publishCommand)
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
        expect(body.assignment.assignmentRef).toBe(assignmentRef);
      });

    await request(app)
      .put(apiRoutes.teacher.assignment(assignmentRef))
      .set(demoHeaders)
      .send({
        expectedVersion: published.body.assignment.version,
        title: "不允许覆盖的已发布作业",
        instructions: "",
        dueAt: null,
        items: assignmentItems(),
        purpose: "assignment.update-draft",
        idempotencyKey: `gate27:invalid-update:${randomUUID()}`
      })
      .expect(409);

    const versionRef = published.body.assignment.currentVersion.assignmentVersionRef;
    await expect(
      adminPool.query(
        `UPDATE education.assignment_version SET title = 'mutated' WHERE assignment_version_ref = $1`,
        [versionRef]
      )
    ).rejects.toThrow(/immutable/i);

    const closed = await request(app)
      .post(apiRoutes.teacher.assignmentClose(assignmentRef))
      .set(demoHeaders)
      .send({
        expectedVersion: published.body.assignment.version,
        purpose: "assignment.close",
        idempotencyKey: `gate27:close:${randomUUID()}`
      })
      .expect(201);
    expect(closed.body.assignment.status).toBe("closed");
    const archived = await request(app)
      .post(apiRoutes.teacher.assignmentArchive(assignmentRef))
      .set(demoHeaders)
      .send({
        expectedVersion: closed.body.assignment.version,
        purpose: "assignment.archive",
        idempotencyKey: `gate27:archive:${randomUUID()}`
      })
      .expect(201);
    expect(archived.body.assignment.status).toBe("archived");
  });

  it("keeps SubmissionAttempt immutable, distinguishes missing work, and versions confirmed Evidence", async () => {
    const { assignmentRef } = await publishAndImport();
    const list = await request(app)
      .get(apiRoutes.teacher.assignmentSubmissions(assignmentRef))
      .set(demoHeaders)
      .expect(200);
    expect(list.body.items).toHaveLength(12);
    expect(list.body.items.filter((item: { submissionState: string }) => item.submissionState === "not_submitted")).toHaveLength(2);
    expect(
      list.body.items
        .filter((item: { submissionState: string }) => item.submissionState === "not_submitted")
        .every((item: { score: number | null }) => item.score === null)
    ).toBe(true);

    const graded = await saveAndConfirmFirstSubmission(assignmentRef);
    await request(app)
      .post(
        apiRoutes.teacher.gradeDecisionConfirm(
          graded.confirmed.gradeDecisionRef
        )
      )
      .set(demoHeaders)
      .send(graded.confirmCommand)
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
        expect(body.decision.gradeDecisionRef).toBe(
          graded.confirmed.gradeDecisionRef
        );
      });
    await expect(
      adminPool.query(
        `UPDATE education.submission_attempt_details SET attempt_number = 2 WHERE attempt_ref = $1`,
        [graded.attempt.attemptRef]
      )
    ).rejects.toThrow(/immutable/i);
    await expect(
      adminPool.query(
        `UPDATE education.attempt SET response_summary = '{}'::jsonb WHERE attempt_ref = $1`,
        [graded.attempt.attemptRef]
      )
    ).rejects.toThrow(/immutable/i);

    const evidence = await request(app)
      .get(apiRoutes.teacher.assignmentEvidence(assignmentRef))
      .set(demoHeaders)
      .expect(200);
    expect(evidence.body.items).toHaveLength(3);
    expect(evidence.body.items[0]).toMatchObject({
      assignmentRef,
      attemptRef: graded.attempt.attemptRef,
      gradeDecisionRef: graded.confirmed.gradeDecisionRef,
      confirmationStatus: "teacher_confirmed",
      isCurrent: true
    });

    const learnerEvidence = await request(app)
      .get(apiRoutes.teacher.learnerEvidence(gate2DemoRefs.courseRunRef, graded.summary.learnerRef))
      .set(demoHeaders)
      .expect(200);
    expect(learnerEvidence.body.evidence).toHaveLength(3);

    const reopened = await request(app)
      .post(apiRoutes.teacher.gradeDecisionReopen(graded.confirmed.gradeDecisionRef))
      .set(demoHeaders)
      .send({
        expectedDecisionVersion: graded.confirmed.version,
        purpose: "assignment.grading.reopen",
        idempotencyKey: `gate27:reopen:${randomUUID()}`
      })
      .expect(201);
    expect(reopened.body.decision.status).toBe("draft");
    expect(reopened.body.decision.version).toBeGreaterThan(graded.confirmed.version);

    const savedAgain = await request(app)
      .post(apiRoutes.teacher.submissionGradeDraft(graded.summary.submissionRef))
      .set(demoHeaders)
      .send({
        expectedAttemptRef: graded.attempt.attemptRef,
        expectedDecisionVersion: reopened.body.decision.version,
        feedback: "复核后调整简答题反馈。",
        itemGrades: graded.itemGrades.map((item: { awardedScore: number }) => ({
          ...item,
          awardedScore: item.awardedScore
        })),
        purpose: "assignment.grading.save-draft",
        idempotencyKey: `gate27:grade-revision:${randomUUID()}`
      })
      .expect(201);
    await request(app)
      .post(apiRoutes.teacher.gradeDecisionConfirm(savedAgain.body.decision.gradeDecisionRef))
      .set(demoHeaders)
      .send({
        expectedDecisionVersion: savedAgain.body.decision.version,
        purpose: "assignment.grading.confirm",
        idempotencyKey: `gate27:confirm-revision:${randomUUID()}`
      })
      .expect(201);

    const sourceRows = await adminPool.query<{
      supersedes_observation_ref: string | null;
      is_current: boolean;
    }>(
      `SELECT source.supersedes_observation_ref,
              NOT EXISTS (
                SELECT 1 FROM education.assignment_evidence_source newer
                 WHERE newer.supersedes_observation_ref = source.observation_ref
              ) AS is_current
         FROM education.assignment_evidence_source source
        WHERE source.assignment_ref = $1`,
      [assignmentRef]
    );
    expect(sourceRows.rows).toHaveLength(6);
    expect(sourceRows.rows.filter((row) => row.is_current)).toHaveLength(3);
    expect(sourceRows.rows.filter((row) => row.supersedes_observation_ref)).toHaveLength(3);
  });

  it("allows one concurrent grade draft and creates an adjustment Task from only selected current Evidence", async () => {
    const { assignmentRef } = await publishAndImport();
    const submissions = await request(app)
      .get(apiRoutes.teacher.assignmentSubmissions(assignmentRef))
      .set(demoHeaders)
      .expect(200);
    const first = submissions.body.items.find(
      (item: { submissionRef: string | null }) => item.submissionRef
    );
    const detail = await request(app)
      .get(apiRoutes.teacher.submission(first.submissionRef))
      .set(demoHeaders)
      .expect(200);
    const attempt = detail.body.attempts.find((item: { isCurrent: boolean }) => item.isCurrent);
    const grades = attempt.itemResponses.map((response: { responseRef: string }, index: number) => ({
      responseRef: response.responseRef,
      outcome: index === 0 ? "incorrect" : "partial",
      awardedScore: index === 0 ? 0 : 1,
      feedback: "教师并发复核用例。"
    }));
    const base = {
      expectedAttemptRef: attempt.attemptRef,
      expectedDecisionVersion: 0,
      feedback: "并发批改",
      itemGrades: grades,
      purpose: "assignment.grading.save-draft"
    };
    const [left, right] = await Promise.all([
      request(app).post(apiRoutes.teacher.submissionGradeDraft(first.submissionRef)).set(demoHeaders).send({ ...base, idempotencyKey: `gate27:concurrent-left:${randomUUID()}` }),
      request(app).post(apiRoutes.teacher.submissionGradeDraft(first.submissionRef)).set(demoHeaders).send({ ...base, idempotencyKey: `gate27:concurrent-right:${randomUUID()}` })
    ]);
    expect([left.status, right.status].sort()).toEqual([201, 409]);
    const saved = left.status === 201 ? left.body : right.body;
    await request(app)
      .post(apiRoutes.teacher.gradeDecisionConfirm(saved.decision.gradeDecisionRef))
      .set(demoHeaders)
      .send({
        expectedDecisionVersion: saved.decision.version,
        purpose: "assignment.grading.confirm",
        idempotencyKey: `gate27:confirm:${randomUUID()}`
      })
      .expect(201);

    const analytics = await request(app)
      .get(apiRoutes.teacher.assignmentAnalytics(assignmentRef))
      .set(demoHeaders)
      .expect(200);
    expect(analytics.body.commonErrors.length).toBeGreaterThan(0);
    const selected = analytics.body.commonErrors[0];
    const adjustmentCommand = {
      assignmentRef,
      sourceLessonRef: gate27DemoRefs.sourceLessonRef,
      targetLessonRef: gate27DemoRefs.nextLessonRef,
      selectedEvidenceRefs: selected.evidenceRefs,
      selectedItemRefs: [selected.itemRef],
      dueAt: null,
      priority: "high",
      purpose: "assignment.adjust-next-lesson",
      idempotencyKey: `gate27:adjust:${randomUUID()}`
    };
    const adjusted = await request(app)
      .post(apiRoutes.teacher.assignmentAdjustment(assignmentRef))
      .set(demoHeaders)
      .send(adjustmentCommand)
      .expect(201);
    expect(adjusted.body.task).toMatchObject({
      taskType: "lesson_preparation",
      status: "planned",
      lessonRef: gate27DemoRefs.nextLessonRef,
      workingSet: {
        sourceLessonRef: gate27DemoRefs.sourceLessonRef,
        sourceAssignmentRef: assignmentRef,
        sourceAssignmentItemRefs: [selected.itemRef],
        evidenceRefs: selected.evidenceRefs
      }
    });
    await request(app)
      .post(apiRoutes.teacher.assignmentAdjustment(assignmentRef))
      .set(demoHeaders)
      .send(adjustmentCommand)
      .expect(200)
      .expect(({ body }) => {
        expect(body.replayed).toBe(true);
        expect(body.task.taskRef).toBe(adjusted.body.task.taskRef);
      });

    const started = await request(app)
      .post(apiRoutes.teacher.preparationTaskStart(adjusted.body.task.taskRef))
      .set(demoHeaders)
      .send({
        expectedVersion: adjusted.body.task.version,
        purpose: "lesson-preparation.start",
        idempotencyKey: `gate27:adjust-start:${randomUUID()}`
      })
      .expect(201);
    const proposal = await request(app)
      .post(apiRoutes.demo.createTeacherCopilotTask)
      .set(demoHeaders)
      .send({
        requestText: "仅根据教师明确选择的本次作业 Evidence 调整下一课。",
        courseRunRef: started.body.task.courseRunRef,
        goalRef: gate2DemoRefs.goalRef,
        learningObjectiveRefs: started.body.task.workingSet.learningObjectiveRefs,
        selectedEvidenceRefs: started.body.task.workingSet.evidenceRefs,
        requestVersion: 1,
        purpose: "teacher-copilot.adjust-next-lesson",
        idempotencyKey: `gate27:adjust-proposal:${randomUUID()}`,
        preparationTaskRef: started.body.task.taskRef,
        curriculumUnitRef: started.body.task.curriculumUnitRef,
        lessonRef: started.body.task.lessonRef,
        workingSetVersion: started.body.task.workingSet.version,
        expectedPreparationTaskVersion: started.body.task.version
      })
      .expect(201);
    expect(proposal.body.proposalRevisionRef).toBeTruthy();
    const sealed = await request(app)
      .get(apiRoutes.teacher.taskContextManifest(started.body.task.taskRef))
      .set(demoHeaders)
      .expect(200);
    expect(sealed.body.evidenceRefs).toEqual(selected.evidenceRefs);
    expect(sealed.body.resourceRefs).toEqual(
      expect.arrayContaining([
        assignmentRef,
        selected.itemRef,
        gate27DemoRefs.sourceLessonRef,
        gate27DemoRefs.nextLessonRef
      ])
    );

    await request(app)
      .post(apiRoutes.teacher.assignmentAdjustment(assignmentRef))
      .set(demoHeaders)
      .send({
        ...adjustmentCommand,
        selectedEvidenceRefs: ["evidence-observation:not-authorized"],
        idempotencyKey: `gate27:invalid-evidence:${randomUUID()}`
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe("EVIDENCE_SELECTION_NOT_AUTHORIZED");
      });

    const restarted = createProductContainer(postgresEnvironment);
    const restartedApp = createApp({ product: restarted });
    try {
      await request(restartedApp)
        .get(apiRoutes.teacher.preparationTask(adjusted.body.task.taskRef))
        .set(demoHeaders)
        .expect(200)
        .expect(({ body }) => {
          expect(body.workingSet.evidenceRefs).toEqual(selected.evidenceRefs);
          expect(body.workingSet.sourceAssignmentRef).toBe(assignmentRef);
        });
    } finally {
      await restarted.close();
    }
  });

  it("keeps assignment overview derived and prevents another tenant from reading the CourseRun", async () => {
    const draft = await createDraft();
    await request(app)
      .get(apiRoutes.teacher.assignmentOverview)
      .set(demoHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body.draftCount).toBe(1);
        expect(body.notSubmittedCount).toBe(0);
      });
    await request(app)
      .get(apiRoutes.teacher.assignment(draft.body.assignment.assignmentRef))
      .set({
        ...demoHeaders,
        "x-demo-tenant": "tenant:another-school"
      })
      .expect(403);
  });
});

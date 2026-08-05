import { randomUUID } from "node:crypto";

import {
  DecideLessonBriefResultSchema,
  GenerateLessonBriefResultSchema,
  LessonBriefStateSchema,
  LessonJourneyProjectionSchema,
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

describe("Phase 8A-1 Lesson Brief API", () => {
  it("persists an explainable candidate and makes Journey wait for the teacher", async () => {
    const lessonRef = gate25DemoRefs.lessonRefs.slopeAndGraph;
    const empty = await request(app)
      .get(apiRoutes.teacher.lessonBrief(lessonRef))
      .set(demoHeaders)
      .expect(200);
    expect(LessonBriefStateSchema.parse(empty.body).current).toBeNull();

    const idempotencyKey = `lesson-brief:${randomUUID()}`;
    const generatedResponse = await request(app)
      .post(apiRoutes.teacher.generateLessonBrief(lessonRef))
      .set(demoHeaders)
      .send({
        purpose: "lesson-brief.generate",
        idempotencyKey,
        teacherAdjustment: "本班需要先用一个简短例子建立直观理解"
      })
      .expect(201);
    const generated = GenerateLessonBriefResultSchema.parse(
      generatedResponse.body
    );

    expect(generated).toMatchObject({
      replayed: false,
      brief: {
        lessonRef,
        status: "waiting_for_teacher",
        generatedBySkillRef: "lesson-analysis@1"
      }
    });
    expect(generated.brief.contextManifestHash).toHaveLength(64);
    expect(generated.brief.knownGaps).toEqual(expect.arrayContaining([
      "尚未接入教材知识源",
      "尚未接入课程标准知识源",
      "尚未接入考点知识源"
    ]));
    expect(generated.brief.sourceRefs.filter((source) =>
      source.kind === "evidence" && source.included
    ).map((source) => source.ref)).toEqual(
      generated.brief.classEvidenceSummary.map((item) => item.evidenceRef)
    );

    const replay = await request(app)
      .post(apiRoutes.teacher.generateLessonBrief(lessonRef))
      .set(demoHeaders)
      .send({
        purpose: "lesson-brief.generate",
        idempotencyKey,
        teacherAdjustment: "本班需要先用一个简短例子建立直观理解"
      })
      .expect(201);
    expect(GenerateLessonBriefResultSchema.parse(replay.body)).toMatchObject({
      replayed: true,
      brief: { agentRunRef: generated.brief.agentRunRef }
    });

    const recovered = await request(app)
      .get(apiRoutes.teacher.lessonBrief(lessonRef))
      .set(demoHeaders)
      .expect(200);
    expect(LessonBriefStateSchema.parse(recovered.body).current).toEqual(
      generated.brief
    );

    const journey = await request(app)
      .get(apiRoutes.teacher.lessonJourney(lessonRef))
      .set(demoHeaders)
      .expect(200);
    expect(LessonJourneyProjectionSchema.parse(journey.body)).toMatchObject({
      currentStage: "understand",
      status: "waiting_for_teacher",
      nextBestAction: { kind: "review_lesson_brief" }
    });
  });

  it("adopts only selected candidates into TaskWorkingSet without changing Lesson truth", async () => {
    const lessonRef = gate25DemoRefs.lessonRefs.linearFunctionApplication;
    const beforeLesson = await request(app)
      .get(apiRoutes.teacher.lesson(lessonRef))
      .set(demoHeaders)
      .expect(200);
    const workingSetResponse = await request(app)
      .get(apiRoutes.teacher.taskWorkingSet(gate25DemoRefs.seededPreparationTaskRef))
      .set(demoHeaders)
      .expect(200);

    const generatedResponse = await request(app)
      .post(apiRoutes.teacher.generateLessonBrief(lessonRef))
      .set(demoHeaders)
      .send({
        purpose: "lesson-brief.generate",
        idempotencyKey: `lesson-brief:${randomUUID()}`,
        teacherAdjustment: null
      })
      .expect(201);
    const generated = GenerateLessonBriefResultSchema.parse(
      generatedResponse.body
    );
    const selectedCandidateIds = [
      generated.brief.teachingFocusCandidates[0]?.candidateId,
      generated.brief.difficultyCandidates[0]?.candidateId
    ].filter((value): value is string => Boolean(value));

    const decidedResponse = await request(app)
      .post(apiRoutes.teacher.decideLessonBrief(
        lessonRef,
        generated.brief.agentRunRef
      ))
      .set(demoHeaders)
      .send({
        purpose: "lesson-brief.decide",
        idempotencyKey: `lesson-brief-decision:${randomUUID()}`,
        expectedContentHash: generated.brief.contentHash,
        action: "adopt",
        selectedCandidateIds,
        preparationTaskRef: gate25DemoRefs.seededPreparationTaskRef,
        expectedWorkingSetVersion: workingSetResponse.body.version
      })
      .expect(200);
    const decided = DecideLessonBriefResultSchema.parse(decidedResponse.body);

    expect(decided.brief).toMatchObject({
      status: "adopted",
      disposition: {
        action: "adopted",
        selectedCandidateIds,
        teacherRef: gate2DemoRefs.teacherRef,
        taskRef: gate25DemoRefs.seededPreparationTaskRef
      }
    });
    expect(decided.workingSet?.sourceResourceRefs).toContain(
      `lesson-brief-run:${generated.brief.agentRunRef}`
    );

    const afterLesson = await request(app)
      .get(apiRoutes.teacher.lesson(lessonRef))
      .set(demoHeaders)
      .expect(200);
    expect(afterLesson.body).toEqual(beforeLesson.body);
  });

  it("does not reveal or generate a Brief for a Lesson outside the workspace", async () => {
    const foreignLessonRef = "lesson:school-b-linear-function-application";

    await request(app)
      .get(apiRoutes.teacher.lessonBrief(foreignLessonRef))
      .set(demoHeaders)
      .expect(404);
    await request(app)
      .post(apiRoutes.teacher.generateLessonBrief(foreignLessonRef))
      .set(demoHeaders)
      .send({
        purpose: "lesson-brief.generate",
        idempotencyKey: `lesson-brief:${randomUUID()}`,
        teacherAdjustment: null
      })
      .expect(404);
  });
});

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const files = {
  contracts: "packages/contracts/src/gate2-9.ts",
  service: "apps/api/src/composition/postgres-classroom-reflection-service.ts",
  model: "apps/api/src/composition/postgres-model-invocation-service.ts",
  educationMigration: "apps/api/src/modules/education-domain/infrastructure/migrations/0006_gate2_9_classroom_implementation.sql",
  artifactMigration: "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0009_gate2_9_lesson_reflections.sql",
  workMigration: "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0009_gate2_9_reflection_workflow.sql",
  webRoute: "apps/web/src/route.ts"
} as const;

async function source(path: string) {
  return readFile(path, "utf8");
}

describe("Gate 2.9 architecture invariants", () => {
  it("keeps formal classroom facts in Education, reflections in Artifact, and work coordination in Work", async () => {
    const [education, artifact, work] = await Promise.all([
      source(files.educationMigration),
      source(files.artifactMigration),
      source(files.workMigration)
    ]);
    expect(education).toContain("education.lesson_delivery");
    expect(education).toContain("education.observed_pedagogical_move");
    expect(education).toContain("education.classroom_observation");
    expect(artifact).toContain("artifact.lesson_reflection_scope");
    expect(work).toContain("work.lesson_reflection_task_details");
    expect(work).toContain("work.reflection_follow_up_link");
    expect(`${education}\n${artifact}\n${work}`).not.toMatch(/CREATE SCHEMA/i);
  });

  it("materializes implementation facts only in the teacher confirmation command", async () => {
    const service = await source(files.service);
    const createBody = service.slice(service.indexOf("async createDelivery"), service.indexOf("async getDelivery"));
    const confirmBody = service.slice(service.indexOf("async confirmDelivery"), service.indexOf("async createObservation"));
    expect(createBody).not.toContain("observed-move:");
    expect(confirmBody).toContain("observed-move:");
    expect(confirmBody).toContain("instructional-decision:");
    expect(confirmBody).toContain('eventName: "LessonDeliveryConfirmed"');
  });

  it("keeps Reflection output as a draft-only model result with selected sealed context", async () => {
    const [contracts, model] = await Promise.all([
      source(files.contracts),
      source(files.model)
    ]);
    expect(contracts).toContain('teacherApprovalRequired: z.literal(true)');
    expect(model).toContain('resultKind: "lesson_reflection_draft"');
    expect(model).toContain("validateConfirmedObservations");
    expect(model).toContain("validateAssignmentEvidence");
    expect(model).not.toContain('resultKind: "approved_reflection"');
  });

  it("provides a recoverable Reflection deep link without adding a primary route", async () => {
    const route = await source(files.webRoute);
    expect(route).toContain('/agent/reflections/');
    expect(route).toContain("navigateReflection");
    const primaryRoutes = route.slice(route.indexOf("export const appRoutes"), route.indexOf("] as const"));
    expect(primaryRoutes).not.toContain('"/reflections"');
  });
});

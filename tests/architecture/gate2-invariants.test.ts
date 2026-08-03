import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

describe("Gate 2 architecture invariants", () => {
  it("keeps suggestion disposition separate from implementation facts", () => {
    const workMigration = source(
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0003_gate2_teacher_copilot.sql"
    );
    expect(workMigration).toContain(
      "implementation_observed boolean NOT NULL DEFAULT false"
    );
    expect(workMigration).toContain(
      "CHECK (implementation_observed = false)"
    );

    const allGate2Migrations = [
      workMigration,
      source(
        "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0003_gate2_structured_revision.sql"
      ),
      source(
        "apps/api/src/modules/agent-runtime-context/infrastructure/migrations/0003_gate2_context_manifest.sql"
      ),
      source(
        "apps/api/src/modules/capability-integration/infrastructure/migrations/0003_gate2_model_execution.sql"
      ),
      source(
        "apps/api/src/modules/education-domain/infrastructure/migrations/0003_gate2_course_view.sql"
      )
    ].join("\n");
    expect(allGate2Migrations).not.toMatch(
      /CREATE\s+TABLE[\s\S]{0,100}\b(?:instructional_decision|observed_pedagogical_move)\b/i
    );
  });

  it("makes every TeachingPlan change a new immutable revision", () => {
    const migration = source(
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0003_gate2_structured_revision.sql"
    );
    expect(migration).toContain("'in_review'");
    expect(migration).toContain(
      "CREATE TRIGGER artifact_revision_immutable"
    );
    expect(migration).not.toMatch(
      /UPDATE\s+artifact\.artifact_revision/i
    );
  });

  it("keeps the Mock provider external-network-free", () => {
    const capabilityMigration = source(
      "apps/api/src/modules/capability-integration/infrastructure/migrations/0003_gate2_model_execution.sql"
    );
    expect(capabilityMigration).toContain(
      "CHECK (external_network_used = false)"
    );
    const service = source(
      "apps/api/src/composition/postgres-gate2-teacher-copilot-service.ts"
    );
    expect(service).not.toMatch(
      /\b(?:fetch|axios|DeepSeek|CloudBase|Netlify)\b/
    );
  });

  it("keeps the OpenAI-compatible SDK inside the server integration adapter", () => {
    const apiPackage = source("apps/api/package.json");
    const webPackage = source("apps/web/package.json");
    const arkAdapter = source(
      "apps/api/src/modules/capability-integration/infrastructure/volcengine-ark-provider.ts"
    );
    const providerPort = source(
      "apps/api/src/modules/capability-integration/domain/capability.ts"
    );
    const invocationService = source(
      "apps/api/src/composition/postgres-model-invocation-service.ts"
    );

    expect(apiPackage).toContain('"openai"');
    expect(webPackage).not.toContain('"openai"');
    expect(arkAdapter).toContain('from "openai"');
    expect(providerPort).not.toContain('from "openai"');
    expect(invocationService).not.toContain('from "openai"');
    expect(source("packages/contracts/src/gate2-6a.ts")).not.toContain(
      'from "openai"'
    );
  });

  it("keeps the teacher UI centered on daily work rather than system concepts", () => {
    const app = source("apps/web/src/App.tsx");
    const sidebar = source(
      "apps/web/src/components/portal/TeacherSidebar.tsx"
    );
    const overview = source(
      "apps/web/src/pages/OverviewPage.tsx"
    );
    const agent = source(
      "apps/web/src/pages/AgentWorkspacePage.tsx"
    );
    for (const route of [
      "概览",
      "日程",
      "教学",
      "学生",
      "文件",
      "Agent"
    ]) {
      expect(sidebar).toContain(route);
    }
    expect(sidebar).not.toContain("学习证据");
    expect(sidebar).not.toContain("运行记录");
    expect(agent).toContain("从备课任务开始");
    expect(agent).toContain("loadLessonPreparationTasks");
    expect(agent).not.toContain("sessionStorage");
    expect(overview).toContain("今天需要做什么");
    expect(overview).toContain("今日课程");
    expect(overview).toContain("学生概况");
    expect(overview).not.toContain("备课组动态");
    expect(overview).not.toContain("学校动态");
    expect(overview).toContain("最近文件");
    expect(app).not.toMatch(/Chat(Input|Box)|聊天框/);
  });

  it("centralizes the bright blue design and presentation vocabulary", () => {
    const tokens = source("apps/web/src/design-tokens.ts");
    const main = source("apps/web/src/main.tsx");
    const presentation = source("apps/web/src/presentation.ts");
    const overview = source(
      "apps/web/src/pages/OverviewPage.tsx"
    );

    expect(tokens).toContain('colorBrand: "#3370FF"');
    expect(tokens).toContain(
      'sidebarWidth: "260px"'
    );
    expect(main).toContain("installDesignTokens");
    expect(main).toContain("theme={antdTheme}");
    expect(presentation).toContain("teachingPlanStateLabel");
    expect(presentation).toContain("合成学生");
    expect(overview).not.toContain("明日教学重点");
    expect(overview).not.toContain("我的常用");
    expect(overview).toContain("今日课程");
    expect(overview).not.toContain("备课组动态");
    expect(overview).toContain("最近文件");
  });

  it("uses one shared route contract instead of handwritten web paths", () => {
    const webApi = source("apps/web/src/api.ts");
    const apiApp = source("apps/api/src/app.ts");
    const routeContract = source(
      "packages/contracts/src/api-routes.ts"
    );

    expect(webApi).toContain("apiRoutes.");
    expect(apiApp).toContain("apiRoutes.");
    expect(webApi).not.toMatch(/["'`]\/api\//);
    expect(apiApp).not.toMatch(/["'`]\/api\//);
    expect(routeContract).toContain(
      'bootstrap: "/api/v1/demo/workspace"'
    );
  });

  it("keeps product and internal test composition roots separate", () => {
    const apiIndex = source("apps/api/src/index.ts");
    const apiApp = source("apps/api/src/app.ts");
    const productContainer = source(
      "apps/api/src/composition/product-container.ts"
    );
    const testContainer = source(
      "apps/api/src/composition/test-container.ts"
    );

    expect(apiIndex).toContain("createProductContainer");
    expect(apiIndex).not.toContain("createTestContainer");
    expect(apiIndex).not.toContain("createGate1AContainer");
    expect(productContainer).toContain("createRolePool");
    expect(productContainer).not.toContain("InMemory");
    expect(testContainer).toContain("createTestContainer");
    expect(apiApp).toContain("exposeInternalTestRoutes");
    expect(apiApp).toContain("product.services");
  });

  it("persists the typed teacher request through Task, Contract, ContextManifest and model input", () => {
    const contracts = source("packages/contracts/src/gate2.ts");
    const service = source(
      "apps/api/src/composition/postgres-gate2-teacher-copilot-service.ts"
    );
    const workMigration = source(
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0004_gate2_4_task_request_and_disposition.sql"
    );
    const runtimeMigration = source(
      "apps/api/src/modules/agent-runtime-context/infrastructure/migrations/0004_gate2_4_request_context.sql"
    );

    for (const field of [
      "requestText",
      "actorRef",
      "purpose",
      "courseRunRef",
      "learningObjectiveRefs",
      "selectedEvidenceRefs",
      "createdAt",
      "requestVersion"
    ]) {
      expect(contracts).toContain(field);
    }
    expect(workMigration).toContain("request_payload jsonb");
    expect(runtimeMigration).toContain("request_summary jsonb");
    expect(service).toContain("contractPayload");
    expect(service).toContain("taskRequest");
    expect(service).toContain(
      "requestText: taskRequest.requestText"
    );
  });

  it("uses explicit approved and in-review pointers and runs only the local Gate 2.4 Outbox consumer", () => {
    const artifactMigration = source(
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0004_gate2_4_teaching_plan_lifecycle.sql"
    );
    const routes = source("packages/contracts/src/api-routes.ts");
    const worker = source(
      "apps/api/src/composition/local-copilot-outbox-worker.ts"
    );
    const productContainer = source(
      "apps/api/src/composition/product-container.ts"
    );

    expect(artifactMigration).toContain(
      "current_approved_revision_ref"
    );
    expect(artifactMigration).toContain(
      "current_in_review_revision_ref"
    );
    expect(routes).toContain("currentApprovedTeachingPlan");
    expect(routes).toContain("currentInReviewTeachingPlan");
    expect(routes).toContain("teachingPlanDrafts");
    expect(routes).toContain("teachingPlanHistory");
    expect(routes).not.toContain("latestTeachingPlan");
    for (const eventName of [
      "TeacherCopilotTaskCompleted",
      "SuggestionDisposed",
      "TeachingPlanApproved"
    ]) {
      expect(worker).toContain(eventName);
    }
    expect(productContainer).toContain(
      "LocalCopilotOutboxWorker"
    );
    expect(productContainer).not.toContain("InMemory");
  });

  it("keeps Gate 2.5 Lesson preparation on the existing Task aggregate and PostgreSQL Product root", () => {
    const contracts = source("packages/contracts/src/gate2-5.ts");
    const app = source("apps/api/src/app.ts");
    const productContainer = source(
      "apps/api/src/composition/product-container.ts"
    );
    const workMigration = source(
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0005_gate2_5_lesson_preparation.sql"
    );
    const runtimeMigration = source(
      "apps/api/src/modules/agent-runtime-context/infrastructure/migrations/0005_gate2_5_authorized_context_plan.sql"
    );

    expect(workMigration).toContain(
      "REFERENCES work.task (task_ref)"
    );
    expect(workMigration).toContain(
      "CREATE TABLE IF NOT EXISTS work.task_working_set"
    );
    expect(runtimeMigration).toContain(
      "CREATE TABLE IF NOT EXISTS runtime.authorized_context_plan"
    );
    expect(contracts).not.toContain("TeacherWorkItem");
    expect(contracts).not.toContain("AgentContextBinding");
    expect(productContainer).toContain(
      "PostgresLessonPreparationService"
    );
    expect(productContainer).not.toContain("InMemory");
    expect(app).toContain("product.services.lessonPreparation");
    expect(app).toContain(
      "product.teacher.lesson-preparation.tasks.create"
    );
  });

  it("enforces one active in-review and one current approved plan per Lesson", () => {
    const educationMigration = source(
      "apps/api/src/modules/education-domain/infrastructure/migrations/0004_gate2_5_curriculum_and_lessons.sql"
    );
    const artifactMigration = source(
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0005_gate2_5_lesson_plan_scope.sql"
    );
    const worker = source(
      "apps/api/src/composition/local-copilot-outbox-worker.ts"
    );

    expect(educationMigration).toContain(
      "CREATE TABLE IF NOT EXISTS education.curriculum_unit"
    );
    expect(educationMigration).toContain(
      "CREATE TABLE IF NOT EXISTS education.lesson"
    );
    expect(educationMigration).toContain(
      "CREATE TABLE IF NOT EXISTS education.lesson_evidence_link"
    );
    expect(artifactMigration).toContain(
      "teaching_plan_active_review_unique"
    );
    expect(artifactMigration).toContain(
      "WHERE lifecycle_status = 'active_in_review'"
    );
    expect(artifactMigration).toContain(
      "teaching_plan_current_approved_unique"
    );
    expect(artifactMigration).toContain(
      "WHERE lifecycle_status = 'current_approved'"
    );
    for (const eventName of [
      "LessonPreparationTaskCreated",
      "LessonPreparationStarted",
      "TeachingPlanReviewCreated",
      "LessonPreparationReadyForUse",
      "LessonPreparationCompleted"
    ]) {
      expect(worker).toContain(eventName);
    }
    expect(worker).toContain(
      "none-business-state-synchronous"
    );
  });

  it("keeps Gate 2.5B file truth in Artifact and binary storage behind the Capability port", () => {
    const contracts = source("packages/contracts/src/gate2-5b.ts");
    const migration = source(
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0006_gate2_5b_file_artifacts.sql"
    );
    const productContainer = source(
      "apps/api/src/composition/product-container.ts"
    );
    const objectStore = source(
      "apps/api/src/modules/capability-integration/domain/object-store.ts"
    );
    const localAdapter = source(
      "apps/api/src/modules/capability-integration/infrastructure/local-object-store.ts"
    );
    const fileService = source(
      "apps/api/src/composition/postgres-file-artifact-service.ts"
    );

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS artifact.file_asset");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS artifact.file_version");
    expect(migration).toContain("artifact_file_binding");
    expect(migration).toContain("file_version_immutable");
    expect(migration).not.toContain("CREATE SCHEMA");
    expect(contracts).not.toContain("FileManager");
    expect(objectStore).toContain("export interface ObjectStore");
    expect(localAdapter).toContain("randomUUID");
    expect(localAdapter).toContain("assertWithinRoot");
    expect(productContainer).toContain("PostgresFileArtifactService");
    expect(productContainer).toContain("LocalObjectStore");
    expect(productContainer).not.toContain("FileManager");
    expect(fileService).toContain("TEACHING_PLAN_DOCX_TEMPLATE_VERSION");
    expect(fileService).toContain("TEACHING_PLAN_EXPORT_REQUIRES_APPROVED_REVISION");
    expect(fileService).not.toContain("MockModelProvider");
  });

  it("keeps fonts self-hosted, licensed and honest about delivery tradeoffs", () => {
    const fonts = source("apps/web/src/fonts.css");
    const attribution = source(
      "apps/web/public/fonts/attribution.md"
    );
    const styleGuide = source(
      "apps/web/src/pages/TeacherStyleGuidePage.tsx"
    );

    expect(fonts).not.toMatch(/https?:\/\//);
    expect(fonts).toContain(
      '/fonts/harmonyos-sans-sc/HarmonyOS_Sans_SC.ttf'
    );
    expect(attribution).toContain("HarmonyOS Sans SC / 鸿蒙黑体");
    expect(attribution).toContain("Font internal version: 2.040");
    expect(attribution).toContain(
      "licenses/HarmonyOS-Sans-License.txt"
    );
    expect(attribution).toContain("v1.011");
    expect(attribution).toContain(
      "8c6a9bb9732545b9ed53f29ec5e1ab0ff53c4e6f"
    );
    expect(styleGuide).toContain("HarmonyOS Sans SC 2.040");
    expect(styleGuide).toContain("加载失败时回退");
  });
});

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

  it("keeps the teacher UI centered on daily work rather than system concepts", () => {
    const app = source("apps/web/src/App.tsx");
    const sidebar = source(
      "apps/web/src/components/portal/TeacherSidebar.tsx"
    );
    const overview = source(
      "apps/web/src/pages/OverviewPage.tsx"
    );
    const agent = source(
      "apps/web/src/components/portal/AgentComponents.tsx"
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
    expect(agent).toContain("有什么可以帮你？");
    expect(agent).toContain("描述你想完成的教学任务");
    expect(overview).toContain("今天需要做什么");
    expect(overview).toContain("今日课程");
    expect(overview).toContain("学生概况");
    expect(overview).toContain("备课组动态");
    expect(overview).toContain("学校动态");
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
    expect(overview).toContain("备课组动态");
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

  it("keeps fonts self-hosted, licensed and honest about delivery tradeoffs", () => {
    const fonts = source("apps/web/src/fonts.css");
    const attribution = source(
      "apps/web/public/fonts/ATTRIBUTION.md"
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

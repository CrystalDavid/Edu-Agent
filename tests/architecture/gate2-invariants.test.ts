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
    const dashboard = source(
      "apps/web/src/pages/DashboardPage.tsx"
    );
    for (const route of [
      "工作台",
      "日程",
      "课程",
      "学生",
      "作业",
      "文件"
    ]) {
      expect(app).toContain(route);
    }
    expect(app).toContain(
      "搜索课程、学生和文件，或告诉我你想完成什么"
    );
    expect(app).toContain("准备明天的课程");
    expect(dashboard).toContain("今日课程");
    expect(dashboard).toContain("快捷操作");
    expect(dashboard).toContain("需要处理");
    expect(dashboard).toContain("备课与课件");
    expect(dashboard).toContain("学生学习情况");
    expect(dashboard).toContain("今日日程与待办");
    expect(app).not.toMatch(/Chat(Input|Box)|聊天框/);
  });

  it("centralizes the bright blue design and presentation vocabulary", () => {
    const tokens = source("apps/web/src/design-tokens.ts");
    const main = source("apps/web/src/main.tsx");
    const presentation = source("apps/web/src/presentation.ts");
    const dashboard = source(
      "apps/web/src/pages/DashboardPage.tsx"
    );

    expect(tokens).toContain('colorBrand: "#3370FF"');
    expect(tokens).toContain(
      'sidebarWidth: "68px"'
    );
    expect(main).toContain("installDesignTokens");
    expect(main).toContain("theme={antdTheme}");
    expect(presentation).toContain("teachingPlanStateLabel");
    expect(presentation).toContain("合成学生");
    expect(dashboard).not.toContain("明日教学重点");
    expect(dashboard).not.toContain("我的常用");
    expect(dashboard).toContain("今日课程");
    expect(dashboard).toContain("备课与课件");
    expect(dashboard).toContain("最近文件");
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

  it("keeps fonts self-hosted, pinned and honest about Simplified Chinese", () => {
    const fonts = source("apps/web/src/fonts.css");
    const attribution = source(
      "apps/web/public/fonts/ATTRIBUTION.md"
    );
    const styleGuide = source(
      "apps/web/src/pages/StyleGuidePage.tsx"
    );

    expect(fonts).not.toMatch(/https?:\/\//);
    expect(attribution).toContain("v1.011");
    expect(attribution).toContain(
      "8c6a9bb9732545b9ed53f29ec5e1ab0ff53c4e6f"
    );
    expect(styleGuide).toContain(
      "昭源環方不宣称完整支持简化字"
    );
    expect(styleGuide).toContain("font-system-sc");
  });
});

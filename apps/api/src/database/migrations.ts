export const moduleMigrations = [
  {
    owner: "governance",
    relativePath:
      "apps/api/src/modules/identity-governance-audit/infrastructure/migrations/0001_governance.sql"
  },
  {
    owner: "governance",
    relativePath:
      "apps/api/src/modules/identity-governance-audit/infrastructure/migrations/0002_gate1b_governance.sql"
  },
  {
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0001_work.sql"
  },
  {
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0002_gate1b_work.sql"
  },
  {
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0003_gate2_teacher_copilot.sql"
  },
  {
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0004_gate2_4_task_request_and_disposition.sql"
  },
  {
    owner: "runtime",
    relativePath:
      "apps/api/src/modules/agent-runtime-context/infrastructure/migrations/0001_runtime.sql"
  },
  {
    owner: "runtime",
    relativePath:
      "apps/api/src/modules/agent-runtime-context/infrastructure/migrations/0002_gate1b_runtime.sql"
  },
  {
    owner: "runtime",
    relativePath:
      "apps/api/src/modules/agent-runtime-context/infrastructure/migrations/0003_gate2_context_manifest.sql"
  },
  {
    owner: "runtime",
    relativePath:
      "apps/api/src/modules/agent-runtime-context/infrastructure/migrations/0004_gate2_4_request_context.sql"
  },
  {
    owner: "capability",
    relativePath:
      "apps/api/src/modules/capability-integration/infrastructure/migrations/0001_capability.sql"
  },
  {
    owner: "capability",
    relativePath:
      "apps/api/src/modules/capability-integration/infrastructure/migrations/0002_gate1b_capability.sql"
  },
  {
    owner: "capability",
    relativePath:
      "apps/api/src/modules/capability-integration/infrastructure/migrations/0003_gate2_model_execution.sql"
  },
  {
    owner: "artifact",
    relativePath:
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0001_artifact.sql"
  },
  {
    owner: "artifact",
    relativePath:
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0002_gate1b_artifact.sql"
  },
  {
    owner: "artifact",
    relativePath:
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0003_gate2_structured_revision.sql"
  },
  {
    owner: "artifact",
    relativePath:
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0004_gate2_4_teaching_plan_lifecycle.sql"
  },
  {
    owner: "education",
    relativePath:
      "apps/api/src/modules/education-domain/infrastructure/migrations/0001_education.sql"
  },
  {
    owner: "education",
    relativePath:
      "apps/api/src/modules/education-domain/infrastructure/migrations/0002_gate1b_education.sql"
  },
  {
    owner: "education",
    relativePath:
      "apps/api/src/modules/education-domain/infrastructure/migrations/0003_gate2_course_view.sql"
  },
  {
    owner: "personalization",
    relativePath:
      "apps/api/src/modules/personalization-memory-analytics/infrastructure/migrations/0001_personalization.sql"
  }
] as const;

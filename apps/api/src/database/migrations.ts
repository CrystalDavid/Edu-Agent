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
    owner: "governance",
    relativePath:
      "apps/api/src/modules/identity-governance-audit/infrastructure/migrations/0003_gate2_6a_model_data_manifest.sql"
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
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0005_gate2_5_lesson_preparation.sql"
  },
  {
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0006_gate2_6a_task_run_lifecycle.sql"
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
    owner: "runtime",
    relativePath:
      "apps/api/src/modules/agent-runtime-context/infrastructure/migrations/0005_gate2_5_authorized_context_plan.sql"
  },
  {
    owner: "runtime",
    relativePath:
      "apps/api/src/modules/agent-runtime-context/infrastructure/migrations/0006_gate2_6a_agent_run_lifecycle.sql"
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
    owner: "capability",
    relativePath:
      "apps/api/src/modules/capability-integration/infrastructure/migrations/0004_gate2_6a_model_execution_lifecycle.sql"
  },
  {
    owner: "capability",
    relativePath:
      "apps/api/src/modules/capability-integration/infrastructure/migrations/0005_gate2_6a_live_capability_acceptance.sql"
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
    owner: "artifact",
    relativePath:
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0005_gate2_5_lesson_plan_scope.sql"
  },
  {
    owner: "artifact",
    relativePath:
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0006_gate2_5b_file_artifacts.sql"
  },
  {
    owner: "artifact",
    relativePath:
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0007_gate2_5b_shared_object_keys.sql"
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
    owner: "education",
    relativePath:
      "apps/api/src/modules/education-domain/infrastructure/migrations/0004_gate2_5_curriculum_and_lessons.sql"
  },
  {
    owner: "personalization",
    relativePath:
      "apps/api/src/modules/personalization-memory-analytics/infrastructure/migrations/0001_personalization.sql"
  }
] as const;

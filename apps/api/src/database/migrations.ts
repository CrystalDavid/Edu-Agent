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
    owner: "governance",
    relativePath:
      "apps/api/src/modules/identity-governance-audit/infrastructure/migrations/0004_gate2_9_reflection_model_data.sql"
  },
  {
    owner: "governance",
    relativePath:
      "apps/api/src/modules/identity-governance-audit/infrastructure/migrations/0005_gate2_10a_identity_organization.sql"
  },
  {
    owner: "governance",
    relativePath:
      "apps/api/src/modules/identity-governance-audit/infrastructure/migrations/0006_gate2_10a_model_data_scope.sql"
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
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0007_gate2_7_assignment_work_context.sql"
  },
  {
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0008_gate2_8_teacher_workbench.sql"
  },
  {
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0009_gate2_9_reflection_workflow.sql"
  },
  {
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0010_calendar_event_categories.sql"
  },
  {
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0011_next_lesson_action_candidates.sql"
  },
  {
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0012_conversation_thread_turn.sql"
  },
  {
    owner: "work",
    relativePath:
      "apps/api/src/modules/work-assistant-durable-execution/infrastructure/migrations/0013_explicit_memory_command_turn.sql"
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
    owner: "runtime",
    relativePath:
      "apps/api/src/modules/agent-runtime-context/infrastructure/migrations/0007_working_memory_snapshot.sql"
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
    owner: "capability",
    relativePath:
      "apps/api/src/modules/capability-integration/infrastructure/migrations/0006_gate2_9_model_result_kind.sql"
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
    owner: "artifact",
    relativePath:
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0008_gate2_7_assignment_file_bindings.sql"
  },
  {
    owner: "artifact",
    relativePath:
      "apps/api/src/modules/artifact-collaboration/infrastructure/migrations/0009_gate2_9_lesson_reflections.sql"
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
    owner: "education",
    relativePath:
      "apps/api/src/modules/education-domain/infrastructure/migrations/0005_gate2_7_assignment_learning_evidence.sql"
  },
  {
    owner: "education",
    relativePath:
      "apps/api/src/modules/education-domain/infrastructure/migrations/0006_gate2_9_classroom_implementation.sql"
  },
  {
    owner: "personalization",
    relativePath:
      "apps/api/src/modules/personalization-memory-analytics/infrastructure/migrations/0001_personalization.sql"
  },
  {
    owner: "personalization",
    relativePath:
      "apps/api/src/modules/personalization-memory-analytics/infrastructure/migrations/0002_phase7a_memory_persistence.sql"
  },
  {
    owner: "personalization",
    relativePath:
      "apps/api/src/modules/personalization-memory-analytics/infrastructure/migrations/0003_memory_application_observability.sql"
  },
  {
    owner: "personalization",
    relativePath:
      "apps/api/src/modules/personalization-memory-analytics/infrastructure/migrations/0004_teacher_preference_scope_and_epoch.sql"
  }
] as const;

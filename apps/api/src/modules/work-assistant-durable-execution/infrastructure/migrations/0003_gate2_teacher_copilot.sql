ALTER TABLE work.task
  ADD COLUMN IF NOT EXISTS task_kind text NOT NULL
    DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS case_ref text,
  ADD COLUMN IF NOT EXISTS goal_ref text;

CREATE TABLE IF NOT EXISTS work.case_record (
  case_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  case_type text NOT NULL
    CHECK (case_type IN ('TeachingImprovementCase')),
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'closed')),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS work.goal_record (
  goal_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  case_ref text
    REFERENCES work.case_record (case_ref),
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'achieved', 'closed')),
  success_criteria jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS work.task_result (
  task_result_ref text PRIMARY KEY,
  task_ref text NOT NULL
    REFERENCES work.task (task_ref),
  goal_ref text
    REFERENCES work.goal_record (goal_ref),
  proposal_artifact_ref text NOT NULL,
  proposal_revision_ref text NOT NULL,
  teaching_plan_artifact_ref text NOT NULL,
  draft_revision_ref text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (task_ref)
);

CREATE TABLE IF NOT EXISTS work.suggestion_disposition (
  disposition_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  task_ref text NOT NULL
    REFERENCES work.task (task_ref),
  proposal_revision_ref text NOT NULL UNIQUE,
  disposition_kind text NOT NULL
    CHECK (
      disposition_kind IN (
        'accepted',
        'accepted_with_changes',
        'rejected',
        'deferred'
      )
    ),
  selected_strategy_id text NOT NULL,
  teacher_edits jsonb NOT NULL,
  note text,
  resulting_revision_ref text,
  implementation_observed boolean NOT NULL DEFAULT false
    CHECK (implementation_observed = false),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS goal_record_case_idx
  ON work.goal_record (tenant_ref, case_ref, status);

CREATE INDEX IF NOT EXISTS task_goal_idx
  ON work.task (goal_ref, created_at);

CREATE INDEX IF NOT EXISTS suggestion_disposition_task_idx
  ON work.suggestion_disposition (tenant_ref, task_ref);

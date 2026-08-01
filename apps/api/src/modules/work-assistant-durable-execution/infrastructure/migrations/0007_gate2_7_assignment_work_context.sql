ALTER TABLE work.task_working_set
  ADD COLUMN IF NOT EXISTS source_lesson_ref text,
  ADD COLUMN IF NOT EXISTS source_assignment_ref text,
  ADD COLUMN IF NOT EXISTS source_assignment_item_refs jsonb NOT NULL
    DEFAULT '[]'::jsonb;

ALTER TABLE work.task_working_set_revision
  ADD COLUMN IF NOT EXISTS source_lesson_ref text,
  ADD COLUMN IF NOT EXISTS source_assignment_ref text,
  ADD COLUMN IF NOT EXISTS source_assignment_item_refs jsonb NOT NULL
    DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS work.assignment_grading_task_details (
  task_ref text PRIMARY KEY
    REFERENCES work.task (task_ref),
  tenant_ref text NOT NULL,
  assignment_ref text NOT NULL,
  assignment_version_ref text NOT NULL,
  grading_status text NOT NULL
    CHECK (grading_status IN ('pending', 'in_progress', 'completed')),
  pending_count integer NOT NULL DEFAULT 0 CHECK (pending_count >= 0),
  confirmed_count integer NOT NULL DEFAULT 0 CHECK (confirmed_count >= 0),
  updated_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_ref, assignment_ref, assignment_version_ref)
);

CREATE INDEX IF NOT EXISTS assignment_grading_task_status_idx
  ON work.assignment_grading_task_details (
    tenant_ref, grading_status, updated_at DESC
  );

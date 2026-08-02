ALTER TABLE work.task_working_set
  ADD COLUMN IF NOT EXISTS source_reflection_ref text,
  ADD COLUMN IF NOT EXISTS source_delivery_revision_ref text,
  ADD COLUMN IF NOT EXISTS source_observation_revision_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE work.task_working_set_revision
  ADD COLUMN IF NOT EXISTS source_reflection_ref text,
  ADD COLUMN IF NOT EXISTS source_delivery_revision_ref text,
  ADD COLUMN IF NOT EXISTS source_observation_revision_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS work.lesson_reflection_task_details (
  task_ref text PRIMARY KEY REFERENCES work.task (task_ref),
  tenant_ref text NOT NULL,
  reflection_ref text NOT NULL UNIQUE,
  lesson_ref text NOT NULL,
  reflection_status text NOT NULL CHECK (
    reflection_status IN ('draft', 'generating', 'draft_ready', 'confirmed', 'cancelled')
  ),
  current_model_execution_ref text,
  updated_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS lesson_reflection_task_status_idx
  ON work.lesson_reflection_task_details (tenant_ref, reflection_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS work.reflection_follow_up_link (
  follow_up_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  reflection_revision_ref text NOT NULL,
  action_type text NOT NULL CHECK (
    action_type IN ('lesson_preparation', 'assignment_draft', 'teacher_todo')
  ),
  target_ref text NOT NULL,
  target_status text NOT NULL,
  deep_link text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (reflection_revision_ref, action_type, target_ref)
);

ALTER TABLE work.teacher_todo_resource_link
  DROP CONSTRAINT IF EXISTS teacher_todo_resource_link_resource_kind_check;

ALTER TABLE work.teacher_todo_resource_link
  ADD CONSTRAINT teacher_todo_resource_link_resource_kind_check
    CHECK (
      resource_kind IN (
        'lesson', 'assignment', 'file', 'teaching_plan',
        'lesson_reflection', 'lesson_delivery', 'classroom_observation'
      )
    );


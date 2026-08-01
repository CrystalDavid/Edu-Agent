CREATE TABLE IF NOT EXISTS work.teacher_todo (
  todo_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  description text NOT NULL DEFAULT '',
  priority text NOT NULL CHECK (priority IN ('high', 'normal', 'low')),
  due_at timestamptz,
  status text NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  pinned boolean NOT NULL DEFAULT false,
  snoozed_until timestamptz,
  created_by text NOT NULL,
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS teacher_todo_teacher_status_idx
  ON work.teacher_todo (
    tenant_ref, teacher_ref, status, pinned DESC, due_at, updated_at DESC
  );

CREATE TABLE IF NOT EXISTS work.teacher_todo_resource_link (
  link_ref text PRIMARY KEY,
  todo_ref text NOT NULL REFERENCES work.teacher_todo (todo_ref),
  resource_kind text NOT NULL
    CHECK (resource_kind IN ('lesson', 'assignment', 'file', 'teaching_plan')),
  resource_ref text NOT NULL,
  label text NOT NULL,
  deep_link text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (todo_ref, resource_kind, resource_ref)
);

CREATE TABLE IF NOT EXISTS work.calendar_event (
  event_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  description text NOT NULL DEFAULT '',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  timezone text NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  event_type text NOT NULL
    CHECK (
      event_type IN (
        'class', 'meeting', 'grading', 'lesson_preparation',
        'custom_reminder', 'todo_time_block'
      )
    ),
  status text NOT NULL
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  related_todo_ref text REFERENCES work.teacher_todo (todo_ref),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS calendar_event_teacher_time_idx
  ON work.calendar_event (
    tenant_ref, teacher_ref, status, start_at, end_at
  );

CREATE TABLE IF NOT EXISTS work.todo_calendar_link (
  link_ref text PRIMARY KEY,
  todo_ref text NOT NULL REFERENCES work.teacher_todo (todo_ref),
  event_ref text NOT NULL UNIQUE REFERENCES work.calendar_event (event_ref),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS work.teacher_work_projection (
  projection_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  projection_kind text NOT NULL
    CHECK (projection_kind IN ('action', 'calendar', 'information')),
  source_module text NOT NULL
    CHECK (source_module IN ('work', 'education', 'artifact', 'capability')),
  source_type text NOT NULL,
  source_ref text NOT NULL,
  source_version text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  display_status text NOT NULL,
  due_at timestamptz,
  start_at timestamptz,
  end_at timestamptz,
  recommended_action text NOT NULL,
  deep_link text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('high', 'normal', 'low')),
  status text NOT NULL CHECK (status IN ('active', 'resolved')),
  last_projected_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (
    tenant_ref, teacher_ref, projection_kind,
    source_module, source_type, source_ref
  ),
  CHECK (
    projection_kind <> 'calendar'
    OR (start_at IS NOT NULL AND end_at IS NOT NULL AND end_at > start_at)
  )
);

CREATE INDEX IF NOT EXISTS teacher_work_projection_active_idx
  ON work.teacher_work_projection (
    tenant_ref, teacher_ref, projection_kind, status,
    priority, due_at, last_projected_at DESC
  );

CREATE TABLE IF NOT EXISTS work.teacher_work_preference (
  preference_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('projection')),
  target_ref text NOT NULL REFERENCES work.teacher_work_projection (projection_ref),
  target_version text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  snoozed_until timestamptz,
  hidden_until timestamptz,
  sort_order integer,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_ref, teacher_ref, target_kind, target_ref, target_version)
);

CREATE TABLE IF NOT EXISTS work.teacher_todo_status_history (
  history_ref text PRIMARY KEY,
  todo_ref text NOT NULL REFERENCES work.teacher_todo (todo_ref),
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('active', 'completed', 'cancelled')),
  todo_version integer NOT NULL CHECK (todo_version > 0),
  reason text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK (from_status IS NULL OR from_status IN ('active', 'completed', 'cancelled')),
  UNIQUE (todo_ref, todo_version)
);

CREATE TABLE IF NOT EXISTS work.calendar_event_status_history (
  history_ref text PRIMARY KEY,
  event_ref text NOT NULL REFERENCES work.calendar_event (event_ref),
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('scheduled', 'completed', 'cancelled')),
  event_version integer NOT NULL CHECK (event_version > 0),
  reason text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK (from_status IS NULL OR from_status IN ('scheduled', 'completed', 'cancelled')),
  UNIQUE (event_ref, event_version)
);

CREATE OR REPLACE FUNCTION work.reject_teacher_work_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Teacher work history is immutable: %', OLD.history_ref;
END
$$;

DROP TRIGGER IF EXISTS teacher_todo_history_immutable
  ON work.teacher_todo_status_history;
CREATE TRIGGER teacher_todo_history_immutable
  BEFORE UPDATE OR DELETE ON work.teacher_todo_status_history
  FOR EACH ROW EXECUTE FUNCTION work.reject_teacher_work_history_mutation();

DROP TRIGGER IF EXISTS calendar_event_history_immutable
  ON work.calendar_event_status_history;
CREATE TRIGGER calendar_event_history_immutable
  BEFORE UPDATE OR DELETE ON work.calendar_event_status_history
  FOR EACH ROW EXECUTE FUNCTION work.reject_teacher_work_history_mutation();

ALTER TABLE work.task_working_set
  ADD COLUMN IF NOT EXISTS source_todo_ref text,
  ADD COLUMN IF NOT EXISTS source_resource_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE work.task_working_set_revision
  ADD COLUMN IF NOT EXISTS source_todo_ref text,
  ADD COLUMN IF NOT EXISTS source_resource_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

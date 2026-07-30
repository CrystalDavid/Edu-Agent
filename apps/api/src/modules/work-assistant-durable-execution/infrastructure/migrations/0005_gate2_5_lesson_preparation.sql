ALTER TABLE work.task
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE work.task
   SET updated_at = created_at
 WHERE updated_at IS NULL;

ALTER TABLE work.task
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE work.task
  DROP CONSTRAINT IF EXISTS task_version_check;
ALTER TABLE work.task
  ADD CONSTRAINT task_version_check CHECK (version > 0);

ALTER TABLE work.task_result
  ADD COLUMN IF NOT EXISTS task_run_ref text;

ALTER TABLE work.task_run
  ADD COLUMN IF NOT EXISTS request_payload jsonb NOT NULL
    DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS request_version integer NOT NULL
    DEFAULT 1;

UPDATE work.task_run AS run
   SET request_payload = task.request_payload,
       request_version = task.request_version
  FROM work.task AS task
 WHERE task.task_ref = run.task_ref
   AND run.request_payload = '{}'::jsonb;

UPDATE work.task_result AS result
   SET task_run_ref = (
     SELECT run.task_run_ref
       FROM work.task_run AS run
      WHERE run.task_ref = result.task_ref
      ORDER BY run.attempt, run.created_at
      LIMIT 1
   )
 WHERE result.task_run_ref IS NULL;

ALTER TABLE work.task_result
  ALTER COLUMN task_run_ref SET NOT NULL;

ALTER TABLE work.task_result
  DROP CONSTRAINT IF EXISTS task_result_task_ref_key;

CREATE UNIQUE INDEX IF NOT EXISTS task_result_task_run_unique
  ON work.task_result (task_run_ref);

CREATE UNIQUE INDEX IF NOT EXISTS task_run_attempt_unique
  ON work.task_run (task_ref, attempt);

CREATE TABLE IF NOT EXISTS work.lesson_preparation_task_details (
  task_ref text PRIMARY KEY
    REFERENCES work.task (task_ref),
  tenant_ref text NOT NULL,
  course_run_ref text NOT NULL,
  curriculum_unit_ref text NOT NULL,
  lesson_ref text NOT NULL,
  due_at timestamptz,
  priority text NOT NULL
    CHECK (priority IN ('low', 'normal', 'high')),
  preparation_status text NOT NULL
    CHECK (
      preparation_status IN (
        'planned',
        'in_progress',
        'awaiting_plan_review',
        'ready_for_use',
        'completed',
        'cancelled'
      )
    ),
  approved_plan_ref text,
  created_by text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION work.sync_lesson_preparation_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.task_kind = 'lesson_preparation' THEN
    UPDATE work.lesson_preparation_task_details
       SET preparation_status = NEW.status,
           updated_at = NEW.updated_at
     WHERE task_ref = NEW.task_ref;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS lesson_preparation_status_from_task
  ON work.task;
CREATE TRIGGER lesson_preparation_status_from_task
  AFTER UPDATE OF status ON work.task
  FOR EACH ROW
  EXECUTE FUNCTION work.sync_lesson_preparation_status();

CREATE OR REPLACE FUNCTION work.reject_direct_preparation_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.preparation_status IS DISTINCT FROM OLD.preparation_status
     AND pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION
      'Lesson preparation status is owned by work.task: %',
      OLD.task_ref;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS lesson_preparation_status_task_owned
  ON work.lesson_preparation_task_details;
CREATE TRIGGER lesson_preparation_status_task_owned
  BEFORE UPDATE OF preparation_status
  ON work.lesson_preparation_task_details
  FOR EACH ROW
  EXECUTE FUNCTION work.reject_direct_preparation_status_change();

CREATE TABLE IF NOT EXISTS work.task_working_set (
  task_ref text PRIMARY KEY
    REFERENCES work.task (task_ref),
  current_version integer NOT NULL CHECK (current_version > 0),
  course_run_ref text NOT NULL,
  curriculum_unit_ref text NOT NULL,
  lesson_ref text NOT NULL,
  learning_objective_refs jsonb NOT NULL,
  evidence_refs jsonb NOT NULL,
  baseline_teaching_plan_ref text,
  context_purpose text NOT NULL,
  requested_field_mask jsonb NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS work.task_working_set_revision (
  working_set_revision_ref text PRIMARY KEY,
  task_ref text NOT NULL
    REFERENCES work.task (task_ref),
  working_set_version integer NOT NULL CHECK (working_set_version > 0),
  course_run_ref text NOT NULL,
  curriculum_unit_ref text NOT NULL,
  lesson_ref text NOT NULL,
  learning_objective_refs jsonb NOT NULL,
  evidence_refs jsonb NOT NULL,
  baseline_teaching_plan_ref text,
  context_purpose text NOT NULL,
  requested_field_mask jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (task_ref, working_set_version)
);

CREATE OR REPLACE FUNCTION work.reject_working_set_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'TaskWorkingSet revision is immutable: %',
    OLD.working_set_revision_ref;
END
$$;

DROP TRIGGER IF EXISTS task_working_set_revision_immutable
  ON work.task_working_set_revision;
CREATE TRIGGER task_working_set_revision_immutable
  BEFORE UPDATE OR DELETE
  ON work.task_working_set_revision
  FOR EACH ROW
  EXECUTE FUNCTION work.reject_working_set_revision_mutation();

CREATE TABLE IF NOT EXISTS work.preparation_status_history (
  history_ref text PRIMARY KEY,
  task_ref text NOT NULL
    REFERENCES work.task (task_ref),
  from_status text,
  to_status text NOT NULL,
  task_version integer NOT NULL CHECK (task_version > 0),
  reason text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK (
    from_status IS NULL OR from_status IN (
      'planned',
      'in_progress',
      'awaiting_plan_review',
      'ready_for_use',
      'completed',
      'cancelled'
    )
  ),
  CHECK (
    to_status IN (
      'planned',
      'in_progress',
      'awaiting_plan_review',
      'ready_for_use',
      'completed',
      'cancelled'
    )
  )
);

CREATE INDEX IF NOT EXISTS lesson_preparation_lesson_idx
  ON work.lesson_preparation_task_details (lesson_ref, updated_at DESC);

CREATE INDEX IF NOT EXISTS lesson_preparation_status_idx
  ON work.lesson_preparation_task_details (
    preparation_status,
    due_at,
    updated_at DESC
  );

CREATE INDEX IF NOT EXISTS preparation_status_history_task_idx
  ON work.preparation_status_history (task_ref, task_version);

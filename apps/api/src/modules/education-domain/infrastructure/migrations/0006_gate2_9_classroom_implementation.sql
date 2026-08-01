CREATE TABLE IF NOT EXISTS education.lesson_delivery (
  delivery_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  course_run_ref text NOT NULL REFERENCES education.course_run (course_run_ref),
  lesson_ref text NOT NULL REFERENCES education.lesson (lesson_ref),
  session_key text NOT NULL,
  teacher_ref text NOT NULL,
  aggregate_version integer NOT NULL DEFAULT 1 CHECK (aggregate_version > 0),
  current_draft_revision_ref text,
  current_confirmed_revision_ref text,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (tenant_ref, lesson_ref, session_key)
);

CREATE TABLE IF NOT EXISTS education.lesson_delivery_revision (
  delivery_revision_ref text PRIMARY KEY,
  delivery_ref text NOT NULL REFERENCES education.lesson_delivery (delivery_ref),
  revision_number integer NOT NULL CHECK (revision_number > 0),
  revision_version integer NOT NULL DEFAULT 1 CHECK (revision_version > 0),
  revision_status text NOT NULL CHECK (revision_status IN ('draft', 'confirmed', 'superseded')),
  teaching_plan_revision_ref text NOT NULL,
  calendar_event_ref text,
  actual_start_at timestamptz NOT NULL,
  actual_end_at timestamptz NOT NULL,
  steps jsonb NOT NULL,
  pace_notes text NOT NULL DEFAULT '',
  unresolved_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  follow_up_notes text NOT NULL DEFAULT '',
  parent_revision_ref text REFERENCES education.lesson_delivery_revision (delivery_revision_ref),
  confirmed_by text,
  confirmed_at timestamptz,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (delivery_ref, revision_number),
  CHECK (actual_end_at > actual_start_at),
  CHECK (
    (revision_status = 'confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
    OR revision_status <> 'confirmed'
  )
);

ALTER TABLE education.lesson_delivery
  DROP CONSTRAINT IF EXISTS lesson_delivery_current_draft_revision_fk;
ALTER TABLE education.lesson_delivery
  ADD CONSTRAINT lesson_delivery_current_draft_revision_fk
  FOREIGN KEY (current_draft_revision_ref)
  REFERENCES education.lesson_delivery_revision (delivery_revision_ref);

ALTER TABLE education.lesson_delivery
  DROP CONSTRAINT IF EXISTS lesson_delivery_current_confirmed_revision_fk;
ALTER TABLE education.lesson_delivery
  ADD CONSTRAINT lesson_delivery_current_confirmed_revision_fk
  FOREIGN KEY (current_confirmed_revision_ref)
  REFERENCES education.lesson_delivery_revision (delivery_revision_ref);

CREATE UNIQUE INDEX IF NOT EXISTS lesson_delivery_active_draft_unique
  ON education.lesson_delivery_revision (delivery_ref)
  WHERE revision_status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS lesson_delivery_current_confirmed_unique
  ON education.lesson_delivery_revision (delivery_ref)
  WHERE revision_status = 'confirmed';

CREATE INDEX IF NOT EXISTS lesson_delivery_lesson_history_idx
  ON education.lesson_delivery (tenant_ref, lesson_ref, updated_at DESC);

CREATE TABLE IF NOT EXISTS education.observed_pedagogical_move (
  move_ref text PRIMARY KEY,
  delivery_revision_ref text NOT NULL REFERENCES education.lesson_delivery_revision (delivery_revision_ref),
  step_key text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  title text NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('adopted', 'adjusted', 'skipped', 'added')),
  actual_description text NOT NULL,
  observed_at timestamptz NOT NULL,
  confirmed_by text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (delivery_revision_ref, step_key)
);

CREATE TABLE IF NOT EXISTS education.instructional_decision (
  decision_ref text PRIMARY KEY,
  move_ref text NOT NULL UNIQUE REFERENCES education.observed_pedagogical_move (move_ref),
  decision_type text NOT NULL CHECK (decision_type IN ('adjusted', 'skipped', 'added')),
  rationale text NOT NULL,
  decided_at timestamptz NOT NULL,
  decided_by text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS education.classroom_observation (
  observation_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  course_run_ref text NOT NULL REFERENCES education.course_run (course_run_ref),
  lesson_ref text NOT NULL REFERENCES education.lesson (lesson_ref),
  delivery_ref text NOT NULL REFERENCES education.lesson_delivery (delivery_ref),
  teacher_ref text NOT NULL,
  aggregate_version integer NOT NULL DEFAULT 1 CHECK (aggregate_version > 0),
  current_draft_revision_ref text,
  current_confirmed_revision_ref text,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS education.classroom_observation_revision (
  observation_revision_ref text PRIMARY KEY,
  observation_ref text NOT NULL REFERENCES education.classroom_observation (observation_ref),
  revision_number integer NOT NULL CHECK (revision_number > 0),
  revision_version integer NOT NULL DEFAULT 1 CHECK (revision_version > 0),
  revision_status text NOT NULL CHECK (revision_status IN ('draft', 'confirmed', 'superseded')),
  delivery_revision_ref text NOT NULL REFERENCES education.lesson_delivery_revision (delivery_revision_ref),
  observation_scope text NOT NULL CHECK (
    observation_scope IN ('class', 'learning_objective', 'learner', 'activity', 'assignment_item')
  ),
  scope_ref text,
  observation_type text NOT NULL CHECK (
    observation_type IN ('achievement', 'confusion', 'timing', 'engagement', 'activity_effectiveness', 'unresolved')
  ),
  observation_content text NOT NULL,
  observed_at timestamptz NOT NULL,
  parent_revision_ref text REFERENCES education.classroom_observation_revision (observation_revision_ref),
  confirmed_by text,
  confirmed_at timestamptz,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (observation_ref, revision_number),
  CHECK (
    (observation_scope = 'class' AND scope_ref IS NULL)
    OR (observation_scope <> 'class' AND scope_ref IS NOT NULL)
  ),
  CHECK (
    (revision_status = 'confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
    OR revision_status <> 'confirmed'
  )
);

ALTER TABLE education.classroom_observation
  DROP CONSTRAINT IF EXISTS classroom_observation_current_draft_revision_fk;
ALTER TABLE education.classroom_observation
  ADD CONSTRAINT classroom_observation_current_draft_revision_fk
  FOREIGN KEY (current_draft_revision_ref)
  REFERENCES education.classroom_observation_revision (observation_revision_ref);

ALTER TABLE education.classroom_observation
  DROP CONSTRAINT IF EXISTS classroom_observation_current_confirmed_revision_fk;
ALTER TABLE education.classroom_observation
  ADD CONSTRAINT classroom_observation_current_confirmed_revision_fk
  FOREIGN KEY (current_confirmed_revision_ref)
  REFERENCES education.classroom_observation_revision (observation_revision_ref);

CREATE UNIQUE INDEX IF NOT EXISTS classroom_observation_active_draft_unique
  ON education.classroom_observation_revision (observation_ref)
  WHERE revision_status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS classroom_observation_current_confirmed_unique
  ON education.classroom_observation_revision (observation_ref)
  WHERE revision_status = 'confirmed';

CREATE INDEX IF NOT EXISTS classroom_observation_lesson_idx
  ON education.classroom_observation (tenant_ref, lesson_ref, updated_at DESC);

CREATE OR REPLACE FUNCTION education.protect_gate29_confirmed_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Confirmed classroom history cannot be deleted';
  END IF;
  IF OLD.revision_status = 'confirmed' THEN
    IF NEW.revision_status <> 'superseded'
       OR NEW.delivery_ref IS DISTINCT FROM OLD.delivery_ref
       OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
       OR NEW.revision_version IS DISTINCT FROM OLD.revision_version
       OR NEW.teaching_plan_revision_ref IS DISTINCT FROM OLD.teaching_plan_revision_ref
       OR NEW.calendar_event_ref IS DISTINCT FROM OLD.calendar_event_ref
       OR NEW.actual_start_at IS DISTINCT FROM OLD.actual_start_at
       OR NEW.actual_end_at IS DISTINCT FROM OLD.actual_end_at
       OR NEW.steps IS DISTINCT FROM OLD.steps
       OR NEW.pace_notes IS DISTINCT FROM OLD.pace_notes
       OR NEW.unresolved_questions IS DISTINCT FROM OLD.unresolved_questions
       OR NEW.follow_up_notes IS DISTINCT FROM OLD.follow_up_notes
       OR NEW.parent_revision_ref IS DISTINCT FROM OLD.parent_revision_ref
       OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
       OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
       OR NEW.actor_ref IS DISTINCT FROM OLD.actor_ref
       OR NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.owner_module IS DISTINCT FROM OLD.owner_module
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.authorization_decision_ref IS DISTINCT FROM OLD.authorization_decision_ref
       OR NEW.audit_ref IS DISTINCT FROM OLD.audit_ref
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Confirmed LessonDelivery content is immutable';
    END IF;
  END IF;
  IF OLD.revision_status = 'superseded' THEN
    RAISE EXCEPTION 'Superseded LessonDelivery revision is immutable';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS lesson_delivery_revision_history_guard
  ON education.lesson_delivery_revision;
CREATE TRIGGER lesson_delivery_revision_history_guard
  BEFORE UPDATE OR DELETE ON education.lesson_delivery_revision
  FOR EACH ROW EXECUTE FUNCTION education.protect_gate29_confirmed_revision();

CREATE OR REPLACE FUNCTION education.protect_gate29_observation_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ClassroomObservation history cannot be deleted';
  END IF;
  IF OLD.revision_status = 'confirmed' THEN
    IF NEW.revision_status <> 'superseded'
       OR NEW.observation_ref IS DISTINCT FROM OLD.observation_ref
       OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
       OR NEW.revision_version IS DISTINCT FROM OLD.revision_version
       OR NEW.delivery_revision_ref IS DISTINCT FROM OLD.delivery_revision_ref
       OR NEW.observation_scope IS DISTINCT FROM OLD.observation_scope
       OR NEW.scope_ref IS DISTINCT FROM OLD.scope_ref
       OR NEW.observation_type IS DISTINCT FROM OLD.observation_type
       OR NEW.observation_content IS DISTINCT FROM OLD.observation_content
       OR NEW.observed_at IS DISTINCT FROM OLD.observed_at
       OR NEW.parent_revision_ref IS DISTINCT FROM OLD.parent_revision_ref
       OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
       OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
       OR NEW.actor_ref IS DISTINCT FROM OLD.actor_ref
       OR NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.owner_module IS DISTINCT FROM OLD.owner_module
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.authorization_decision_ref IS DISTINCT FROM OLD.authorization_decision_ref
       OR NEW.audit_ref IS DISTINCT FROM OLD.audit_ref
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Confirmed ClassroomObservation content is immutable';
    END IF;
  END IF;
  IF OLD.revision_status = 'superseded' THEN
    RAISE EXCEPTION 'Superseded ClassroomObservation revision is immutable';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS classroom_observation_revision_history_guard
  ON education.classroom_observation_revision;
CREATE TRIGGER classroom_observation_revision_history_guard
  BEFORE UPDATE OR DELETE ON education.classroom_observation_revision
  FOR EACH ROW EXECUTE FUNCTION education.protect_gate29_observation_revision();

CREATE OR REPLACE FUNCTION education.reject_gate29_formal_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Confirmed classroom fact is immutable';
END
$$;

DROP TRIGGER IF EXISTS observed_pedagogical_move_immutable
  ON education.observed_pedagogical_move;
CREATE TRIGGER observed_pedagogical_move_immutable
  BEFORE UPDATE OR DELETE ON education.observed_pedagogical_move
  FOR EACH ROW EXECUTE FUNCTION education.reject_gate29_formal_fact_mutation();

DROP TRIGGER IF EXISTS instructional_decision_immutable
  ON education.instructional_decision;
CREATE TRIGGER instructional_decision_immutable
  BEFORE UPDATE OR DELETE ON education.instructional_decision
  FOR EACH ROW EXECUTE FUNCTION education.reject_gate29_formal_fact_mutation();

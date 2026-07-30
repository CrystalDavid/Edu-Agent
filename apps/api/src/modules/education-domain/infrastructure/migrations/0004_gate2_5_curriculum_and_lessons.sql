CREATE TABLE IF NOT EXISTS education.curriculum_unit (
  unit_ref text PRIMARY KEY,
  course_run_ref text NOT NULL
    REFERENCES education.course_run (course_run_ref),
  sequence integer NOT NULL CHECK (sequence > 0),
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('planned', 'active', 'completed')),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (course_run_ref, sequence)
);

CREATE TABLE IF NOT EXISTS education.lesson (
  lesson_ref text PRIMARY KEY,
  unit_ref text NOT NULL
    REFERENCES education.curriculum_unit (unit_ref),
  sequence integer NOT NULL CHECK (sequence > 0),
  title text NOT NULL,
  planned_at timestamptz,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  preparation_state text NOT NULL DEFAULT 'not_started'
    CHECK (
      preparation_state IN (
        'not_started',
        'planned',
        'in_progress',
        'awaiting_plan_review',
        'ready_for_use',
        'completed',
        'cancelled'
      )
    ),
  current_approved_plan_ref text,
  active_preparation_task_ref text,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (unit_ref, sequence)
);

CREATE TABLE IF NOT EXISTS education.lesson_learning_objective_link (
  lesson_ref text NOT NULL
    REFERENCES education.lesson (lesson_ref),
  objective_ref text NOT NULL
    REFERENCES education.learning_objective (objective_ref),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (lesson_ref, objective_ref)
);

CREATE TABLE IF NOT EXISTS education.lesson_evidence_link (
  lesson_ref text NOT NULL
    REFERENCES education.lesson (lesson_ref),
  evidence_ref text NOT NULL,
  evidence_kind text NOT NULL
    CHECK (evidence_kind IN ('observation', 'claim')),
  is_current boolean NOT NULL DEFAULT true,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (lesson_ref, evidence_ref)
);

CREATE TABLE IF NOT EXISTS education.lesson_teaching_plan_binding (
  binding_ref text PRIMARY KEY,
  lesson_ref text NOT NULL
    REFERENCES education.lesson (lesson_ref),
  preparation_task_ref text,
  teaching_plan_artifact_ref text NOT NULL,
  teaching_plan_revision_ref text NOT NULL,
  binding_kind text NOT NULL
    CHECK (
      binding_kind IN (
        'baseline',
        'current_approved'
      )
    ),
  superseded_at timestamptz,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS curriculum_unit_course_idx
  ON education.curriculum_unit (course_run_ref, sequence);

CREATE INDEX IF NOT EXISTS lesson_unit_idx
  ON education.lesson (unit_ref, sequence);

CREATE INDEX IF NOT EXISTS lesson_objective_objective_idx
  ON education.lesson_learning_objective_link (objective_ref, lesson_ref);

CREATE INDEX IF NOT EXISTS lesson_current_evidence_idx
  ON education.lesson_evidence_link (lesson_ref, evidence_kind)
  WHERE is_current = true;

CREATE UNIQUE INDEX IF NOT EXISTS lesson_current_approved_binding_unique
  ON education.lesson_teaching_plan_binding (lesson_ref)
  WHERE binding_kind = 'current_approved'
    AND superseded_at IS NULL;

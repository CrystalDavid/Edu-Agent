CREATE TABLE IF NOT EXISTS education.course_run_enrollment (
  enrollment_ref text PRIMARY KEY,
  course_run_ref text NOT NULL
    REFERENCES education.course_run (course_run_ref),
  learner_ref text NOT NULL,
  display_name text NOT NULL,
  enrollment_status text NOT NULL DEFAULT 'active'
    CHECK (enrollment_status IN ('active', 'withdrawn')),
  synthetic boolean NOT NULL DEFAULT true,
  enrolled_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (course_run_ref, learner_ref)
);

CREATE TABLE IF NOT EXISTS education.assignment (
  assignment_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  course_run_ref text NOT NULL
    REFERENCES education.course_run (course_run_ref),
  curriculum_unit_ref text NOT NULL
    REFERENCES education.curriculum_unit (unit_ref),
  lesson_ref text NOT NULL
    REFERENCES education.lesson (lesson_ref),
  assignment_status text NOT NULL DEFAULT 'draft'
    CHECK (assignment_status IN ('draft', 'published', 'closed', 'archived')),
  current_version_number integer NOT NULL DEFAULT 1
    CHECK (current_version_number > 0),
  aggregate_version integer NOT NULL DEFAULT 1
    CHECK (aggregate_version > 0),
  created_by text NOT NULL,
  published_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS education.assignment_version (
  assignment_version_ref text PRIMARY KEY,
  assignment_ref text NOT NULL
    REFERENCES education.assignment (assignment_ref),
  version_number integer NOT NULL CHECK (version_number > 0),
  title text NOT NULL,
  instructions text NOT NULL,
  due_at timestamptz,
  created_by text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (assignment_ref, version_number)
);

CREATE TABLE IF NOT EXISTS education.assignment_item (
  item_ref text PRIMARY KEY,
  assignment_version_ref text NOT NULL
    REFERENCES education.assignment_version (assignment_version_ref),
  sequence integer NOT NULL CHECK (sequence > 0),
  item_type text NOT NULL
    CHECK (item_type IN ('multiple_choice', 'numeric', 'short_answer')),
  prompt text NOT NULL,
  max_score numeric(8, 2) NOT NULL CHECK (max_score > 0),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_key jsonb NOT NULL,
  grading_criteria text NOT NULL DEFAULT '',
  objective_ref text NOT NULL
    REFERENCES education.learning_objective (objective_ref),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (assignment_version_ref, sequence)
);

CREATE TABLE IF NOT EXISTS education.assignment_objective_link (
  assignment_version_ref text NOT NULL
    REFERENCES education.assignment_version (assignment_version_ref),
  objective_ref text NOT NULL
    REFERENCES education.learning_objective (objective_ref),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (assignment_version_ref, objective_ref)
);

CREATE TABLE IF NOT EXISTS education.submission (
  submission_ref text PRIMARY KEY,
  assignment_ref text NOT NULL
    REFERENCES education.assignment (assignment_ref),
  enrollment_ref text NOT NULL
    REFERENCES education.course_run_enrollment (enrollment_ref),
  learner_ref text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (assignment_ref, learner_ref)
);

CREATE TABLE IF NOT EXISTS education.submission_attempt_details (
  attempt_ref text PRIMARY KEY
    REFERENCES education.attempt (attempt_ref),
  submission_ref text NOT NULL
    REFERENCES education.submission (submission_ref),
  assignment_version_ref text NOT NULL
    REFERENCES education.assignment_version (assignment_version_ref),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (submission_ref, attempt_number)
);

CREATE TABLE IF NOT EXISTS education.item_response (
  response_ref text PRIMARY KEY,
  attempt_ref text NOT NULL
    REFERENCES education.submission_attempt_details (attempt_ref),
  item_ref text NOT NULL
    REFERENCES education.assignment_item (item_ref),
  response_value jsonb NOT NULL,
  submitted_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (attempt_ref, item_ref)
);

CREATE TABLE IF NOT EXISTS education.teacher_grade_decision (
  grade_decision_ref text PRIMARY KEY,
  attempt_ref text NOT NULL
    REFERENCES education.submission_attempt_details (attempt_ref),
  decision_version integer NOT NULL CHECK (decision_version > 0),
  decision_status text NOT NULL DEFAULT 'draft'
    CHECK (decision_status IN ('draft', 'confirmed', 'superseded')),
  total_score numeric(8, 2) NOT NULL CHECK (total_score >= 0),
  max_score numeric(8, 2) NOT NULL CHECK (max_score > 0),
  teacher_feedback text NOT NULL DEFAULT '',
  previous_decision_ref text
    REFERENCES education.teacher_grade_decision (grade_decision_ref),
  created_by text NOT NULL,
  confirmed_at timestamptz,
  updated_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (attempt_ref, decision_version)
);

CREATE TABLE IF NOT EXISTS education.teacher_item_grade (
  item_grade_ref text PRIMARY KEY,
  grade_decision_ref text NOT NULL
    REFERENCES education.teacher_grade_decision (grade_decision_ref),
  response_ref text NOT NULL
    REFERENCES education.item_response (response_ref),
  outcome text NOT NULL CHECK (outcome IN ('correct', 'partial', 'incorrect')),
  awarded_score numeric(8, 2) NOT NULL CHECK (awarded_score >= 0),
  feedback text NOT NULL DEFAULT '',
  suggestion_source text NOT NULL
    CHECK (suggestion_source IN ('deterministic', 'teacher')),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (grade_decision_ref, response_ref)
);

CREATE TABLE IF NOT EXISTS education.assignment_evidence_source (
  observation_ref text PRIMARY KEY
    REFERENCES education.evidence_observation (observation_ref),
  assignment_ref text NOT NULL
    REFERENCES education.assignment (assignment_ref),
  assignment_version_ref text NOT NULL
    REFERENCES education.assignment_version (assignment_version_ref),
  item_ref text NOT NULL
    REFERENCES education.assignment_item (item_ref),
  response_ref text NOT NULL
    REFERENCES education.item_response (response_ref),
  grade_decision_ref text NOT NULL
    REFERENCES education.teacher_grade_decision (grade_decision_ref),
  lesson_ref text NOT NULL
    REFERENCES education.lesson (lesson_ref),
  learner_ref text NOT NULL,
  source_version integer NOT NULL CHECK (source_version > 0),
  supersedes_observation_ref text
    REFERENCES education.evidence_observation (observation_ref),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS assignment_active_grade_draft_unique
  ON education.teacher_grade_decision (attempt_ref)
  WHERE decision_status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS assignment_current_confirmed_grade_unique
  ON education.teacher_grade_decision (attempt_ref)
  WHERE decision_status = 'confirmed';

CREATE INDEX IF NOT EXISTS assignment_tenant_status_idx
  ON education.assignment (tenant_ref, assignment_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS assignment_lesson_idx
  ON education.assignment (lesson_ref, updated_at DESC);

CREATE INDEX IF NOT EXISTS enrollment_course_idx
  ON education.course_run_enrollment (course_run_ref, enrollment_status, display_name);

CREATE INDEX IF NOT EXISTS submission_assignment_idx
  ON education.submission (assignment_ref, learner_ref);

CREATE INDEX IF NOT EXISTS assignment_evidence_lookup_idx
  ON education.assignment_evidence_source (
    assignment_ref, item_ref, learner_ref, created_at DESC
  );

CREATE OR REPLACE FUNCTION education.reject_assignment_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Immutable assignment record cannot be changed';
END
$$;

CREATE OR REPLACE FUNCTION education.protect_submission_attempt_base()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM education.submission_attempt_details details
     WHERE details.attempt_ref = OLD.attempt_ref
  ) THEN
    RAISE EXCEPTION 'SubmissionAttempt base record is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

DROP TRIGGER IF EXISTS submission_attempt_base_immutable
  ON education.attempt;
CREATE TRIGGER submission_attempt_base_immutable
  BEFORE UPDATE OR DELETE ON education.attempt
  FOR EACH ROW EXECUTE FUNCTION education.protect_submission_attempt_base();

DROP TRIGGER IF EXISTS assignment_version_immutable
  ON education.assignment_version;
CREATE TRIGGER assignment_version_immutable
  BEFORE UPDATE OR DELETE ON education.assignment_version
  FOR EACH ROW EXECUTE FUNCTION education.reject_assignment_immutable_mutation();

DROP TRIGGER IF EXISTS assignment_item_immutable
  ON education.assignment_item;
CREATE TRIGGER assignment_item_immutable
  BEFORE UPDATE OR DELETE ON education.assignment_item
  FOR EACH ROW EXECUTE FUNCTION education.reject_assignment_immutable_mutation();

DROP TRIGGER IF EXISTS assignment_objective_link_immutable
  ON education.assignment_objective_link;
CREATE TRIGGER assignment_objective_link_immutable
  BEFORE UPDATE OR DELETE ON education.assignment_objective_link
  FOR EACH ROW EXECUTE FUNCTION education.reject_assignment_immutable_mutation();

DROP TRIGGER IF EXISTS submission_attempt_details_immutable
  ON education.submission_attempt_details;
CREATE TRIGGER submission_attempt_details_immutable
  BEFORE UPDATE OR DELETE ON education.submission_attempt_details
  FOR EACH ROW EXECUTE FUNCTION education.reject_assignment_immutable_mutation();

DROP TRIGGER IF EXISTS item_response_immutable
  ON education.item_response;
CREATE TRIGGER item_response_immutable
  BEFORE UPDATE OR DELETE ON education.item_response
  FOR EACH ROW EXECUTE FUNCTION education.reject_assignment_immutable_mutation();

DROP TRIGGER IF EXISTS assignment_evidence_source_immutable
  ON education.assignment_evidence_source;
CREATE TRIGGER assignment_evidence_source_immutable
  BEFORE UPDATE OR DELETE ON education.assignment_evidence_source
  FOR EACH ROW EXECUTE FUNCTION education.reject_assignment_immutable_mutation();

CREATE OR REPLACE FUNCTION education.protect_grade_decision_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'GradeDecision history cannot be deleted';
  END IF;
  IF OLD.decision_status = 'confirmed' THEN
    IF NEW.decision_status <> 'superseded'
       OR NEW.total_score IS DISTINCT FROM OLD.total_score
       OR NEW.max_score IS DISTINCT FROM OLD.max_score
       OR NEW.teacher_feedback IS DISTINCT FROM OLD.teacher_feedback
       OR NEW.previous_decision_ref IS DISTINCT FROM OLD.previous_decision_ref THEN
      RAISE EXCEPTION 'Confirmed GradeDecision content is immutable';
    END IF;
  END IF;
  IF OLD.decision_status = 'superseded' THEN
    RAISE EXCEPTION 'Superseded GradeDecision is immutable';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS teacher_grade_decision_history_guard
  ON education.teacher_grade_decision;
CREATE TRIGGER teacher_grade_decision_history_guard
  BEFORE UPDATE OR DELETE ON education.teacher_grade_decision
  FOR EACH ROW EXECUTE FUNCTION education.protect_grade_decision_history();

CREATE OR REPLACE FUNCTION education.protect_confirmed_item_grade()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE parent_status text;
BEGIN
  SELECT decision_status INTO parent_status
    FROM education.teacher_grade_decision
   WHERE grade_decision_ref = OLD.grade_decision_ref;
  IF parent_status IN ('confirmed', 'superseded') THEN
    RAISE EXCEPTION 'Confirmed TeacherItemGrade is immutable';
  END IF;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS teacher_item_grade_history_guard
  ON education.teacher_item_grade;
CREATE TRIGGER teacher_item_grade_history_guard
  BEFORE UPDATE OR DELETE ON education.teacher_item_grade
  FOR EACH ROW EXECUTE FUNCTION education.protect_confirmed_item_grade();

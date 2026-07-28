CREATE TABLE IF NOT EXISTS education.course_run (
  course_run_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  curriculum_framework_ref text NOT NULL,
  subject text NOT NULL,
  grade_level text NOT NULL,
  academic_term text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS education.learning_objective (
  objective_ref text PRIMARY KEY,
  course_run_ref text NOT NULL
    REFERENCES education.course_run (course_run_ref),
  title text NOT NULL,
  description text NOT NULL,
  knowledge_concept_refs jsonb NOT NULL,
  competency_refs jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS education.learning_interaction_profile (
  profile_ref text NOT NULL,
  profile_version integer NOT NULL CHECK (profile_version > 0),
  scope_ref text NOT NULL,
  participation_mode text NOT NULL,
  support_limit integer NOT NULL CHECK (support_limit >= 0),
  answer_release_boundary text NOT NULL,
  policy_version_ref text NOT NULL,
  prompt_version_ref text NOT NULL,
  evidence_rule_version_ref text NOT NULL,
  profile_payload jsonb NOT NULL,
  content_hash text NOT NULL,
  valid_from timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (profile_ref, profile_version)
);

CREATE TABLE IF NOT EXISTS education.attempt (
  attempt_ref text PRIMARY KEY,
  course_run_ref text NOT NULL
    REFERENCES education.course_run (course_run_ref),
  objective_ref text NOT NULL
    REFERENCES education.learning_objective (objective_ref),
  learner_ref text NOT NULL,
  submitted_at timestamptz NOT NULL,
  response_summary jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS education.evidence_observation (
  observation_ref text PRIMARY KEY,
  attempt_ref text NOT NULL
    REFERENCES education.attempt (attempt_ref),
  objective_ref text NOT NULL
    REFERENCES education.learning_objective (objective_ref),
  observer_type text NOT NULL,
  observation_type text NOT NULL,
  observation_value jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  source_ref text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS education.evidence_claim (
  claim_ref text PRIMARY KEY,
  objective_ref text NOT NULL
    REFERENCES education.learning_objective (objective_ref),
  claim_type text NOT NULL,
  claim_value jsonb NOT NULL,
  confidence numeric(5, 4) NOT NULL
    CHECK (confidence >= 0 AND confidence <= 1),
  valid_from timestamptz NOT NULL,
  expires_at timestamptz,
  status text NOT NULL CHECK (status IN ('candidate', 'confirmed', 'superseded')),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS education.evidence_claim_observation (
  claim_ref text NOT NULL
    REFERENCES education.evidence_claim (claim_ref),
  observation_ref text NOT NULL
    REFERENCES education.evidence_observation (observation_ref),
  relation_type text NOT NULL CHECK (relation_type IN ('supports', 'contradicts')),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (claim_ref, observation_ref)
);

CREATE TABLE IF NOT EXISTS education.teaching_plan_alignment (
  alignment_ref text PRIMARY KEY,
  teaching_plan_artifact_ref text NOT NULL,
  course_run_ref text NOT NULL
    REFERENCES education.course_run (course_run_ref),
  objective_ref text NOT NULL
    REFERENCES education.learning_objective (objective_ref),
  validation_status text NOT NULL
    CHECK (validation_status IN ('draft', 'validated', 'rejected')),
  validation_result jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS education.outbox_record (
  outbox_ref text PRIMARY KEY,
  event_name text NOT NULL,
  aggregate_ref text NOT NULL,
  payload jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'education'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  published_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'retry')),
  lease_owner text,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz
);

CREATE OR REPLACE VIEW education.learning_evidence_view AS
SELECT
  observation.observation_ref,
  observation.attempt_ref,
  attempt.learner_ref,
  observation.objective_ref,
  objective.title AS objective_title,
  observation.observation_type,
  observation.observation_value,
  observation.observed_at,
  observation.source_ref,
  claim.claim_ref,
  claim.claim_type,
  claim.claim_value,
  claim.confidence,
  claim.valid_from,
  claim.expires_at,
  claim.status AS claim_status,
  relation.relation_type
FROM education.evidence_observation AS observation
JOIN education.attempt AS attempt
  ON attempt.attempt_ref = observation.attempt_ref
JOIN education.learning_objective AS objective
  ON objective.objective_ref = observation.objective_ref
LEFT JOIN education.evidence_claim_observation AS relation
  ON relation.observation_ref = observation.observation_ref
LEFT JOIN education.evidence_claim AS claim
  ON claim.claim_ref = relation.claim_ref;

CREATE OR REPLACE FUNCTION education.reject_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Immutable education evidence cannot be changed';
END
$$;

DROP TRIGGER IF EXISTS attempt_immutable ON education.attempt;
CREATE TRIGGER attempt_immutable
  BEFORE UPDATE OR DELETE ON education.attempt
  FOR EACH ROW EXECUTE FUNCTION education.reject_evidence_mutation();

DROP TRIGGER IF EXISTS evidence_observation_immutable
  ON education.evidence_observation;
CREATE TRIGGER evidence_observation_immutable
  BEFORE UPDATE OR DELETE ON education.evidence_observation
  FOR EACH ROW EXECUTE FUNCTION education.reject_evidence_mutation();

DROP TRIGGER IF EXISTS evidence_claim_immutable
  ON education.evidence_claim;
CREATE TRIGGER evidence_claim_immutable
  BEFORE UPDATE OR DELETE ON education.evidence_claim
  FOR EACH ROW EXECUTE FUNCTION education.reject_evidence_mutation();

DROP TRIGGER IF EXISTS interaction_profile_immutable
  ON education.learning_interaction_profile;
CREATE TRIGGER interaction_profile_immutable
  BEFORE UPDATE OR DELETE ON education.learning_interaction_profile
  FOR EACH ROW EXECUTE FUNCTION education.reject_evidence_mutation();

CREATE INDEX IF NOT EXISTS education_outbox_claim_idx
  ON education.outbox_record (status, lease_expires_at, created_at)
  WHERE processed_at IS NULL;

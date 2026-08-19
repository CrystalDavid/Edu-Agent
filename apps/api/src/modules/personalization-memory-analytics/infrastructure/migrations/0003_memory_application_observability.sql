CREATE TABLE IF NOT EXISTS personalization.memory_application (
  application_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  conversation_ref text NOT NULL,
  turn_ref text NOT NULL,
  task_ref text NOT NULL,
  agent_run_ref text NOT NULL,
  model_execution_ref text,
  skill_ref text NOT NULL,
  use_case text NOT NULL,
  scope_hash text NOT NULL,
  preference_ref text NOT NULL,
  preference_version integer NOT NULL CHECK (preference_version > 0),
  preference_content_hash text NOT NULL,
  pack_ref text NOT NULL,
  pack_content_hash text NOT NULL,
  decision text NOT NULL CHECK (
    decision IN ('selected', 'injected', 'excluded', 'overridden')
  ),
  reason_code text NOT NULL CHECK (
    reason_code IN (
      'active_confirmed_preference',
      'duplicate_key',
      'token_budget',
      'skill_not_allowed',
      'current_instruction_override',
      'expired',
      'revoked',
      'superseded'
    )
  ),
  target_fields jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(target_fields) = 'array'
  ),
  estimated_tokens integer NOT NULL CHECK (estimated_tokens >= 0),
  policy_version text NOT NULL,
  retention_policy_version text NOT NULL,
  retention_until timestamptz NOT NULL,
  idempotency_key text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'personalization'),
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT memory_application_idempotency_key_unique
    UNIQUE (idempotency_key),
  CONSTRAINT memory_application_run_preference_decision_unique
    UNIQUE (agent_run_ref, preference_ref, preference_version, decision),
  CONSTRAINT memory_application_preference_revision_fk
    FOREIGN KEY (preference_ref, preference_version)
    REFERENCES personalization.teacher_preference_revision (
      preference_ref, version
    ),
  CHECK (retention_until > created_at)
);

CREATE INDEX IF NOT EXISTS memory_application_owner_run_idx
  ON personalization.memory_application (
    tenant_ref, teacher_ref, agent_run_ref, created_at
  );

CREATE INDEX IF NOT EXISTS memory_application_owner_preference_idx
  ON personalization.memory_application (
    tenant_ref, teacher_ref, preference_ref, preference_version, created_at DESC
  );

CREATE INDEX IF NOT EXISTS memory_application_owner_decision_idx
  ON personalization.memory_application (
    tenant_ref, teacher_ref, decision, created_at DESC
  );

CREATE INDEX IF NOT EXISTS memory_application_pack_idx
  ON personalization.memory_application (
    tenant_ref, teacher_ref, pack_ref, created_at
  );

CREATE INDEX IF NOT EXISTS memory_application_retention_idx
  ON personalization.memory_application (retention_until);

CREATE TABLE IF NOT EXISTS personalization.memory_application_outcome (
  outcome_ref text PRIMARY KEY,
  application_ref text NOT NULL
    REFERENCES personalization.memory_application (application_ref),
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  source_event_ref text NOT NULL,
  agent_run_ref text NOT NULL,
  outcome_status text NOT NULL CHECK (
    outcome_status IN ('adopted', 'edited', 'rejected', 'deferred', 'unknown')
  ),
  resulting_revision_ref text,
  policy_version text NOT NULL,
  idempotency_key text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'personalization'),
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT memory_application_outcome_idempotency_key_unique
    UNIQUE (idempotency_key),
  CONSTRAINT memory_application_outcome_source_application_unique
    UNIQUE (source_event_ref, application_ref)
);

CREATE INDEX IF NOT EXISTS memory_application_outcome_owner_run_idx
  ON personalization.memory_application_outcome (
    tenant_ref, teacher_ref, agent_run_ref, created_at
  );

CREATE INDEX IF NOT EXISTS memory_application_outcome_application_idx
  ON personalization.memory_application_outcome (
    application_ref, created_at DESC
  );

CREATE INDEX IF NOT EXISTS memory_application_outcome_owner_status_idx
  ON personalization.memory_application_outcome (
    tenant_ref, teacher_ref, outcome_status, created_at DESC
  );

CREATE OR REPLACE FUNCTION personalization.reject_memory_application_observability_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Memory application observability records are append-only';
END
$$;

DROP TRIGGER IF EXISTS memory_application_immutable
  ON personalization.memory_application;
CREATE TRIGGER memory_application_immutable
  BEFORE UPDATE OR DELETE ON personalization.memory_application
  FOR EACH ROW EXECUTE FUNCTION
    personalization.reject_memory_application_observability_mutation();

DROP TRIGGER IF EXISTS memory_application_outcome_immutable
  ON personalization.memory_application_outcome;
CREATE TRIGGER memory_application_outcome_immutable
  BEFORE UPDATE OR DELETE ON personalization.memory_application_outcome
  FOR EACH ROW EXECUTE FUNCTION
    personalization.reject_memory_application_observability_mutation();

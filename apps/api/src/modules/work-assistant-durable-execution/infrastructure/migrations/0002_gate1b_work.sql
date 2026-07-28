CREATE TABLE IF NOT EXISTS work.resolved_learning_interaction_contract (
  contract_ref text PRIMARY KEY,
  bound_run_kind text NOT NULL
    CHECK (bound_run_kind IN ('QueryRun', 'TaskRun')),
  bound_run_ref text NOT NULL,
  profile_ref text NOT NULL,
  profile_version integer NOT NULL CHECK (profile_version > 0),
  policy_version_ref text NOT NULL,
  prompt_version_ref text NOT NULL,
  evidence_rule_version_ref text NOT NULL,
  participation_mode text NOT NULL,
  support_limit integer NOT NULL CHECK (support_limit >= 0),
  answer_release_boundary text NOT NULL,
  contract_payload jsonb NOT NULL,
  content_hash text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (bound_run_kind, bound_run_ref)
);

CREATE OR REPLACE FUNCTION work.reject_contract_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'ResolvedLearningInteractionContract is immutable: %',
    OLD.contract_ref;
END
$$;

DROP TRIGGER IF EXISTS resolved_contract_immutable
  ON work.resolved_learning_interaction_contract;
CREATE TRIGGER resolved_contract_immutable
  BEFORE UPDATE OR DELETE
  ON work.resolved_learning_interaction_contract
  FOR EACH ROW
  EXECUTE FUNCTION work.reject_contract_mutation();

ALTER TABLE work.outbox_record
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'retry')),
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE TABLE IF NOT EXISTS work.outbox_consumer_effect (
  consumer_name text NOT NULL,
  outbox_ref text NOT NULL,
  effect_key text NOT NULL,
  effect_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, outbox_ref),
  UNIQUE (consumer_name, effect_key)
);

CREATE INDEX IF NOT EXISTS work_outbox_claim_idx
  ON work.outbox_record (status, lease_expires_at, created_at)
  WHERE processed_at IS NULL;

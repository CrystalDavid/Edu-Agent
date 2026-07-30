CREATE TABLE IF NOT EXISTS capability.model_execution (
  execution_ref text PRIMARY KEY,
  provider text NOT NULL CHECK (provider = 'mock'),
  model_profile text NOT NULL,
  prompt_bundle_ref text NOT NULL,
  input_summary jsonb NOT NULL,
  output jsonb NOT NULL,
  usage_summary jsonb NOT NULL,
  external_network_used boolean NOT NULL DEFAULT false
    CHECK (external_network_used = false),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'capability'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS model_execution_prompt_idx
  ON capability.model_execution (prompt_bundle_ref, created_at);

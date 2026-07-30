CREATE TABLE IF NOT EXISTS runtime.context_manifest (
  context_manifest_ref text PRIMARY KEY,
  agent_run_ref text NOT NULL UNIQUE
    REFERENCES runtime.agent_run (agent_run_ref),
  resource_refs jsonb NOT NULL,
  evidence_refs jsonb NOT NULL,
  unknowns jsonb NOT NULL,
  requested_field_mask jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'runtime'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

ALTER TABLE runtime.run_manifest
  ADD COLUMN IF NOT EXISTS context_manifest_ref text;

CREATE INDEX IF NOT EXISTS context_manifest_agent_run_idx
  ON runtime.context_manifest (agent_run_ref);

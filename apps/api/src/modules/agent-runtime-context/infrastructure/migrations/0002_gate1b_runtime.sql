CREATE TABLE IF NOT EXISTS runtime.run_manifest (
  manifest_ref text PRIMARY KEY,
  agent_run_ref text NOT NULL UNIQUE,
  contract_ref text,
  prompt_version_ref text NOT NULL,
  policy_version_ref text NOT NULL,
  capability_refs jsonb NOT NULL,
  context_refs jsonb NOT NULL,
  content_hash text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'runtime'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

ALTER TABLE runtime.outbox_record
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'retry')),
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE INDEX IF NOT EXISTS runtime_outbox_claim_idx
  ON runtime.outbox_record (status, lease_expires_at, created_at)
  WHERE processed_at IS NULL;

ALTER TABLE governance.authorization_decision
  ADD COLUMN IF NOT EXISTS requested_field_mask jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz;

UPDATE governance.authorization_decision
SET decided_at = created_at
WHERE decided_at IS NULL;

ALTER TABLE governance.authorization_decision
  ALTER COLUMN decided_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS governance.idempotency_record (
  idempotency_ref text PRIMARY KEY,
  root_key text NOT NULL UNIQUE,
  request_fingerprint text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'completed')),
  result jsonb,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'governance'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS governance_idempotency_status_idx
  ON governance.idempotency_record (status, created_at);

ALTER TABLE capability.tool_execution
  ADD COLUMN IF NOT EXISTS capability_ref text NOT NULL
    DEFAULT 'capability:gate1a-fake-tool';

ALTER TABLE capability.outbox_record
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'retry')),
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE INDEX IF NOT EXISTS capability_outbox_claim_idx
  ON capability.outbox_record (status, lease_expires_at, created_at)
  WHERE processed_at IS NULL;

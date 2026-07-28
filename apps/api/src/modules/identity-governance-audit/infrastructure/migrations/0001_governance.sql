CREATE SCHEMA IF NOT EXISTS governance;

CREATE TABLE IF NOT EXISTS governance.authorization_decision (
  decision_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  action text NOT NULL,
  resource_ref text NOT NULL,
  effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
  reason_codes jsonb NOT NULL,
  policy_version text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'governance'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS governance.audit_record (
  record_ref text PRIMARY KEY,
  write_ref text NOT NULL,
  record_type text NOT NULL,
  action text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'governance'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_record_write_ref_idx
  ON governance.audit_record (write_ref);

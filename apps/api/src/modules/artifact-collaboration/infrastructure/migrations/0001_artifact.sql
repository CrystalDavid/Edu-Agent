CREATE SCHEMA IF NOT EXISTS artifact;

CREATE TABLE IF NOT EXISTS artifact.artifact_revision (
  revision_ref text PRIMARY KEY,
  artifact_ref text NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  artifact_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  source_agent_run_ref text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'artifact'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (artifact_ref, revision_number)
);

CREATE TABLE IF NOT EXISTS artifact.outbox_record (
  outbox_ref text PRIMARY KEY,
  event_name text NOT NULL,
  aggregate_ref text NOT NULL,
  payload jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'artifact'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  published_at timestamptz
);

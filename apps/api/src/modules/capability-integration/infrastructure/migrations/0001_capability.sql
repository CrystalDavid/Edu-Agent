CREATE SCHEMA IF NOT EXISTS capability;

CREATE TABLE IF NOT EXISTS capability.tool_execution (
  execution_ref text PRIMARY KEY,
  tool_name text NOT NULL,
  input jsonb NOT NULL,
  output jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'capability'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS capability.outbox_record (
  outbox_ref text PRIMARY KEY,
  event_name text NOT NULL,
  aggregate_ref text NOT NULL,
  payload jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'capability'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  published_at timestamptz
);

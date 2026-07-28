CREATE SCHEMA IF NOT EXISTS work;

CREATE TABLE IF NOT EXISTS work.task (
  task_ref text PRIMARY KEY,
  title text NOT NULL,
  status text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS work.task_run (
  task_run_ref text PRIMARY KEY,
  task_ref text NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  status text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS work.query_run (
  query_run_ref text PRIMARY KEY,
  query_name text NOT NULL,
  status text NOT NULL,
  resource_ref text NOT NULL,
  requested_field_mask jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS work.idempotency_record (
  idempotency_ref text PRIMARY KEY,
  root_key text NOT NULL UNIQUE,
  request_fingerprint text NOT NULL,
  result jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS work.outbox_record (
  outbox_ref text PRIMARY KEY,
  event_name text NOT NULL,
  aggregate_ref text NOT NULL,
  payload jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS work_outbox_unpublished_idx
  ON work.outbox_record (created_at)
  WHERE published_at IS NULL;

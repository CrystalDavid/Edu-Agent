CREATE TABLE IF NOT EXISTS runtime.authorized_context_plan (
  authorized_context_plan_ref text PRIMARY KEY,
  task_ref text NOT NULL,
  task_run_ref text NOT NULL,
  working_set_version integer NOT NULL CHECK (working_set_version > 0),
  authorized_resource_refs jsonb NOT NULL,
  authorized_evidence_refs jsonb NOT NULL,
  denied_resource_refs jsonb NOT NULL,
  requested_field_mask jsonb NOT NULL,
  content_hash text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'runtime'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (task_run_ref)
);

CREATE OR REPLACE FUNCTION runtime.reject_authorized_context_plan_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'AuthorizedContextPlan is immutable: %',
    OLD.authorized_context_plan_ref;
END
$$;

DROP TRIGGER IF EXISTS authorized_context_plan_immutable
  ON runtime.authorized_context_plan;
CREATE TRIGGER authorized_context_plan_immutable
  BEFORE UPDATE OR DELETE
  ON runtime.authorized_context_plan
  FOR EACH ROW
  EXECUTE FUNCTION runtime.reject_authorized_context_plan_mutation();

ALTER TABLE runtime.context_manifest
  ADD COLUMN IF NOT EXISTS authorized_context_plan_ref text;

CREATE INDEX IF NOT EXISTS authorized_context_plan_task_idx
  ON runtime.authorized_context_plan (
    task_ref,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS context_manifest_authorized_plan_idx
  ON runtime.context_manifest (authorized_context_plan_ref);

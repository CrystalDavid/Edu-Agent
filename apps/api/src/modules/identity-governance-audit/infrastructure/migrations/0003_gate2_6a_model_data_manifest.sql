CREATE TABLE IF NOT EXISTS governance.model_data_manifest (
  model_data_manifest_ref text PRIMARY KEY,
  task_run_ref text NOT NULL,
  context_manifest_ref text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('mock', 'volcengine-ark')),
  model_id_hash text NOT NULL,
  data_categories jsonb NOT NULL,
  resource_refs jsonb NOT NULL,
  field_names jsonb NOT NULL,
  synthetic_data_assertion boolean NOT NULL
    CHECK (synthetic_data_assertion = true),
  retention_policy text NOT NULL
    CHECK (
      retention_policy =
        'provider-transient-no-local-raw-content'
    ),
  tenant_ref text NOT NULL CHECK (tenant_ref = 'tenant:demo-school'),
  actor_ref text NOT NULL CHECK (actor_ref = 'user:teacher-001'),
  purpose text NOT NULL
    CHECK (purpose = 'teacher-copilot.lesson-preparation'),
  owner_module text NOT NULL CHECK (owner_module = 'governance'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS model_data_manifest_context_idx
  ON governance.model_data_manifest (context_manifest_ref);

CREATE INDEX IF NOT EXISTS model_data_manifest_task_run_idx
  ON governance.model_data_manifest (task_run_ref, created_at DESC);

CREATE OR REPLACE FUNCTION governance.reject_model_data_manifest_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'ModelDataManifest is immutable: %',
    OLD.model_data_manifest_ref;
END
$$;

DROP TRIGGER IF EXISTS model_data_manifest_immutable
  ON governance.model_data_manifest;
CREATE TRIGGER model_data_manifest_immutable
  BEFORE UPDATE OR DELETE
  ON governance.model_data_manifest
  FOR EACH ROW
  EXECUTE FUNCTION governance.reject_model_data_manifest_mutation();

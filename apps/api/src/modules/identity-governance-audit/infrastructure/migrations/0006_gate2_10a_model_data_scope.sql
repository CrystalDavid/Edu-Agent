ALTER TABLE governance.model_data_manifest
  DROP CONSTRAINT IF EXISTS model_data_manifest_tenant_ref_check;

ALTER TABLE governance.model_data_manifest
  DROP CONSTRAINT IF EXISTS model_data_manifest_actor_ref_check;

CREATE INDEX IF NOT EXISTS model_data_manifest_tenant_actor_idx
  ON governance.model_data_manifest (tenant_ref, actor_ref, created_at DESC);

COMMENT ON COLUMN governance.model_data_manifest.tenant_ref IS
  'Server-resolved organization/tenant scope. synthetic_data_assertion remains mandatory in Gate 2.10A.';

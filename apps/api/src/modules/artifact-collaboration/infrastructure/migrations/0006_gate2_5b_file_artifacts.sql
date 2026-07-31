CREATE TABLE IF NOT EXISTS artifact.file_asset (
  asset_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  display_name text NOT NULL,
  category text NOT NULL
    CHECK (
      category IN (
        'lesson_plan', 'reference', 'courseware', 'assessment',
        'worksheet', 'report', 'other'
      )
    ),
  source text NOT NULL
    CHECK (source IN ('upload', 'teaching_plan_export')),
  lifecycle_status text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'deleted')),
  current_version_ref text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'artifact'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS artifact.file_version (
  version_ref text PRIMARY KEY,
  asset_ref text NOT NULL
    REFERENCES artifact.file_asset (asset_ref),
  version_number integer NOT NULL CHECK (version_number > 0),
  original_file_name text NOT NULL,
  mime_type text NOT NULL,
  extension text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  object_key text NOT NULL UNIQUE,
  content_summary text,
  created_by text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'artifact'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (asset_ref, version_number)
);

ALTER TABLE artifact.file_asset
  ADD CONSTRAINT file_asset_current_version_fk
  FOREIGN KEY (current_version_ref)
  REFERENCES artifact.file_version (version_ref);

CREATE TABLE IF NOT EXISTS artifact.artifact_file_binding (
  binding_ref text PRIMARY KEY,
  asset_ref text NOT NULL
    REFERENCES artifact.file_asset (asset_ref),
  version_ref text NOT NULL
    REFERENCES artifact.file_version (version_ref),
  target_type text NOT NULL
    CHECK (
      target_type IN (
        'lesson', 'preparation_task',
        'teaching_plan_artifact', 'teaching_plan_revision'
      )
    ),
  target_ref text NOT NULL,
  relation_kind text NOT NULL
    CHECK (relation_kind IN ('reference', 'export', 'attachment')),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'artifact'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (version_ref, target_type, target_ref, relation_kind)
);

CREATE TABLE IF NOT EXISTS artifact.file_operation_idempotency (
  idempotency_ref text PRIMARY KEY,
  root_key text NOT NULL UNIQUE,
  request_fingerprint text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('processing', 'completed')),
  result jsonb,
  completed_at timestamptz,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'artifact'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS artifact.teaching_plan_file_export (
  export_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  teaching_plan_artifact_ref text NOT NULL,
  teaching_plan_revision_ref text NOT NULL,
  lesson_ref text NOT NULL,
  preparation_task_ref text,
  asset_ref text NOT NULL
    REFERENCES artifact.file_asset (asset_ref),
  version_ref text NOT NULL
    REFERENCES artifact.file_version (version_ref),
  export_format text NOT NULL CHECK (export_format = 'docx'),
  template_version text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'artifact'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (
    tenant_ref,
    teaching_plan_revision_ref,
    export_format,
    template_version
  )
);

CREATE INDEX IF NOT EXISTS file_asset_tenant_list_idx
  ON artifact.file_asset (
    tenant_ref,
    lifecycle_status,
    updated_at DESC,
    asset_ref
  );

CREATE INDEX IF NOT EXISTS file_version_asset_history_idx
  ON artifact.file_version (asset_ref, version_number DESC);

CREATE INDEX IF NOT EXISTS artifact_file_binding_target_idx
  ON artifact.artifact_file_binding (
    target_type,
    target_ref,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS teaching_plan_file_export_artifact_idx
  ON artifact.teaching_plan_file_export (
    teaching_plan_artifact_ref,
    created_at DESC
  );

CREATE OR REPLACE FUNCTION artifact.reject_file_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'FileVersion is immutable: %', OLD.version_ref;
END
$$;

DROP TRIGGER IF EXISTS file_version_immutable
  ON artifact.file_version;
CREATE TRIGGER file_version_immutable
  BEFORE UPDATE OR DELETE
  ON artifact.file_version
  FOR EACH ROW
  EXECUTE FUNCTION artifact.reject_file_version_mutation();

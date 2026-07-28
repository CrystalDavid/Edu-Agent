CREATE TABLE IF NOT EXISTS artifact.artifact (
  artifact_ref text PRIMARY KEY,
  artifact_type text NOT NULL,
  latest_published_revision_ref text,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'artifact'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

ALTER TABLE artifact.artifact_revision
  ALTER COLUMN source_agent_run_ref DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS parent_revision_ref text,
  ADD COLUMN IF NOT EXISTS revision_state text NOT NULL DEFAULT 'published'
    CHECK (revision_state IN ('draft', 'proposal', 'published')),
  ADD COLUMN IF NOT EXISTS content_hash text NOT NULL DEFAULT 'legacy';

CREATE INDEX IF NOT EXISTS artifact_revision_parent_idx
  ON artifact.artifact_revision (artifact_ref, parent_revision_ref);

CREATE OR REPLACE FUNCTION artifact.reject_published_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.revision_state = 'published' THEN
    RAISE EXCEPTION
      'Published ArtifactRevision is immutable: %',
      OLD.revision_ref;
  END IF;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS published_revision_immutable
  ON artifact.artifact_revision;
CREATE TRIGGER published_revision_immutable
  BEFORE UPDATE OR DELETE
  ON artifact.artifact_revision
  FOR EACH ROW
  EXECUTE FUNCTION artifact.reject_published_revision_mutation();

ALTER TABLE artifact.outbox_record
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'retry')),
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE INDEX IF NOT EXISTS artifact_outbox_claim_idx
  ON artifact.outbox_record (status, lease_expires_at, created_at)
  WHERE processed_at IS NULL;

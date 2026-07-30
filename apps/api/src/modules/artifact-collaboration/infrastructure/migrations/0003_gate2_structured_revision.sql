ALTER TABLE artifact.artifact
  ADD COLUMN IF NOT EXISTS latest_revision_ref text;

ALTER TABLE artifact.artifact_revision
  ADD COLUMN IF NOT EXISTS structured_content jsonb,
  ADD COLUMN IF NOT EXISTS change_reason text,
  ADD COLUMN IF NOT EXISTS evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS teacher_selection jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE artifact.artifact_revision
  DROP CONSTRAINT IF EXISTS artifact_revision_revision_state_check;

ALTER TABLE artifact.artifact_revision
  ADD CONSTRAINT artifact_revision_revision_state_check
    CHECK (
      revision_state IN (
        'draft',
        'proposal',
        'in_review',
        'published'
      )
    );

DROP TRIGGER IF EXISTS published_revision_immutable
  ON artifact.artifact_revision;

CREATE OR REPLACE FUNCTION artifact.reject_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.revision_state = 'published' THEN
    RAISE EXCEPTION
      'Published ArtifactRevision is immutable: %',
      OLD.revision_ref;
  END IF;
  RAISE EXCEPTION
    'ArtifactRevision is immutable: %',
    OLD.revision_ref;
END
$$;

DROP TRIGGER IF EXISTS artifact_revision_immutable
  ON artifact.artifact_revision;
CREATE TRIGGER artifact_revision_immutable
  BEFORE UPDATE OR DELETE
  ON artifact.artifact_revision
  FOR EACH ROW
  EXECUTE FUNCTION artifact.reject_revision_mutation();

CREATE INDEX IF NOT EXISTS artifact_revision_state_idx
  ON artifact.artifact_revision (
    artifact_ref,
    revision_state,
    revision_number DESC
  );

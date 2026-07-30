ALTER TABLE artifact.artifact
  ADD COLUMN IF NOT EXISTS current_approved_revision_ref text,
  ADD COLUMN IF NOT EXISTS current_in_review_revision_ref text;

ALTER TABLE artifact.artifact_revision
  DROP CONSTRAINT IF EXISTS artifact_revision_revision_state_check;

ALTER TABLE artifact.artifact_revision
  ADD CONSTRAINT artifact_revision_revision_state_check
    CHECK (
      revision_state IN (
        'draft',
        'proposal',
        'in_review',
        'approved',
        'published'
      )
    );

DROP TRIGGER IF EXISTS artifact_revision_immutable
  ON artifact.artifact_revision;

UPDATE artifact.artifact_revision
   SET revision_state = 'approved'
 WHERE artifact_type = 'TeachingPlan'
   AND revision_number = 1
   AND source_agent_run_ref IS NULL
   AND teacher_selection ->> 'source' = 'synthetic-seed'
   AND revision_state = 'draft';

UPDATE artifact.artifact AS artifact_record
   SET current_approved_revision_ref = (
     SELECT revision.revision_ref
       FROM artifact.artifact_revision AS revision
      WHERE revision.artifact_ref = artifact_record.artifact_ref
        AND revision.artifact_type = 'TeachingPlan'
        AND revision.revision_state = 'approved'
      ORDER BY revision.revision_number DESC
      LIMIT 1
   )
 WHERE artifact_record.current_approved_revision_ref IS NULL
   AND EXISTS (
     SELECT 1
       FROM artifact.artifact_revision AS revision
      WHERE revision.artifact_ref = artifact_record.artifact_ref
        AND revision.artifact_type = 'TeachingPlan'
        AND revision.revision_state = 'approved'
   );

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
  IF OLD.revision_state = 'approved' THEN
    RAISE EXCEPTION
      'Approved ArtifactRevision is immutable: %',
      OLD.revision_ref;
  END IF;
  RAISE EXCEPTION
    'ArtifactRevision is immutable: %',
    OLD.revision_ref;
END
$$;

CREATE TRIGGER artifact_revision_immutable
  BEFORE UPDATE OR DELETE
  ON artifact.artifact_revision
  FOR EACH ROW
  EXECUTE FUNCTION artifact.reject_revision_mutation();

CREATE INDEX IF NOT EXISTS teaching_plan_lifecycle_idx
  ON artifact.artifact_revision (
    artifact_ref,
    artifact_type,
    revision_state,
    revision_number DESC
  )
  WHERE artifact_type = 'TeachingPlan';

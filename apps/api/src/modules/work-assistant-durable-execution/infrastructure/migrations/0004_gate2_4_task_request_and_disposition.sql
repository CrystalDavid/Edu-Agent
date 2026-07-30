ALTER TABLE work.task
  ADD COLUMN IF NOT EXISTS request_payload jsonb NOT NULL
    DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS request_version integer NOT NULL
    DEFAULT 1;

ALTER TABLE work.task
  DROP CONSTRAINT IF EXISTS task_request_version_check;
ALTER TABLE work.task
  ADD CONSTRAINT task_request_version_check
    CHECK (request_version > 0);

UPDATE work.task
   SET request_payload = jsonb_build_object(
     'requestText', title,
     'actorRef', actor_ref,
     'purpose', purpose,
     'courseRunRef', 'course-run:legacy',
     'learningObjectiveRefs',
       jsonb_build_array('learning-objective:legacy'),
     'selectedEvidenceRefs',
       jsonb_build_array('evidence:legacy'),
     'createdAt', to_jsonb(created_at),
     'requestVersion', 1
   )
 WHERE request_payload = '{}'::jsonb;

ALTER TABLE work.suggestion_disposition
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

UPDATE work.suggestion_disposition
   SET request_fingerprint = 'legacy:' || disposition_ref
 WHERE request_fingerprint IS NULL;

ALTER TABLE work.suggestion_disposition
  ALTER COLUMN request_fingerprint SET NOT NULL;

CREATE INDEX IF NOT EXISTS task_request_course_idx
  ON work.task (
    (request_payload ->> 'courseRunRef'),
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS suggestion_disposition_fingerprint_idx
  ON work.suggestion_disposition (
    proposal_revision_ref,
    request_fingerprint
  );

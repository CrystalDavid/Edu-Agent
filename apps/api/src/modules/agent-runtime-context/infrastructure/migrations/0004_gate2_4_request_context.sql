ALTER TABLE runtime.context_manifest
  ADD COLUMN IF NOT EXISTS task_ref text,
  ADD COLUMN IF NOT EXISTS request_summary jsonb NOT NULL
    DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS request_version integer NOT NULL
    DEFAULT 1;

UPDATE runtime.context_manifest
   SET request_summary = jsonb_build_object(
     'requestText', 'Legacy Teacher Copilot request',
     'actorRef', actor_ref,
     'purpose', purpose,
     'courseRunRef',
       coalesce(resource_refs ->> 0, 'course-run:legacy'),
     'learningObjectiveRefs',
       jsonb_build_array(
         coalesce(resource_refs ->> 3, 'learning-objective:legacy')
       ),
     'selectedEvidenceRefs',
       CASE
         WHEN jsonb_array_length(evidence_refs) > 0
           THEN evidence_refs
         ELSE jsonb_build_array('evidence:legacy')
       END,
     'createdAt', to_jsonb(created_at),
     'requestVersion', 1
   )
 WHERE request_summary = '{}'::jsonb;

ALTER TABLE runtime.context_manifest
  DROP CONSTRAINT IF EXISTS context_manifest_request_version_check;
ALTER TABLE runtime.context_manifest
  ADD CONSTRAINT context_manifest_request_version_check
    CHECK (request_version > 0);

CREATE INDEX IF NOT EXISTS context_manifest_task_ref_idx
  ON runtime.context_manifest (task_ref);

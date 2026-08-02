ALTER TABLE capability.model_execution
  ADD COLUMN IF NOT EXISTS result_kind text NOT NULL DEFAULT 'teaching_proposal',
  ADD COLUMN IF NOT EXISTS result_ref text;

ALTER TABLE capability.model_execution
  DROP CONSTRAINT IF EXISTS model_execution_result_kind_check;

ALTER TABLE capability.model_execution
  ADD CONSTRAINT model_execution_result_kind_check CHECK (
    result_kind IN ('teaching_proposal', 'lesson_reflection_draft')
  );

UPDATE capability.model_execution
   SET result_ref = proposal_revision_ref
 WHERE result_ref IS NULL
   AND proposal_revision_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS model_execution_result_idx
  ON capability.model_execution (result_kind, result_ref)
  WHERE result_ref IS NOT NULL;


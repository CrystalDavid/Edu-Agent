ALTER TABLE work.task_run
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE work.task_run
   SET updated_at = COALESCE(updated_at, created_at),
       completed_at = CASE
         WHEN status = 'completed'
           THEN COALESCE(completed_at, created_at)
         ELSE completed_at
       END
 WHERE updated_at IS NULL
    OR (status = 'completed' AND completed_at IS NULL);

ALTER TABLE work.task_run
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS task_run_status_idx
  ON work.task_run (status, updated_at DESC);

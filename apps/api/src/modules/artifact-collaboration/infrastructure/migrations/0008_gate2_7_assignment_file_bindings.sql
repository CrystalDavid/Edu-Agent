ALTER TABLE artifact.artifact_file_binding
  DROP CONSTRAINT IF EXISTS artifact_file_binding_target_type_check;

ALTER TABLE artifact.artifact_file_binding
  ADD CONSTRAINT artifact_file_binding_target_type_check
  CHECK (
    target_type IN (
      'lesson', 'preparation_task',
      'teaching_plan_artifact', 'teaching_plan_revision',
      'assignment', 'assignment_version'
    )
  );

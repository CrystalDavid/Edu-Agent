ALTER TABLE governance.model_data_manifest
  DROP CONSTRAINT IF EXISTS model_data_manifest_purpose_check;

ALTER TABLE governance.model_data_manifest
  ADD CONSTRAINT model_data_manifest_purpose_check CHECK (
    purpose IN (
      'teacher-copilot.lesson-preparation',
      'teacher-copilot.lesson-reflection'
    )
  );

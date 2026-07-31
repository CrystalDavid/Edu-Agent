ALTER TABLE artifact.file_version
  DROP CONSTRAINT IF EXISTS file_version_object_key_key;

CREATE INDEX IF NOT EXISTS file_version_object_key_idx
  ON artifact.file_version (object_key);

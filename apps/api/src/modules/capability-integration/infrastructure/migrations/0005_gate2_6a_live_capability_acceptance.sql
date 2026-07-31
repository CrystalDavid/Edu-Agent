ALTER TABLE capability.provider_capability_snapshot
  ADD COLUMN live boolean NOT NULL DEFAULT false,
  ADD COLUMN image_url_status text NOT NULL DEFAULT 'not_tested'
    CHECK (image_url_status IN (
      'supported', 'unsupported', 'partially_supported', 'not_tested'
    )),
  ADD COLUMN json_object_status text NOT NULL DEFAULT 'not_tested'
    CHECK (json_object_status IN (
      'supported', 'unsupported', 'partially_supported', 'not_tested'
    )),
  ADD COLUMN json_schema_status text NOT NULL DEFAULT 'not_tested'
    CHECK (json_schema_status IN (
      'supported', 'unsupported', 'partially_supported', 'not_tested'
    )),
  ADD COLUMN function_calling_status text NOT NULL DEFAULT 'not_tested'
    CHECK (function_calling_status IN (
      'supported', 'unsupported', 'partially_supported', 'not_tested'
    )),
  ADD COLUMN streaming_status text NOT NULL DEFAULT 'not_tested'
    CHECK (streaming_status IN (
      'supported', 'unsupported', 'partially_supported', 'not_tested'
    ));

UPDATE capability.provider_capability_snapshot
   SET image_url_status = CASE
         WHEN supports_image_url THEN 'supported'
         ELSE 'unsupported'
       END,
       json_object_status = CASE
         WHEN supports_json_object THEN 'supported'
         ELSE 'unsupported'
       END,
       json_schema_status = CASE
         WHEN supports_json_schema THEN 'supported'
         ELSE 'unsupported'
       END,
       function_calling_status = CASE
         WHEN supports_function_calling THEN 'supported'
         ELSE 'unsupported'
       END,
       streaming_status = CASE
         WHEN supports_streaming THEN 'supported'
         ELSE 'unsupported'
       END;

CREATE INDEX provider_capability_snapshot_live_latest_idx
  ON capability.provider_capability_snapshot (
    provider,
    live,
    checked_at DESC
  );

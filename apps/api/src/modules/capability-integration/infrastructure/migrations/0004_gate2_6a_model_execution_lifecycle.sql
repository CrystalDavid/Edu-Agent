ALTER TABLE capability.model_execution
  DROP CONSTRAINT IF EXISTS model_execution_provider_check;

ALTER TABLE capability.model_execution
  DROP CONSTRAINT IF EXISTS model_execution_external_network_used_check;

ALTER TABLE capability.model_execution
  ALTER COLUMN output DROP NOT NULL,
  ALTER COLUMN usage_summary DROP NOT NULL;

ALTER TABLE capability.model_execution
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS model_id text,
  ADD COLUMN IF NOT EXISTS model_display_name text,
  ADD COLUMN IF NOT EXISTS task_ref text,
  ADD COLUMN IF NOT EXISTS task_run_ref text,
  ADD COLUMN IF NOT EXISTS agent_run_ref text,
  ADD COLUMN IF NOT EXISTS prompt_bundle_version integer,
  ADD COLUMN IF NOT EXISTS context_manifest_ref text,
  ADD COLUMN IF NOT EXISTS authorized_context_plan_ref text,
  ADD COLUMN IF NOT EXISTS model_data_manifest_ref text,
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS timeout_ms integer,
  ADD COLUMN IF NOT EXISTS max_output_tokens integer,
  ADD COLUMN IF NOT EXISTS input_tokens integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer,
  ADD COLUMN IF NOT EXISTS total_tokens integer,
  ADD COLUMN IF NOT EXISTS estimated_cost numeric(18, 8),
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS provider_request_id text,
  ADD COLUMN IF NOT EXISTS finish_reason text,
  ADD COLUMN IF NOT EXISTS safe_error_category text,
  ADD COLUMN IF NOT EXISTS safe_message text,
  ADD COLUMN IF NOT EXISTS output_schema_version text,
  ADD COLUMN IF NOT EXISTS output_hash text,
  ADD COLUMN IF NOT EXISTS proposal_revision_ref text,
  ADD COLUMN IF NOT EXISTS retry_of_execution_ref text,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE capability.model_execution
   SET status = COALESCE(status, 'succeeded'),
       model_id = COALESCE(model_id, model_profile),
       model_display_name = COALESCE(model_display_name, model_profile),
       agent_run_ref = COALESCE(
         agent_run_ref,
         input_summary ->> 'agentRunRef'
       ),
       prompt_bundle_version = COALESCE(prompt_bundle_version, 1),
       request_hash = COALESCE(request_hash, execution_ref),
       attempt_count = GREATEST(attempt_count, 1),
       output_schema_version = COALESCE(
         output_schema_version,
         'gate2-legacy-strategies@1'
       ),
       queued_at = COALESCE(queued_at, created_at),
       completed_at = COALESCE(completed_at, created_at),
       updated_at = COALESCE(updated_at, created_at)
 WHERE status IS NULL
    OR model_id IS NULL
    OR request_hash IS NULL
    OR updated_at IS NULL;

ALTER TABLE capability.model_execution
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN model_id SET NOT NULL,
  ALTER COLUMN model_display_name SET NOT NULL,
  ALTER COLUMN prompt_bundle_version SET NOT NULL,
  ALTER COLUMN request_hash SET NOT NULL,
  ALTER COLUMN output_schema_version SET NOT NULL,
  ALTER COLUMN queued_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE capability.model_execution
  DROP CONSTRAINT IF EXISTS model_execution_status_check;
ALTER TABLE capability.model_execution
  ADD CONSTRAINT model_execution_status_check CHECK (
    status IN (
      'queued',
      'running',
      'validating',
      'succeeded',
      'timed_out',
      'retryable_failed',
      'permanently_failed',
      'validation_failed',
      'budget_exceeded',
      'cancel_requested',
      'cancelled'
    )
  );

ALTER TABLE capability.model_execution
  DROP CONSTRAINT IF EXISTS model_execution_provider_v2_check;
ALTER TABLE capability.model_execution
  ADD CONSTRAINT model_execution_provider_v2_check CHECK (
    provider IN ('mock', 'volcengine-ark')
  );

ALTER TABLE capability.model_execution
  DROP CONSTRAINT IF EXISTS model_execution_attempt_count_check;
ALTER TABLE capability.model_execution
  ADD CONSTRAINT model_execution_attempt_count_check
    CHECK (attempt_count >= 0 AND max_attempts > 0);

ALTER TABLE capability.model_execution
  DROP CONSTRAINT IF EXISTS model_execution_token_check;
ALTER TABLE capability.model_execution
  ADD CONSTRAINT model_execution_token_check CHECK (
    (input_tokens IS NULL OR input_tokens >= 0)
    AND (output_tokens IS NULL OR output_tokens >= 0)
    AND (total_tokens IS NULL OR total_tokens >= 0)
    AND (estimated_cost IS NULL OR estimated_cost >= 0)
    AND (latency_ms IS NULL OR latency_ms >= 0)
  );

CREATE UNIQUE INDEX IF NOT EXISTS model_execution_task_run_active_unique
  ON capability.model_execution (task_run_ref)
  WHERE retry_of_execution_ref IS NULL
    AND task_run_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS model_execution_status_queue_idx
  ON capability.model_execution (status, queued_at, execution_ref);

CREATE INDEX IF NOT EXISTS model_execution_request_hash_idx
  ON capability.model_execution (request_hash, status, completed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS model_execution_active_retry_unique
  ON capability.model_execution (retry_of_execution_ref)
  WHERE retry_of_execution_ref IS NOT NULL
    AND status IN (
      'queued',
      'running',
      'validating',
      'retryable_failed',
      'cancel_requested'
    );

CREATE TABLE IF NOT EXISTS capability.model_execution_event (
  event_ref text PRIMARY KEY,
  execution_ref text NOT NULL
    REFERENCES capability.model_execution (execution_ref),
  from_status text,
  to_status text NOT NULL,
  attempt integer NOT NULL CHECK (attempt >= 0),
  safe_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'capability'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS model_execution_event_timeline_idx
  ON capability.model_execution_event (
    execution_ref,
    created_at,
    event_ref
  );

CREATE TABLE IF NOT EXISTS capability.model_budget_decision (
  decision_ref text PRIMARY KEY,
  execution_ref text NOT NULL
    REFERENCES capability.model_execution (execution_ref),
  allowed boolean NOT NULL,
  reason_code text NOT NULL,
  estimated_input_tokens integer NOT NULL CHECK (estimated_input_tokens >= 0),
  requested_output_tokens integer NOT NULL CHECK (requested_output_tokens >= 0),
  estimated_maximum_cost numeric(18, 8) NOT NULL
    CHECK (estimated_maximum_cost >= 0),
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'capability'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS capability.provider_capability_snapshot (
  snapshot_ref text PRIMARY KEY,
  provider text NOT NULL CHECK (provider = 'volcengine-ark'),
  model_id_hash text NOT NULL,
  supports_text boolean NOT NULL,
  supports_image_url boolean NOT NULL,
  supports_json_object boolean NOT NULL,
  supports_json_schema boolean NOT NULL,
  supports_function_calling boolean NOT NULL,
  supports_streaming boolean NOT NULL,
  reports_usage boolean NOT NULL,
  reports_request_id boolean NOT NULL,
  reported_model_matches boolean NOT NULL,
  checked_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'capability'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS provider_capability_snapshot_latest_idx
  ON capability.provider_capability_snapshot (
    provider,
    checked_at DESC
  );

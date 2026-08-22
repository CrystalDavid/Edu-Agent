CREATE TABLE IF NOT EXISTS runtime.working_memory_snapshot (
  snapshot_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  conversation_ref text NOT NULL,
  source_turn_sequence integer NOT NULL CHECK (source_turn_sequence > 0),
  status text NOT NULL CHECK (
    status IN ('building', 'active', 'superseded', 'invalidated', 'expired')
  ),
  active_goal jsonb NOT NULL,
  recent_teacher_requests jsonb NOT NULL,
  referents jsonb NOT NULL,
  pending_intents jsonb NOT NULL,
  selected_options jsonb NOT NULL,
  temporary_overrides jsonb NOT NULL,
  latest_assistant_result jsonb,
  rolling_summary text NOT NULL,
  builder_version text NOT NULL,
  policy_version text NOT NULL,
  source_refs jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  content_hash text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'runtime'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_ref, teacher_ref, conversation_ref, version),
  CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS working_memory_active_idx
  ON runtime.working_memory_snapshot (tenant_ref, teacher_ref, conversation_ref)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS working_memory_source_idx
  ON runtime.working_memory_snapshot (
    tenant_ref,
    teacher_ref,
    conversation_ref,
    source_turn_sequence DESC
  );

CREATE INDEX IF NOT EXISTS working_memory_expiry_idx
  ON runtime.working_memory_snapshot (status, expires_at);

CREATE OR REPLACE FUNCTION runtime.protect_working_memory_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'working memory snapshots are retained as revisions';
  END IF;
  IF NEW.status NOT IN ('superseded', 'invalidated', 'expired')
     OR OLD.status <> 'active'
     OR NEW.snapshot_ref IS DISTINCT FROM OLD.snapshot_ref
     OR NEW.tenant_ref IS DISTINCT FROM OLD.tenant_ref
     OR NEW.teacher_ref IS DISTINCT FROM OLD.teacher_ref
     OR NEW.conversation_ref IS DISTINCT FROM OLD.conversation_ref
     OR NEW.source_turn_sequence IS DISTINCT FROM OLD.source_turn_sequence
     OR NEW.active_goal IS DISTINCT FROM OLD.active_goal
     OR NEW.recent_teacher_requests IS DISTINCT FROM OLD.recent_teacher_requests
     OR NEW.referents IS DISTINCT FROM OLD.referents
     OR NEW.pending_intents IS DISTINCT FROM OLD.pending_intents
     OR NEW.selected_options IS DISTINCT FROM OLD.selected_options
     OR NEW.temporary_overrides IS DISTINCT FROM OLD.temporary_overrides
     OR NEW.latest_assistant_result IS DISTINCT FROM OLD.latest_assistant_result
     OR NEW.rolling_summary IS DISTINCT FROM OLD.rolling_summary
     OR NEW.builder_version IS DISTINCT FROM OLD.builder_version
     OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
     OR NEW.source_refs IS DISTINCT FROM OLD.source_refs
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
     OR NEW.actor_ref IS DISTINCT FROM OLD.actor_ref
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.owner_module IS DISTINCT FROM OLD.owner_module
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.authorization_decision_ref IS DISTINCT FROM OLD.authorization_decision_ref
     OR NEW.audit_ref IS DISTINCT FROM OLD.audit_ref
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'working memory snapshot payloads are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS working_memory_snapshot_protect
  ON runtime.working_memory_snapshot;
CREATE TRIGGER working_memory_snapshot_protect
  BEFORE UPDATE OR DELETE ON runtime.working_memory_snapshot
  FOR EACH ROW EXECUTE FUNCTION runtime.protect_working_memory_snapshot();

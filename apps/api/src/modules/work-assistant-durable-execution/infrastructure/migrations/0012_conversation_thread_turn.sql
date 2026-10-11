CREATE TABLE IF NOT EXISTS work.conversation_thread (
  conversation_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  task_ref text NOT NULL REFERENCES work.task (task_ref),
  purpose_family text NOT NULL CHECK (
    purpose_family IN ('lesson_preparation')
  ),
  status text NOT NULL CHECK (status IN ('active', 'closed', 'expired')),
  course_run_ref text NOT NULL,
  lesson_ref text NOT NULL,
  current_version integer NOT NULL CHECK (current_version > 0),
  last_turn_sequence integer NOT NULL DEFAULT 0 CHECK (last_turn_sequence >= 0),
  last_turn_ref text,
  retention_until timestamptz NOT NULL,
  policy_version text NOT NULL,
  content_hash text NOT NULL,
  updated_at timestamptz NOT NULL,
  closed_at timestamptz,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK (retention_until > created_at),
  CHECK (
    (status = 'active' AND closed_at IS NULL)
    OR (status IN ('closed', 'expired') AND closed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS conversation_thread_owner_status_idx
  ON work.conversation_thread (
    tenant_ref,
    teacher_ref,
    status,
    updated_at DESC
  );

CREATE INDEX IF NOT EXISTS conversation_thread_task_idx
  ON work.conversation_thread (tenant_ref, teacher_ref, task_ref, updated_at DESC);

CREATE INDEX IF NOT EXISTS conversation_thread_retention_idx
  ON work.conversation_thread (status, retention_until);

CREATE TABLE IF NOT EXISTS work.conversation_turn (
  turn_ref text PRIMARY KEY,
  conversation_ref text NOT NULL REFERENCES work.conversation_thread (conversation_ref),
  sequence integer NOT NULL CHECK (sequence > 0),
  parent_turn_ref text REFERENCES work.conversation_turn (turn_ref),
  actor_kind text NOT NULL CHECK (
    actor_kind IN ('teacher', 'assistant_surface', 'system_event')
  ),
  content_kind text NOT NULL CHECK (
    content_kind IN ('teacher_text', 'safe_surface_summary', 'command', 'result_link')
  ),
  teacher_text text,
  surface_summary text,
  task_run_ref text REFERENCES work.task_run (task_run_ref),
  agent_run_ref text,
  model_execution_ref text,
  proposal_revision_ref text,
  content_hash text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (conversation_ref, sequence),
  CHECK (
    (actor_kind = 'teacher'
      AND content_kind = 'teacher_text'
      AND teacher_text IS NOT NULL
      AND length(btrim(teacher_text)) BETWEEN 1 AND 2000
      AND surface_summary IS NULL)
    OR
    (actor_kind IN ('assistant_surface', 'system_event')
      AND teacher_text IS NULL
      AND surface_summary IS NOT NULL
      AND length(btrim(surface_summary)) BETWEEN 1 AND 1000)
  )
);

CREATE INDEX IF NOT EXISTS conversation_turn_thread_sequence_idx
  ON work.conversation_turn (conversation_ref, sequence);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_turn_proposal_idx
  ON work.conversation_turn (conversation_ref, proposal_revision_ref)
  WHERE proposal_revision_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION work.reject_conversation_turn_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ConversationTurn is immutable: %', OLD.turn_ref;
END
$$;

DROP TRIGGER IF EXISTS conversation_turn_no_update
  ON work.conversation_turn;
CREATE TRIGGER conversation_turn_no_update
  BEFORE UPDATE OR DELETE ON work.conversation_turn
  FOR EACH ROW EXECUTE FUNCTION work.reject_conversation_turn_mutation();

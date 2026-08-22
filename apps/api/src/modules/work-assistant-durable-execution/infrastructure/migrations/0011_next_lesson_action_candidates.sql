CREATE TABLE IF NOT EXISTS work.next_lesson_action_candidate (
  candidate_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  source_reflection_ref text NOT NULL,
  source_reflection_revision_ref text NOT NULL,
  source_agent_run_ref text NOT NULL,
  context_manifest_ref text NOT NULL,
  candidate_type text NOT NULL CHECK (
    candidate_type IN (
      'adjust_next_lesson_focus',
      'create_practice_task',
      'create_teacher_todo',
      'review_student_issue'
    )
  ),
  title text NOT NULL,
  reason text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  status text NOT NULL CHECK (
    status IN ('candidate', 'accepted', 'rejected', 'expired')
  ),
  version integer NOT NULL CHECK (version > 0),
  target_lesson_ref text,
  target_ref text,
  deep_link text,
  teacher_note text,
  source_refs jsonb NOT NULL,
  generated_by_skill_ref text NOT NULL,
  expires_at timestamptz,
  decided_at timestamptz,
  updated_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK (
    (status = 'accepted' AND target_ref IS NOT NULL AND deep_link IS NOT NULL AND decided_at IS NOT NULL)
    OR (status IN ('rejected', 'expired') AND decided_at IS NOT NULL)
    OR (status = 'candidate' AND target_ref IS NULL AND deep_link IS NULL AND decided_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS next_lesson_action_reflection_idx
  ON work.next_lesson_action_candidate (
    tenant_ref,
    teacher_ref,
    source_reflection_ref,
    created_at DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS next_lesson_action_run_key_idx
  ON work.next_lesson_action_candidate (source_agent_run_ref, candidate_type);

CREATE TABLE IF NOT EXISTS work.next_lesson_action_history (
  history_ref text PRIMARY KEY,
  candidate_ref text NOT NULL REFERENCES work.next_lesson_action_candidate (candidate_ref),
  candidate_version integer NOT NULL CHECK (candidate_version > 0),
  change_kind text NOT NULL CHECK (
    change_kind IN ('created', 'updated', 'accepted', 'rejected', 'expired')
  ),
  snapshot jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'work'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (candidate_ref, candidate_version)
);

DROP TRIGGER IF EXISTS next_lesson_action_history_no_update
  ON work.next_lesson_action_history;
CREATE TRIGGER next_lesson_action_history_no_update
  BEFORE UPDATE OR DELETE ON work.next_lesson_action_history
  FOR EACH ROW EXECUTE FUNCTION work.reject_teacher_work_history_mutation();

ALTER TABLE artifact.artifact_revision
  DROP CONSTRAINT IF EXISTS artifact_revision_revision_state_check;

ALTER TABLE artifact.artifact_revision
  ADD CONSTRAINT artifact_revision_revision_state_check
    CHECK (
      revision_state IN (
        'draft',
        'proposal',
        'in_review',
        'superseded',
        'approved',
        'confirmed',
        'published'
      )
    );

CREATE TABLE IF NOT EXISTS artifact.lesson_reflection_scope (
  scope_ref text PRIMARY KEY,
  artifact_ref text NOT NULL REFERENCES artifact.artifact (artifact_ref),
  revision_ref text NOT NULL UNIQUE REFERENCES artifact.artifact_revision (revision_ref),
  tenant_ref text NOT NULL,
  course_run_ref text NOT NULL,
  lesson_ref text NOT NULL,
  teaching_plan_revision_ref text NOT NULL,
  delivery_revision_ref text NOT NULL,
  observation_revision_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  assignment_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  lifecycle_status text NOT NULL CHECK (
    lifecycle_status IN ('draft', 'current_confirmed', 'historical_confirmed', 'superseded')
  ),
  source_agent_run_ref text,
  confirmed_by text,
  confirmed_at timestamptz,
  content_hash text NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'artifact'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS lesson_reflection_active_draft_unique
  ON artifact.lesson_reflection_scope (artifact_ref)
  WHERE lifecycle_status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS lesson_reflection_active_delivery_unique
  ON artifact.lesson_reflection_scope (tenant_ref, delivery_revision_ref)
  WHERE lifecycle_status IN ('draft', 'current_confirmed');

CREATE UNIQUE INDEX IF NOT EXISTS lesson_reflection_current_confirmed_unique
  ON artifact.lesson_reflection_scope (delivery_revision_ref)
  WHERE lifecycle_status = 'current_confirmed';

CREATE INDEX IF NOT EXISTS lesson_reflection_lesson_history_idx
  ON artifact.lesson_reflection_scope (tenant_ref, lesson_ref, updated_at DESC);

CREATE OR REPLACE FUNCTION artifact.protect_gate29_reflection_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LessonReflection scope history cannot be deleted';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['lifecycle_status', 'updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['lifecycle_status', 'updated_at']) THEN
    RAISE EXCEPTION 'LessonReflection confirmed scope is immutable';
  END IF;
  IF OLD.lifecycle_status = 'draft' AND NEW.lifecycle_status = 'superseded' THEN
    RETURN NEW;
  END IF;
  IF OLD.lifecycle_status = 'current_confirmed'
     AND NEW.lifecycle_status = 'historical_confirmed' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid LessonReflection lifecycle transition';
END
$$;

DROP TRIGGER IF EXISTS lesson_reflection_scope_history_guard
  ON artifact.lesson_reflection_scope;
CREATE TRIGGER lesson_reflection_scope_history_guard
  BEFORE UPDATE OR DELETE ON artifact.lesson_reflection_scope
  FOR EACH ROW EXECUTE FUNCTION artifact.protect_gate29_reflection_scope();

CREATE TABLE IF NOT EXISTS artifact.lesson_reflection_event (
  event_ref text PRIMARY KEY,
  artifact_ref text NOT NULL,
  revision_ref text NOT NULL,
  lesson_ref text NOT NULL,
  delivery_revision_ref text NOT NULL,
  event_name text NOT NULL CHECK (
    event_name IN (
      'LessonReflectionDraftCreated',
      'LessonReflectionDraftGenerated',
      'LessonReflectionDraftEdited',
      'LessonReflectionConfirmed',
      'LessonReflectionSuperseded'
    )
  ),
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'artifact'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

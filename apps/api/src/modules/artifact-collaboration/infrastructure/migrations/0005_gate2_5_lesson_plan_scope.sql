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
        'published'
      )
    );

CREATE TABLE IF NOT EXISTS artifact.teaching_plan_scope_lifecycle (
  scope_ref text PRIMARY KEY,
  artifact_ref text NOT NULL
    REFERENCES artifact.artifact (artifact_ref),
  revision_ref text NOT NULL UNIQUE
    REFERENCES artifact.artifact_revision (revision_ref),
  lesson_ref text NOT NULL,
  preparation_task_ref text,
  lifecycle_status text NOT NULL
    CHECK (
      lifecycle_status IN (
        'draft',
        'active_in_review',
        'superseded',
        'current_approved',
        'historical_approved'
      )
    ),
  superseded_by_revision_ref text,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'artifact'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS artifact.teaching_plan_scope_event (
  event_ref text PRIMARY KEY,
  artifact_ref text NOT NULL,
  revision_ref text NOT NULL,
  lesson_ref text NOT NULL,
  preparation_task_ref text,
  event_name text NOT NULL
    CHECK (
      event_name IN (
        'TeachingPlanDraftScoped',
        'TeachingPlanReviewActivated',
        'TeachingPlanReviewSuperseded',
        'TeachingPlanApprovedForLesson'
      )
    ),
  event_payload jsonb NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'artifact'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS teaching_plan_active_review_unique
  ON artifact.teaching_plan_scope_lifecycle (lesson_ref)
  WHERE lifecycle_status = 'active_in_review';

CREATE UNIQUE INDEX IF NOT EXISTS teaching_plan_current_approved_unique
  ON artifact.teaching_plan_scope_lifecycle (lesson_ref)
  WHERE lifecycle_status = 'current_approved';

CREATE INDEX IF NOT EXISTS teaching_plan_scope_task_idx
  ON artifact.teaching_plan_scope_lifecycle (
    preparation_task_ref,
    lifecycle_status,
    updated_at DESC
  );

CREATE INDEX IF NOT EXISTS teaching_plan_scope_lesson_history_idx
  ON artifact.teaching_plan_scope_lifecycle (
    lesson_ref,
    updated_at DESC
  );

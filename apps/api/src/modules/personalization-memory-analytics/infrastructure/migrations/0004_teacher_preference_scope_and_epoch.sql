ALTER TABLE personalization.teacher_preference
  ADD COLUMN IF NOT EXISTS canonical_key text,
  ADD COLUMN IF NOT EXISTS scope_kind text,
  ADD COLUMN IF NOT EXISTS scope_subject text,
  ADD COLUMN IF NOT EXISTS scope_grade_level text,
  ADD COLUMN IF NOT EXISTS scope_course_run_ref text,
  ADD COLUMN IF NOT EXISTS scope_lesson_ref text,
  ADD COLUMN IF NOT EXISTS scope_task_ref text,
  ADD COLUMN IF NOT EXISTS scope_skill_ids jsonb,
  ADD COLUMN IF NOT EXISTS scope_fingerprint text,
  ADD COLUMN IF NOT EXISTS valid_from timestamptz,
  ADD COLUMN IF NOT EXISTS valid_until timestamptz,
  ADD COLUMN IF NOT EXISTS explicitness text,
  ADD COLUMN IF NOT EXISTS consent_basis text,
  ADD COLUMN IF NOT EXISTS consent_version text,
  ADD COLUMN IF NOT EXISTS policy_version text;

ALTER TABLE personalization.teacher_preference_revision
  ADD COLUMN IF NOT EXISTS canonical_key text,
  ADD COLUMN IF NOT EXISTS scope_kind text,
  ADD COLUMN IF NOT EXISTS scope_subject text,
  ADD COLUMN IF NOT EXISTS scope_grade_level text,
  ADD COLUMN IF NOT EXISTS scope_course_run_ref text,
  ADD COLUMN IF NOT EXISTS scope_lesson_ref text,
  ADD COLUMN IF NOT EXISTS scope_task_ref text,
  ADD COLUMN IF NOT EXISTS scope_skill_ids jsonb,
  ADD COLUMN IF NOT EXISTS scope_fingerprint text,
  ADD COLUMN IF NOT EXISTS valid_from timestamptz,
  ADD COLUMN IF NOT EXISTS valid_until timestamptz,
  ADD COLUMN IF NOT EXISTS explicitness text,
  ADD COLUMN IF NOT EXISTS consent_basis text,
  ADD COLUMN IF NOT EXISTS consent_version text,
  ADD COLUMN IF NOT EXISTS policy_version text;

UPDATE personalization.teacher_preference
   SET canonical_key = lower(trim(preference_key)),
       scope_kind = 'global',
       scope_subject = NULL,
       scope_grade_level = NULL,
       scope_course_run_ref = NULL,
       scope_lesson_ref = NULL,
       scope_task_ref = NULL,
       scope_skill_ids = '[]'::jsonb,
       scope_fingerprint =
         '9236aceb0f398f41960671056c4c44d8de8de8169ba34dddd251fc885cad8a2b',
       valid_from = confirmed_at,
       valid_until = NULL,
       explicitness = 'teacher_declared',
       consent_basis = 'teacher_settings_confirmed',
       consent_version = 'consent:teacher-settings@1',
       policy_version = 'teacher-preference-scope@1'
 WHERE canonical_key IS NULL;

ALTER TABLE personalization.teacher_preference_revision
  DISABLE TRIGGER teacher_preference_revision_immutable;

UPDATE personalization.teacher_preference_revision
   SET canonical_key = lower(trim(preference_key)),
       scope_kind = 'global',
       scope_subject = NULL,
       scope_grade_level = NULL,
       scope_course_run_ref = NULL,
       scope_lesson_ref = NULL,
       scope_task_ref = NULL,
       scope_skill_ids = '[]'::jsonb,
       scope_fingerprint =
         '9236aceb0f398f41960671056c4c44d8de8de8169ba34dddd251fc885cad8a2b',
       valid_from = confirmed_at,
       valid_until = NULL,
       explicitness = 'teacher_declared',
       consent_basis = 'teacher_settings_confirmed',
       consent_version = 'consent:teacher-settings@1',
       policy_version = 'teacher-preference-scope@1'
 WHERE canonical_key IS NULL;

ALTER TABLE personalization.teacher_preference_revision
  ENABLE TRIGGER teacher_preference_revision_immutable;

ALTER TABLE personalization.teacher_preference
  ALTER COLUMN canonical_key SET NOT NULL,
  ALTER COLUMN scope_kind SET NOT NULL,
  ALTER COLUMN scope_skill_ids SET NOT NULL,
  ALTER COLUMN scope_skill_ids SET DEFAULT '[]'::jsonb,
  ALTER COLUMN scope_fingerprint SET NOT NULL,
  ALTER COLUMN valid_from SET NOT NULL,
  ALTER COLUMN explicitness SET NOT NULL,
  ALTER COLUMN consent_basis SET NOT NULL,
  ALTER COLUMN consent_version SET NOT NULL,
  ALTER COLUMN policy_version SET NOT NULL;

ALTER TABLE personalization.teacher_preference_revision
  ALTER COLUMN canonical_key SET NOT NULL,
  ALTER COLUMN scope_kind SET NOT NULL,
  ALTER COLUMN scope_skill_ids SET NOT NULL,
  ALTER COLUMN scope_skill_ids SET DEFAULT '[]'::jsonb,
  ALTER COLUMN scope_fingerprint SET NOT NULL,
  ALTER COLUMN valid_from SET NOT NULL,
  ALTER COLUMN explicitness SET NOT NULL,
  ALTER COLUMN consent_basis SET NOT NULL,
  ALTER COLUMN consent_version SET NOT NULL,
  ALTER COLUMN policy_version SET NOT NULL;

ALTER TABLE personalization.teacher_preference
  ADD CONSTRAINT teacher_preference_scope_kind_check CHECK (
    scope_kind IN (
      'global', 'subject', 'subject_grade', 'course_run', 'lesson', 'task'
    )
  ),
  ADD CONSTRAINT teacher_preference_scope_skill_ids_check CHECK (
    jsonb_typeof(scope_skill_ids) = 'array'
  ),
  ADD CONSTRAINT teacher_preference_explicitness_check CHECK (
    explicitness IN ('teacher_declared', 'teacher_confirmed_inferred')
  ),
  ADD CONSTRAINT teacher_preference_consent_basis_check CHECK (
    consent_basis IN ('teacher_settings_confirmed', 'teacher_explicit_command')
  ),
  ADD CONSTRAINT teacher_preference_valid_time_check CHECK (
    valid_until IS NULL OR valid_until > valid_from
  ),
  ADD CONSTRAINT teacher_preference_scope_shape_check CHECK (
    (scope_kind = 'global'
      AND scope_subject IS NULL AND scope_grade_level IS NULL
      AND scope_course_run_ref IS NULL AND scope_lesson_ref IS NULL
      AND scope_task_ref IS NULL)
    OR (scope_kind = 'subject'
      AND scope_subject IS NOT NULL AND scope_grade_level IS NULL
      AND scope_course_run_ref IS NULL AND scope_lesson_ref IS NULL
      AND scope_task_ref IS NULL)
    OR (scope_kind = 'subject_grade'
      AND scope_subject IS NOT NULL AND scope_grade_level IS NOT NULL
      AND scope_course_run_ref IS NULL AND scope_lesson_ref IS NULL
      AND scope_task_ref IS NULL)
    OR (scope_kind = 'course_run'
      AND scope_subject IS NULL AND scope_grade_level IS NULL
      AND scope_course_run_ref IS NOT NULL AND scope_lesson_ref IS NULL
      AND scope_task_ref IS NULL)
    OR (scope_kind = 'lesson'
      AND scope_subject IS NULL AND scope_grade_level IS NULL
      AND scope_course_run_ref IS NOT NULL AND scope_lesson_ref IS NOT NULL
      AND scope_task_ref IS NULL)
    OR (scope_kind = 'task'
      AND scope_subject IS NULL AND scope_grade_level IS NULL
      AND scope_task_ref IS NOT NULL)
  );

ALTER TABLE personalization.teacher_preference_revision
  ADD CONSTRAINT teacher_preference_revision_scope_kind_check CHECK (
    scope_kind IN (
      'global', 'subject', 'subject_grade', 'course_run', 'lesson', 'task'
    )
  ),
  ADD CONSTRAINT teacher_preference_revision_scope_skill_ids_check CHECK (
    jsonb_typeof(scope_skill_ids) = 'array'
  ),
  ADD CONSTRAINT teacher_preference_revision_explicitness_check CHECK (
    explicitness IN ('teacher_declared', 'teacher_confirmed_inferred')
  ),
  ADD CONSTRAINT teacher_preference_revision_consent_basis_check CHECK (
    consent_basis IN ('teacher_settings_confirmed', 'teacher_explicit_command')
  ),
  ADD CONSTRAINT teacher_preference_revision_valid_time_check CHECK (
    valid_until IS NULL OR valid_until > valid_from
  ),
  ADD CONSTRAINT teacher_preference_revision_scope_shape_check CHECK (
    (scope_kind = 'global'
      AND scope_subject IS NULL AND scope_grade_level IS NULL
      AND scope_course_run_ref IS NULL AND scope_lesson_ref IS NULL
      AND scope_task_ref IS NULL)
    OR (scope_kind = 'subject'
      AND scope_subject IS NOT NULL AND scope_grade_level IS NULL
      AND scope_course_run_ref IS NULL AND scope_lesson_ref IS NULL
      AND scope_task_ref IS NULL)
    OR (scope_kind = 'subject_grade'
      AND scope_subject IS NOT NULL AND scope_grade_level IS NOT NULL
      AND scope_course_run_ref IS NULL AND scope_lesson_ref IS NULL
      AND scope_task_ref IS NULL)
    OR (scope_kind = 'course_run'
      AND scope_subject IS NULL AND scope_grade_level IS NULL
      AND scope_course_run_ref IS NOT NULL AND scope_lesson_ref IS NULL
      AND scope_task_ref IS NULL)
    OR (scope_kind = 'lesson'
      AND scope_subject IS NULL AND scope_grade_level IS NULL
      AND scope_course_run_ref IS NOT NULL AND scope_lesson_ref IS NOT NULL
      AND scope_task_ref IS NULL)
    OR (scope_kind = 'task'
      AND scope_subject IS NULL AND scope_grade_level IS NULL
      AND scope_task_ref IS NOT NULL)
  );

DROP INDEX IF EXISTS personalization.teacher_preference_active_key_unique;

CREATE UNIQUE INDEX teacher_preference_active_scope_key_unique
  ON personalization.teacher_preference (
    tenant_ref, teacher_ref, canonical_key, scope_fingerprint
  )
  WHERE preference_status = 'active';

CREATE INDEX teacher_preference_owner_resolution_idx
  ON personalization.teacher_preference (
    tenant_ref, teacher_ref, preference_status, canonical_key,
    scope_kind, valid_from, valid_until
  );

CREATE TABLE IF NOT EXISTS personalization.teacher_memory_state (
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  memory_epoch bigint NOT NULL CHECK (memory_epoch >= 0),
  policy_version text NOT NULL,
  updated_at timestamptz NOT NULL,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL,
  idempotency_key text NOT NULL,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_ref, teacher_ref)
);

INSERT INTO personalization.teacher_memory_state (
  tenant_ref, teacher_ref, memory_epoch, policy_version, updated_at,
  actor_ref, purpose, owner_module, idempotency_key,
  authorization_decision_ref, audit_ref, content_hash, created_at
)
SELECT tenant_ref, teacher_ref, 1, 'teacher-memory-epoch@1', max(updated_at),
       teacher_ref, 'personalization.migration.scope-backfill',
       'personalization',
       'migration:teacher-memory-state:' || md5(tenant_ref || '|' || teacher_ref),
       'authorization-decision:migration', 'audit:migration',
       md5(tenant_ref || '|' || teacher_ref || '|1') ||
       md5('teacher-memory-epoch@1|' || tenant_ref || '|' || teacher_ref),
       max(updated_at)
  FROM personalization.teacher_preference
 GROUP BY tenant_ref, teacher_ref
ON CONFLICT (tenant_ref, teacher_ref) DO NOTHING;

CREATE INDEX teacher_memory_state_updated_idx
  ON personalization.teacher_memory_state (updated_at DESC);

DROP TRIGGER IF EXISTS teacher_memory_state_no_delete
  ON personalization.teacher_memory_state;
CREATE TRIGGER teacher_memory_state_no_delete
  BEFORE DELETE ON personalization.teacher_memory_state
  FOR EACH ROW EXECUTE FUNCTION personalization.reject_memory_physical_delete();

ALTER TABLE personalization.memory_application
  DROP CONSTRAINT IF EXISTS memory_application_reason_code_check;

ALTER TABLE personalization.memory_application
  ADD CONSTRAINT memory_application_reason_code_check CHECK (
    reason_code IN (
      'active_confirmed_preference',
      'duplicate_key',
      'token_budget',
      'skill_not_allowed',
      'current_instruction_override',
      'expired',
      'revoked',
      'superseded',
      'scope_mismatch',
      'not_yet_valid',
      'more_specific_scope',
      'more_specific_skill_scope'
    )
  );

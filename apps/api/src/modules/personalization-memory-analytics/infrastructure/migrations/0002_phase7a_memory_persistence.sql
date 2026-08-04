CREATE TABLE IF NOT EXISTS personalization.memory_candidate (
  candidate_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  candidate_type text NOT NULL CHECK (candidate_type IN ('preference', 'episodic')),
  content jsonb NOT NULL,
  sources jsonb NOT NULL,
  confidence numeric(5, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  proposed_by text NOT NULL CHECK (proposed_by IN ('teacher', 'agent')),
  created_by_ref text NOT NULL,
  candidate_status text NOT NULL CHECK (
    candidate_status IN ('draft', 'confirmed', 'rejected', 'expired')
  ),
  current_version integer NOT NULL CHECK (current_version > 0),
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  expired_at timestamptz,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'personalization'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  CHECK (expires_at > created_at),
  CHECK (updated_at >= created_at),
  CHECK (
    (candidate_status = 'draft'
      AND confirmed_at IS NULL AND rejected_at IS NULL AND expired_at IS NULL)
    OR (candidate_status = 'confirmed'
      AND confirmed_at IS NOT NULL AND rejected_at IS NULL AND expired_at IS NULL)
    OR (candidate_status = 'rejected'
      AND confirmed_at IS NULL AND rejected_at IS NOT NULL AND expired_at IS NULL)
    OR (candidate_status = 'expired'
      AND confirmed_at IS NULL AND rejected_at IS NULL AND expired_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS personalization.memory_candidate_revision (
  candidate_ref text NOT NULL REFERENCES personalization.memory_candidate (candidate_ref),
  version integer NOT NULL CHECK (version > 0),
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  candidate_type text NOT NULL CHECK (candidate_type IN ('preference', 'episodic')),
  content jsonb NOT NULL,
  sources jsonb NOT NULL,
  confidence numeric(5, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  proposed_by text NOT NULL CHECK (proposed_by IN ('teacher', 'agent')),
  created_by_ref text NOT NULL,
  candidate_status text NOT NULL CHECK (
    candidate_status IN ('draft', 'confirmed', 'rejected', 'expired')
  ),
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  expired_at timestamptz,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'personalization'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  revision_created_at timestamptz NOT NULL,
  PRIMARY KEY (candidate_ref, version)
);

CREATE INDEX IF NOT EXISTS memory_candidate_owner_status_idx
  ON personalization.memory_candidate (
    tenant_ref, teacher_ref, candidate_status, updated_at DESC
  );

CREATE TABLE IF NOT EXISTS personalization.teacher_preference (
  preference_ref text PRIMARY KEY,
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  preference_key text NOT NULL,
  preference_value text NOT NULL,
  source_candidate_ref text NOT NULL UNIQUE
    REFERENCES personalization.memory_candidate (candidate_ref),
  source_candidate_hash text NOT NULL,
  preference_status text NOT NULL CHECK (preference_status IN ('active', 'revoked')),
  current_version integer NOT NULL CHECK (current_version > 0),
  content_hash text NOT NULL,
  confirmed_by_ref text NOT NULL,
  confirmed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  revoked_at timestamptz,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'personalization'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  CHECK (updated_at >= created_at),
  CHECK (
    (preference_status = 'active' AND revoked_at IS NULL)
    OR (preference_status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS teacher_preference_active_key_unique
  ON personalization.teacher_preference (tenant_ref, teacher_ref, preference_key)
  WHERE preference_status = 'active';

CREATE INDEX IF NOT EXISTS teacher_preference_owner_status_idx
  ON personalization.teacher_preference (
    tenant_ref, teacher_ref, preference_status, updated_at DESC
  );

CREATE TABLE IF NOT EXISTS personalization.teacher_preference_revision (
  preference_ref text NOT NULL
    REFERENCES personalization.teacher_preference (preference_ref),
  version integer NOT NULL CHECK (version > 0),
  tenant_ref text NOT NULL,
  teacher_ref text NOT NULL,
  preference_key text NOT NULL,
  preference_value text NOT NULL,
  source_candidate_ref text NOT NULL,
  source_candidate_hash text NOT NULL,
  preference_status text NOT NULL CHECK (preference_status IN ('active', 'revoked')),
  content_hash text NOT NULL,
  confirmed_by_ref text NOT NULL,
  confirmed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  revoked_at timestamptz,
  actor_ref text NOT NULL,
  purpose text NOT NULL,
  owner_module text NOT NULL CHECK (owner_module = 'personalization'),
  idempotency_key text NOT NULL UNIQUE,
  authorization_decision_ref text NOT NULL,
  audit_ref text NOT NULL,
  revision_created_at timestamptz NOT NULL,
  PRIMARY KEY (preference_ref, version)
);

CREATE OR REPLACE FUNCTION personalization.protect_memory_revision_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Personalization revision history is immutable';
END
$$;

DROP TRIGGER IF EXISTS memory_candidate_revision_immutable
  ON personalization.memory_candidate_revision;
CREATE TRIGGER memory_candidate_revision_immutable
  BEFORE UPDATE OR DELETE ON personalization.memory_candidate_revision
  FOR EACH ROW EXECUTE FUNCTION personalization.protect_memory_revision_history();

DROP TRIGGER IF EXISTS teacher_preference_revision_immutable
  ON personalization.teacher_preference_revision;
CREATE TRIGGER teacher_preference_revision_immutable
  BEFORE UPDATE OR DELETE ON personalization.teacher_preference_revision
  FOR EACH ROW EXECUTE FUNCTION personalization.protect_memory_revision_history();

CREATE OR REPLACE FUNCTION personalization.reject_memory_physical_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Memory records must be rejected, expired, or revoked; physical deletion is forbidden';
END
$$;

DROP TRIGGER IF EXISTS memory_candidate_no_delete
  ON personalization.memory_candidate;
CREATE TRIGGER memory_candidate_no_delete
  BEFORE DELETE ON personalization.memory_candidate
  FOR EACH ROW EXECUTE FUNCTION personalization.reject_memory_physical_delete();

DROP TRIGGER IF EXISTS teacher_preference_no_delete
  ON personalization.teacher_preference;
CREATE TRIGGER teacher_preference_no_delete
  BEFORE DELETE ON personalization.teacher_preference
  FOR EACH ROW EXECUTE FUNCTION personalization.reject_memory_physical_delete();

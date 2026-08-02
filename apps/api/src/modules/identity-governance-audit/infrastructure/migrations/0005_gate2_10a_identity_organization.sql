CREATE TABLE IF NOT EXISTS governance.user_account (
  user_ref text PRIMARY KEY,
  display_name text NOT NULL,
  email text,
  status text NOT NULL CHECK (status IN ('active', 'suspended')),
  data_source text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS user_account_email_unique
  ON governance.user_account (lower(email))
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS governance.external_identity_link (
  identity_link_ref text PRIMARY KEY,
  user_ref text NOT NULL
    REFERENCES governance.user_account (user_ref),
  provider text NOT NULL,
  external_subject_hash text NOT NULL,
  display_hint text,
  linked_at timestamptz NOT NULL,
  unlinked_at timestamptz,
  UNIQUE (provider, external_subject_hash)
);

CREATE INDEX IF NOT EXISTS external_identity_user_idx
  ON governance.external_identity_link (user_ref, linked_at DESC);

CREATE TABLE IF NOT EXISTS governance.organization (
  organization_ref text PRIMARY KEY,
  organization_type text NOT NULL CHECK (organization_type = 'school'),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'suspended')),
  timezone text NOT NULL,
  data_source text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS governance.organization_membership (
  membership_ref text PRIMARY KEY,
  organization_ref text NOT NULL
    REFERENCES governance.organization (organization_ref),
  user_ref text NOT NULL
    REFERENCES governance.user_account (user_ref),
  status text NOT NULL
    CHECK (status IN ('invited', 'active', 'suspended')),
  created_by text NOT NULL,
  activated_at timestamptz,
  suspended_at timestamptz,
  last_used_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (organization_ref, user_ref)
);

CREATE INDEX IF NOT EXISTS membership_user_status_idx
  ON governance.organization_membership (user_ref, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS governance.membership_role_assignment (
  membership_ref text NOT NULL
    REFERENCES governance.organization_membership (membership_ref),
  role_key text NOT NULL CHECK (
    role_key IN (
      'ordinary_teacher',
      'school_admin',
      'subject_lead',
      'homeroom_teacher'
    )
  ),
  assigned_by text NOT NULL,
  assigned_at timestamptz NOT NULL,
  PRIMARY KEY (membership_ref, role_key)
);

CREATE TABLE IF NOT EXISTS governance.membership_course_run_access (
  membership_ref text NOT NULL
    REFERENCES governance.organization_membership (membership_ref),
  course_run_ref text NOT NULL,
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL,
  PRIMARY KEY (membership_ref, course_run_ref)
);

CREATE INDEX IF NOT EXISTS course_run_access_ref_idx
  ON governance.membership_course_run_access (course_run_ref, membership_ref);

CREATE TABLE IF NOT EXISTS governance.authentication_session (
  session_ref text PRIMARY KEY,
  session_token_hash text NOT NULL UNIQUE,
  csrf_token_hash text NOT NULL,
  user_ref text NOT NULL
    REFERENCES governance.user_account (user_ref),
  active_membership_ref text
    REFERENCES governance.organization_membership (membership_ref),
  authentication_method text NOT NULL CHECK (
    authentication_method IN ('server-session', 'local-identity', 'oidc')
  ),
  provider text NOT NULL,
  client_label text NOT NULL,
  client_fingerprint_hash text,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS authentication_session_active_idx
  ON governance.authentication_session (user_ref, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS governance.oidc_login_state (
  login_state_ref text PRIMARY KEY,
  provider text NOT NULL,
  state_hash text NOT NULL UNIQUE,
  nonce text NOT NULL,
  pkce_code_verifier text NOT NULL,
  return_to text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS oidc_login_state_expiry_idx
  ON governance.oidc_login_state (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS governance.organization_invitation (
  invitation_ref text PRIMARY KEY,
  organization_ref text NOT NULL
    REFERENCES governance.organization (organization_ref),
  membership_ref text NOT NULL
    REFERENCES governance.organization_membership (membership_ref),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS governance.identity_command (
  command_ref text PRIMARY KEY,
  root_key text NOT NULL UNIQUE,
  request_fingerprint text NOT NULL,
  result jsonb NOT NULL,
  actor_ref text NOT NULL,
  organization_ref text,
  action text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS governance.security_event (
  event_ref text PRIMARY KEY,
  event_type text NOT NULL,
  actor_ref text,
  organization_ref text,
  session_ref text,
  outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  safe_reason text NOT NULL,
  safe_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS security_event_org_time_idx
  ON governance.security_event (organization_ref, occurred_at DESC);

CREATE TABLE IF NOT EXISTS governance.data_governance_request (
  request_ref text PRIMARY KEY,
  user_ref text NOT NULL
    REFERENCES governance.user_account (user_ref),
  organization_ref text,
  request_type text NOT NULL
    CHECK (request_type IN ('export', 'de_identification', 'deletion')),
  status text NOT NULL CHECK (
    status IN ('requested', 'under_review', 'approved', 'rejected', 'completed')
  ),
  reason text NOT NULL,
  retention_notice text NOT NULL,
  requested_by text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (user_ref, idempotency_key)
);

CREATE OR REPLACE FUNCTION governance.reject_external_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.external_subject_hash <> NEW.external_subject_hash
     OR OLD.provider <> NEW.provider
     OR OLD.user_ref <> NEW.user_ref THEN
    RAISE EXCEPTION 'External identity binding is immutable; unlink and create a new binding';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS external_identity_binding_immutable
  ON governance.external_identity_link;
CREATE TRIGGER external_identity_binding_immutable
  BEFORE UPDATE ON governance.external_identity_link
  FOR EACH ROW
  EXECUTE FUNCTION governance.reject_external_identity_mutation();

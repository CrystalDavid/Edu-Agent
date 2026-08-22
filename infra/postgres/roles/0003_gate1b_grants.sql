REVOKE ALL ON SCHEMA governance, work, runtime, capability, artifact,
  education, personalization FROM PUBLIC;

GRANT USAGE ON SCHEMA governance, work, runtime, capability, artifact,
  education, personalization TO edu_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA governance, work, runtime, capability,
  artifact, education
  TO edu_app;
GRANT SELECT, INSERT, UPDATE
  ON ALL TABLES IN SCHEMA personalization
  TO edu_app;
REVOKE DELETE, TRUNCATE
  ON ALL TABLES IN SCHEMA personalization
  FROM edu_app;

GRANT USAGE ON SCHEMA runtime, governance, education, personalization
  TO edu_runtime;
GRANT SELECT, INSERT, UPDATE
  ON ALL TABLES IN SCHEMA runtime
  TO edu_runtime;
GRANT SELECT ON governance.authorization_decision TO edu_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA education TO edu_runtime;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON ALL TABLES IN SCHEMA governance
  FROM edu_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON ALL TABLES IN SCHEMA education
  FROM edu_runtime;

GRANT USAGE ON SCHEMA personalization TO edu_runtime;

GRANT USAGE ON SCHEMA work, runtime, capability, artifact, education
  TO edu_worker;

GRANT SELECT ON
  work.outbox_record,
  runtime.outbox_record,
  capability.outbox_record,
  artifact.outbox_record,
  education.outbox_record
  TO edu_worker;

GRANT UPDATE (
  status,
  lease_owner,
  lease_expires_at,
  attempt_count,
  last_error,
  processed_at,
  published_at
) ON work.outbox_record TO edu_worker;

GRANT UPDATE (
  status,
  lease_owner,
  lease_expires_at,
  attempt_count,
  last_error,
  processed_at,
  published_at
) ON runtime.outbox_record TO edu_worker;

GRANT UPDATE (
  status,
  lease_owner,
  lease_expires_at,
  attempt_count,
  last_error,
  processed_at,
  published_at
) ON capability.outbox_record TO edu_worker;

GRANT UPDATE (
  status,
  lease_owner,
  lease_expires_at,
  attempt_count,
  last_error,
  processed_at,
  published_at
) ON artifact.outbox_record TO edu_worker;

GRANT UPDATE (
  status,
  lease_owner,
  lease_expires_at,
  attempt_count,
  last_error,
  processed_at,
  published_at
) ON education.outbox_record TO edu_worker;

GRANT SELECT, INSERT ON work.outbox_consumer_effect TO edu_worker;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON ALL TABLES IN SCHEMA governance, education, personalization
  FROM edu_worker;

-- Education emits teacher-work projection events. Re-grant only the
-- lease columns after the broad ownership protection above.
GRANT UPDATE (
  status,
  lease_owner,
  lease_expires_at,
  attempt_count,
  last_error,
  processed_at,
  published_at
) ON education.outbox_record TO edu_worker;

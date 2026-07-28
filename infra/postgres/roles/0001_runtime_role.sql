-- Execute as a PostgreSQL administrator after all seven module migrations.
-- Runtime writes only its own Schema. Read grants for projections are explicit.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'edu_agent_runtime'
  ) THEN
    CREATE ROLE edu_agent_runtime NOLOGIN;
  END IF;
END
$$;

REVOKE ALL ON SCHEMA governance FROM edu_agent_runtime;
REVOKE ALL ON SCHEMA education FROM edu_agent_runtime;
REVOKE ALL ON SCHEMA personalization FROM edu_agent_runtime;

GRANT USAGE ON SCHEMA runtime TO edu_agent_runtime;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA runtime
  TO edu_agent_runtime;

GRANT USAGE ON SCHEMA governance TO edu_agent_runtime;
GRANT SELECT ON governance.authorization_decision
  TO edu_agent_runtime;

GRANT USAGE ON SCHEMA education TO edu_agent_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA education
  TO edu_agent_runtime;

GRANT USAGE ON SCHEMA personalization TO edu_agent_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA personalization
  TO edu_agent_runtime;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON ALL TABLES IN SCHEMA governance
  FROM edu_agent_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON ALL TABLES IN SCHEMA education
  FROM edu_agent_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON ALL TABLES IN SCHEMA personalization
  FROM edu_agent_runtime;

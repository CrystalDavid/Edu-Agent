DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'edu_owner_governance',
    'edu_owner_work',
    'edu_owner_runtime',
    'edu_owner_capability',
    'edu_owner_artifact',
    'edu_owner_education',
    'edu_owner_personalization'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = role_name
    ) THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
        role_name
      );
    END IF;
  END LOOP;

  FOREACH role_name IN ARRAY ARRAY[
    'edu_migrator',
    'edu_app',
    'edu_runtime',
    'edu_worker'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = role_name
    ) THEN
      EXECUTE format(
        'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT',
        role_name
      );
    END IF;
  END LOOP;
END
$$;

GRANT edu_owner_governance TO edu_migrator;
GRANT edu_owner_work TO edu_migrator;
GRANT edu_owner_runtime TO edu_migrator;
GRANT edu_owner_capability TO edu_migrator;
GRANT edu_owner_artifact TO edu_migrator;
GRANT edu_owner_education TO edu_migrator;
GRANT edu_owner_personalization TO edu_migrator;

ALTER ROLE edu_app SET statement_timeout = '5s';
ALTER ROLE edu_runtime SET statement_timeout = '5s';
ALTER ROLE edu_worker SET statement_timeout = '10s';

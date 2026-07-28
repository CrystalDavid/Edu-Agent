export interface PostgresEnvironment {
  host: string;
  port: number;
  database: string;
  adminUser: "edu_admin";
  adminPassword: string;
  migratorUser: "edu_migrator";
  migratorPassword: string;
  appUser: "edu_app";
  appPassword: string;
  runtimeUser: "edu_runtime";
  runtimePassword: string;
  workerUser: "edu_worker";
  workerPassword: string;
}

function requireValue(
  environment: NodeJS.ProcessEnv,
  name: string
): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`Missing PostgreSQL environment value: ${name}`);
  }
  return value;
}

function requireExpectedUser<
  TUser extends
    | "edu_admin"
    | "edu_migrator"
    | "edu_app"
    | "edu_runtime"
    | "edu_worker"
>(
  environment: NodeJS.ProcessEnv,
  name: string,
  expected: TUser
): TUser {
  const value = requireValue(environment, name);
  if (value !== expected) {
    throw new Error(`${name} must be ${expected} for Gate 1B.`);
  }
  return expected;
}

export function readPostgresEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): PostgresEnvironment {
  const port = Number(requireValue(environment, "POSTGRES_HOST_PORT"));
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("POSTGRES_HOST_PORT must be a valid TCP port.");
  }

  return {
    host: requireValue(environment, "POSTGRES_HOST"),
    port,
    database: requireValue(environment, "POSTGRES_DB"),
    adminUser: requireExpectedUser(
      environment,
      "POSTGRES_ADMIN_USER",
      "edu_admin"
    ),
    adminPassword: requireValue(
      environment,
      "POSTGRES_ADMIN_PASSWORD"
    ),
    migratorUser: requireExpectedUser(
      environment,
      "POSTGRES_MIGRATOR_USER",
      "edu_migrator"
    ),
    migratorPassword: requireValue(
      environment,
      "POSTGRES_MIGRATOR_PASSWORD"
    ),
    appUser: requireExpectedUser(
      environment,
      "POSTGRES_APP_USER",
      "edu_app"
    ),
    appPassword: requireValue(environment, "POSTGRES_APP_PASSWORD"),
    runtimeUser: requireExpectedUser(
      environment,
      "POSTGRES_RUNTIME_USER",
      "edu_runtime"
    ),
    runtimePassword: requireValue(
      environment,
      "POSTGRES_RUNTIME_PASSWORD"
    ),
    workerUser: requireExpectedUser(
      environment,
      "POSTGRES_WORKER_USER",
      "edu_worker"
    ),
    workerPassword: requireValue(
      environment,
      "POSTGRES_WORKER_PASSWORD"
    )
  };
}

export function buildPostgresUrl(input: {
  environment: PostgresEnvironment;
  user: string;
  password: string;
}): string {
  const { environment } = input;
  const url = new URL("postgresql://localhost");
  url.hostname = environment.host;
  url.port = String(environment.port);
  url.username = input.user;
  url.password = input.password;
  url.pathname = `/${environment.database}`;
  url.searchParams.set("application_name", "edu-agent-gate1b");
  return url.toString();
}

export function postgresUrls(
  environment: PostgresEnvironment
): Record<
  "admin" | "migrator" | "app" | "runtime" | "worker",
  string
> {
  return {
    admin: buildPostgresUrl({
      environment,
      user: environment.adminUser,
      password: environment.adminPassword
    }),
    migrator: buildPostgresUrl({
      environment,
      user: environment.migratorUser,
      password: environment.migratorPassword
    }),
    app: buildPostgresUrl({
      environment,
      user: environment.appUser,
      password: environment.appPassword
    }),
    runtime: buildPostgresUrl({
      environment,
      user: environment.runtimeUser,
      password: environment.runtimePassword
    }),
    worker: buildPostgresUrl({
      environment,
      user: environment.workerUser,
      password: environment.workerPassword
    })
  };
}

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { Pool, type PoolClient } from "pg";

import { moduleMigrations } from "../../database/migrations.js";
import {
  postgresUrls,
  type PostgresEnvironment
} from "./config.js";

const schemaOwners = {
  governance: "edu_owner_governance",
  work: "edu_owner_work",
  runtime: "edu_owner_runtime",
  capability: "edu_owner_capability",
  artifact: "edu_owner_artifact",
  education: "edu_owner_education",
  personalization: "edu_owner_personalization"
} as const;

type ModuleOwner = keyof typeof schemaOwners;

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function setRolePassword(
  client: PoolClient,
  role: string,
  password: string
): Promise<void> {
  quoteIdentifier(role);
  await client.query(
    "SELECT set_config('edu_agent.bootstrap_password', $1, false)",
    [password]
  );
  await client.query(`
    DO $$
    BEGIN
      EXECUTE format(
        'ALTER ROLE ${role} PASSWORD %L',
        current_setting('edu_agent.bootstrap_password')
      );
    END
    $$;
  `);
  await client.query(
    "SELECT set_config('edu_agent.bootstrap_password', '', false)"
  );
}

async function bootstrapRoles(
  client: PoolClient,
  environment: PostgresEnvironment
): Promise<void> {
  const roleSql = await readFile(
    resolve("infra/postgres/roles/0002_gate1b_roles.sql"),
    "utf8"
  );
  await client.query(roleSql);

  await setRolePassword(
    client,
    environment.migratorUser,
    environment.migratorPassword
  );
  await setRolePassword(
    client,
    environment.appUser,
    environment.appPassword
  );
  await setRolePassword(
    client,
    environment.runtimeUser,
    environment.runtimePassword
  );
  await setRolePassword(
    client,
    environment.workerUser,
    environment.workerPassword
  );

  const database = quoteIdentifier(environment.database);
  await client.query(`REVOKE CREATE ON DATABASE ${database} FROM PUBLIC`);
  await client.query(
    `GRANT CONNECT ON DATABASE ${database}
       TO edu_migrator, edu_app, edu_runtime, edu_worker`
  );
  for (const ownerRole of Object.values(schemaOwners)) {
    await client.query(
      `GRANT CREATE ON DATABASE ${database} TO ${quoteIdentifier(ownerRole)}`
    );
  }
}

async function applyOwnerMigrations(
  client: PoolClient,
  owner: ModuleOwner
): Promise<number> {
  const ownerRole = schemaOwners[owner];
  const schema = quoteIdentifier(owner);
  const migrations = moduleMigrations.filter(
    (migration) => migration.owner === owner
  );

  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL ROLE ${quoteIdentifier(ownerRole)}`);
    await client.query(
      `CREATE SCHEMA IF NOT EXISTS ${schema}
         AUTHORIZATION ${quoteIdentifier(ownerRole)}`
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.schema_migration (
        migration_name text PRIMARY KEY,
        content_sha256 text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    let applied = 0;
    for (const migration of migrations) {
      const sql = await readFile(
        resolve(migration.relativePath),
        "utf8"
      );
      const migrationName = basename(migration.relativePath);
      const contentHash = createHash("sha256")
        .update(sql)
        .digest("hex");
      const existing = await client.query<{
        content_sha256: string;
      }>(
        `SELECT content_sha256
           FROM ${schema}.schema_migration
          WHERE migration_name = $1`,
        [migrationName]
      );

      if (existing.rowCount) {
        if (existing.rows[0]?.content_sha256 !== contentHash) {
          throw new Error(
            `Applied migration changed: ${owner}/${migrationName}`
          );
        }
        continue;
      }

      await client.query(sql);
      await client.query(
        `INSERT INTO ${schema}.schema_migration (
           migration_name,
           content_sha256
         ) VALUES ($1, $2)`,
        [migrationName, contentHash]
      );
      applied += 1;
    }

    await client.query("COMMIT");
    return applied;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function bootstrapGate1BPostgres(
  environment: PostgresEnvironment
): Promise<{
  appliedMigrations: number;
  schemas: readonly ModuleOwner[];
}> {
  const urls = postgresUrls(environment);
  const adminPool = new Pool({
    connectionString: urls.admin,
    max: 1,
    connectionTimeoutMillis: 5_000
  });

  try {
    const client = await adminPool.connect();
    try {
      await bootstrapRoles(client, environment);
    } finally {
      client.release();
    }
  } finally {
    await adminPool.end();
  }

  const migratorPool = new Pool({
    connectionString: urls.migrator,
    max: 1,
    connectionTimeoutMillis: 5_000
  });

  let appliedMigrations = 0;
  try {
    const client = await migratorPool.connect();
    try {
      for (const owner of Object.keys(
        schemaOwners
      ) as ModuleOwner[]) {
        appliedMigrations += await applyOwnerMigrations(client, owner);
      }
    } finally {
      client.release();
    }
  } finally {
    await migratorPool.end();
  }

  const grantsSql = await readFile(
    resolve("infra/postgres/roles/0003_gate1b_grants.sql"),
    "utf8"
  );
  const finalAdminPool = new Pool({
    connectionString: urls.admin,
    max: 1,
    connectionTimeoutMillis: 5_000
  });
  try {
    await finalAdminPool.query(grantsSql);
  } finally {
    await finalAdminPool.end();
  }

  return {
    appliedMigrations,
    schemas: Object.keys(schemaOwners) as ModuleOwner[]
  };
}

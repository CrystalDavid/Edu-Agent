import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const target = resolve("infra/local/postgres/.env.local");

if (existsSync(target)) {
  process.stdout.write("Local PostgreSQL environment already exists.\n");
  process.exit(0);
}

const password = () => randomBytes(24).toString("base64url");
const content = [
  "POSTGRES_HOST=127.0.0.1",
  "POSTGRES_HOST_PORT=55432",
  "POSTGRES_DB=edu_agent_dev",
  "POSTGRES_ADMIN_USER=edu_admin",
  `POSTGRES_ADMIN_PASSWORD=${password()}`,
  "POSTGRES_MIGRATOR_USER=edu_migrator",
  `POSTGRES_MIGRATOR_PASSWORD=${password()}`,
  "POSTGRES_APP_USER=edu_app",
  `POSTGRES_APP_PASSWORD=${password()}`,
  "POSTGRES_RUNTIME_USER=edu_runtime",
  `POSTGRES_RUNTIME_PASSWORD=${password()}`,
  "POSTGRES_WORKER_USER=edu_worker",
  `POSTGRES_WORKER_PASSWORD=${password()}`,
  ""
].join("\n");

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, content, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600
});

process.stdout.write("Created ignored local PostgreSQL environment.\n");

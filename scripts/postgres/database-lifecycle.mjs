import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { childEnvironment } from "../tool-environment.mjs";

export const developmentComposeProject = "edu-agent-dev";
export const developmentVolumeName =
  "edu-agent-dev-postgres-data";
export const composeFile = resolve(
  "infra/local/postgres/compose.postgres.yml"
);
export const localEnvironmentFile = resolve(
  "infra/local/postgres/.env.local"
);
export const localUploadDirectory = resolve(
  process.env.LOCAL_UPLOAD_DIRECTORY ?? ".local-data/object-store"
);

const allowedRunId = /^[a-z0-9][a-z0-9-]{0,47}$/;

export function readEnvironmentFile(path = localEnvironmentFile) {
  if (!existsSync(path)) {
    throw new Error(
      "Local PostgreSQL environment is missing. Run `pnpm db:env` first."
    );
  }
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 1) {
          throw new Error(
            `Invalid PostgreSQL environment entry in ${path}.`
          );
        }
        return [
          line.slice(0, separator),
          line.slice(separator + 1)
        ];
      })
  );
}

export function developmentComposeEnvironment() {
  return {
    ...readEnvironmentFile(),
    COMPOSE_PROJECT_NAME: developmentComposeProject,
    POSTGRES_VOLUME_NAME: developmentVolumeName
  };
}

export function assertDestructiveDevelopmentResetAllowed(
  environment = process.env
) {
  if (environment.ALLOW_DESTRUCTIVE_DB_RESET !== "1") {
    throw new Error(
      "Refusing to delete the long-lived development PostgreSQL volume. " +
        "Set ALLOW_DESTRUCTIVE_DB_RESET=1 explicitly, then rerun `pnpm db:clean`."
    );
  }
}

export function normalizeE2eRunId(value) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!allowedRunId.test(normalized)) {
    throw new Error("E2E run id must contain letters, numbers or hyphens.");
  }
  return normalized;
}

export function createE2eRunId() {
  return normalizeE2eRunId(
    `${Date.now().toString(36)}-${process.pid}-${randomBytes(4).toString("hex")}`
  );
}

export function e2eComposeProject(runId) {
  return `edu-agent-e2e-${normalizeE2eRunId(runId)}`;
}

export function e2eVolumeName(runId) {
  return `${e2eComposeProject(runId)}-postgres-data`;
}

export function createE2eDatabaseEnvironment(runId, hostPort) {
  const normalized = normalizeE2eRunId(runId);
  const password = () => randomBytes(24).toString("base64url");
  return {
    POSTGRES_HOST: "127.0.0.1",
    POSTGRES_HOST_PORT: String(hostPort),
    POSTGRES_DB: "edu_agent_e2e",
    POSTGRES_ADMIN_USER: "edu_admin",
    POSTGRES_ADMIN_PASSWORD: password(),
    POSTGRES_MIGRATOR_USER: "edu_migrator",
    POSTGRES_MIGRATOR_PASSWORD: password(),
    POSTGRES_APP_USER: "edu_app",
    POSTGRES_APP_PASSWORD: password(),
    POSTGRES_RUNTIME_USER: "edu_runtime",
    POSTGRES_RUNTIME_PASSWORD: password(),
    POSTGRES_WORKER_USER: "edu_worker",
    POSTGRES_WORKER_PASSWORD: password(),
    COMPOSE_PROJECT_NAME: e2eComposeProject(normalized),
    POSTGRES_VOLUME_NAME: e2eVolumeName(normalized),
    E2E_RUN_ID: normalized
  };
}

export function composeArguments(environment, ...args) {
  return [
    "compose",
    "--project-name",
    environment.COMPOSE_PROJECT_NAME,
    "-f",
    composeFile,
    ...args
  ];
}

export function runDocker(args, environment, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: process.cwd(),
    env: childEnvironment(environment),
    encoding: options.encoding,
    stdio: options.stdio ?? "inherit",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `docker ${args.join(" ")} failed with exit code ${result.status}.`
    );
  }
  return result;
}

export function runCompose(environment, ...args) {
  return runDocker(
    composeArguments(environment, ...args),
    environment
  );
}

export function inspectVolumeIdentity(name) {
  const result = runDocker(
    ["volume", "inspect", name, "--format", "{{json .}}"],
    {},
    {
      allowFailure: true,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  if (result.status !== 0) {
    const error = String(result.stderr ?? "");
    if (/no such volume/i.test(error)) return null;
    throw new Error(
      `Unable to inspect Docker volume ${name}: ${error.trim()}`
    );
  }
  const volume = JSON.parse(String(result.stdout).trim());
  return {
    name: volume.Name,
    createdAt: volume.CreatedAt,
    mountpoint: volume.Mountpoint,
    driver: volume.Driver
  };
}

function fileDigest(path) {
  if (!existsSync(path)) return null;
  return createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
}

export function snapshotLocalPath(path) {
  if (!existsSync(path)) return null;
  const rootStat = statSync(path);
  if (rootStat.isFile()) {
    return {
      kind: "file",
      digest: fileDigest(path),
      size: rootStat.size
    };
  }
  const entries = readdirSync(path, {
    recursive: true,
    withFileTypes: true
  })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fullPath = resolve(entry.parentPath, entry.name);
      return {
        path: fullPath.slice(resolve(path).length + 1),
        digest: fileDigest(fullPath),
        size: statSync(fullPath).size
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    kind: "directory",
    entries
  };
}

export function snapshotProtectedLocalState() {
  return {
    developmentVolume: inspectVolumeIdentity(
      developmentVolumeName
    ),
    environmentFile: snapshotLocalPath(localEnvironmentFile),
    uploadDirectory: snapshotLocalPath(localUploadDirectory)
  };
}

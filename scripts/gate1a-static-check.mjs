import {
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);
const modulesRoot = join(root, "apps/api/src/modules");
const modules = {
  "identity-governance-audit": "governance",
  "work-assistant-durable-execution": "work",
  "agent-runtime-context": "runtime",
  "capability-integration": "capability",
  "artifact-collaboration": "artifact",
  "education-domain": "education",
  "personalization-memory-analytics": "personalization"
};
const failures = [];
let assertions = 0;

// Authentication/organization foundation tables are security infrastructure,
// not module business-command facts. They carry their own actor/source/time
// fields and are verified through Gate 2.10A security-event/Audit tests.
const identityInfrastructureTables = new Set([
  "governance.user_account",
  "governance.external_identity_link",
  "governance.organization",
  "governance.organization_membership",
  "governance.membership_role_assignment",
  "governance.membership_course_run_access",
  "governance.authentication_session",
  "governance.oidc_login_state",
  "governance.organization_invitation",
  "governance.identity_command",
  "governance.security_event",
  "governance.data_governance_request"
]);

function assert(condition, message) {
  assertions += 1;
  if (!condition) failures.push(message);
}

function filesUnder(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const actualModules = readdirSync(modulesRoot)
  .filter((entry) => statSync(join(modulesRoot, entry)).isDirectory())
  .sort();
assert(
  JSON.stringify(actualModules) ===
    JSON.stringify(Object.keys(modules).sort()),
  `Expected exactly seven modules, got: ${actualModules.join(", ")}`
);

for (const [moduleName, schema] of Object.entries(modules)) {
  const migrationDirectory = join(
    modulesRoot,
    moduleName,
    "infrastructure/migrations"
  );
  const migrations = filesUnder(migrationDirectory).filter((path) =>
    path.endsWith(".sql")
  );
  assert(migrations.length > 0, `${moduleName} has no migration`);
  const moduleSql = migrations
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert(
    new RegExp(
      `CREATE\\s+SCHEMA\\s+IF\\s+NOT\\s+EXISTS\\s+${schema}`,
      "i"
    ).test(moduleSql),
    `${moduleName} does not create ${schema}`
  );

  for (const path of migrations) {
    const sql = readFileSync(path, "utf8");
    for (const otherSchema of Object.values(modules)) {
      if (otherSchema === schema) continue;
      assert(
        !new RegExp(
          `\\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\\b[\\s\\S]{0,80}\\b${otherSchema}\\.`,
          "i"
        ).test(sql),
        `${relative(root, path)} crosses into ${otherSchema}.*`
      );
    }
  }
}

const runtimeFiles = filesUnder(
  join(modulesRoot, "agent-runtime-context")
).filter((path) => path.endsWith(".ts"));
for (const path of runtimeFiles) {
  const source = readFileSync(path, "utf8");
  for (const forbidden of [
    "identity-governance-audit",
    "education-domain",
    "personalization-memory-analytics"
  ]) {
    assert(
      !source.includes(forbidden),
      `${relative(root, path)} imports ${forbidden}`
    );
  }
}

for (const moduleName of Object.keys(modules)) {
  const moduleFiles = filesUnder(join(modulesRoot, moduleName))
    .filter((path) => path.endsWith(".ts"))
    .filter((path) => !path.endsWith("schema.ts"));
  for (const path of moduleFiles) {
    const source = readFileSync(path, "utf8");
    for (const otherModule of Object.keys(modules)) {
      if (otherModule === moduleName) continue;
      assert(
        !source.includes(otherModule),
        `${relative(root, path)} imports ${otherModule}; use a port`
      );
    }
  }
}

const ingress = readFileSync(
  join(root, "packages/contracts/src/ingress.ts"),
  "utf8"
);
for (const kind of [
  "Query",
  "Command",
  "DomainEvent",
  "ObservationEvent",
  "WorkflowSignal"
]) {
  assert(
    ingress.includes(`z.literal("${kind}")`),
    `Ingress is missing ${kind}`
  );
}
assert(
  !ingress.includes('z.literal("Schedule")'),
  "Schedule must not be an Ingress business semantic"
);

const allMigrations = filesUnder(modulesRoot).filter((path) =>
  path.endsWith(".sql")
);
for (const path of allMigrations) {
  const sql = readFileSync(path, "utf8");
  assert(
    !/CREATE\s+TABLE[\s\S]{0,80}\blearning_evidence\b/i.test(sql),
    `${relative(root, path)} creates generic LearningEvidence`
  );
  for (const table of sql.matchAll(
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z_]+\.[a-z_]+)\s*\(([\s\S]*?)\);/gi
  )) {
    const [, tableName, body] = table;
    if (!tableName || !body) continue;
    if (
      tableName === "work.outbox_consumer_effect" ||
      identityInfrastructureTables.has(tableName)
    ) {
      continue;
    }
    for (const column of [
      "actor_ref",
      "purpose",
      "owner_module",
      "idempotency_key",
      "authorization_decision_ref",
      "audit_ref",
      "created_at"
    ]) {
      assert(
        body.includes(column),
        `${tableName} is missing formal-write column ${column}`
      );
    }
  }
}

const roles = readFileSync(
  join(root, "infra/postgres/roles/0001_runtime_role.sql"),
  "utf8"
);
for (const schema of [
  "governance",
  "education",
  "personalization"
]) {
  assert(
    new RegExp(
      `REVOKE\\s+INSERT,\\s*UPDATE,\\s*DELETE,\\s*TRUNCATE[\\s\\S]*?SCHEMA\\s+${schema}[\\s\\S]*?FROM\\s+edu_agent_runtime`,
      "i"
    ).test(roles),
    `Runtime write privileges are not revoked for ${schema}`
  );
}

for (const document of [
  "docs/adr/教育智能体平台v0.3.2勘误与adr包.md",
  "docs/history/research/教育智能体平台第一轮工程验证计划.md"
]) {
  const content = readFileSync(join(root, document), "utf8");
  assert(
    !/sk-[A-Za-z0-9]{12,}/.test(content),
    `${document} contains a secret-like value`
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `Gate 1A static check failed (${failures.length}/${assertions}):\n`
  );
  for (const failure of failures) {
    process.stderr.write(`- ${failure}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Gate 1A static check passed: ${assertions} assertions.\n`
  );
}

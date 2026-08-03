import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const verifiedBaseline = "gate-2-10a-verified";

const requiredFiles = [
  ".env.example",
  ".gitattributes",
  ".gitignore",
  "AGENTS.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "README.md",
  "SECURITY.md",
  "apps/api/package.json",
  "apps/api/src/app.ts",
  "apps/api/src/database/migrations.ts",
  "apps/web/package.json",
  "apps/web/public/fonts/attribution.md",
  "apps/web/src/App.tsx",
  "docs/architecture.md",
  "docs/capabilities.md",
  "docs/development.md",
  "docs/operations.md",
  "docs/README.md",
  "docs/roadmap.md",
  "docs/validation.md",
  "docs/version-history.md",
  "infra/local/README.md",
  "infra/local/postgres/.env.example",
  "infra/local/postgres/compose.postgres.yml",
  "packages/sample-data/README.md",
  "package.json",
  "packages/contracts/package.json",
  "packages/sample-data/package.json",
  "packages/test-fixtures/package.json",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "tests/config/playwright-ark.config.ts",
  "tests/config/test-artifacts.ts",
  "tests/config/vitest-live.config.ts",
  "tests/config/vitest-postgres.config.ts",
  "vitest.config.ts"
] as const;

const requiredTrackedRoots = [
  "apps/api/",
  "apps/web/",
  "docs/",
  "infra/local/",
  "infra/",
  "packages/contracts/",
  "packages/sample-data/",
  "packages/test-fixtures/",
  "scripts/",
  "tests/"
] as const;

const forbiddenTrackedPath =
  /(^|\/)(?:node_modules|dist|coverage|\.vite|\.local-data|\.demo|\.playwright-cli|\.pglite|\.gate1a-data|\.pgdata|playwright-report(?:-ark)?|test-results)(?:\/|$)|^output\/playwright\//;
const privateEnvironmentFile = /(^|\/)\.env(?:\..+)?$/;
const forbiddenSecretExtension = /\.(?:key|pem|p12|pfx|jks|keystore)$/i;
const sourceLikeExtension =
  /\.(?:c?js|mjs|ts|tsx|json|ya?ml|toml|md|mdx|sql|css|scss|html|svg)$/i;
const knownIgnoredRuntime =
  /(^|\/)(?:node_modules|dist|coverage|\.vite|\.local-data|\.demo|\.playwright-cli|\.pglite|\.gate1a-data|\.pgdata|playwright-report(?:-ark)?|test-results)(?:\/|$)|^output\/playwright\/|(^|\/)\.env(?:\..+)?$|\.(?:log|tmp|bak|orig|tsbuildinfo)$/i;
const forbiddenPhysicalRootEntries = [
  ".playwright-cli",
  ".vite",
  "coverage",
  "dist",
  "output",
  "playwright-report",
  "playwright-report-ark",
  "test-results"
] as const;
const conventionalUppercaseMarkdown = new Set([
  "AGENTS.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "README.md",
  "SECURITY.md"
]);

const failures: string[] = [];
const warnings: string[] = [];

function git(args: readonly string[], allowFailure = false): string {
  const result = spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`
    );
  }
  return result.status === 0 ? result.stdout : "";
}

function nulList(args: readonly string[]): string[] {
  return git(args).split("\0").filter(Boolean);
}

function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

const status = git(["status", "--porcelain=v1"]);
check(status.length === 0, "working tree is not clean");

const trackedFiles = nulList(["ls-files", "-z"]);
const trackedSet = new Set(trackedFiles);
const untrackedFiles = nulList([
  "ls-files",
  "--others",
  "--exclude-standard",
  "-z"
]);
check(
  untrackedFiles.length === 0,
  `non-ignored untracked files exist: ${untrackedFiles.join(", ")}`
);

for (const requiredFile of requiredFiles) {
  check(existsSync(resolve(workspaceRoot, requiredFile)), `missing ${requiredFile}`);
  check(trackedSet.has(requiredFile), `required file is not tracked: ${requiredFile}`);
  const ignored = spawnSync(
    "git",
    ["check-ignore", "--no-index", "--quiet", "--", requiredFile],
    { cwd: workspaceRoot, windowsHide: true }
  ).status === 0;
  check(!ignored, `required file is matched by .gitignore: ${requiredFile}`);
}

for (const root of requiredTrackedRoots) {
  check(
    trackedFiles.some((trackedFile) => trackedFile.startsWith(root)),
    `required tracked root is empty: ${root}`
  );
}

for (const rootEntry of forbiddenPhysicalRootEntries) {
  check(
    !existsSync(resolve(workspaceRoot, rootEntry)),
    `generated artifact must not exist in repository root: ${rootEntry}`
  );
}

for (const trackedFile of trackedFiles) {
  if (forbiddenTrackedPath.test(trackedFile)) {
    failures.push(`generated/runtime path is tracked: ${trackedFile}`);
  }
  if (
    privateEnvironmentFile.test(trackedFile) &&
    basename(trackedFile) !== ".env.example"
  ) {
    failures.push(`private environment file is tracked: ${trackedFile}`);
  }
  if (forbiddenSecretExtension.test(trackedFile)) {
    failures.push(`secret-bearing file extension is tracked: ${trackedFile}`);
  }
  const fileName = basename(trackedFile);
  if (
    trackedFile.endsWith(".md") &&
    /[A-Z]/.test(fileName) &&
    !conventionalUppercaseMarkdown.has(fileName)
  ) {
    failures.push(
      `topic Markdown filename must use lowercase kebab-case: ${trackedFile}`
    );
  }
}

const ignoredFiles = nulList([
  "ls-files",
  "--others",
  "--ignored",
  "--exclude-standard",
  "-z"
]);
const suspiciousIgnored = ignoredFiles.filter(
  (ignoredFile) =>
    sourceLikeExtension.test(ignoredFile) &&
    !knownIgnoredRuntime.test(ignoredFile)
);
check(
  suspiciousIgnored.length === 0,
  `source/document-like files are suspiciously ignored: ${suspiciousIgnored.join(", ")}`
);

const baselineMigrations = nulList([
  "ls-tree",
  "-r",
  "--name-only",
  "-z",
  verifiedBaseline,
  "--",
  "apps/api/src/modules"
]).filter((path) => /\/infrastructure\/migrations\/.*\.sql$/.test(path));
check(
  baselineMigrations.length === 43,
  `${verifiedBaseline} should contain 43 historical migrations, found ${baselineMigrations.length}`
);

for (const migration of baselineMigrations) {
  check(trackedSet.has(migration), `historical migration is missing: ${migration}`);
  const baselineBlob = git(["rev-parse", `${verifiedBaseline}:${migration}`], true).trim();
  const indexBlob = git(["rev-parse", `:${migration}`], true).trim();
  check(
    baselineBlob.length > 0 && baselineBlob === indexBlob,
    `historical migration changed since ${verifiedBaseline}: ${migration}`
  );
}

const currentMigrations = trackedFiles.filter((path) =>
  /\/infrastructure\/migrations\/.*\.sql$/.test(path)
);
check(
  currentMigrations.length >= baselineMigrations.length,
  `current migration count ${currentMigrations.length} is below verified baseline`
);

const fontLicenses = trackedFiles.filter(
  (path) =>
    path.startsWith("apps/web/public/fonts/licenses/") &&
    /\.(?:md|txt)$/i.test(path)
);
check(fontLicenses.length >= 3, "font license/attribution files are incomplete");

const largeFiles: Array<{ path: string; bytes: number }> = [];
for (const trackedFile of trackedFiles) {
  const absolutePath = resolve(workspaceRoot, trackedFile);
  if (!existsSync(absolutePath)) continue;
  const bytes = statSync(absolutePath).size;
  if (bytes >= 10 * 1024 * 1024) largeFiles.push({ path: trackedFile, bytes });
  check(
    bytes < 95 * 1024 * 1024,
    `tracked file approaches/exceeds GitHub's 100 MiB limit: ${trackedFile} (${bytes} bytes)`
  );
}
for (const largeFile of largeFiles) {
  warnings.push(
    `large tracked file: ${largeFile.path} (${(largeFile.bytes / 1024 / 1024).toFixed(1)} MiB)`
  );
}

const lfsAttributes = git(["grep", "-n", "filter=lfs", "--", ".gitattributes"], true).trim();
if (lfsAttributes.length === 0) warnings.push("Git LFS is not configured (no current file requires it)");
if (!existsSync(resolve(workspaceRoot, ".github"))) {
  warnings.push(".github/ is absent; repository CI/governance configuration is not yet defined");
}

const branch = git(["branch", "--show-current"]).trim();
check(branch.length > 0, "HEAD is detached");
const head = git(["rev-parse", "HEAD"]).trim();
const upstream = git(
  ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
  true
).trim();
check(upstream.length > 0, `branch ${branch || "<detached>"} has no upstream`);
if (upstream.length > 0) {
  const upstreamHead = git(["rev-parse", "@{upstream}"], true).trim();
  check(
    head === upstreamHead,
    `HEAD ${head} does not match upstream ${upstream} ${upstreamHead || "<missing>"}`
  );
}

const localMain = git(["rev-parse", "refs/heads/main"], true).trim();
const remoteMain = git(["rev-parse", "refs/remotes/origin/main"], true).trim();
check(localMain.length > 0, "local main is missing");
check(remoteMain.length > 0, "origin/main is missing; run git fetch origin");
check(
  localMain.length > 0 && localMain === remoteMain,
  `local main ${localMain || "<missing>"} does not match origin/main ${remoteMain || "<missing>"}`
);

if (failures.length > 0) {
  console.error(`Repository sync verification failed (${failures.length} issue(s)):`);
  for (const failure of failures) console.error(`- ${failure}`);
  if (warnings.length > 0) {
    console.error("Warnings:");
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exitCode = 1;
} else {
  console.log("Repository sync verification passed:");
  console.log(`- branch: ${branch} @ ${head}`);
  console.log(`- upstream: ${upstream}`);
  console.log(`- tracked files: ${trackedFiles.length}`);
  console.log(`- non-ignored untracked files: ${untrackedFiles.length}`);
  console.log(`- historical migrations unchanged: ${baselineMigrations.length}`);
  console.log(`- suspicious ignored source/docs: ${suspiciousIgnored.length}`);
  console.log("- forbidden generated root entries: 0");
  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) console.log(`- ${warning}`);
  }
}

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const trackedAndUnignoredFiles = execFileSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z"
  ],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true
  }
)
  .split("\0")
  .filter(Boolean);

const textExtensions = new Set([
  "",
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

const arkPrefix = "ar" + "k-";
const authorizationPrefix = "Authorization:" + " Bearer";
const patterns = [
  {
    name: "Ark API key",
    expression: new RegExp(
      `${arkPrefix}[A-Za-z0-9_\\-]{16,}`,
      "g"
    )
  },
  {
    name: "Bearer authorization value",
    expression: new RegExp(
      `${authorizationPrefix}\\s+[A-Za-z0-9._~+\\-/=]{8,}`,
      "gi"
    )
  },
  {
    name: "non-placeholder ARK_API_KEY assignment",
    expression:
      /ARK_API_KEY[ \t]*=[ \t]*(?![ \t]*(?:$|#|<[^>]+>|change-me\b|your-api-key\b|placeholder\b|\$\{))[^\s#]{8,}/gim
  }
];

function detect(content) {
  const detected = [];
  for (const pattern of patterns) {
    pattern.expression.lastIndex = 0;
    if (pattern.expression.test(content)) detected.push(pattern.name);
  }
  return detected;
}

const detectorFixtures = [
  {
    label: "Ark prefix",
    content: arkPrefix + "synthetic" + "x".repeat(20),
    expected: true
  },
  {
    label: "Bearer header",
    content:
      authorizationPrefix + " " + "synthetic-token-value",
    expected: true
  },
  {
    label: "Ark environment assignment",
    content:
      "ARK_" + "API_KEY=" + "synthetic-secret-value",
    expected: true
  },
  {
    label: "empty example placeholder",
    content: "ARK_" + "API_KEY=\nARK_MODEL_ID=synthetic-model",
    expected: false
  }
];
for (const fixture of detectorFixtures) {
  const actual = detect(fixture.content).length > 0;
  if (actual !== fixture.expected) {
    throw new Error(
      `Secret detector self-test failed for ${fixture.label}.`
    );
  }
}

const findings = [];
for (const relativePath of trackedAndUnignoredFiles) {
  const extension = extname(relativePath).toLowerCase();
  if (!textExtensions.has(extension)) continue;

  let content;
  try {
    content = readFileSync(resolve(repositoryRoot, relativePath), "utf8");
  } catch {
    continue;
  }
  if (content.includes("\0")) continue;

  for (const pattern of patterns) {
    pattern.expression.lastIndex = 0;
    for (const match of content.matchAll(pattern.expression)) {
      const line =
        content.slice(0, match.index ?? 0).split(/\r?\n/).length;
      findings.push(
        `${relativePath}:${line} contains ${pattern.name}`
      );
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(
    `Secret scan failed (${findings.length} finding(s)):\n`
  );
  for (const finding of findings) {
    process.stderr.write(`- ${finding}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Secret scan passed: ${trackedAndUnignoredFiles.length} files checked; no Ark key, Bearer token, or non-placeholder ARK_API_KEY assignment found.\n`
  );
}

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function gitTrackedAndUntrackedMarkdown(): string[] {
  const result = spawnSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      "*.md"
    ],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
      windowsHide: true
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `Unable to enumerate Markdown files: ${result.stderr.trim()}`
    );
  }
  return [...new Set(result.stdout.split("\0").filter(Boolean))]
    .filter((path) => existsSync(resolve(workspaceRoot, path)))
    .filter((path) => !path.replaceAll("\\", "/").startsWith("docs/history/"))
    .sort();
}

function localTargets(source: string): string[] {
  const targets: string[] = [];
  const inlinePattern =
    /!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^)]*["'])?\)/g;
  for (const match of source.matchAll(inlinePattern)) {
    if (match[1]) targets.push(match[1]);
  }

  const referencePattern =
    /^[ \t]{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm;
  for (const match of source.matchAll(referencePattern)) {
    if (match[1]) targets.push(match[1]);
  }
  return targets;
}

function resolveLocalTarget(markdownFile: string, rawTarget: string): string | null {
  const target = rawTarget.replace(/^<|>$/g, "");
  if (
    target.length === 0 ||
    target.startsWith("#") ||
    target.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  ) {
    return null;
  }

  const pathOnly = target.split("#", 1)[0]?.split("?", 1)[0];
  if (!pathOnly) return null;
  return resolve(
    dirname(resolve(workspaceRoot, markdownFile)),
    decodeURIComponent(pathOnly)
  );
}

const failures: string[] = [];
let checkedLinks = 0;
const markdownFiles = gitTrackedAndUntrackedMarkdown();

for (const markdownFile of markdownFiles) {
  const absoluteMarkdownFile = resolve(workspaceRoot, markdownFile);
  if (!existsSync(absoluteMarkdownFile)) {
    failures.push(`${markdownFile}: file is listed by Git but missing`);
    continue;
  }

  const source = readFileSync(absoluteMarkdownFile, "utf8");
  for (const rawTarget of localTargets(source)) {
    let absoluteTarget: string | null;
    try {
      absoluteTarget = resolveLocalTarget(markdownFile, rawTarget);
    } catch {
      failures.push(`${markdownFile}: invalid URI encoding in ${rawTarget}`);
      continue;
    }
    if (!absoluteTarget) continue;
    checkedLinks += 1;
    if (!existsSync(absoluteTarget)) {
      failures.push(`${markdownFile}: broken local link ${rawTarget}`);
      continue;
    }
    const target = statSync(absoluteTarget);
    if (!target.isFile() && !target.isDirectory()) {
      failures.push(`${markdownFile}: invalid local link target ${rawTarget}`);
    }
  }
}

if (failures.length > 0) {
  console.error(
    `Markdown link verification failed (${failures.length} issue(s)):`
  );
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Markdown link verification passed: ${markdownFiles.length} files, ${checkedLinks} local links.`
  );
}

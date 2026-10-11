import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface VerifiedStage {
  readonly name: string;
  readonly featureHead: string;
  readonly mergeCommit: string;
  readonly tag: string;
  readonly document: string;
}

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const versionHistoryPath = resolve(
  workspaceRoot,
  "docs/version-history.md"
);

const stages: readonly VerifiedStage[] = [
  {
    name: "Gate 1B",
    featureHead: "86d9f6f27b2234d56f419101f732eeffc851f603",
    mergeCommit: "6d1335a0a2a941bbd7439fd1aa4e5353bbc82d6a",
    tag: "gate-1b-verified",
    document: "docs/history/research/教育智能体平台第一轮工程验证计划.md"
  },
  {
    name: "Gate 2.4",
    featureHead: "b353f35fdba7cd47d0b2537d94b00a81487816b8",
    mergeCommit: "3ec7f106a163b85d89c5f58fc30b5ed30375d3f3",
    tag: "gate-2-4-verified",
    document: "docs/history/gates/gate-2-4-copilot-correctness.md"
  },
  {
    name: "Gate 2.5",
    featureHead: "8a5d8d56e098548be2e38347f4f3eb34d5694600",
    mergeCommit: "15fb113e68b48b8f7e0ae40b9afbac29e7d55a66",
    tag: "gate-2-5-verified",
    document: "docs/history/gates/gate-2-5-recoverable-lesson-preparation.md"
  },
  {
    name: "Gate 2.6A",
    featureHead: "57e78bac25d9d46318c671c6ec7d2f3ab3fc34b5",
    mergeCommit: "6676b3f876809bd9529b71af56dab32f07cb3c37",
    tag: "gate-2-6a-verified",
    document: "docs/history/gates/gate-2-6a-volcengine-ark-provider.md"
  },
  {
    name: "Gate 2.5B",
    featureHead: "2ac23d1e0ce2e1198f5820514e7979e42ccd4dd3",
    mergeCommit: "b3787fa117b74729e0e6347b993b2c7f4a5e37f4",
    tag: "gate-2-5b-verified",
    document: "docs/history/gates/gate-2-5b-file-and-teaching-artifacts.md"
  },
  {
    name: "Gate 2.5C",
    featureHead: "fbf5dedaf5fec3ac8cabda4d63b7e2bf0592559c",
    mergeCommit: "afdcfbd9d342822038dee3e6c1a19b64dca535ac",
    tag: "gate-2-5c-verified",
    document: "docs/history/gates/teacher-product-stabilization-matrix.md"
  },
  {
    name: "Gate 2.7",
    featureHead: "dd5437fc30f9cbc7f80790d3c2ceb44bc1b10d79",
    mergeCommit: "64e0aab9a54bdb47731d14ddca32c869c2cf25f6",
    tag: "gate-2-7-verified",
    document: "docs/history/gates/gate-2-7-assignment-learning-evidence.md"
  },
  {
    name: "Gate 2.8",
    featureHead: "996400123fd2433d145ee8056bda639c61208ce4",
    mergeCommit: "44a67ef0ffa519d0ef9c6c2b84e42ab9204561d0",
    tag: "gate-2-8-verified",
    document: "docs/history/gates/gate-2-8-teacher-workbench.md"
  },
  {
    name: "Gate 2.9",
    featureHead: "a264bb5718d5f3a3af78255691e6329b6b32166d",
    mergeCommit: "f2c756630b45e1b6e284d0f02269f0c094c3964d",
    tag: "gate-2-9-verified",
    document: "docs/history/gates/gate-2-9-classroom-reflection-loop.md"
  },
  {
    name: "Gate 2.10A",
    featureHead: "2fd31f874afa9f6097cd1c6e019763148eb59a47",
    mergeCommit: "bbba3428602bb148a3d73a201ad97fcb29181c1b",
    tag: "gate-2-10a-verified",
    document: "docs/history/gates/gate-2-10a-identity-organization-foundation.md"
  }
];

const failures: string[] = [];
let assertionCount = 0;

function check(condition: boolean, message: string): void {
  assertionCount += 1;
  if (!condition) {
    failures.push(message);
  }
}

function git(args: readonly string[]): string | undefined {
  const result = spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    return undefined;
  }
  return result.stdout.trim();
}

function read(relativePath: string): string {
  const absolutePath = resolve(workspaceRoot, relativePath);
  check(existsSync(absolutePath), `Missing required file: ${relativePath}`);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function collectMarkdownFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(absolutePath));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      files.push(absolutePath);
    }
  }
  return files;
}

function verifyLocalMarkdownLinks(filePath: string): void {
  const source = readFileSync(filePath, "utf8");
  const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g;
  for (const match of source.matchAll(linkPattern)) {
    const rawTarget = match[1]?.replace(/^<|>$/g, "");
    if (
      !rawTarget ||
      rawTarget.startsWith("#") ||
      rawTarget.startsWith("/") ||
      /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)
    ) {
      continue;
    }
    const pathOnly = rawTarget.split("#", 1)[0]?.split("?", 1)[0];
    if (!pathOnly) {
      continue;
    }
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(pathOnly);
    } catch {
      failures.push(`Invalid URI encoding in ${filePath}: ${rawTarget}`);
      continue;
    }
    const targetPath = resolve(dirname(filePath), decodedPath);
    check(
      existsSync(targetPath),
      `Broken local Markdown link in ${filePath}: ${rawTarget}`
    );
    if (existsSync(targetPath)) {
      check(
        statSync(targetPath).isFile() || statSync(targetPath).isDirectory(),
        `Invalid Markdown link target in ${filePath}: ${rawTarget}`
      );
    }
  }
}

const versionHistory = read("docs/version-history.md");
const readme = read("README.md");
const changelog = read("CHANGELOG.md");

for (const stage of stages) {
  check(
    git(["cat-file", "-e", `${stage.featureHead}^{commit}`]) !== undefined,
    `${stage.name}: feature HEAD does not exist: ${stage.featureHead}`
  );
  check(
    git(["cat-file", "-e", `${stage.mergeCommit}^{commit}`]) !== undefined,
    `${stage.name}: merge commit does not exist: ${stage.mergeCommit}`
  );
  check(
    git(["cat-file", "-t", stage.tag]) === "tag",
    `${stage.name}: ${stage.tag} is missing or is not an annotated tag`
  );
  check(
    git(["rev-parse", `${stage.tag}^{}`]) === stage.mergeCommit,
    `${stage.name}: ${stage.tag} does not peel to ${stage.mergeCommit}`
  );
  const parents = git(["show", "-s", "--format=%P", stage.mergeCommit]);
  check(
    parents?.split(/\s+/).includes(stage.featureHead) === true,
    `${stage.name}: feature HEAD is not a parent of merge ${stage.mergeCommit}`
  );
  check(
    existsSync(resolve(workspaceRoot, stage.document)),
    `${stage.name}: missing product document ${stage.document}`
  );
  check(
    versionHistory.includes(stage.featureHead),
    `${stage.name}: feature HEAD missing from VERSION_HISTORY`
  );
  check(
    versionHistory.includes(stage.mergeCommit),
    `${stage.name}: merge commit missing from VERSION_HISTORY`
  );
  check(
    versionHistory.includes(stage.tag),
    `${stage.name}: verified tag missing from VERSION_HISTORY`
  );
}

const historyCommitRefs = new Set(
  [...versionHistory.matchAll(/\b[0-9a-f]{40}\b/g)].map((match) => match[0])
);
for (const commitRef of historyCommitRefs) {
  check(
    git(["cat-file", "-e", `${commitRef}^{commit}`]) !== undefined,
    `VERSION_HISTORY references a missing commit: ${commitRef}`
  );
}

check(
  readme.includes("Gate 2.10A") && readme.includes("gate-2-10a-verified"),
  "README does not identify Gate 2.10A as the current verified gate"
);
check(
  changelog.includes("## Current") &&
    changelog.includes("普通教师工作台的可运行产品基线，已具备正式身份和学校组织边界；正式云基础设施和学校试点运维尚未完成。"),
  "CHANGELOG Current positioning or Gate 2.10A product statement is missing"
);
check(
  versionHistory.includes("Gate 2.6B") && versionHistory.includes("没有实施"),
  "VERSION_HISTORY must explicitly record that Gate 2.6B was not implemented"
);

const markdownFiles = [
  resolve(workspaceRoot, "README.md"),
  resolve(workspaceRoot, "CHANGELOG.md"),
  ...collectMarkdownFiles(resolve(workspaceRoot, "docs"))
].filter((filePath) => {
  const historyRoot = resolve(workspaceRoot, "docs/history");
  const pathFromHistory = relative(historyRoot, filePath);
  return pathFromHistory.startsWith("..") || pathFromHistory === "";
});
for (const markdownFile of markdownFiles) {
  verifyLocalMarkdownLinks(markdownFile);
}

if (failures.length > 0) {
  console.error(
    `Version history verification failed (${failures.length}/${assertionCount} checks):`
  );
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Version history verification passed: ${stages.length} verified stages, ${historyCommitRefs.size} commit references, ${markdownFiles.length} Markdown files, ${assertionCount} checks.`
  );
}

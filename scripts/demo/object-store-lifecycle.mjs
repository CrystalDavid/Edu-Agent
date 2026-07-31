import { rm, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { normalizeE2eRunId } from "../postgres/database-lifecycle.mjs";

const e2eRoot = resolve(".demo/e2e");

export function e2eObjectStoreRoot(runId) {
  const normalized = normalizeE2eRunId(runId);
  const root = resolve(e2eRoot, normalized, "uploads");
  assertSafeE2eRoot(root);
  return root;
}

export async function removeE2eObjectStore(root) {
  const resolved = resolve(root);
  assertSafeE2eRoot(resolved);
  await rm(resolved, { recursive: true, force: true });
  const runDirectory = resolve(resolved, "..");
  assertWithin(runDirectory, e2eRoot);
  await rm(runDirectory, { recursive: false, force: true }).catch(
    () => undefined
  );
}

export async function objectStoreDirectoryExists(root) {
  try {
    return (await stat(root)).isDirectory();
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function assertSafeE2eRoot(root) {
  assertWithin(root, e2eRoot);
  const parts = relative(e2eRoot, root).split(sep);
  if (parts.length !== 2 || parts[1] !== "uploads") {
    throw new Error("Refusing to operate on a non-run E2E object-store path.");
  }
}

function assertWithin(target, parent) {
  const relativePath = relative(parent, target);
  if (
    relativePath === "" ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === ".." ||
    resolve(parent, relativePath) !== target
  ) {
    throw new Error("E2E object-store path escapes .demo/e2e.");
  }
}

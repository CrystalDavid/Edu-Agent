import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const configuredRoot = process.env.EDU_AGENT_TEST_OUTPUT_ROOT?.trim();
const preferredWindowsRoot = "C:\\Code\\test";

export const testArtifactRoot = configuredRoot
  ? resolve(configuredRoot)
  : process.platform === "win32" && existsSync(preferredWindowsRoot)
    ? join(preferredWindowsRoot, "edu-agent")
    : join(tmpdir(), "edu-agent-test-output");

export function playwrightArtifactPath(...segments: string[]): string {
  return join(testArtifactRoot, "playwright", ...segments);
}

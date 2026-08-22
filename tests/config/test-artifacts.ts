import { join, resolve } from "node:path";

const configuredRoot = process.env.EDU_AGENT_TEST_OUTPUT_ROOT?.trim();

export const testArtifactRoot = configuredRoot
  ? resolve(configuredRoot)
  : resolve(".local-data", "test-output");

export function playwrightArtifactPath(...segments: string[]): string {
  return join(testArtifactRoot, "playwright", ...segments);
}

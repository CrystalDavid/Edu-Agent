import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

import { playwrightArtifactPath } from "./test-artifacts.js";

const webOrigin = `http://127.0.0.1:${
  process.env.E2E_WEB_PORT ?? "5173"
}`;
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  globalSetup: "../playwright/global-setup.ts",
  testDir: "../playwright",
  testMatch: "teacher-model-provider.spec.ts",
  outputDir: playwrightArtifactPath("ark-fake", "results"),
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: playwrightArtifactPath("ark-fake", "report"),
        open: "never"
      }
    ]
  ],
  use: {
    baseURL: webOrigin,
    storageState: playwrightArtifactPath("shared", ".auth", "teacher.json"),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: {
      width: 1440,
      height: 900
    }
  },
  webServer: {
    command: "node scripts/testing/run-e2e-app.mjs",
    cwd: workspaceRoot,
    url: `${webOrigin}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: {
      signal: "SIGTERM",
      timeout: 15_000
    }
  },
  projects: [
    {
      name: "edge-desktop-ark-fake",
      use: {
        ...devices["Desktop Chrome"],
        channel: "msedge"
      }
    }
  ]
});

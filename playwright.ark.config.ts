import { defineConfig, devices } from "@playwright/test";

const webOrigin = `http://127.0.0.1:${
  process.env.E2E_WEB_PORT ?? "5173"
}`;

export default defineConfig({
  testDir: "./tests/playwright",
  testMatch: "teacher-model-provider.spec.ts",
  outputDir: "./test-results/playwright-ark",
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
        outputFolder: "playwright-report-ark",
        open: "never"
      }
    ]
  ],
  use: {
    baseURL: webOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: {
      width: 1440,
      height: 900
    }
  },
  webServer: {
    command: "node scripts/demo/run-e2e-demo.mjs",
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

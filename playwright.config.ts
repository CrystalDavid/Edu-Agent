import { defineConfig, devices } from "@playwright/test";

const webOrigin = `http://127.0.0.1:${
  process.env.E2E_WEB_PORT ?? "5173"
}`;

export default defineConfig({
  testDir: "./tests/playwright",
  outputDir: "./test-results/playwright",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "playwright-report",
        open: "never"
      }
    ]
  ],
  use: {
    baseURL: webOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    viewport: {
      width: 1536,
      height: 960
    }
  },
  webServer: {
    command: "pnpm demo:test-server",
    url: `${webOrigin}/api/health`,
    reuseExistingServer:
      process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true",
    timeout: 120_000
  },
  projects: [
    {
      name: "edge-desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel: "msedge"
      }
    }
  ]
});

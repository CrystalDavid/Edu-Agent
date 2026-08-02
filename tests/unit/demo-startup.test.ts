import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const source = (path: string) =>
  readFileSync(resolve(root, path), "utf8");

describe("local demo startup contract", () => {
  it("keeps pnpm fixed and routes dev through the reproducible demo", () => {
    const packageJson = JSON.parse(source("package.json"));
    expect(packageJson.packageManager).toBe("pnpm@11.9.0");
    expect(packageJson.scripts.dev).toBe("pnpm demo:dev");
    expect(packageJson.scripts["demo:doctor"]).toBeTruthy();
    expect(packageJson.scripts["demo:reset"]).toBeTruthy();
    expect(packageJson.scripts["demo:down"]).toBeTruthy();
  });

  it("waits for health, formal local identity, and bootstrap before presenting the web URL", () => {
    const runner = source("scripts/demo/run-demo.mjs");
    expect(runner.indexOf("prepareDemo()")).toBeLessThan(
      runner.indexOf('startPackage("@edu-agent/api"')
    );
    expect(runner.indexOf("apiRoutes.health")).toBeLessThan(
      runner.indexOf('startPackage("@edu-agent/web"')
    );
    expect(runner.indexOf("apiRoutes.authentication.localLogin")).toBeLessThan(
      runner.indexOf("apiRoutes.demo.bootstrap")
    );
    expect(runner).toContain('authenticationMethod !== "local-identity"');
    expect(runner.indexOf("apiRoutes.demo.bootstrap")).toBeLessThan(
      runner.indexOf('startPackage("@edu-agent/web"')
    );
    expect(
      runner.indexOf(
        "apiRoutes.teacher.modelProviderAvailability"
      )
    ).toBeLessThan(
      runner.indexOf('startPackage("@edu-agent/web"')
    );
    expect(runner).toContain(
      "payload?.activeProvider === expectedActiveProvider"
    );
    expect(runner).toContain(
      "payload?.fallbackToMock === false"
    );
    expect(runner).toContain(
      "教师验收入口：http://localhost:5173/"
    );
    expect(runner).not.toMatch(/["'`]\/localhost/);
    expect(runner).toContain("stopProcessTree");
  });

  it("documents one safe local API default and no remote font CDN", () => {
    expect(source("apps/web/.env.example")).toContain(
      "VITE_API_BASE_URL="
    );
    const fontCss = source("apps/web/src/fonts.css");
    expect(fontCss).not.toMatch(/https?:\/\//);
    expect(fontCss).not.toMatch(
      /fonts\.googleapis|fonts\.gstatic|jsdelivr|raw\.githubusercontent/i
    );
    expect(fontCss).toContain("font-display: swap");
  });
});

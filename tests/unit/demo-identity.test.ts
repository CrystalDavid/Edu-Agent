import { describe, expect, it } from "vitest";

import {
  createDemoIdentityPolicy
} from "../../apps/api/src/platform/demo-identity.js";

describe("demo identity policy", () => {
  it("is fail closed by default", () => {
    expect(createDemoIdentityPolicy({})).toEqual({
      applicationEnvironment: "test",
      allowBypass: false
    });
  });

  it("allows bypass only in explicit local or demo environments", () => {
    expect(
      createDemoIdentityPolicy({
        APP_ENV: "local",
        DEMO_AUTH_BYPASS: "true"
      })
    ).toEqual({
      applicationEnvironment: "local",
      allowBypass: true
    });
    expect(
      createDemoIdentityPolicy({
        APP_ENV: "demo",
        DEMO_AUTH_BYPASS: "true"
      })
    ).toEqual({
      applicationEnvironment: "demo",
      allowBypass: true
    });
    expect(() =>
      createDemoIdentityPolicy({
        APP_ENV: "test",
        DEMO_AUTH_BYPASS: "true"
      })
    ).toThrow(/APP_ENV=local or APP_ENV=demo/);
  });

  it("forbids bypass in production regardless of APP_ENV", () => {
    expect(() =>
      createDemoIdentityPolicy({
        APP_ENV: "production",
        DEMO_AUTH_BYPASS: "true"
      })
    ).toThrow(/forbidden in production/);
    expect(() =>
      createDemoIdentityPolicy({
        APP_ENV: "local",
        NODE_ENV: "production",
        DEMO_AUTH_BYPASS: "true"
      })
    ).toThrow(/forbidden in production/);
  });
});

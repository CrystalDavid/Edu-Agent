import { describe, expect, it } from "vitest";

import { apiRoutes } from "@edu-agent/contracts";
import {
  ApiConfigurationError,
  resolveApiUrl
} from "../../apps/web/src/api-url.js";

describe("web API URL resolution", () => {
  it("uses the same-origin /api proxy when no base is configured", () => {
    expect(
      resolveApiUrl(
        apiRoutes.health,
        undefined,
        "http://localhost:5173"
      )
    ).toBe("/api/health");
  });

  it("uses an explicitly configured production API origin", () => {
    expect(
      resolveApiUrl(
        apiRoutes.demo.bootstrap,
        "https://demo-api.example.edu/",
        "https://demo.example.edu"
      )
    ).toBe(
      "https://demo-api.example.edu/api/v1/demo/workspace"
    );
  });

  it("fails clearly for a host without an explicit protocol", () => {
    expect(() =>
      resolveApiUrl(
        apiRoutes.health,
        "localhost:3001",
        "http://localhost:5173"
      )
    ).toThrow(ApiConfigurationError);
  });

  it("never turns the root route into /localhost", () => {
    const result = resolveApiUrl(
      apiRoutes.demo.bootstrap,
      "",
      "http://localhost:5173"
    );
    expect(result).toBe("/api/v1/demo/workspace");
    expect(result).not.toContain("/localhost");
  });
});

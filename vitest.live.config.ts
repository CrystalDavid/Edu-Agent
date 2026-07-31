import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@edu-agent/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url)
      ),
      "@edu-agent/test-fixtures": fileURLToPath(
        new URL(
          "./packages/test-fixtures/src/index.ts",
          import.meta.url
        )
      )
    }
  },
  test: {
    environment: "node",
    include: ["tests/live/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    sequence: {
      concurrent: false
    }
  }
});

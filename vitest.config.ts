import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

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
    include: ["tests/**/*.test.ts"],
    exclude: [
      "tests/postgres/**/*.test.ts",
      "tests/live/**/*.test.ts"
    ],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      reporter: ["text", "json-summary"]
    }
  }
});

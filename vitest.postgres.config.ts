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
    include: ["tests/postgres/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    sequence: {
      concurrent: false
    }
  }
});

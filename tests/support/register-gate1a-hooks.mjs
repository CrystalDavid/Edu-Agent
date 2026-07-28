import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const contractsUrl = new URL(
  "../../packages/contracts/src/index.ts",
  import.meta.url
).href;
const fixturesUrl = new URL(
  "../../packages/test-fixtures/src/index.ts",
  import.meta.url
).href;
const zodUrl = new URL("./zod-lite.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@edu-agent/contracts") {
      return { url: contractsUrl, shortCircuit: true };
    }
    if (specifier === "@edu-agent/test-fixtures") {
      return { url: fixturesUrl, shortCircuit: true };
    }
    if (specifier === "zod") {
      return { url: zodUrl, shortCircuit: true };
    }

    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        context.parentURL?.startsWith("file:") &&
        specifier.startsWith(".") &&
        specifier.endsWith(".js")
      ) {
        const candidate = new URL(
          specifier.replace(/\.js$/, ".ts"),
          context.parentURL
        );
        if (existsSync(fileURLToPath(candidate))) {
          return {
            url: pathToFileURL(fileURLToPath(candidate)).href,
            shortCircuit: true
          };
        }
      }
      throw error;
    }
  }
});

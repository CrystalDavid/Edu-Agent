throw new Error(
  "run-demo-fresh is intentionally disabled because it deleted the " +
    "long-lived development database. Use `pnpm test:playwright` for an " +
    "isolated E2E database, or explicitly authorize `pnpm demo:reset`."
);

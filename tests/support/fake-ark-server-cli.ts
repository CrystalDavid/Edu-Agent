import {
  startFakeArkServer
} from "./fake-ark-server.js";

const port = Number(process.env.E2E_FAKE_ARK_PORT);
if (!Number.isInteger(port) || port < 1) {
  throw new Error(
    "E2E_FAKE_ARK_PORT must be a positive integer."
  );
}

const server = await startFakeArkServer({
  port,
  scenario: "success",
  timeoutMilliseconds: 2_000
});
process.stdout.write(
  `Fake Ark server listening at ${server.baseUrl}; no external network is used.\n`
);

async function shutdown() {
  await server.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

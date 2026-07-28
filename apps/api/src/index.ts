import { createApp } from "./app.js";
import { createGate1AContainer } from "./composition/gate1a-container.js";
import {
  createGate2Container,
  type Gate2Container
} from "./composition/gate2-container.js";
import {
  readPostgresEnvironment
} from "./platform/postgres/config.js";

const port = Number(process.env.PORT ?? 3001);
const container = createGate1AContainer();
let gate2: Gate2Container | undefined;
if (process.env.GATE2_DEMO_ENABLED === "true") {
  gate2 = createGate2Container(readPostgresEnvironment());
}
const app = createApp(container, gate2);

const server = app.listen(port, () => {
  process.stdout.write(
    `Edu Agent ${gate2 ? "Gate 2 demo" : "Gate 1A"} API ` +
      `listening on http://localhost:${port}\n`
  );
});

async function shutdown(): Promise<void> {
  server.close();
  await gate2?.close();
}

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

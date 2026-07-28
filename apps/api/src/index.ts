import { createApp } from "./app.js";
import { createGate1AContainer } from "./composition/gate1a-container.js";

const port = Number(process.env.PORT ?? 3001);
const container = createGate1AContainer();
const app = createApp(container);

app.listen(port, () => {
  process.stdout.write(
    `Edu Agent Gate 1A API listening on http://localhost:${port}\n`
  );
});

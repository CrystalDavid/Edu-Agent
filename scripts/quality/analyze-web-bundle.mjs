import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const distRoot = resolve("apps/web/dist");
const manifest = JSON.parse(
  readFileSync(resolve(distRoot, ".vite/manifest.json"), "utf8")
);
const entry = Object.entries(manifest).find(
  ([, value]) => value.isEntry
);
if (!entry) {
  throw new Error(
    "Vite manifest has no entry. Run pnpm --filter @edu-agent/web build first."
  );
}

const initialKeys = new Set();
function visitStatic(key) {
  if (initialKeys.has(key)) return;
  initialKeys.add(key);
  for (const dependency of manifest[key]?.imports ?? []) {
    visitStatic(dependency);
  }
}
visitStatic(entry[0]);

function metrics(file) {
  const bytes = readFileSync(resolve(distRoot, file));
  return {
    file,
    rawBytes: bytes.byteLength,
    gzipBytes: gzipSync(bytes).byteLength
  };
}

const initial = [...initialKeys]
  .map((key) => manifest[key]?.file)
  .filter((file) => file?.endsWith(".js"))
  .map(metrics)
  .sort((a, b) => b.gzipBytes - a.gzipBytes);
const allJavaScript = Object.values(manifest)
  .map((value) => value.file)
  .filter((file, index, files) =>
    file.endsWith(".js") && files.indexOf(file) === index
  )
  .map(metrics)
  .sort((a, b) => b.gzipBytes - a.gzipBytes);

const total = (items, key) =>
  items.reduce((sum, item) => sum + item[key], 0);
const format = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

process.stdout.write(
  [
    "Initial JavaScript (static entry graph)",
    ...initial.map(
      (item) =>
        `  ${item.file}: ${format(item.rawBytes)} raw / ${format(
          item.gzipBytes
        )} gzip`
    ),
    `Initial total: ${format(
      total(initial, "rawBytes")
    )} raw / ${format(total(initial, "gzipBytes"))} gzip`,
    "",
    "Largest JavaScript chunks (all routes)",
    ...allJavaScript.slice(0, 8).map(
      (item) =>
        `  ${item.file}: ${format(item.rawBytes)} raw / ${format(
          item.gzipBytes
        )} gzip`
    )
  ].join("\n") + "\n"
);

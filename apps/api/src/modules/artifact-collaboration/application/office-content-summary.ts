import JSZip, { type JSZipObject } from "jszip";

const maxEntries = 16;
const maxArchiveEntries = 2_000;
const maxEntryBytes = 256 * 1024;
const maxSummaryCharacters = 420;

type OfficeExtension = ".docx" | ".pptx" | ".xlsx";

export async function extractOfficeContentSummary(input: {
  extension: OfficeExtension;
  content: Buffer;
}): Promise<string> {
  const archive = await JSZip.loadAsync(input.content, {
    checkCRC32: false,
    createFolders: false
  });
  if (Object.keys(archive.files).length > maxArchiveEntries) {
    throw new Error("The OOXML archive contains too many entries.");
  }
  const entries = selectedEntries(archive, input.extension);
  assertOfficeContainer(archive, entries, input.extension);

  const fragments: string[] = [];
  for (const entry of entries.slice(0, maxEntries)) {
    const xml = await readEntryPrefix(entry, maxEntryBytes);
    fragments.push(...extractTextNodes(xml, input.extension));
    if (fragments.join(" ").length >= maxSummaryCharacters * 2) break;
  }
  const summary = normalize(fragments.join(" "));
  return summary.length > 0
    ? truncate(summary, maxSummaryCharacters)
    : "Office 文件结构有效，未提取到可显示文本。";
}

function selectedEntries(
  archive: JSZip,
  extension: OfficeExtension
): JSZipObject[] {
  const entries = Object.values(archive.files).filter((entry) => !entry.dir);
  if (extension === ".docx") {
    return entries.filter((entry) => entry.name === "word/document.xml");
  }
  if (extension === ".pptx") {
    return entries
      .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/u.test(entry.name))
      .sort((left, right) => naturalName(left.name, right.name));
  }
  return entries
    .filter(
      (entry) =>
        entry.name === "xl/sharedStrings.xml" ||
        /^xl\/worksheets\/sheet\d+\.xml$/u.test(entry.name)
    )
    .sort((left, right) => {
      if (left.name === "xl/sharedStrings.xml") return -1;
      if (right.name === "xl/sharedStrings.xml") return 1;
      return naturalName(left.name, right.name);
    });
}

function assertOfficeContainer(
  archive: JSZip,
  entries: readonly JSZipObject[],
  extension: OfficeExtension
): void {
  if (!archive.file("[Content_Types].xml")) {
    throw new Error("The ZIP archive is not an OOXML document.");
  }
  const required = {
    ".docx": "word/document.xml",
    ".pptx": "ppt/presentation.xml",
    ".xlsx": "xl/workbook.xml"
  }[extension];
  if (!archive.file(required) || entries.length === 0) {
    throw new Error(`The archive does not contain a valid ${extension} document.`);
  }
}

async function readEntryPrefix(
  entry: JSZipObject,
  maxBytes: number
): Promise<string> {
  const stream = entry.nodeStream("nodebuffer") as NodeJS.ReadableStream & {
    pause?: () => void;
    destroy?: () => void;
  };
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const cleanup = () => {
      stream.removeListener("data", onData);
      stream.removeListener("end", onEnd);
      stream.removeListener("error", onError);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = maxBytes - total;
      if (remaining <= 0) {
        stream.pause?.();
        stream.destroy?.();
        finish();
        return;
      }
      chunks.push(buffer.subarray(0, remaining));
      total += Math.min(buffer.byteLength, remaining);
      if (buffer.byteLength > remaining || total >= maxBytes) {
        stream.pause?.();
        stream.destroy?.();
        finish();
      }
    };
    const onEnd = () => finish();
    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("error", onError);
  });
}

function extractTextNodes(
  xml: string,
  extension: OfficeExtension
): string[] {
  const pattern = extension === ".docx"
    ? /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gu
    : extension === ".pptx"
      ? /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gu
      : /<(?:[a-z]+:)?(?:t|v)\b[^>]*>([\s\S]*?)<\/(?:[a-z]+:)?(?:t|v)>/gu;
  return [...xml.matchAll(pattern)]
    .map((match) => decodeXml(match[1] ?? ""))
    .map(normalize)
    .filter(Boolean);
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/gu, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function normalize(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function truncate(value: string, maxCharacters: number): string {
  return value.length <= maxCharacters
    ? value
    : `${value.slice(0, maxCharacters - 1).trimEnd()}…`;
}

function naturalName(left: string, right: string): number {
  return left.localeCompare(right, "en", { numeric: true });
}

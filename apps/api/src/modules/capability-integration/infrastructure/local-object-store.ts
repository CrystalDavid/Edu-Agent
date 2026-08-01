import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  createWriteStream
} from "node:fs";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import type {
  ObjectStore,
  ObjectStorePutInput,
  ObjectStorePutResult,
  StoredObjectMetadata
} from "../domain/object-store.js";

const objectKeyPattern =
  /^v1\/[a-f0-9]{2}\/[a-f0-9]{2}\/[0-9a-f-]{36}-([a-f0-9]{64})\.blob$/u;

class ObjectTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Object exceeds the configured ${maxBytes} byte limit.`);
    this.name = "ObjectTooLargeError";
  }
}

class HashingGuard extends Transform {
  private readonly hash = createHash("sha256");
  private readonly prefixChunks: Buffer[] = [];
  private prefixLength = 0;
  sizeBytes = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  override _transform(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void
  ): void {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk, encoding);
    this.sizeBytes += buffer.byteLength;
    if (this.sizeBytes > this.maxBytes) {
      callback(new ObjectTooLargeError(this.maxBytes));
      return;
    }
    this.hash.update(buffer);
    if (this.prefixLength < 16) {
      const remaining = 16 - this.prefixLength;
      const prefix = buffer.subarray(0, remaining);
      this.prefixChunks.push(prefix);
      this.prefixLength += prefix.byteLength;
    }
    callback(null, buffer);
  }

  digest(): { sha256: string; firstBytesHex: string } {
    return {
      sha256: this.hash.digest("hex"),
      firstBytesHex: Buffer.concat(this.prefixChunks).toString("hex")
    };
  }
}

function slashPath(value: string): string {
  return value.split(sep).join("/");
}

export class LocalObjectStore implements ObjectStore {
  readonly rootDirectory: string;
  private readonly temporaryDirectory: string;
  private readonly orphanDirectory: string;

  constructor(rootDirectory: string) {
    this.rootDirectory = resolve(rootDirectory);
    this.temporaryDirectory = resolve(this.rootDirectory, ".tmp");
    this.orphanDirectory = resolve(this.rootDirectory, ".orphans");
  }

  async put(input: ObjectStorePutInput): Promise<ObjectStorePutResult> {
    if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1) {
      throw new Error("ObjectStore maxBytes must be a positive integer.");
    }
    await mkdir(this.temporaryDirectory, { recursive: true });
    const temporaryPath = resolve(
      this.temporaryDirectory,
      `${randomUUID()}.uploading`
    );
    this.assertWithinRoot(temporaryPath);
    const guard = new HashingGuard(input.maxBytes);
    try {
      await pipeline(
        input.content,
        guard,
        createWriteStream(temporaryPath, {
          flags: "wx",
          mode: 0o600
        })
      );
      if (guard.sizeBytes < 1) {
        throw new Error("Empty objects are not accepted.");
      }
      if (
        input.expectedSizeBytes !== undefined &&
        input.expectedSizeBytes !== guard.sizeBytes
      ) {
        throw new Error(
          "The streamed object size does not match Content-Length."
        );
      }
      const digest = guard.digest();
      const objectKey = [
        "v1",
        digest.sha256.slice(0, 2),
        digest.sha256.slice(2, 4),
        `${randomUUID()}-${digest.sha256}.blob`
      ].join("/");
      const destination = this.resolveObjectPath(objectKey);
      await mkdir(dirname(destination), { recursive: true });
      const handle = await open(temporaryPath, "r+");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, destination);
      return {
        objectKey,
        sizeBytes: guard.sizeBytes,
        sha256: digest.sha256,
        firstBytesHex: digest.firstBytesHex,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async get(objectKey: string): Promise<Readable> {
    const path = this.resolveObjectPath(objectKey);
    await stat(path);
    return createReadStream(path);
  }

  async exists(objectKey: string): Promise<boolean> {
    try {
      await stat(this.resolveObjectPath(objectKey));
      return true;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return false;
      }
      throw error;
    }
  }

  async metadata(objectKey: string): Promise<StoredObjectMetadata> {
    const match = objectKey.match(objectKeyPattern);
    if (!match?.[1]) throw new Error("Unsafe object key.");
    const details = await stat(this.resolveObjectPath(objectKey));
    if (!details.isFile()) throw new Error("Stored object is not a file.");
    return {
      objectKey,
      sizeBytes: details.size,
      sha256: match[1],
      modifiedAt: details.mtime.toISOString()
    };
  }

  async delete(objectKey: string): Promise<boolean> {
    const path = this.resolveObjectPath(objectKey);
    try {
      await unlink(path);
      await this.clearOrphanMarker(objectKey);
      return true;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        await this.clearOrphanMarker(objectKey);
        return false;
      }
      throw error;
    }
  }

  async listObjectKeys(): Promise<readonly string[]> {
    const root = resolve(this.rootDirectory, "v1");
    const keys: string[] = [];
    await this.walk(root, keys);
    return keys.sort();
  }

  async markOrphan(objectKey: string, safeReason: string): Promise<void> {
    this.resolveObjectPath(objectKey);
    await mkdir(this.orphanDirectory, { recursive: true });
    const markerPath = this.orphanMarkerPath(objectKey);
    await writeFile(
      markerPath,
      JSON.stringify({
        objectKey,
        safeReason: safeReason.slice(0, 240),
        markedAt: new Date().toISOString()
      }),
      { encoding: "utf8", flag: "w", mode: 0o600 }
    );
  }

  async clearOrphanMarker(objectKey: string): Promise<void> {
    await rm(this.orphanMarkerPath(objectKey), { force: true }).catch(
      () => undefined
    );
  }

  async readOrphanMarker(objectKey: string): Promise<unknown | null> {
    try {
      return JSON.parse(
        await readFile(this.orphanMarkerPath(objectKey), "utf8")
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null;
      }
      throw error;
    }
  }

  private resolveObjectPath(objectKey: string): string {
    if (!objectKeyPattern.test(objectKey)) {
      throw new Error("Unsafe object key.");
    }
    const path = resolve(this.rootDirectory, ...objectKey.split("/"));
    this.assertWithinRoot(path);
    return path;
  }

  private assertWithinRoot(path: string): void {
    const prefix = `${this.rootDirectory}${sep}`;
    if (path !== this.rootDirectory && !path.startsWith(prefix)) {
      throw new Error("Object path escapes the configured root.");
    }
  }

  private orphanMarkerPath(objectKey: string): string {
    const name = createHash("sha256").update(objectKey).digest("hex");
    const path = resolve(this.orphanDirectory, `${name}.json`);
    this.assertWithinRoot(path);
    return path;
  }

  private async walk(directory: string, keys: string[]): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      this.assertWithinRoot(path);
      if (entry.isDirectory()) {
        await this.walk(path, keys);
      } else if (entry.isFile()) {
        const key = slashPath(relative(this.rootDirectory, path));
        if (objectKeyPattern.test(key)) keys.push(key);
      }
    }
  }
}

export function readableFromBuffer(content: Buffer): Readable {
  return Readable.from(content);
}

export { ObjectTooLargeError };

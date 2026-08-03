import { resolve } from "node:path";

export interface ObjectStoreSettings {
  rootDirectory: string;
  maxUploadBytes: number;
}

const defaultMaxUploadBytes = 25 * 1024 * 1024;

export function readObjectStoreSettings(
  environment: NodeJS.ProcessEnv = process.env
): ObjectStoreSettings {
  const configuredRoot = environment.LOCAL_OBJECT_STORE_ROOT?.trim();
  const maxUploadBytes = Number(
    environment.FILE_MAX_UPLOAD_BYTES ?? defaultMaxUploadBytes
  );
  if (
    !Number.isSafeInteger(maxUploadBytes) ||
    maxUploadBytes < 1 ||
    maxUploadBytes > 250 * 1024 * 1024
  ) {
    throw new Error(
      "FILE_MAX_UPLOAD_BYTES must be an integer between 1 and 262144000."
    );
  }
  return {
    rootDirectory: resolve(
      configuredRoot && configuredRoot.length > 0
        ? configuredRoot
        : ".local-data/object-store"
    ),
    maxUploadBytes
  };
}

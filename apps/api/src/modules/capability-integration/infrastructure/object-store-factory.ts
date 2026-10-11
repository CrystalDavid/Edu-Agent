import type { ObjectStore } from "../domain/object-store.js";
import { LocalObjectStore } from "./local-object-store.js";
import type { ObjectStoreSettings } from "./object-store-config.js";

export function createConfiguredObjectStore(
  settings: ObjectStoreSettings
): ObjectStore {
  return new LocalObjectStore(settings.rootDirectory);
}

import { createHash } from "node:crypto";

import type {
  SkillLifecycleStatus,
  SkillManifest,
  SkillVersionBase
} from "./types.js";
import type {
  RuntimeSkillBinding,
  RuntimeSkillLoaderPort
} from "../../modules/agent-runtime-context/application/runtime-kernel-service.js";

export class SkillRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillRegistryError";
  }
}

export class VersionedSkillRegistry implements RuntimeSkillLoaderPort {
  readonly #skills = new Map<string, SkillVersionBase>();

  register<TSkill extends SkillVersionBase>(skill: TSkill): TSkill {
    assertManifestIntegrity(skill.manifest);
    if (this.#skills.has(skill.manifest.ref)) {
      throw new SkillRegistryError(
        `Skill ${skill.manifest.ref} is already registered.`
      );
    }
    const frozen = Object.freeze(skill);
    this.#skills.set(skill.manifest.ref, frozen);
    return frozen;
  }

  loadPublished<TSkill extends SkillVersionBase>(skillRef: string): TSkill {
    const skill = this.load<TSkill>(skillRef);
    if (skill.manifest.status !== "published") {
      throw new SkillRegistryError(
        `Skill ${skillRef} is ${skill.manifest.status} and cannot start a new run.`
      );
    }
    return skill;
  }

  loadHistorical<TSkill extends SkillVersionBase>(skillRef: string): TSkill {
    return this.load<TSkill>(skillRef);
  }

  loadPublishedBinding(skillRef: string): RuntimeSkillBinding {
    return toBinding(this.loadPublished(skillRef).manifest);
  }

  loadHistoricalBinding(skillRef: string): RuntimeSkillBinding {
    return toBinding(this.loadHistorical(skillRef).manifest);
  }

  list(): readonly RuntimeSkillBinding[] {
    return [...this.#skills.values()]
      .map((skill) => toBinding(skill.manifest))
      .sort((left, right) => left.skillRef.localeCompare(right.skillRef));
  }

  private load<TSkill extends SkillVersionBase>(skillRef: string): TSkill {
    const skill = this.#skills.get(skillRef);
    if (!skill) {
      throw new SkillRegistryError(`Skill ${skillRef} is not registered.`);
    }
    assertManifestIntegrity(skill.manifest);
    return skill as TSkill;
  }
}

export function createSkillManifest(
  input: Omit<SkillManifest, "contentHash">
): SkillManifest {
  assertRef(input.id, input.version, input.ref);
  return deepFreeze({
    ...input,
    contentHash: hashManifest(input)
  });
}

export function cloneSkillManifest(input: {
  readonly manifest: SkillManifest;
  readonly version: string;
  readonly status: SkillLifecycleStatus;
}): SkillManifest {
  const { contentHash: _contentHash, ...base } = input.manifest;
  return createSkillManifest({
    ...base,
    version: input.version,
    ref: `${base.id}@${input.version}`,
    status: input.status
  });
}

function assertManifestIntegrity(manifest: SkillManifest): void {
  assertRef(manifest.id, manifest.version, manifest.ref);
  const { contentHash, ...content } = manifest;
  if (hashManifest(content) !== contentHash) {
    throw new SkillRegistryError(
      `Skill ${manifest.ref} manifest content hash does not match.`
    );
  }
  if (!Object.isFrozen(manifest)) {
    throw new SkillRegistryError(
      `Skill ${manifest.ref} manifest must be immutable.`
    );
  }
}

function assertRef(id: string, version: string, ref: string): void {
  if (!id.trim() || !version.trim() || ref !== `${id}@${version}`) {
    throw new SkillRegistryError(`Invalid Skill ref ${ref}.`);
  }
}

function toBinding(manifest: SkillManifest): RuntimeSkillBinding {
  return Object.freeze({
    skillId: manifest.id,
    skillVersion: manifest.version,
    skillRef: manifest.ref,
    contentHash: manifest.contentHash,
    purpose: manifest.purpose,
    status: manifest.status
  });
}

function hashManifest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

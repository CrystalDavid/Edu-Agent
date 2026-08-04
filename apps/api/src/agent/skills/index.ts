import {
  lessonPreparationSkillV1,
  type LessonPreparationSkillVersion
} from "./lesson-preparation/index.js";
import { VersionedSkillRegistry } from "./skill-registry.js";

export const lessonPreparationSkillRef = "lesson-preparation@1";

export function createBuiltInSkillRegistry(): VersionedSkillRegistry {
  const registry = new VersionedSkillRegistry();
  registry.register(lessonPreparationSkillV1);
  return registry;
}

export function loadLessonPreparationSkill(
  registry: VersionedSkillRegistry,
  skillRef = lessonPreparationSkillRef
): LessonPreparationSkillVersion {
  const skill = registry.loadPublished<LessonPreparationSkillVersion>(skillRef);
  if (skill.manifest.id !== "lesson-preparation") {
    throw new Error(
      `Skill ${skillRef} cannot execute the lesson preparation workflow.`
    );
  }
  return skill;
}

export {
  VersionedSkillRegistry,
  lessonPreparationSkillV1
};
export type {
  RuntimeSkillBinding,
  RuntimeSkillLoaderPort,
  SkillLifecycleStatus,
  SkillManifest,
  SkillVersionBase
} from "./types.js";
export type { LessonPreparationSkillVersion };

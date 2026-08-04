import {
  LessonPreparationContextBuildError,
  lessonPreparationSkillV1,
  lessonPreparationSkillV2,
  type LessonPreparationContextEvaluation,
  type LessonPreparationEngineeringManifest,
  type LessonPreparationSkillInput,
  type LessonPreparationSkillEvaluation,
  type LessonPreparationSkillVersion
} from "./lesson-preparation/index.js";
import { VersionedSkillRegistry } from "./skill-registry.js";

export const lessonPreparationSkillRef = "lesson-preparation@2";

export function createBuiltInSkillRegistry(): VersionedSkillRegistry {
  const registry = new VersionedSkillRegistry();
  registry.register(lessonPreparationSkillV1);
  registry.register(lessonPreparationSkillV2);
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

export function loadHistoricalLessonPreparationSkill(
  registry: VersionedSkillRegistry,
  skillRef: string
): LessonPreparationSkillVersion {
  const skill = registry.loadHistorical<LessonPreparationSkillVersion>(
    skillRef
  );
  if (skill.manifest.id !== "lesson-preparation") {
    throw new Error(
      `Skill ${skillRef} cannot explain the lesson preparation workflow.`
    );
  }
  return skill;
}

export {
  LessonPreparationContextBuildError,
  VersionedSkillRegistry,
  lessonPreparationSkillV1,
  lessonPreparationSkillV2
};
export type {
  SkillLifecycleStatus,
  SkillManifest,
  SkillVersionBase
} from "./types.js";
export type {
  LessonPreparationContextEvaluation,
  LessonPreparationEngineeringManifest,
  LessonPreparationSkillInput,
  LessonPreparationSkillEvaluation,
  LessonPreparationSkillVersion
};

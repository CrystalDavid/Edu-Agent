import {
  LessonPreparationContextBuildError,
  lessonPreparationSkillV1,
  lessonPreparationSkillV2,
  lessonPreparationSkillV3,
  lessonPreparationSkillV4,
  type LessonPreparationContextEvaluation,
  type LessonPreparationEngineeringManifest,
  type LessonBriefContextEvaluation,
  type LessonBriefPreparationManifest,
  type PersonalizedLessonPreparationManifest,
  type PreferenceContextEvaluation,
  type LessonPreparationSkillInput,
  type LessonPreparationSkillEvaluation,
  type LessonPreparationSkillVersion
} from "./lesson-preparation/index.js";
import { VersionedSkillRegistry } from "./skill-registry.js";
import {
  lessonAnalysisSkillV1,
  type LessonAnalysisSkillInput,
  type LessonAnalysisSkillVersion
} from "./lesson-analysis/index.js";

export const lessonPreparationSkillRef = "lesson-preparation@4";
export const legacyLessonPreparationSkillRef = "lesson-preparation@3";
export const lessonAnalysisSkillRef = "lesson-analysis@1";

export function createBuiltInSkillRegistry(): VersionedSkillRegistry {
  const registry = new VersionedSkillRegistry();
  registry.register(lessonPreparationSkillV1);
  registry.register(lessonPreparationSkillV2);
  registry.register(lessonPreparationSkillV3);
  registry.register(lessonPreparationSkillV4);
  registry.register(lessonAnalysisSkillV1);
  return registry;
}

export function loadLessonAnalysisSkill(
  registry: VersionedSkillRegistry,
  skillRef = lessonAnalysisSkillRef
): LessonAnalysisSkillVersion {
  const skill = registry.loadPublished<LessonAnalysisSkillVersion>(skillRef);
  if (skill.manifest.id !== "lesson-analysis") {
    throw new Error(`Skill ${skillRef} cannot execute lesson analysis.`);
  }
  return skill;
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
  lessonPreparationSkillV2,
  lessonPreparationSkillV3,
  lessonPreparationSkillV4,
  lessonAnalysisSkillV1
};
export type {
  SkillLifecycleStatus,
  SkillManifest,
  SkillVersionBase
} from "./types.js";
export type {
  LessonPreparationContextEvaluation,
  LessonPreparationEngineeringManifest,
  LessonBriefContextEvaluation,
  LessonBriefPreparationManifest,
  PersonalizedLessonPreparationManifest,
  PreferenceContextEvaluation,
  LessonPreparationSkillInput,
  LessonPreparationSkillEvaluation,
  LessonPreparationSkillVersion,
  LessonAnalysisSkillInput,
  LessonAnalysisSkillVersion
};

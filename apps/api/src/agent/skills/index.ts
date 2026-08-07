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
import {
  materialGenerationSkillV1,
  type MaterialGenerationContextBuildResult,
  type MaterialGenerationEvaluation,
  type MaterialGenerationSkillInput,
  type MaterialGenerationSkillVersion
} from "./material-generation/index.js";
import {
  classroomReflectionSkillV1,
  type ClassroomReflectionContextBuildResult,
  type ClassroomReflectionEvaluation,
  type ClassroomReflectionSkillInput,
  type ClassroomReflectionSkillOutput,
  type ClassroomReflectionSkillVersion
} from "./classroom-reflection/index.js";
import {
  reflectionAnalysisSkillV1,
  type ReflectionAnalysisContextBuildResult,
  type ReflectionAnalysisEvaluation,
  type ReflectionAnalysisOperationMetrics,
  type ReflectionAnalysisSkillInput,
  type ReflectionAnalysisSkillOutput,
  type ReflectionAnalysisSkillVersion
} from "./reflection-analysis/index.js";

export const lessonPreparationSkillRef = "lesson-preparation@4";
export const legacyLessonPreparationSkillRef = "lesson-preparation@3";
export const lessonAnalysisSkillRef = "lesson-analysis@1";
export const materialGenerationSkillRef = "material-generation@1";
export const classroomReflectionSkillRef = "classroom-reflection@1";
export const reflectionAnalysisSkillRef = "reflection-analysis@1";

export function createBuiltInSkillRegistry(): VersionedSkillRegistry {
  const registry = new VersionedSkillRegistry();
  registry.register(lessonPreparationSkillV1);
  registry.register(lessonPreparationSkillV2);
  registry.register(lessonPreparationSkillV3);
  registry.register(lessonPreparationSkillV4);
  registry.register(lessonAnalysisSkillV1);
  registry.register(materialGenerationSkillV1);
  registry.register(classroomReflectionSkillV1);
  registry.register(reflectionAnalysisSkillV1);
  return registry;
}

export function loadReflectionAnalysisSkill(
  registry: VersionedSkillRegistry,
  skillRef = reflectionAnalysisSkillRef
): ReflectionAnalysisSkillVersion {
  const skill = registry.loadPublished<ReflectionAnalysisSkillVersion>(
    skillRef
  );
  if (skill.manifest.id !== "reflection-analysis") {
    throw new Error(`Skill ${skillRef} cannot analyze lesson reflection.`);
  }
  return skill;
}

export function loadClassroomReflectionSkill(
  registry: VersionedSkillRegistry,
  skillRef = classroomReflectionSkillRef
): ClassroomReflectionSkillVersion {
  const skill = registry.loadPublished<ClassroomReflectionSkillVersion>(
    skillRef
  );
  if (skill.manifest.id !== "classroom-reflection") {
    throw new Error(`Skill ${skillRef} cannot organize classroom feedback.`);
  }
  return skill;
}

export function loadMaterialGenerationSkill(
  registry: VersionedSkillRegistry,
  skillRef = materialGenerationSkillRef
): MaterialGenerationSkillVersion {
  const skill = registry.loadPublished<MaterialGenerationSkillVersion>(
    skillRef
  );
  if (skill.manifest.id !== "material-generation") {
    throw new Error(`Skill ${skillRef} cannot generate teaching materials.`);
  }
  return skill;
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
  lessonAnalysisSkillV1,
  materialGenerationSkillV1,
  classroomReflectionSkillV1,
  reflectionAnalysisSkillV1
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
  LessonAnalysisSkillVersion,
  MaterialGenerationSkillInput,
  MaterialGenerationContextBuildResult,
  MaterialGenerationEvaluation,
  MaterialGenerationSkillVersion,
  ClassroomReflectionSkillInput,
  ClassroomReflectionSkillOutput,
  ClassroomReflectionContextBuildResult,
  ClassroomReflectionEvaluation,
  ClassroomReflectionSkillVersion,
  ReflectionAnalysisContextBuildResult,
  ReflectionAnalysisEvaluation,
  ReflectionAnalysisOperationMetrics,
  ReflectionAnalysisSkillInput,
  ReflectionAnalysisSkillOutput,
  ReflectionAnalysisSkillVersion
};

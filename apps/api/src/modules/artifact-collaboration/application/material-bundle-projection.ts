import {
  MaterialBundleProjectionSchema,
  MaterialKindSchema,
  type FileAssetDetail,
  type MaterialBundleItem,
  type MaterialBundleProjection,
  type MaterialKind,
  type TeachingPlanRevisionView
} from "@edu-agent/contracts";

export const MATERIAL_GENERATION_SKILL_REF = "material-generation@1";

const materialKinds = MaterialKindSchema.options;

const labels: Record<MaterialKind, string> = {
  lesson_plan: "教案",
  slide_outline: "PPT 大纲",
  exercise_set: "课堂练习",
  board_design: "板书设计",
  differentiated_support: "分层支持材料"
};

const categories: Record<MaterialKind, FileAssetDetail["category"]> = {
  lesson_plan: "lesson_plan",
  slide_outline: "courseware",
  exercise_set: "assessment",
  board_design: "reference",
  differentiated_support: "worksheet"
};

export interface MaterialBundleProjectionInput {
  readonly lessonRef: string;
  readonly approvedTeachingPlan: TeachingPlanRevisionView | null;
  readonly files: readonly FileAssetDetail[];
  readonly provenanceByVersionRef?: Readonly<Record<string, MaterialDraftProvenance>>;
  readonly generatedAt?: string;
}

export interface MaterialDraftProvenance {
  readonly kind: MaterialKind;
  readonly teachingPlanRevisionRef: string;
  readonly skillRef: string;
  readonly agentRunRef: string;
  readonly contextManifestHash: string;
}

export function projectMaterialBundle(
  input: MaterialBundleProjectionInput
): MaterialBundleProjection {
  const currentRevisionRef = input.approvedTeachingPlan?.revisionRef ?? null;
  const items = materialKinds.map((kind) =>
    projectItem(
      kind,
      currentRevisionRef,
      input.files,
      input.provenanceByVersionRef ?? {}
    )
  );
  const available = items.filter((item) => item.status !== "missing");
  const sourceVersionVector: Record<string, string> = {};
  if (input.approvedTeachingPlan) {
    sourceVersionVector[
      `teaching_plan_revision:${input.approvedTeachingPlan.revisionRef}`
    ] = `${input.approvedTeachingPlan.revisionNumber}:${input.approvedTeachingPlan.state}`;
  }
  for (const item of available) {
    if (item.assetRef && item.assetVersion && item.versionNumber) {
      sourceVersionVector[`file_asset:${item.assetRef}`] =
        `${item.assetVersion}:${item.versionNumber}:${item.status}`;
    }
  }
  return MaterialBundleProjectionSchema.parse({
    lessonRef: input.lessonRef,
    approvedTeachingPlanRevisionRef: currentRevisionRef,
    approvedTeachingPlanRevisionNumber:
      input.approvedTeachingPlan?.revisionNumber ?? null,
    status: bundleStatus(currentRevisionRef, items),
    items,
    sourceVersionVector,
    generatedAt: input.generatedAt ?? new Date().toISOString()
  });
}

export function materialCategory(kind: MaterialKind): FileAssetDetail["category"] {
  return categories[kind];
}

export function materialLabel(kind: MaterialKind): string {
  return labels[kind];
}

export function materialContentSummary(input: {
  kind: MaterialKind;
  teachingPlanRevisionNumber: number;
}): string {
  return `${labels[input.kind]}草稿 · 基于 TeachingPlan Revision ${input.teachingPlanRevisionNumber} · 待教师采用`;
}

function projectItem(
  kind: MaterialKind,
  currentRevisionRef: string | null,
  files: readonly FileAssetDetail[],
  provenanceByVersionRef: Readonly<Record<string, MaterialDraftProvenance>>
): MaterialBundleItem {
  const candidates = files
    .filter((file) => file.status === "active")
    .map((file) =>
      toCandidate(
        kind,
        currentRevisionRef,
        file,
        provenanceByVersionRef[file.currentVersion.versionRef] ?? null
      )
    )
    .filter((item): item is MaterialBundleItem => item !== null)
    .sort(compareItems);
  return candidates[0] ?? emptyItem(kind);
}

function toCandidate(
  kind: MaterialKind,
  currentRevisionRef: string | null,
  file: FileAssetDetail,
  provenance: MaterialDraftProvenance | null
): MaterialBundleItem | null {
  const formalLessonPlan =
    kind === "lesson_plan" &&
    file.category === "lesson_plan" &&
    file.source === "teaching_plan_export" &&
    file.currentVersion.extension === ".docx";
  if (!formalLessonPlan && provenance?.kind !== kind) return null;
  if (!formalLessonPlan && file.category !== categories[kind]) return null;

  const revisionBindings = file.bindings.filter(
    (binding) => binding.targetType === "teaching_plan_revision"
  );
  const currentBinding = currentRevisionRef
    ? revisionBindings.find(
        (binding) => binding.targetRef === currentRevisionRef
      ) ?? null
    : null;
  const sourceRevisionRef =
    provenance?.teachingPlanRevisionRef ??
    currentBinding?.targetRef ??
    revisionBindings[0]?.targetRef ??
    null;
  const status =
    currentRevisionRef && currentBinding?.relation === "export"
      ? "adopted"
      : currentRevisionRef && currentBinding
        ? "draft"
        : "outdated";
  return {
    kind,
    label: labels[kind],
    status,
    assetRef: file.assetRef,
    assetVersion: file.version,
    versionRef: file.currentVersion.versionRef,
    versionNumber: file.currentVersion.versionNumber,
    originalFileName: file.currentVersion.originalFileName,
    mimeType: file.currentVersion.mimeType,
    previewKind: file.currentVersion.previewKind,
    sourceTeachingPlanRevisionRef: sourceRevisionRef,
    generatedBySkillRef:
      provenance?.skillRef ?? (formalLessonPlan ? "teaching-plan-docx-export" : null),
    agentRunRef: provenance?.agentRunRef ?? null,
    contextManifestHash: provenance?.contextManifestHash ?? null,
    contentHash: file.currentVersion.sha256,
    updatedAt: file.updatedAt
  };
}

function emptyItem(kind: MaterialKind): MaterialBundleItem {
  return {
    kind,
    label: labels[kind],
    status: "missing",
    assetRef: null,
    assetVersion: null,
    versionRef: null,
    versionNumber: null,
    originalFileName: null,
    mimeType: null,
    previewKind: null,
    sourceTeachingPlanRevisionRef: null,
    generatedBySkillRef: null,
    agentRunRef: null,
    contextManifestHash: null,
    contentHash: null,
    updatedAt: null
  };
}

function bundleStatus(
  currentRevisionRef: string | null,
  items: readonly MaterialBundleItem[]
): MaterialBundleProjection["status"] {
  if (!currentRevisionRef) return "blocked_no_approved_plan";
  if (items.every((item) => item.status === "adopted")) return "ready";
  if (items.some((item) => item.status === "draft")) {
    return "waiting_for_teacher";
  }
  if (items.every((item) => item.status === "missing")) {
    return "ready_to_generate";
  }
  return "partially_ready";
}

function compareItems(left: MaterialBundleItem, right: MaterialBundleItem): number {
  const rank = { adopted: 2, draft: 2, outdated: 1, missing: 0 } as const;
  const status = rank[right.status] - rank[left.status];
  if (status !== 0) return status;
  return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
}

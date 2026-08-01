import { z } from "zod";

export const FileCategorySchema = z.enum([
  "lesson_plan",
  "reference",
  "courseware",
  "assessment",
  "worksheet",
  "report",
  "other"
]);

export const FileSourceSchema = z.enum([
  "upload",
  "teaching_plan_export"
]);

export const FileLifecycleStatusSchema = z.enum([
  "active",
  "deleted"
]);

export const FilePreviewKindSchema = z.enum([
  "image",
  "text",
  "pdf",
  "office",
  "unsupported"
]);

export const FileBindingTargetTypeSchema = z.enum([
  "lesson",
  "preparation_task",
  "teaching_plan_artifact",
  "teaching_plan_revision",
  "assignment",
  "assignment_version"
]);

export const FileBindingRelationSchema = z.enum([
  "reference",
  "export",
  "attachment"
]);

export const FileBindingTargetSchema = z.object({
  targetType: FileBindingTargetTypeSchema,
  targetRef: z.string().min(1),
  relation: FileBindingRelationSchema
});

export const FileBindingViewSchema = FileBindingTargetSchema.extend({
  bindingRef: z.string().min(1),
  assetRef: z.string().min(1),
  versionRef: z.string().min(1),
  createdAt: z.string().datetime()
});

export const FileVersionViewSchema = z.object({
  versionRef: z.string().min(1),
  assetRef: z.string().min(1),
  versionNumber: z.number().int().positive(),
  originalFileName: z.string().min(1),
  mimeType: z.string().min(1),
  extension: z.string().regex(/^\.[a-z0-9]+$/u),
  previewKind: FilePreviewKindSchema,
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  contentSummary: z.string().min(1).nullable(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime()
});

export const FileAssetSummarySchema = z.object({
  assetRef: z.string().min(1),
  displayName: z.string().min(1),
  category: FileCategorySchema,
  source: FileSourceSchema,
  status: FileLifecycleStatusSchema,
  version: z.number().int().positive(),
  currentVersion: FileVersionViewSchema,
  bindingCount: z.number().int().nonnegative(),
  deletionProtected: z.boolean(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const FileAssetDetailSchema = FileAssetSummarySchema.extend({
  versions: z.array(FileVersionViewSchema).min(1),
  bindings: z.array(FileBindingViewSchema)
});

export const FileAssetListSchema = z.object({
  items: z.array(FileAssetSummarySchema),
  generatedAt: z.string().datetime()
});

export const FileAssetListQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  category: FileCategorySchema.optional(),
  status: z.enum(["active", "deleted", "all"]).default("active"),
  sort: z
    .enum(["newest", "oldest", "name", "size", "type"])
    .default("newest"),
  targetType: FileBindingTargetTypeSchema.optional(),
  targetRef: z.string().min(1).optional()
}).superRefine((value, context) => {
  if ((value.targetType && !value.targetRef) || (!value.targetType && value.targetRef)) {
    context.addIssue({
      code: "custom",
      path: ["targetRef"],
      message: "targetType and targetRef must be provided together"
    });
  }
});

export const FileUploadMetadataSchema = z.object({
  originalFileName: z.string().min(1).max(180),
  mimeType: z.string().min(1).max(160),
  category: FileCategorySchema,
  purpose: z.literal("file.upload"),
  idempotencyKey: z.string().min(8).max(200),
  bindings: z.array(FileBindingTargetSchema).max(8).default([])
});

export const FileVersionUploadMetadataSchema = z.object({
  originalFileName: z.string().min(1).max(180),
  mimeType: z.string().min(1).max(160),
  expectedAssetVersion: z.number().int().positive(),
  purpose: z.literal("file.version.create"),
  idempotencyKey: z.string().min(8).max(200)
});

export const FileLifecycleRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  purpose: z.enum(["file.delete", "file.restore"]),
  idempotencyKey: z.string().min(8).max(200)
});

export const FileBindingRequestSchema = FileBindingTargetSchema.extend({
  expectedAssetVersion: z.number().int().positive(),
  purpose: z.literal("file.binding.add"),
  idempotencyKey: z.string().min(8).max(200)
});

export const FileMutationResultSchema = z.object({
  replayed: z.boolean(),
  deduplicated: z.boolean(),
  asset: FileAssetDetailSchema
});

export const TeachingPlanDocxExportRequestSchema = z.object({
  lessonRef: z.string().min(1),
  preparationTaskRef: z.string().min(1).optional(),
  expectedRevisionNumber: z.number().int().positive(),
  purpose: z.literal("teaching-plan.export-docx"),
  idempotencyKey: z.string().min(8).max(200)
});

export const TeachingPlanDocxExportResultSchema = z.object({
  replayed: z.boolean(),
  deduplicated: z.boolean(),
  exportRef: z.string().min(1),
  templateVersion: z.string().min(1),
  asset: FileAssetDetailSchema
});

export const FileMaintenanceResultSchema = z.object({
  inspectedObjects: z.number().int().nonnegative(),
  removedObjects: z.number().int().nonnegative(),
  retainedObjects: z.number().int().nonnegative()
});

export type FileCategory = z.infer<typeof FileCategorySchema>;
export type FileSource = z.infer<typeof FileSourceSchema>;
export type FilePreviewKind = z.infer<typeof FilePreviewKindSchema>;
export type FileBindingTargetType = z.infer<
  typeof FileBindingTargetTypeSchema
>;
export type FileBindingTarget = z.infer<typeof FileBindingTargetSchema>;
export type FileBindingView = z.infer<typeof FileBindingViewSchema>;
export type FileVersionView = z.infer<typeof FileVersionViewSchema>;
export type FileAssetSummary = z.infer<typeof FileAssetSummarySchema>;
export type FileAssetDetail = z.infer<typeof FileAssetDetailSchema>;
export type FileAssetListQuery = z.infer<typeof FileAssetListQuerySchema>;
export type FileUploadMetadata = z.infer<typeof FileUploadMetadataSchema>;
export type FileVersionUploadMetadata = z.infer<
  typeof FileVersionUploadMetadataSchema
>;
export type FileLifecycleRequest = z.infer<
  typeof FileLifecycleRequestSchema
>;
export type FileBindingRequest = z.infer<typeof FileBindingRequestSchema>;
export type TeachingPlanDocxExportRequest = z.infer<
  typeof TeachingPlanDocxExportRequestSchema
>;
export type FileMutationResult = z.infer<
  typeof FileMutationResultSchema
>;
export type TeachingPlanDocxExportResult = z.infer<
  typeof TeachingPlanDocxExportResultSchema
>;
export type FileMaintenanceResult = z.infer<
  typeof FileMaintenanceResultSchema
>;

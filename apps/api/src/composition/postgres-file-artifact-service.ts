import { createHash, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import {
  FileAssetDetailSchema,
  FileAssetListQuerySchema,
  FileAssetListSchema,
  FileBindingRequestSchema,
  FileLifecycleRequestSchema,
  FileMutationResultSchema,
  FileUploadMetadataSchema,
  FileVersionUploadMetadataSchema,
  TeachingPlanDocxExportRequestSchema,
  TeachingPlanDocxExportResultSchema,
  type AuthorizationDecision,
  type FileAssetDetail,
  type FileAssetListQuery,
  type FileBindingRequest,
  type FileBindingTarget,
  type FileLifecycleRequest,
  type FileUploadMetadata,
  type FileVersionUploadMetadata,
  type FormalWriteReceipt,
  type TeachingPlanDocxExportRequest
} from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/sample-data";
import type { Pool } from "pg";

import {
  renderApprovedTeachingPlanDocx,
  TEACHING_PLAN_DOCX_TEMPLATE_VERSION
} from "../modules/artifact-collaboration/application/teaching-plan-docx-renderer.js";
import {
  extractOfficeContentSummary
} from "../modules/artifact-collaboration/application/office-content-summary.js";
import {
  assertFileSignature,
  contentSummary,
  validateFileMetadata
} from "../modules/artifact-collaboration/domain/file-artifact.js";
import {
  PostgresFileArtifactRepository,
  type StoredFileContent
} from "../modules/artifact-collaboration/infrastructure/postgres-file-artifact-repository.js";
import {
  PostgresGate2ArtifactRepository
} from "../modules/artifact-collaboration/infrastructure/postgres-gate2-artifact-repository.js";
import type { ObjectStore } from "../modules/capability-integration/domain/object-store.js";
import { ObjectTooLargeError } from "../modules/capability-integration/infrastructure/local-object-store.js";
import type { ObjectStoreSettings } from "../modules/capability-integration/infrastructure/object-store-config.js";
import {
  PostgresGate25EducationRepository
} from "../modules/education-domain/infrastructure/postgres-gate2-5-education-repository.js";
import {
  PostgresGate27EducationRepository
} from "../modules/education-domain/infrastructure/postgres-gate2-7-education-repository.js";
import {
  PostgresEducationRepository
} from "../modules/education-domain/infrastructure/postgres-education-repository.js";
import {
  PostgresGovernanceRepository
} from "../modules/identity-governance-audit/infrastructure/postgres-governance-repository.js";
import {
  PostgresGate25WorkRepository
} from "../modules/work-assistant-durable-execution/infrastructure/postgres-gate2-5-work-repository.js";
import {
  AuthorizationDeniedError,
  DomainConflictError,
  InvalidFileError,
  NotFoundError
} from "../platform/errors.js";
import {
  createWriteMetadata,
  type WriteContext
} from "../platform/postgres/write-context.js";

function hash(value: unknown): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

function decisionRef(rootKey: string): string {
  return `authorization-decision:${hash(rootKey).slice(0, 32)}`;
}

function safeDisplayName(value: string): string {
  return value.replace(/\.[^.]+$/u, "").trim().slice(0, 160) || "未命名文件";
}

export interface AuthorizedFileContent extends StoredFileContent {
  stream: Readable;
}

export class PostgresFileArtifactService {
  constructor(
    private readonly pool: Pool,
    private readonly objectStore: ObjectStore,
    private readonly objectStoreSettings: ObjectStoreSettings,
    private readonly governance = new PostgresGovernanceRepository(),
    private readonly files = new PostgresFileArtifactRepository(),
    private readonly education = new PostgresGate25EducationRepository(),
    private readonly assignments = new PostgresGate27EducationRepository(),
    private readonly educationEvidence = new PostgresEducationRepository(),
    private readonly work = new PostgresGate25WorkRepository(),
    private readonly artifacts = new PostgresGate2ArtifactRepository()
  ) {}

  async list(input: {
    tenantRef: string;
    actorRef: string;
    query: FileAssetListQuery;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const query = FileAssetListQuerySchema.parse(input.query);
    return FileAssetListSchema.parse({
      items: await this.files.listAssets(this.pool, input.tenantRef, query),
      generatedAt: new Date().toISOString()
    });
  }

  async get(input: {
    tenantRef: string;
    actorRef: string;
    assetRef: string;
  }): Promise<FileAssetDetail> {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    return this.requireAsset(input.tenantRef, input.assetRef);
  }

  async getContent(input: {
    tenantRef: string;
    actorRef: string;
    assetRef: string;
    versionRef?: string;
  }): Promise<AuthorizedFileContent> {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const content = await this.files.getContent(
      this.pool,
      input.tenantRef,
      input.assetRef,
      input.versionRef
    );
    if (!content) throw new NotFoundError("文件内容或版本不存在。");
    if (content.status !== "active") {
      throw new DomainConflictError(
        "FILE_DELETED",
        "已删除文件不可下载；请先恢复文件。"
      );
    }
    if (!(await this.objectStore.exists(content.objectKey))) {
      throw new DomainConflictError(
        "FILE_OBJECT_MISSING",
        "文件元数据存在，但本地对象缺失。"
      );
    }
    await this.recordReadAuthorization({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      action: "file.download",
      resourceRef: `${input.assetRef}:${content.version.versionRef}`
    });
    return {
      ...content,
      stream: await this.objectStore.get(content.objectKey)
    };
  }

  async upload(input: {
    tenantRef: string;
    actorRef: string;
    metadata: FileUploadMetadata;
    content: Readable;
    expectedSizeBytes?: number;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const metadata = FileUploadMetadataSchema.parse(input.metadata);
    const validated = this.validateMetadata(metadata);
    const stored = await this.store(input.content, input.expectedSizeBytes);
    let extractedText: string | undefined;
    let effectiveStored = stored;
    try {
      this.assertSignature(validated.extension, stored.firstBytesHex);
      extractedText = await this.extractOfficeSummary(
        validated.extension,
        stored.objectKey
      );
      effectiveStored = await this.reuseStoredObject(
        input.tenantRef,
        stored
      );
    } catch (error) {
      await this.compensate(stored.objectKey, "file-signature-rejected");
      throw error;
    }

    const now = new Date().toISOString();
    const rootKey = [
      input.tenantRef,
      input.actorRef,
      metadata.purpose,
      metadata.idempotencyKey
    ].join("|");
    const context = this.writeContext(input.actorRef, metadata.purpose, metadata.idempotencyKey, rootKey, now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.files.reserveIdempotency(client, {
        idempotencyRef: `file-idempotency:${hash(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: hash({ metadata, sha256: stored.sha256 }),
        writeContext: context
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        await this.objectStore.delete(stored.objectKey);
        const assetRef = String(reservation.result?.["assetRef"] ?? "");
        return FileMutationResultSchema.parse({
          replayed: true,
          deduplicated: Boolean(reservation.result?.["deduplicated"]),
          asset: await this.requireAsset(input.tenantRef, assetRef)
        });
      }

      const receipts: FormalWriteReceipt[] = [reservation.receipt!];
      receipts.push(...(await this.authorize(client, {
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        action: "file.upload",
        resourceRef: input.tenantRef,
        requestedFieldMask: ["content", "metadata", "bindings"],
        context
      })));
      for (const binding of metadata.bindings) {
        await this.assertBinding(client, input.tenantRef, binding);
      }
      const assetRef = `file-asset:${randomUUID()}`;
      const versionRef = `file-version:${randomUUID()}`;
      receipts.push(...(await this.files.insertFileAssetBundle(client, {
        assetRef,
        tenantRef: input.tenantRef,
        displayName: safeDisplayName(validated.originalFileName),
        category: metadata.category,
        source: "upload",
        version: {
          versionRef,
          originalFileName: validated.originalFileName,
          mimeType: validated.mimeType,
          extension: validated.extension,
          sizeBytes: effectiveStored.sizeBytes,
          sha256: effectiveStored.sha256,
          objectKey: effectiveStored.objectKey,
          contentSummary: contentSummary({
            category: metadata.category,
            originalFileName: validated.originalFileName,
            extension: validated.extension,
            sizeBytes: effectiveStored.sizeBytes,
            ...(extractedText ? { extractedText } : {})
          }),
          createdBy: input.actorRef
        },
        bindings: metadata.bindings,
        eventName: "FileAssetCreated",
        eventPayload: { category: metadata.category, source: "upload" },
        writeContext: context
      })));
      const result = { assetRef, deduplicated: false };
      await this.files.completeIdempotency(client, { rootKey, result, completedAt: now });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      await this.objectStore.clearOrphanMarker(effectiveStored.objectKey);
      return FileMutationResultSchema.parse({
        replayed: false,
        deduplicated: false,
        asset: await this.requireAsset(input.tenantRef, assetRef)
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      await this.compensate(stored.objectKey, "file-database-write-failed");
      throw this.translateRepositoryError(error);
    } finally {
      client.release();
    }
  }

  async createVersion(input: {
    tenantRef: string;
    actorRef: string;
    assetRef: string;
    metadata: FileVersionUploadMetadata;
    content: Readable;
    expectedSizeBytes?: number;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const metadata = FileVersionUploadMetadataSchema.parse(input.metadata);
    const validated = this.validateMetadata(metadata);
    const existingAsset = await this.requireAsset(
      input.tenantRef,
      input.assetRef
    );
    if (existingAsset.source === "teaching_plan_export") {
      throw new DomainConflictError(
        "TEACHING_PLAN_EXPORT_VERSION_MANAGED",
        "正式教案文件的版本只能由明确的 approved TeachingPlan Revision 导出创建。"
      );
    }
    const stored = await this.store(input.content, input.expectedSizeBytes);
    let extractedText: string | undefined;
    let effectiveStored = stored;
    try {
      this.assertSignature(validated.extension, stored.firstBytesHex);
      extractedText = await this.extractOfficeSummary(
        validated.extension,
        stored.objectKey
      );
      effectiveStored = await this.reuseStoredObject(
        input.tenantRef,
        stored
      );
    } catch (error) {
      await this.compensate(stored.objectKey, "file-signature-rejected");
      throw error;
    }
    const now = new Date().toISOString();
    const rootKey = [input.tenantRef, input.actorRef, input.assetRef, metadata.purpose, metadata.idempotencyKey].join("|");
    const context = this.writeContext(input.actorRef, metadata.purpose, metadata.idempotencyKey, rootKey, now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.files.reserveIdempotency(client, {
        idempotencyRef: `file-idempotency:${hash(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: hash({ assetRef: input.assetRef, metadata, sha256: stored.sha256 }),
        writeContext: context
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        await this.objectStore.delete(stored.objectKey);
        return FileMutationResultSchema.parse({
          replayed: true,
          deduplicated: Boolean(reservation.result?.["deduplicated"]),
          asset: await this.requireAsset(input.tenantRef, input.assetRef)
        });
      }
      const receipts: FormalWriteReceipt[] = [reservation.receipt!];
      receipts.push(...(await this.authorize(client, {
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        action: "file.version.create",
        resourceRef: input.assetRef,
        requestedFieldMask: ["content", "metadata"],
        context
      })));
      const created = await this.files.insertNewVersion(client, {
        assetRef: input.assetRef,
        expectedAssetVersion: metadata.expectedAssetVersion,
        version: {
          versionRef: `file-version:${randomUUID()}`,
          originalFileName: validated.originalFileName,
          mimeType: validated.mimeType,
          extension: validated.extension,
          sizeBytes: effectiveStored.sizeBytes,
          sha256: effectiveStored.sha256,
          objectKey: effectiveStored.objectKey,
          contentSummary: contentSummary({
            category: existingAsset.category,
            originalFileName: validated.originalFileName,
            extension: validated.extension,
            sizeBytes: effectiveStored.sizeBytes,
            ...(extractedText ? { extractedText } : {})
          }),
          createdBy: input.actorRef
        },
        eventName: "FileVersionCreated",
        eventPayload: {},
        writeContext: context
      });
      receipts.push(...created.receipts);
      await this.files.completeIdempotency(client, { rootKey, result: { assetRef: input.assetRef, deduplicated: created.deduplicated }, completedAt: now });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      await this.objectStore.clearOrphanMarker(effectiveStored.objectKey);
      if (created.deduplicated) await this.objectStore.delete(stored.objectKey);
      return FileMutationResultSchema.parse({
        replayed: false,
        deduplicated: created.deduplicated,
        asset: await this.requireAsset(input.tenantRef, input.assetRef)
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      await this.compensate(stored.objectKey, "file-version-database-write-failed");
      throw this.translateRepositoryError(error);
    } finally {
      client.release();
    }
  }

  async addBinding(input: {
    tenantRef: string;
    actorRef: string;
    assetRef: string;
    request: FileBindingRequest;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = FileBindingRequestSchema.parse(input.request);
    const existingAsset = await this.requireAsset(
      input.tenantRef,
      input.assetRef
    );
    if (existingAsset.source === "teaching_plan_export") {
      throw new DomainConflictError(
        "TEACHING_PLAN_EXPORT_BINDING_MANAGED",
        "正式教案文件的 Revision、Lesson 与 Task 关联只能由导出流程维护。"
      );
    }
    return this.metadataMutation({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      assetRef: input.assetRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      fingerprint: { assetRef: input.assetRef, request },
      action: "file.binding.add",
      execute: async (client, context) => {
        await this.assertBinding(client, input.tenantRef, request);
        return this.files.addBinding(client, {
          assetRef: input.assetRef,
          expectedAssetVersion: request.expectedAssetVersion,
          binding: request,
          writeContext: context
        });
      }
    });
  }

  async changeLifecycle(input: {
    tenantRef: string;
    actorRef: string;
    assetRef: string;
    request: FileLifecycleRequest;
    nextStatus: "active" | "deleted";
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = FileLifecycleRequestSchema.parse(input.request);
    const expectedPurpose =
      input.nextStatus === "deleted" ? "file.delete" : "file.restore";
    if (request.purpose !== expectedPurpose) {
      throw new AuthorizationDeniedError("文件生命周期操作与 purpose 不一致。");
    }
    if (
      input.nextStatus === "deleted" &&
      (await this.files.isDeletionProtected(this.pool, input.assetRef))
    ) {
      throw new DomainConflictError(
        "FILE_REFERENCED_BY_FORMAL_ARTIFACT",
        "该文件已被正式 TeachingPlan 成果引用，不能删除。"
      );
    }
    return this.metadataMutation({
      tenantRef: input.tenantRef,
      actorRef: input.actorRef,
      assetRef: input.assetRef,
      purpose: request.purpose,
      idempotencyKey: request.idempotencyKey,
      fingerprint: { assetRef: input.assetRef, request, nextStatus: input.nextStatus },
      action: input.nextStatus === "deleted" ? "file.delete" : "file.restore",
      execute: (client, context) =>
        this.files.changeLifecycle(client, {
          assetRef: input.assetRef,
          expectedVersion: request.expectedVersion,
          nextStatus: input.nextStatus,
          writeContext: context
        })
    });
  }

  async exportApprovedTeachingPlan(input: {
    tenantRef: string;
    actorRef: string;
    revisionRef: string;
    request: TeachingPlanDocxExportRequest;
  }) {
    this.assertDemoActor(input.tenantRef, input.actorRef);
    const request = TeachingPlanDocxExportRequestSchema.parse(input.request);
    const revision = await this.artifacts.getTeachingPlanRevision(
      this.pool,
      input.revisionRef
    );
    const scope = await this.artifacts.getTeachingPlanRevisionScope(
      this.pool,
      input.revisionRef
    );
    if (!revision || !scope) {
      throw new NotFoundError("TeachingPlan Revision 不存在。");
    }
    if (
      revision.state !== "approved" ||
      scope.lifecycleStatus !== "current_approved"
    ) {
      throw new DomainConflictError(
        "TEACHING_PLAN_EXPORT_REQUIRES_APPROVED_REVISION",
        "只有明确的 current approved TeachingPlan Revision 才能导出正式教案。"
      );
    }
    if (revision.revisionNumber !== request.expectedRevisionNumber) {
      throw new DomainConflictError(
        "TEACHING_PLAN_REVISION_CONFLICT",
        "TeachingPlan Revision 版本已变化。",
        { currentRevisionNumber: revision.revisionNumber }
      );
    }
    if (scope.lessonRef !== request.lessonRef) {
      throw new DomainConflictError(
        "TEACHING_PLAN_LESSON_MISMATCH",
        "TeachingPlan 与请求课时不一致。"
      );
    }
    const lesson = await this.education.getLesson(
      this.pool,
      input.tenantRef,
      request.lessonRef
    );
    if (!lesson) throw new NotFoundError("课时不存在。");
    const [unit, course, evidenceContext] = await Promise.all([
      this.education.getUnit(this.pool, input.tenantRef, lesson.unitRef),
      this.education.getCourseRun(this.pool, input.tenantRef, lesson.courseRunRef),
      this.educationEvidence.getTeacherCopilotContext(this.pool, {
        tenantRef: input.tenantRef,
        courseRunRef: lesson.courseRunRef
      })
    ]);
    if (!unit || !course || !evidenceContext) {
      throw new NotFoundError("导出所需课程上下文不完整。");
    }
    if (request.preparationTaskRef) {
      const task = await this.work.getPreparationTask(
        this.pool,
        input.tenantRef,
        request.preparationTaskRef
      );
      if (!task || task.lessonRef !== lesson.lessonRef) {
        throw new DomainConflictError(
          "PREPARATION_TASK_LESSON_MISMATCH",
          "备课 Task 不属于该课时。"
        );
      }
    }

    const evidence = [
      ...evidenceContext.observations.map((item) => ({
        evidenceRef: item.observationRef,
        summary: item.summary,
        status: "observation"
      })),
      ...evidenceContext.claims.map((item) => ({
        evidenceRef: item.claimRef,
        summary: item.summary,
        status: item.status
      }))
    ];
    const knownGaps = [
      ...evidenceContext.observations.flatMap((item) => item.unknowns),
      ...evidenceContext.claims
        .filter((item) => item.status !== "confirmed")
        .map((item) => item.confidenceExplanation)
    ].filter((value, index, all) => value.trim() && all.indexOf(value) === index);
    const now = new Date().toISOString();
    const content = await renderApprovedTeachingPlanDocx({
      courseRun: course,
      unit,
      lesson,
      revision,
      evidence,
      knownGaps,
      generatedAt: now
    });
    const stored = await this.storeBuffer(content);
    const rootKey = [input.tenantRef, input.actorRef, request.purpose, request.idempotencyKey].join("|");
    const context = this.writeContext(input.actorRef, request.purpose, request.idempotencyKey, rootKey, now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${input.revisionRef}|${TEACHING_PLAN_DOCX_TEMPLATE_VERSION}`
      ]);
      const reservation = await this.files.reserveIdempotency(client, {
        idempotencyRef: `file-idempotency:${hash(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: hash({ revisionRef: input.revisionRef, request, template: TEACHING_PLAN_DOCX_TEMPLATE_VERSION }),
        writeContext: context
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        await this.objectStore.delete(stored.objectKey);
        return TeachingPlanDocxExportResultSchema.parse({
          replayed: true,
          deduplicated: true,
          exportRef: String(reservation.result?.["exportRef"]),
          templateVersion: TEACHING_PLAN_DOCX_TEMPLATE_VERSION,
          asset: await this.requireAsset(input.tenantRef, String(reservation.result?.["assetRef"]))
        });
      }
      const prior = await this.files.getExportByRevision(client, {
        tenantRef: input.tenantRef,
        teachingPlanRevisionRef: input.revisionRef,
        templateVersion: TEACHING_PLAN_DOCX_TEMPLATE_VERSION
      });
      if (prior) {
        const result = { exportRef: prior.exportRef, assetRef: prior.assetRef, deduplicated: true };
        await this.files.completeIdempotency(client, { rootKey, result, completedAt: now });
        await this.governance.saveAudits(client, [reservation.receipt!]);
        await client.query("COMMIT");
        await this.objectStore.delete(stored.objectKey);
        return TeachingPlanDocxExportResultSchema.parse({
          replayed: false,
          deduplicated: true,
          exportRef: prior.exportRef,
          templateVersion: prior.templateVersion,
          asset: await this.requireAsset(input.tenantRef, prior.assetRef)
        });
      }

      const receipts: FormalWriteReceipt[] = [reservation.receipt!];
      receipts.push(...(await this.authorize(client, {
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        action: "teaching-plan.export-docx",
        resourceRef: input.revisionRef,
        requestedFieldMask: ["approvedRevision", "lesson", "evidenceSummary", "docx"],
        context
      })));
      const bindings: FileBindingTarget[] = [
        { targetType: "lesson", targetRef: lesson.lessonRef, relation: "export" },
        { targetType: "teaching_plan_artifact", targetRef: revision.artifactRef, relation: "export" },
        { targetType: "teaching_plan_revision", targetRef: revision.revisionRef, relation: "export" },
        ...(request.preparationTaskRef
          ? [{ targetType: "preparation_task" as const, targetRef: request.preparationTaskRef, relation: "export" as const }]
          : [])
      ];
      const existingAsset = await this.files.findExportAsset(client, {
        tenantRef: input.tenantRef,
        teachingPlanArtifactRef: revision.artifactRef,
        lessonRef: lesson.lessonRef
      });
      const versionRef = `file-version:${randomUUID()}`;
      let assetRef: string;
      if (existingAsset) {
        assetRef = existingAsset.assetRef;
        const created = await this.files.insertNewVersion(client, {
          assetRef,
          expectedAssetVersion: existingAsset.assetVersion,
          version: this.exportVersion({ versionRef, stored, lessonTitle: lesson.title, actorRef: input.actorRef, revisionNumber: revision.revisionNumber }),
          additionalBindings: bindings,
          eventName: "TeachingPlanDocxExported",
          eventPayload: { teachingPlanRevisionRef: revision.revisionRef },
          writeContext: context
        });
        receipts.push(...created.receipts);
      } else {
        assetRef = `file-asset:${randomUUID()}`;
        receipts.push(...(await this.files.insertFileAssetBundle(client, {
          assetRef,
          tenantRef: input.tenantRef,
          displayName: `${lesson.title} 教案`,
          category: "lesson_plan",
          source: "teaching_plan_export",
          version: this.exportVersion({ versionRef, stored, lessonTitle: lesson.title, actorRef: input.actorRef, revisionNumber: revision.revisionNumber }),
          bindings,
          eventName: "TeachingPlanDocxExported",
          eventPayload: { teachingPlanRevisionRef: revision.revisionRef },
          writeContext: context
        })));
      }
      const exportRef = `teaching-plan-export:${randomUUID()}`;
      receipts.push(await this.files.insertTeachingPlanExport(client, {
        exportRef,
        tenantRef: input.tenantRef,
        teachingPlanArtifactRef: revision.artifactRef,
        teachingPlanRevisionRef: revision.revisionRef,
        lessonRef: lesson.lessonRef,
        ...(request.preparationTaskRef ? { preparationTaskRef: request.preparationTaskRef } : {}),
        assetRef,
        versionRef,
        templateVersion: TEACHING_PLAN_DOCX_TEMPLATE_VERSION,
        contentHash: stored.sha256,
        writeContext: context
      }));
      const result = { exportRef, assetRef, deduplicated: false };
      await this.files.completeIdempotency(client, { rootKey, result, completedAt: now });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return TeachingPlanDocxExportResultSchema.parse({
        replayed: false,
        deduplicated: false,
        exportRef,
        templateVersion: TEACHING_PLAN_DOCX_TEMPLATE_VERSION,
        asset: await this.requireAsset(input.tenantRef, assetRef)
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      await this.compensate(stored.objectKey, "teaching-plan-export-database-write-failed");
      throw this.translateRepositoryError(error);
    } finally {
      client.release();
    }
  }

  async cleanupOrphans(input: { gracePeriodMs?: number } = {}) {
    const grace = input.gracePeriodMs ?? 60 * 60 * 1000;
    const referenced = new Set(await this.files.listReferencedObjectKeys(this.pool));
    const keys = await this.objectStore.listObjectKeys();
    let removed = 0;
    for (const key of keys) {
      if (referenced.has(key)) continue;
      const metadata = await this.objectStore.metadata(key);
      if (Date.now() - Date.parse(metadata.modifiedAt) < grace) continue;
      if (await this.objectStore.delete(key)) removed += 1;
    }
    return {
      inspectedObjects: keys.length,
      removedObjects: removed,
      retainedObjects: keys.length - removed
    };
  }

  private async metadataMutation(input: {
    tenantRef: string;
    actorRef: string;
    assetRef: string;
    purpose: string;
    idempotencyKey: string;
    fingerprint: unknown;
    action: string;
    execute: (
      client: import("../platform/postgres/types.js").PostgresClient,
      context: WriteContext
    ) => Promise<readonly FormalWriteReceipt[]>;
  }) {
    await this.requireAsset(input.tenantRef, input.assetRef);
    const now = new Date().toISOString();
    const rootKey = [input.tenantRef, input.actorRef, input.assetRef, input.purpose, input.idempotencyKey].join("|");
    const context = this.writeContext(input.actorRef, input.purpose, input.idempotencyKey, rootKey, now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const reservation = await this.files.reserveIdempotency(client, {
        idempotencyRef: `file-idempotency:${hash(rootKey).slice(0, 32)}`,
        rootKey,
        requestFingerprint: hash(input.fingerprint),
        writeContext: context
      });
      if (reservation.kind === "replay") {
        await client.query("COMMIT");
        return FileMutationResultSchema.parse({
          replayed: true,
          deduplicated: true,
          asset: await this.requireAsset(input.tenantRef, input.assetRef)
        });
      }
      const receipts: FormalWriteReceipt[] = [reservation.receipt!];
      receipts.push(...(await this.authorize(client, {
        tenantRef: input.tenantRef,
        actorRef: input.actorRef,
        action: input.action,
        resourceRef: input.assetRef,
        requestedFieldMask: ["metadata", "bindings", "lifecycle"],
        context
      })));
      receipts.push(...(await input.execute(client, context)));
      const result = { assetRef: input.assetRef, deduplicated: receipts.length <= 2 };
      await this.files.completeIdempotency(client, { rootKey, result, completedAt: now });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
      return FileMutationResultSchema.parse({
        replayed: false,
        deduplicated: result.deduplicated,
        asset: await this.requireAsset(input.tenantRef, input.assetRef)
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw this.translateRepositoryError(error);
    } finally {
      client.release();
    }
  }

  private async authorize(
    client: import("../platform/postgres/types.js").PostgresClient,
    input: {
      tenantRef: string;
      actorRef: string;
      action: string;
      resourceRef: string;
      requestedFieldMask: readonly string[];
      context: WriteContext;
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    const decision: AuthorizationDecision = {
      decisionRef: input.context.authorizationDecisionRef,
      actorRef: input.actorRef,
      tenantRef: input.tenantRef,
      purpose: input.context.purpose,
      action: input.action,
      resourceRef: input.resourceRef,
      requestedFieldMask: [...input.requestedFieldMask],
      effect: "allow",
      reasonCodes: ["synthetic-teacher-role", "tenant-file-scope"],
      policyVersion: "policy:file-artifact-local@1",
      decidedAt: input.context.createdAt
    };
    return [
      await this.governance.saveDecision(client, {
        decision,
        metadata: createWriteMetadata(input.context, "governance", "file-authorization")
      })
    ];
  }

  private async recordReadAuthorization(input: {
    tenantRef: string;
    actorRef: string;
    action: string;
    resourceRef: string;
  }): Promise<void> {
    const nonce = randomUUID();
    const now = new Date().toISOString();
    const rootKey = [input.tenantRef, input.actorRef, input.action, input.resourceRef, nonce].join("|");
    const context = this.writeContext(
      input.actorRef,
      "file.download",
      `file-read:${nonce}`,
      rootKey,
      now
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const receipts = await this.authorize(client, {
        ...input,
        requestedFieldMask: ["content", "mimeType", "originalFileName"],
        context
      });
      await this.governance.saveAudits(client, receipts);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async assertBinding(
    executor: import("../platform/postgres/types.js").SqlExecutor,
    tenantRef: string,
    binding: FileBindingTarget
  ): Promise<void> {
    if (binding.targetType === "lesson") {
      if (!(await this.education.getLesson(executor, tenantRef, binding.targetRef))) {
        throw new NotFoundError("文件关联的 Lesson 不存在。");
      }
      return;
    }
    if (binding.targetType === "preparation_task") {
      if (!(await this.work.getPreparationTask(executor, tenantRef, binding.targetRef))) {
        throw new NotFoundError("文件关联的备课 Task 不存在。");
      }
      return;
    }
    if (binding.targetType === "assignment") {
      if (
        !(await this.assignments.getAssignment(
          executor,
          tenantRef,
          binding.targetRef
        ))
      ) {
        throw new NotFoundError(
          "文件关联的 Assignment 不存在或不属于当前 tenant。"
        );
      }
      return;
    }
    if (binding.targetType === "assignment_version") {
      if (
        !(await this.assignments.getAssignmentByVersion(
          executor,
          tenantRef,
          binding.targetRef
        ))
      ) {
        throw new NotFoundError(
          "文件关联的 AssignmentVersion 不存在或不属于当前 tenant。"
        );
      }
      return;
    }
    const revisionRef =
      binding.targetType === "teaching_plan_revision"
        ? binding.targetRef
        : undefined;
    if (revisionRef) {
      const scope = await this.artifacts.getTeachingPlanRevisionScope(executor, revisionRef);
      if (!scope || !(await this.education.getLesson(executor, tenantRef, scope.lessonRef))) {
        throw new NotFoundError("文件关联的 TeachingPlan Revision 不存在或不属于当前 tenant。");
      }
      return;
    }
    const scope = await executor.query<{ lesson_ref: string }>(
      `SELECT lesson_ref
         FROM artifact.teaching_plan_scope_lifecycle
        WHERE artifact_ref = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [binding.targetRef]
    );
    const lessonRef = scope.rows[0]?.lesson_ref;
    if (!lessonRef || !(await this.education.getLesson(executor, tenantRef, lessonRef))) {
      throw new NotFoundError("文件关联的 TeachingPlan Artifact 不存在或不属于当前 tenant。");
    }
  }

  private async requireAsset(tenantRef: string, assetRef: string): Promise<FileAssetDetail> {
    const asset = await this.files.getAsset(this.pool, tenantRef, assetRef);
    if (!asset) throw new NotFoundError("FileAsset 不存在。");
    return FileAssetDetailSchema.parse(asset);
  }

  private validateMetadata(input: { originalFileName: string; mimeType: string }) {
    try {
      return validateFileMetadata(input);
    } catch (error) {
      throw new InvalidFileError(
        "INVALID_FILE_METADATA",
        error instanceof Error ? error.message : "文件元数据无效。"
      );
    }
  }

  private assertSignature(extension: string, firstBytesHex: string): void {
    try {
      assertFileSignature({ extension, firstBytesHex });
    } catch (error) {
      throw new InvalidFileError(
        "FILE_SIGNATURE_MISMATCH",
        error instanceof Error ? error.message : "文件签名无效。"
      );
    }
  }

  private async store(content: Readable, expectedSizeBytes?: number) {
    try {
      return await this.objectStore.put({
        content,
        maxBytes: this.objectStoreSettings.maxUploadBytes,
        ...(expectedSizeBytes === undefined ? {} : { expectedSizeBytes })
      });
    } catch (error) {
      if (error instanceof ObjectTooLargeError) {
        throw new InvalidFileError(
          "FILE_TOO_LARGE",
          `文件超过 ${error.maxBytes} 字节上限。`,
          413
        );
      }
      throw new InvalidFileError(
        "FILE_STORAGE_REJECTED",
        error instanceof Error ? error.message : "文件写入失败。"
      );
    }
  }

  private async storeBuffer(content: Buffer) {
    const { readableFromBuffer } = await import(
      "../modules/capability-integration/infrastructure/local-object-store.js"
    );
    return this.store(readableFromBuffer(content), content.byteLength);
  }

  private async extractOfficeSummary(
    extension: string,
    objectKey: string
  ): Promise<string | undefined> {
    if (!(extension === ".docx" || extension === ".pptx" || extension === ".xlsx")) {
      return undefined;
    }
    try {
      const stream = await this.objectStore.get(objectKey);
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.byteLength;
        if (total > this.objectStoreSettings.maxUploadBytes) {
          throw new Error("Stored Office object exceeds the configured limit.");
        }
        chunks.push(buffer);
      }
      return await extractOfficeContentSummary({
        extension,
        content: Buffer.concat(chunks)
      });
    } catch {
      throw new InvalidFileError(
        "INVALID_OFFICE_CONTAINER",
        "Office 文件结构无效，无法安全提取摘要。"
      );
    }
  }

  private async reuseStoredObject(
    tenantRef: string,
    stored: Awaited<ReturnType<PostgresFileArtifactService["store"]>>
  ) {
    const reusableObjectKey = await this.files.findReusableObjectKey(
      this.pool,
      {
        tenantRef,
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes
      }
    );
    if (
      !reusableObjectKey ||
      !(await this.objectStore.exists(reusableObjectKey))
    ) {
      return stored;
    }
    await this.objectStore.delete(stored.objectKey);
    return { ...stored, objectKey: reusableObjectKey };
  }

  private exportVersion(input: {
    versionRef: string;
    stored: Awaited<ReturnType<PostgresFileArtifactService["store"]>>;
    lessonTitle: string;
    actorRef: string;
    revisionNumber: number;
  }) {
    const originalFileName = `${input.lessonTitle}-教案-R${input.revisionNumber}.docx`;
    return {
      versionRef: input.versionRef,
      originalFileName,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: ".docx",
      sizeBytes: input.stored.sizeBytes,
      sha256: input.stored.sha256,
      objectKey: input.stored.objectKey,
      contentSummary: `DOCX 教案 · TeachingPlan Revision ${input.revisionNumber} · ${input.lessonTitle}`,
      createdBy: input.actorRef
    };
  }

  private async compensate(objectKey: string, reason: string): Promise<void> {
    try {
      await this.objectStore.delete(objectKey);
    } catch {
      await this.objectStore.markOrphan(objectKey, reason).catch(() => undefined);
    }
  }

  private writeContext(
    actorRef: string,
    purpose: string,
    rootIdempotencyKey: string,
    rootKey: string,
    createdAt: string
  ): WriteContext {
    return {
      actorRef,
      purpose,
      rootIdempotencyKey,
      authorizationDecisionRef: decisionRef(rootKey),
      createdAt
    };
  }

  private translateRepositoryError(error: unknown): unknown {
    if (!(error instanceof Error)) return error;
    const conflicts: Record<string, [string, string]> = {
      FILE_ASSET_VERSION_CONFLICT: ["FILE_ASSET_VERSION_CONFLICT", "文件版本已变化，请刷新后重试。"],
      DELETED_FILE_VERSION_FORBIDDEN: ["DELETED_FILE_VERSION_FORBIDDEN", "已删除文件不能创建新版本。"],
      DELETED_FILE_BINDING_FORBIDDEN: ["DELETED_FILE_BINDING_FORBIDDEN", "已删除文件不能新增关联。"],
      FILE_LIFECYCLE_NO_CHANGE: ["FILE_LIFECYCLE_NO_CHANGE", "文件已处于请求状态。"]
    };
    const conflict = conflicts[error.message];
    return conflict
      ? new DomainConflictError(conflict[0], conflict[1])
      : error;
  }

  private assertDemoActor(tenantRef: string, actorRef: string): void {
    if (!tenantRef.trim() || !actorRef.trim()) {
      throw new AuthorizationDeniedError("当前教师无权访问该文件范围。");
    }
  }
}

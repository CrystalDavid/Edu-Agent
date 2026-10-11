import { randomUUID } from "node:crypto";

import {
  FileAssetDetailSchema,
  FileAssetSummarySchema,
  type FileAssetDetail,
  type FileAssetListQuery,
  type FileAssetSummary,
  type FileBindingTarget,
  type FileBindingView,
  type FileCategory,
  type FileSource,
  type FileVersionView,
  type FormalWriteReceipt
} from "@edu-agent/contracts";

import { IdempotencyConflictError } from "../../../platform/errors.js";
import type {
  PostgresClient,
  SqlExecutor
} from "../../../platform/postgres/types.js";
import {
  createReceipt,
  createWriteMetadata,
  formalMetadataValues,
  toPostgresJson,
  type WriteContext
} from "../../../platform/postgres/write-context.js";
import { previewKindForExtension } from "../domain/file-artifact.js";

export interface FileIdempotencyReservation {
  kind: "new" | "replay";
  result?: Record<string, unknown>;
  receipt?: FormalWriteReceipt;
}

export interface StoredFileContent {
  assetRef: string;
  tenantRef: string;
  status: "active" | "deleted";
  displayName: string;
  version: FileVersionView;
  objectKey: string;
}

export interface StoredTeachingPlanFileExport {
  exportRef: string;
  assetRef: string;
  versionRef: string;
  templateVersion: string;
}

export interface StoredMaterialDraftProvenance {
  versionRef: string;
  kind: string;
  teachingPlanRevisionRef: string;
  skillRef: string;
  agentRunRef: string;
  contextManifestHash: string;
}

interface NewFileVersionInput {
  versionRef: string;
  originalFileName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  objectKey: string;
  contentSummary: string;
  createdBy: string;
}

export class PostgresFileArtifactRepository {
  async reserveIdempotency(
    client: PostgresClient,
    input: {
      idempotencyRef: string;
      rootKey: string;
      requestFingerprint: string;
      writeContext: WriteContext;
    }
  ): Promise<FileIdempotencyReservation> {
    const metadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      `file-idempotency:${input.idempotencyRef}`
    );
    const inserted = await client.query(
      `INSERT INTO artifact.file_operation_idempotency (
         idempotency_ref, root_key, request_fingerprint,
         status, result, completed_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, 'processing', NULL, NULL,
         $4, $5, $6, $7, $8, $9, $10
       )
       ON CONFLICT (root_key) DO NOTHING`,
      [
        input.idempotencyRef,
        input.rootKey,
        input.requestFingerprint,
        ...formalMetadataValues(metadata)
      ]
    );
    const selected = await client.query<{
      request_fingerprint: string;
      status: "processing" | "completed";
      result: Record<string, unknown> | null;
    }>(
      `SELECT request_fingerprint, status, result
         FROM artifact.file_operation_idempotency
        WHERE root_key = $1
        FOR UPDATE`,
      [input.rootKey]
    );
    const row = selected.rows[0];
    if (!row) throw new Error("File idempotency reservation disappeared.");
    if (row.request_fingerprint !== input.requestFingerprint) {
      throw new IdempotencyConflictError(
        "The idempotency key was used for a different file payload."
      );
    }
    if (inserted.rowCount === 0) {
      if (row.status !== "completed" || !row.result) {
        throw new Error(
          "An incomplete file idempotency reservation was committed."
        );
      }
      return { kind: "replay", result: row.result };
    }
    return {
      kind: "new",
      receipt: createReceipt({
        writeRef: input.idempotencyRef,
        recordType: "FileOperationIdempotency",
        metadata
      })
    };
  }

  async completeIdempotency(
    client: PostgresClient,
    input: {
      rootKey: string;
      result: Record<string, unknown>;
      completedAt: string;
    }
  ): Promise<void> {
    const updated = await client.query(
      `UPDATE artifact.file_operation_idempotency
          SET status = 'completed',
              result = $2,
              completed_at = $3
        WHERE root_key = $1
          AND status = 'processing'`,
      [input.rootKey, toPostgresJson(input.result), input.completedAt]
    );
    if (updated.rowCount !== 1) {
      throw new Error("File idempotency completion failed.");
    }
  }

  async insertFileAssetBundle(
    client: PostgresClient,
    input: {
      assetRef: string;
      tenantRef: string;
      displayName: string;
      category: FileCategory;
      source: FileSource;
      version: NewFileVersionInput;
      bindings: readonly FileBindingTarget[];
      eventName:
        | "FileAssetCreated"
        | "TeachingPlanDocxExported"
        | "TeachingMaterialDraftGenerated";
      eventPayload: Record<string, unknown>;
      writeContext: WriteContext;
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    const assetMetadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      `file-asset:${input.assetRef}`
    );
    const versionMetadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      `file-version:${input.version.versionRef}`
    );
    await client.query(
      `INSERT INTO artifact.file_asset (
         asset_ref, tenant_ref, display_name, category, source,
         lifecycle_status, current_version_ref, version,
         created_by, deleted_at, updated_at,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         'active', NULL, 1,
         $6, NULL, $7,
         $8, $9, $10, $11, $12, $13, $14
       )`,
      [
        input.assetRef,
        input.tenantRef,
        input.displayName,
        input.category,
        input.source,
        input.version.createdBy,
        input.writeContext.createdAt,
        ...formalMetadataValues(assetMetadata)
      ]
    );
    await this.insertVersion(client, {
      assetRef: input.assetRef,
      versionNumber: 1,
      version: input.version,
      metadata: versionMetadata
    });
    await client.query(
      `UPDATE artifact.file_asset
          SET current_version_ref = $2
        WHERE asset_ref = $1`,
      [input.assetRef, input.version.versionRef]
    );
    const receipts: FormalWriteReceipt[] = [
      createReceipt({
        writeRef: input.assetRef,
        recordType: "FileAsset",
        metadata: assetMetadata
      }),
      createReceipt({
        writeRef: input.version.versionRef,
        recordType: "FileVersion",
        metadata: versionMetadata
      })
    ];
    for (const binding of input.bindings) {
      receipts.push(
        ...(await this.insertBinding(client, {
          assetRef: input.assetRef,
          versionRef: input.version.versionRef,
          binding,
          writeContext: input.writeContext
        }))
      );
    }
    receipts.push(
      await this.insertOutbox(client, {
        eventName: input.eventName,
        aggregateRef: input.assetRef,
        payload: {
          versionRef: input.version.versionRef,
          ...input.eventPayload
        },
        writeContext: input.writeContext
      })
    );
    return receipts;
  }

  async insertNewVersion(
    client: PostgresClient,
    input: {
      assetRef: string;
      expectedAssetVersion: number;
      version: NewFileVersionInput;
      additionalBindings?: readonly FileBindingTarget[];
      eventName:
        | "FileVersionCreated"
        | "TeachingPlanDocxExported"
        | "TeachingMaterialDraftGenerated";
      eventPayload: Record<string, unknown>;
      writeContext: WriteContext;
    }
  ): Promise<{
    deduplicated: boolean;
    receipts: readonly FormalWriteReceipt[];
  }> {
    const locked = await this.lockAsset(client, input.assetRef);
    if (!locked) throw new Error(`FileAsset not found: ${input.assetRef}`);
    if (locked.version !== input.expectedAssetVersion) {
      throw new Error("FILE_ASSET_VERSION_CONFLICT");
    }
    if (locked.status !== "active") {
      throw new Error("DELETED_FILE_VERSION_FORBIDDEN");
    }
    const current = await this.getVersion(
      client,
      input.assetRef,
      locked.currentVersionRef
    );
    if (!current) throw new Error("Current FileVersion is missing.");
    if (current.sha256 === input.version.sha256) {
      return { deduplicated: true, receipts: [] };
    }

    const versionNumber = current.versionNumber + 1;
    const metadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      `file-version:${input.version.versionRef}`
    );
    await this.insertVersion(client, {
      assetRef: input.assetRef,
      versionNumber,
      version: input.version,
      metadata
    });
    const updated = await client.query(
      `UPDATE artifact.file_asset
          SET current_version_ref = $2,
              version = version + 1,
              updated_at = $3
        WHERE asset_ref = $1
          AND version = $4`,
      [
        input.assetRef,
        input.version.versionRef,
        input.writeContext.createdAt,
        input.expectedAssetVersion
      ]
    );
    if (updated.rowCount !== 1) throw new Error("FILE_ASSET_VERSION_CONFLICT");

    const receipts: FormalWriteReceipt[] = [
      createReceipt({
        writeRef: input.version.versionRef,
        recordType: "FileVersion",
        metadata
      })
    ];
    const existingBindings = await client.query<{
      target_type: FileBindingTarget["targetType"];
      target_ref: string;
      relation_kind: FileBindingTarget["relation"];
    }>(
      `SELECT DISTINCT target_type, target_ref, relation_kind
         FROM artifact.artifact_file_binding
        WHERE asset_ref = $1
          AND target_type <> 'teaching_plan_revision'`,
      [input.assetRef]
    );
    const bindings = [
      ...existingBindings.rows.map((row) => ({
        targetType: row.target_type,
        targetRef: row.target_ref,
        relation: row.relation_kind
      })),
      ...(input.additionalBindings ?? [])
    ];
    for (const binding of uniqueBindings(bindings)) {
      receipts.push(
        ...(await this.insertBinding(client, {
          assetRef: input.assetRef,
          versionRef: input.version.versionRef,
          binding,
          writeContext: input.writeContext
        }))
      );
    }
    receipts.push(
      await this.insertOutbox(client, {
        eventName: input.eventName,
        aggregateRef: input.assetRef,
        payload: {
          versionRef: input.version.versionRef,
          versionNumber,
          ...input.eventPayload
        },
        writeContext: input.writeContext
      })
    );
    return { deduplicated: false, receipts };
  }

  async addBinding(
    client: PostgresClient,
    input: {
      assetRef: string;
      expectedAssetVersion: number;
      binding: FileBindingTarget;
      writeContext: WriteContext;
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    const locked = await this.lockAsset(client, input.assetRef);
    if (!locked) throw new Error(`FileAsset not found: ${input.assetRef}`);
    if (locked.version !== input.expectedAssetVersion) {
      throw new Error("FILE_ASSET_VERSION_CONFLICT");
    }
    if (locked.status !== "active") {
      throw new Error("DELETED_FILE_BINDING_FORBIDDEN");
    }
    const receipts = await this.insertBinding(client, {
      assetRef: input.assetRef,
      versionRef: locked.currentVersionRef,
      binding: input.binding,
      writeContext: input.writeContext
    });
    if (receipts.length > 0) {
      await client.query(
        `UPDATE artifact.file_asset
            SET version = version + 1,
                updated_at = $2
          WHERE asset_ref = $1`,
        [input.assetRef, input.writeContext.createdAt]
      );
      receipts.push(
        await this.insertOutbox(client, {
          eventName: "FileBindingCreated",
          aggregateRef: input.assetRef,
          payload: input.binding,
          writeContext: input.writeContext
        })
      );
    }
    return receipts;
  }

  async changeLifecycle(
    client: PostgresClient,
    input: {
      assetRef: string;
      expectedVersion: number;
      nextStatus: "active" | "deleted";
      writeContext: WriteContext;
    }
  ): Promise<readonly FormalWriteReceipt[]> {
    const locked = await this.lockAsset(client, input.assetRef);
    if (!locked) throw new Error(`FileAsset not found: ${input.assetRef}`);
    if (locked.version !== input.expectedVersion) {
      throw new Error("FILE_ASSET_VERSION_CONFLICT");
    }
    if (locked.status === input.nextStatus) {
      throw new Error("FILE_LIFECYCLE_NO_CHANGE");
    }
    const updated = await client.query(
      `UPDATE artifact.file_asset
          SET lifecycle_status = $2,
              deleted_at = CASE
                WHEN $2 = 'deleted' THEN $3::timestamptz
                ELSE NULL::timestamptz
              END,
              version = version + 1,
              updated_at = $3::timestamptz
        WHERE asset_ref = $1
          AND version = $4`,
      [
        input.assetRef,
        input.nextStatus,
        input.writeContext.createdAt,
        input.expectedVersion
      ]
    );
    if (updated.rowCount !== 1) throw new Error("FILE_ASSET_VERSION_CONFLICT");
    const eventName =
      input.nextStatus === "deleted"
        ? "FileAssetSoftDeleted"
        : "FileAssetRestored";
    return [
      await this.insertOutbox(client, {
        eventName,
        aggregateRef: input.assetRef,
        payload: { lifecycleStatus: input.nextStatus },
        writeContext: input.writeContext
      })
    ];
  }

  async isDeletionProtected(
    executor: SqlExecutor,
    assetRef: string
  ): Promise<boolean> {
    const result = await executor.query<{ protected: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM artifact.artifact_file_binding
          WHERE asset_ref = $1
            AND target_type IN (
              'teaching_plan_artifact',
              'teaching_plan_revision',
              'assignment_version'
            )
       ) AS protected`,
      [assetRef]
    );
    return result.rows[0]?.protected === true;
  }

  async findReusableObjectKey(
    executor: SqlExecutor,
    input: {
      tenantRef: string;
      sha256: string;
      sizeBytes: number;
    }
  ): Promise<string | null> {
    const result = await executor.query<{ object_key: string }>(
      `SELECT version.object_key
         FROM artifact.file_version AS version
         JOIN artifact.file_asset AS asset
           ON asset.asset_ref = version.asset_ref
        WHERE asset.tenant_ref = $1
          AND version.sha256 = $2
          AND version.size_bytes = $3
        ORDER BY version.created_at, version.version_ref
        LIMIT 1`,
      [input.tenantRef, input.sha256, input.sizeBytes]
    );
    return result.rows[0]?.object_key ?? null;
  }

  async listAssets(
    executor: SqlExecutor,
    tenantRef: string,
    query: FileAssetListQuery
  ): Promise<FileAssetSummary[]> {
    const orderBy = {
      newest: "asset.updated_at DESC, asset.asset_ref",
      oldest: "asset.updated_at ASC, asset.asset_ref",
      name: "lower(asset.display_name), asset.asset_ref",
      size: "version.size_bytes DESC, asset.asset_ref",
      type: "version.extension, lower(asset.display_name), asset.asset_ref"
    }[query.sort];
    const result = await executor.query<FileAssetSummaryRow>(
      `${fileAssetSummarySelect}
        WHERE asset.tenant_ref = $1
          AND ($2::text = 'all' OR asset.lifecycle_status = $2)
          AND (
            $3::text IS NULL
            OR asset.display_name ILIKE '%' || $3 || '%'
          )
          AND ($4::text IS NULL OR asset.category = $4)
          AND (
            $5::text IS NULL
            OR EXISTS (
              SELECT 1
                FROM artifact.artifact_file_binding AS filter_binding
               WHERE filter_binding.asset_ref = asset.asset_ref
                 AND filter_binding.target_type = $5
                 AND filter_binding.target_ref = $6
            )
          )
        ORDER BY ${orderBy}`,
      [
        tenantRef,
        query.status,
        query.query ?? null,
        query.category ?? null,
        query.targetType ?? null,
        query.targetRef ?? null
      ]
    );
    return result.rows.map(toFileAssetSummary);
  }

  async getAsset(
    executor: SqlExecutor,
    tenantRef: string,
    assetRef: string
  ): Promise<FileAssetDetail | undefined> {
    const summaryResult = await executor.query<FileAssetSummaryRow>(
      `${fileAssetSummarySelect}
        WHERE asset.tenant_ref = $1
          AND asset.asset_ref = $2`,
      [tenantRef, assetRef]
    );
    const summaryRow = summaryResult.rows[0];
    if (!summaryRow) return undefined;
    const [versions, bindings] = await Promise.all([
      this.listVersions(executor, assetRef),
      this.listBindings(executor, assetRef, summaryRow.current_version_ref)
    ]);
    return FileAssetDetailSchema.parse({
      ...toFileAssetSummary(summaryRow),
      versions,
      bindings
    });
  }

  async getContent(
    executor: SqlExecutor,
    tenantRef: string,
    assetRef: string,
    versionRef?: string
  ): Promise<StoredFileContent | undefined> {
    const result = await executor.query<ContentRow>(
      `SELECT asset.asset_ref, asset.tenant_ref, asset.display_name,
              asset.lifecycle_status,
              version.version_ref, version.asset_ref,
              version.version_number, version.original_file_name,
              version.mime_type, version.extension,
              version.size_bytes, version.sha256,
              version.content_summary,
              version.created_by AS version_created_by,
              version.created_at AS version_created_at,
              version.object_key
         FROM artifact.file_asset AS asset
         JOIN artifact.file_version AS version
           ON version.asset_ref = asset.asset_ref
        WHERE asset.tenant_ref = $1
          AND asset.asset_ref = $2
          AND version.version_ref = COALESCE($3, asset.current_version_ref)`,
      [tenantRef, assetRef, versionRef ?? null]
    );
    const row = result.rows[0];
    return row
      ? {
          assetRef: row.asset_ref,
          tenantRef: row.tenant_ref,
          status: row.lifecycle_status,
          displayName: row.display_name,
          version: toFileVersion(row),
          objectKey: row.object_key
        }
      : undefined;
  }

  async listMaterialDraftProvenance(
    executor: SqlExecutor,
    versionRefs: readonly string[]
  ): Promise<readonly StoredMaterialDraftProvenance[]> {
    if (versionRefs.length === 0) return [];
    const result = await executor.query<{
      version_ref: string;
      kind: string;
      teaching_plan_revision_ref: string;
      skill_ref: string;
      agent_run_ref: string;
      context_manifest_hash: string;
    }>(
      `SELECT payload ->> 'versionRef' AS version_ref,
              payload ->> 'kind' AS kind,
              payload ->> 'teachingPlanRevisionRef' AS teaching_plan_revision_ref,
              payload ->> 'skillRef' AS skill_ref,
              payload ->> 'agentRunRef' AS agent_run_ref,
              payload ->> 'contextManifestHash' AS context_manifest_hash
         FROM artifact.outbox_record
        WHERE event_name = 'TeachingMaterialDraftGenerated'
          AND payload ->> 'versionRef' = ANY($1::text[])
        ORDER BY created_at DESC`,
      [versionRefs]
    );
    const seen = new Set<string>();
    return result.rows.filter((row) => {
      if (!row.version_ref || seen.has(row.version_ref)) return false;
      seen.add(row.version_ref);
      return true;
    }).map((row) => ({
      versionRef: row.version_ref,
      kind: row.kind,
      teachingPlanRevisionRef: row.teaching_plan_revision_ref,
      skillRef: row.skill_ref,
      agentRunRef: row.agent_run_ref,
      contextManifestHash: row.context_manifest_hash
    }));
  }

  async listReferencedObjectKeys(
    executor: SqlExecutor
  ): Promise<readonly string[]> {
    const result = await executor.query<{ object_key: string }>(
      `SELECT object_key FROM artifact.file_version ORDER BY object_key`
    );
    return result.rows.map((row) => row.object_key);
  }

  async getExportByRevision(
    executor: SqlExecutor,
    input: {
      tenantRef: string;
      teachingPlanRevisionRef: string;
      templateVersion: string;
    }
  ): Promise<StoredTeachingPlanFileExport | undefined> {
    const result = await executor.query<{
      export_ref: string;
      asset_ref: string;
      version_ref: string;
      template_version: string;
    }>(
      `SELECT export_ref, asset_ref, version_ref, template_version
         FROM artifact.teaching_plan_file_export
        WHERE tenant_ref = $1
          AND teaching_plan_revision_ref = $2
          AND export_format = 'docx'
          AND template_version = $3`,
      [
        input.tenantRef,
        input.teachingPlanRevisionRef,
        input.templateVersion
      ]
    );
    const row = result.rows[0];
    return row
      ? {
          exportRef: row.export_ref,
          assetRef: row.asset_ref,
          versionRef: row.version_ref,
          templateVersion: row.template_version
        }
      : undefined;
  }

  async findExportAsset(
    executor: SqlExecutor,
    input: {
      tenantRef: string;
      teachingPlanArtifactRef: string;
      lessonRef: string;
    }
  ): Promise<{ assetRef: string; assetVersion: number } | undefined> {
    const result = await executor.query<{
      asset_ref: string;
      version: number;
    }>(
      `SELECT export.asset_ref, asset.version
         FROM artifact.teaching_plan_file_export AS export
         JOIN artifact.file_asset AS asset
           ON asset.asset_ref = export.asset_ref
        WHERE export.tenant_ref = $1
          AND export.teaching_plan_artifact_ref = $2
          AND export.lesson_ref = $3
        ORDER BY export.created_at DESC
        LIMIT 1`,
      [
        input.tenantRef,
        input.teachingPlanArtifactRef,
        input.lessonRef
      ]
    );
    const row = result.rows[0];
    return row
      ? { assetRef: row.asset_ref, assetVersion: row.version }
      : undefined;
  }

  async insertTeachingPlanExport(
    client: PostgresClient,
    input: {
      exportRef: string;
      tenantRef: string;
      teachingPlanArtifactRef: string;
      teachingPlanRevisionRef: string;
      lessonRef: string;
      preparationTaskRef?: string;
      assetRef: string;
      versionRef: string;
      templateVersion: string;
      contentHash: string;
      writeContext: WriteContext;
    }
  ): Promise<FormalWriteReceipt> {
    const metadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      `teaching-plan-file-export:${input.exportRef}`
    );
    await client.query(
      `INSERT INTO artifact.teaching_plan_file_export (
         export_ref, tenant_ref, teaching_plan_artifact_ref,
         teaching_plan_revision_ref, lesson_ref,
         preparation_task_ref, asset_ref, version_ref,
         export_format, template_version, content_hash,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         'docx', $9, $10,
         $11, $12, $13, $14, $15, $16, $17
       )`,
      [
        input.exportRef,
        input.tenantRef,
        input.teachingPlanArtifactRef,
        input.teachingPlanRevisionRef,
        input.lessonRef,
        input.preparationTaskRef ?? null,
        input.assetRef,
        input.versionRef,
        input.templateVersion,
        input.contentHash,
        ...formalMetadataValues(metadata)
      ]
    );
    return createReceipt({
      writeRef: input.exportRef,
      recordType: "TeachingPlanFileExport",
      metadata
    });
  }

  private async lockAsset(
    client: PostgresClient,
    assetRef: string
  ): Promise<
    | {
        version: number;
        status: "active" | "deleted";
        currentVersionRef: string;
      }
    | undefined
  > {
    const result = await client.query<{
      version: number;
      lifecycle_status: "active" | "deleted";
      current_version_ref: string | null;
    }>(
      `SELECT version, lifecycle_status, current_version_ref
         FROM artifact.file_asset
        WHERE asset_ref = $1
        FOR UPDATE`,
      [assetRef]
    );
    const row = result.rows[0];
    return row?.current_version_ref
      ? {
          version: row.version,
          status: row.lifecycle_status,
          currentVersionRef: row.current_version_ref
        }
      : undefined;
  }

  private async getVersion(
    executor: SqlExecutor,
    assetRef: string,
    versionRef: string
  ): Promise<FileVersionView | undefined> {
    const result = await executor.query<FileVersionRow>(
      `${fileVersionSelect}
        WHERE asset_ref = $1 AND version_ref = $2`,
      [assetRef, versionRef]
    );
    return result.rows[0] ? toFileVersion(result.rows[0]) : undefined;
  }

  private async listVersions(
    executor: SqlExecutor,
    assetRef: string
  ): Promise<FileVersionView[]> {
    const result = await executor.query<FileVersionRow>(
      `${fileVersionSelect}
        WHERE asset_ref = $1
        ORDER BY version_number DESC`,
      [assetRef]
    );
    return result.rows.map(toFileVersion);
  }

  private async listBindings(
    executor: SqlExecutor,
    assetRef: string,
    versionRef: string
  ): Promise<FileBindingView[]> {
    const result = await executor.query<FileBindingRow>(
      `SELECT binding_ref, asset_ref, version_ref, target_type,
              target_ref, relation_kind, created_at
         FROM artifact.artifact_file_binding
        WHERE asset_ref = $1
          AND version_ref = $2
        ORDER BY created_at, binding_ref`,
      [assetRef, versionRef]
    );
    return result.rows.map((row) => ({
      bindingRef: row.binding_ref,
      assetRef: row.asset_ref,
      versionRef: row.version_ref,
      targetType: row.target_type,
      targetRef: row.target_ref,
      relation: row.relation_kind,
      createdAt: row.created_at.toISOString()
    }));
  }

  private async insertVersion(
    client: PostgresClient,
    input: {
      assetRef: string;
      versionNumber: number;
      version: NewFileVersionInput;
      metadata: ReturnType<typeof createWriteMetadata> & {
        owner: "artifact";
      };
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO artifact.file_version (
         version_ref, asset_ref, version_number,
         original_file_name, mime_type, extension,
         size_bytes, sha256, object_key, content_summary,
         created_by,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18
       )`,
      [
        input.version.versionRef,
        input.assetRef,
        input.versionNumber,
        input.version.originalFileName,
        input.version.mimeType,
        input.version.extension,
        input.version.sizeBytes,
        input.version.sha256,
        input.version.objectKey,
        input.version.contentSummary,
        input.version.createdBy,
        ...formalMetadataValues(input.metadata)
      ]
    );
  }

  private async insertBinding(
    client: PostgresClient,
    input: {
      assetRef: string;
      versionRef: string;
      binding: FileBindingTarget;
      writeContext: WriteContext;
    }
  ): Promise<FormalWriteReceipt[]> {
    const bindingRef = `file-binding:${randomUUID()}`;
    const metadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      `file-binding:${bindingRef}`
    );
    const inserted = await client.query(
      `INSERT INTO artifact.artifact_file_binding (
         binding_ref, asset_ref, version_ref,
         target_type, target_ref, relation_kind,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13
       )
       ON CONFLICT (
         version_ref, target_type, target_ref, relation_kind
       ) DO NOTHING`,
      [
        bindingRef,
        input.assetRef,
        input.versionRef,
        input.binding.targetType,
        input.binding.targetRef,
        input.binding.relation,
        ...formalMetadataValues(metadata)
      ]
    );
    return inserted.rowCount === 1
      ? [
          createReceipt({
            writeRef: bindingRef,
            recordType: "ArtifactFileBinding",
            metadata
          })
        ]
      : [];
  }

  private async insertOutbox(
    client: PostgresClient,
    input: {
      eventName: string;
      aggregateRef: string;
      payload: Record<string, unknown>;
      writeContext: WriteContext;
    }
  ): Promise<FormalWriteReceipt> {
    const outboxRef = `outbox:${randomUUID()}`;
    const metadata = createWriteMetadata(
      input.writeContext,
      "artifact",
      `file-outbox:${outboxRef}`
    );
    await client.query(
      `INSERT INTO artifact.outbox_record (
         outbox_ref, event_name, aggregate_ref, payload,
         actor_ref, purpose, owner_module, idempotency_key,
         authorization_decision_ref, audit_ref, created_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8, $9, $10, $11
       )`,
      [
        outboxRef,
        input.eventName,
        input.aggregateRef,
        toPostgresJson(input.payload),
        ...formalMetadataValues(metadata)
      ]
    );
    return createReceipt({
      writeRef: outboxRef,
      recordType: "OutboxRecord",
      metadata
    });
  }
}

const fileAssetSummarySelect = `
  SELECT asset.asset_ref, asset.tenant_ref, asset.display_name,
         asset.category, asset.source, asset.lifecycle_status,
         asset.current_version_ref, asset.version AS asset_version,
         asset.created_by AS asset_created_by,
         asset.created_at AS asset_created_at,
         asset.updated_at,
         version.version_ref, version.version_number,
         version.original_file_name, version.mime_type,
         version.extension, version.size_bytes, version.sha256,
         version.content_summary,
         version.created_by AS version_created_by,
         version.created_at AS version_created_at,
         (
           SELECT count(*)::integer
             FROM artifact.artifact_file_binding AS binding
            WHERE binding.asset_ref = asset.asset_ref
              AND binding.version_ref = asset.current_version_ref
         ) AS binding_count,
         EXISTS (
           SELECT 1
             FROM artifact.artifact_file_binding AS binding
            WHERE binding.asset_ref = asset.asset_ref
              AND binding.target_type IN (
                'teaching_plan_artifact',
                'teaching_plan_revision',
                'assignment_version'
              )
         ) AS deletion_protected
    FROM artifact.file_asset AS asset
    JOIN artifact.file_version AS version
      ON version.version_ref = asset.current_version_ref`;

const fileVersionSelect = `
  SELECT version_ref, asset_ref, version_number,
         original_file_name, mime_type, extension,
         size_bytes, sha256, content_summary,
         created_by AS version_created_by,
         created_at AS version_created_at
    FROM artifact.file_version`;

interface FileVersionRow {
  version_ref: string;
  asset_ref: string;
  version_number: number;
  original_file_name: string;
  mime_type: string;
  extension: string;
  size_bytes: string | number;
  sha256: string;
  content_summary: string | null;
  version_created_by: string;
  version_created_at: Date;
}

interface FileAssetSummaryRow extends FileVersionRow {
  asset_ref: string;
  tenant_ref: string;
  display_name: string;
  category: FileCategory;
  source: FileSource;
  lifecycle_status: "active" | "deleted";
  current_version_ref: string;
  asset_version: number;
  asset_created_by: string;
  asset_created_at: Date;
  updated_at: Date;
  binding_count: number;
  deletion_protected: boolean;
}

interface FileBindingRow {
  binding_ref: string;
  asset_ref: string;
  version_ref: string;
  target_type: FileBindingTarget["targetType"];
  target_ref: string;
  relation_kind: FileBindingTarget["relation"];
  created_at: Date;
}

interface ContentRow extends FileVersionRow {
  tenant_ref: string;
  display_name: string;
  lifecycle_status: "active" | "deleted";
  object_key: string;
}

function toFileVersion(row: FileVersionRow): FileVersionView {
  return {
    versionRef: row.version_ref,
    assetRef: row.asset_ref,
    versionNumber: row.version_number,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    extension: row.extension,
    previewKind: previewKindForExtension(row.extension),
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    contentSummary: row.content_summary,
    createdBy: row.version_created_by,
    createdAt: row.version_created_at.toISOString()
  };
}

function toFileAssetSummary(
  row: FileAssetSummaryRow
): FileAssetSummary {
  return FileAssetSummarySchema.parse({
    assetRef: row.asset_ref,
    displayName: row.display_name,
    category: row.category,
    source: row.source,
    status: row.lifecycle_status,
    version: row.asset_version,
    currentVersion: toFileVersion(row),
    bindingCount: row.binding_count,
    deletionProtected: row.deletion_protected,
    createdBy: row.asset_created_by,
    createdAt: row.asset_created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  });
}

function uniqueBindings(
  bindings: readonly FileBindingTarget[]
): FileBindingTarget[] {
  return [
    ...new Map(
      bindings.map((binding) => [
        `${binding.targetType}|${binding.targetRef}|${binding.relation}`,
        binding
      ])
    ).values()
  ];
}

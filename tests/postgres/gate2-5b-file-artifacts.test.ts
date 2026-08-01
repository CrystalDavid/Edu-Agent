import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { apiRoutes } from "@edu-agent/contracts";
import { gate2DemoRefs } from "@edu-agent/test-fixtures";
import JSZip from "jszip";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/api/src/app.js";
import {
  gate25DemoRefs
} from "../../apps/api/src/composition/gate2-5-demo-fixture.js";
import {
  createProductContainer
} from "../../apps/api/src/composition/product-container.js";
import { LocalObjectStore } from "../../apps/api/src/modules/capability-integration/infrastructure/local-object-store.js";
import {
  poolFor,
  postgresEnvironment,
  resetGate1BData,
  tableCount
} from "./support/database.js";

const objectRoot = await mkdtemp(join(tmpdir(), "edu-agent-files-postgres-"));
const adminPool = poolFor("admin");
const product = createProductContainer(postgresEnvironment, {
  objectStoreSettings: { rootDirectory: objectRoot, maxUploadBytes: 1024 * 1024 },
  objectStore: new LocalObjectStore(objectRoot)
});
const app = createApp({ product });
const demoHeaders = {
  "x-demo-tenant": gate2DemoRefs.tenantRef,
  "x-demo-actor": gate2DemoRefs.teacherRef
};

beforeEach(async () => {
  await resetGate1BData(adminPool);
  await rm(objectRoot, { recursive: true, force: true });
  await product.services.seed.seed({ includeGate25: true });
});

afterAll(async () => {
  await Promise.all([product.close(), adminPool.end()]);
  await rm(objectRoot, { recursive: true, force: true });
});

function metadataHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

describe("Gate 2.5B file and teaching artifact persistence", () => {
  it("uploads, downloads, binds, versions, deduplicates and survives service reads", async () => {
    const original = Buffer.from("# 合成参考资料\n只用于本地测试。", "utf8");
    const key = `gate25b:upload:${randomUUID()}`;
    const metadata = {
      originalFileName: "一次函数参考.md",
      mimeType: "text/markdown",
      category: "reference",
      purpose: "file.upload",
      idempotencyKey: key,
      bindings: [{
        targetType: "lesson",
        targetRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
        relation: "reference"
      }]
    };
    const created = await request(app)
      .post(apiRoutes.teacher.files)
      .set(demoHeaders)
      .set("content-type", "text/markdown")
      .set("x-edu-file-metadata", metadataHeader(metadata))
      .send(original)
      .expect(201);
    expect(created.body).toMatchObject({
      replayed: false,
      deduplicated: false,
      asset: {
        category: "reference",
        source: "upload",
        currentVersion: { versionNumber: 1, sizeBytes: original.byteLength },
        bindings: [{ targetType: "lesson", targetRef: gate25DemoRefs.lessonRefs.slopeAndGraph }]
      }
    });
    const assetRef = created.body.asset.assetRef as string;

    const replay = await request(app)
      .post(apiRoutes.teacher.files)
      .set(demoHeaders)
      .set("content-type", "text/markdown")
      .set("x-edu-file-metadata", metadataHeader(metadata))
      .send(original)
      .expect(200);
    expect(replay.body.replayed).toBe(true);
    expect(await tableCount(adminPool, "artifact.file_asset")).toBe(1);
    expect(await tableCount(adminPool, "artifact.file_version")).toBe(1);
    expect(await product.infrastructure.objectStore.listObjectKeys()).toHaveLength(1);

    const duplicateContent = await request(app)
      .post(apiRoutes.teacher.files)
      .set(demoHeaders)
      .set("content-type", "text/markdown")
      .set("x-edu-file-metadata", metadataHeader({
        ...metadata,
        originalFileName: "一次函数参考副本.md",
        idempotencyKey: `gate25b:duplicate-content:${randomUUID()}`,
        bindings: []
      }))
      .send(original)
      .expect(201);
    expect(duplicateContent.body.asset.assetRef).not.toBe(assetRef);
    expect(duplicateContent.body.asset.currentVersion.sha256).toBe(
      created.body.asset.currentVersion.sha256
    );
    expect(await tableCount(adminPool, "artifact.file_asset")).toBe(2);
    expect(await tableCount(adminPool, "artifact.file_version")).toBe(2);
    expect(await product.infrastructure.objectStore.listObjectKeys()).toHaveLength(1);

    await request(app)
      .post(apiRoutes.teacher.files)
      .set(demoHeaders)
      .set("content-type", "text/markdown")
      .set("x-edu-file-metadata", metadataHeader({ ...metadata, originalFileName: "不同文件.md" }))
      .send(original)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe("IDEMPOTENCY_CONFLICT"));
    expect(await product.infrastructure.objectStore.listObjectKeys()).toHaveLength(1);

    const downloaded = await request(app)
      .get(apiRoutes.teacher.fileCurrentContent(assetRef))
      .set(demoHeaders)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(downloaded.body).toEqual(original);

    const updated = Buffer.from("# 合成参考资料\n第二个不可变版本。", "utf8");
    const version = await request(app)
      .post(apiRoutes.teacher.fileVersions(assetRef))
      .set(demoHeaders)
      .set("content-type", "text/markdown")
      .set("x-edu-file-metadata", metadataHeader({
        originalFileName: "一次函数参考-v2.md",
        mimeType: "text/markdown",
        expectedAssetVersion: created.body.asset.version,
        purpose: "file.version.create",
        idempotencyKey: `gate25b:version:${randomUUID()}`
      }))
      .send(updated)
      .expect(201);
    expect(version.body.asset.versions.map((item: { versionNumber: number }) => item.versionNumber)).toEqual([2, 1]);
    expect(version.body.asset.bindings).toEqual([
      expect.objectContaining({ targetType: "lesson", targetRef: gate25DemoRefs.lessonRefs.slopeAndGraph })
    ]);
    expect(await product.infrastructure.objectStore.listObjectKeys()).toHaveLength(2);

    await request(app)
      .post(apiRoutes.teacher.fileVersions(assetRef))
      .set(demoHeaders)
      .set("content-type", "text/markdown")
      .set("x-edu-file-metadata", metadataHeader({
        originalFileName: "一次函数参考-conflict.md",
        mimeType: "text/markdown",
        expectedAssetVersion: created.body.asset.version,
        purpose: "file.version.create",
        idempotencyKey: `gate25b:version-conflict:${randomUUID()}`
      }))
      .send(Buffer.from("# 应被补偿的冲突内容", "utf8"))
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe("FILE_ASSET_VERSION_CONFLICT"));
    expect(await product.infrastructure.objectStore.listObjectKeys()).toHaveLength(2);

    const restarted = createProductContainer(postgresEnvironment, {
      objectStoreSettings: { rootDirectory: objectRoot, maxUploadBytes: 1024 * 1024 },
      objectStore: new LocalObjectStore(objectRoot)
    });
    try {
      const restored = await restarted.services.files.get({
        tenantRef: gate2DemoRefs.tenantRef,
        actorRef: gate2DemoRefs.teacherRef,
        assetRef
      });
      expect(restored.currentVersion.versionNumber).toBe(2);
      const restoredContent = await restarted.services.files.getContent({
        tenantRef: gate2DemoRefs.tenantRef,
        actorRef: gate2DemoRefs.teacherRef,
        assetRef
      });
      expect(await streamBuffer(restoredContent.stream)).toEqual(updated);
    } finally {
      await restarted.close();
    }

    const deleted = await product.services.files.changeLifecycle({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      assetRef,
      nextStatus: "deleted",
      request: {
        expectedVersion: version.body.asset.version,
        purpose: "file.delete",
        idempotencyKey: `gate25b:delete:${randomUUID()}`
      }
    });
    expect(deleted.asset.status).toBe("deleted");
    const restoredLifecycle = await product.services.files.changeLifecycle({
      tenantRef: gate2DemoRefs.tenantRef,
      actorRef: gate2DemoRefs.teacherRef,
      assetRef,
      nextStatus: "active",
      request: {
        expectedVersion: deleted.asset.version,
        purpose: "file.restore",
        idempotencyKey: `gate25b:restore:${randomUUID()}`
      }
    });
    expect(restoredLifecycle.asset.status).toBe("active");
  });

  it("exports only the explicit current approved revision as a structurally valid DOCX", async () => {
    const state = await request(app)
      .get(apiRoutes.teacher.lessonTeachingPlans(gate25DemoRefs.lessonRefs.slopeAndGraph))
      .set(demoHeaders)
      .expect(200);
    const approved = state.body.currentApproved;
    expect(approved.state).toBe("approved");
    const requestBody = {
      lessonRef: gate25DemoRefs.lessonRefs.slopeAndGraph,
      expectedRevisionNumber: approved.revisionNumber,
      purpose: "teaching-plan.export-docx",
      idempotencyKey: `gate25b:export:${randomUUID()}`
    };
    const exported = await request(app)
      .post(apiRoutes.teacher.teachingPlanDocxExport(approved.revisionRef))
      .set(demoHeaders)
      .send(requestBody)
      .expect(201);
    expect(exported.body).toMatchObject({
      replayed: false,
      deduplicated: false,
      asset: {
        source: "teaching_plan_export",
        category: "lesson_plan",
        deletionProtected: true,
        currentVersion: { extension: ".docx", versionNumber: 1 }
      }
    });

    const content = await request(app)
      .get(apiRoutes.teacher.fileCurrentContent(exported.body.asset.assetRef))
      .set(demoHeaders)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const zip = await JSZip.loadAsync(content.body as Buffer);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("AI 辅助生成、教师已批准");
    expect(xml).toContain(approved.revisionRef);

    const deduplicated = await request(app)
      .post(apiRoutes.teacher.teachingPlanDocxExport(approved.revisionRef))
      .set(demoHeaders)
      .send({ ...requestBody, idempotencyKey: `gate25b:export:${randomUUID()}` })
      .expect(201);
    expect(deduplicated.body.deduplicated).toBe(true);
    expect(deduplicated.body.asset.assetRef).toBe(exported.body.asset.assetRef);
    expect(await tableCount(adminPool, "artifact.teaching_plan_file_export")).toBe(1);
    expect(await tableCount(adminPool, "artifact.file_version")).toBe(1);
    await expect(
      adminPool.query(
        `UPDATE artifact.file_version
            SET original_file_name = 'mutated.docx'
          WHERE version_ref = $1`,
        [exported.body.asset.currentVersion.versionRef]
      )
    ).rejects.toThrow("FileVersion is immutable");

    await request(app)
      .post(apiRoutes.teacher.fileDelete(exported.body.asset.assetRef))
      .set(demoHeaders)
      .send({
        expectedVersion: exported.body.asset.version,
        purpose: "file.delete",
        idempotencyKey: `gate25b:delete:${randomUUID()}`
      })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe("FILE_REFERENCED_BY_FORMAL_ARTIFACT"));
  });

  it("extracts a bounded Office summary before persisting an uploaded DOCX", async () => {
    const docx = new JSZip();
    docx.file("[Content_Types].xml", "<Types />");
    docx.file(
      "word/document.xml",
      "<w:document><w:body><w:p><w:r><w:t>合成斜率课堂参考</w:t></w:r></w:p></w:body></w:document>"
    );
    const content = await docx.generateAsync({ type: "nodebuffer" });
    const created = await request(app)
      .post(apiRoutes.teacher.files)
      .set(demoHeaders)
      .set(
        "content-type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
      .set("x-edu-file-metadata", metadataHeader({
        originalFileName: "合成参考.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        category: "reference",
        purpose: "file.upload",
        idempotencyKey: `gate25b:office-summary:${randomUUID()}`,
        bindings: []
      }))
      .send(content)
      .expect(201);
    expect(created.body.asset.currentVersion.contentSummary).toContain(
      "合成斜率课堂参考"
    );
  });

  it("fails closed on unsupported MIME, traversal-like names and cross-tenant access", async () => {
    const unsafe = {
      originalFileName: "../secret.pdf",
      mimeType: "application/pdf",
      category: "reference",
      purpose: "file.upload",
      idempotencyKey: `gate25b:unsafe:${randomUUID()}`,
      bindings: []
    };
    await request(app)
      .post(apiRoutes.teacher.files)
      .set(demoHeaders)
      .set("content-type", "application/pdf")
      .set("x-edu-file-metadata", metadataHeader(unsafe))
      .send(Buffer.from("%PDF-1.7\n"))
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe("INVALID_FILE_METADATA"));

    const renamedZip = new JSZip();
    renamedZip.file("notes.txt", "not an Office document");
    const renamedZipContent = await renamedZip.generateAsync({ type: "nodebuffer" });
    await request(app)
      .post(apiRoutes.teacher.files)
      .set(demoHeaders)
      .set(
        "content-type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
      .set("x-edu-file-metadata", metadataHeader({
        originalFileName: "renamed-archive.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        category: "reference",
        purpose: "file.upload",
        idempotencyKey: `gate25b:unsafe-office:${randomUUID()}`,
        bindings: []
      }))
      .send(renamedZipContent)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe("INVALID_OFFICE_CONTAINER"));
    expect(await product.infrastructure.objectStore.listObjectKeys()).toEqual([]);

    await request(app)
      .get(apiRoutes.teacher.files)
      .set("x-demo-tenant", "tenant:other")
      .set("x-demo-actor", gate2DemoRefs.teacherRef)
      .expect(403);
  });

  it("removes aged orphan objects without touching referenced versions", async () => {
    const orphan = await product.infrastructure.objectStore.put({
      content: Readable.from(Buffer.from("orphan")),
      maxBytes: 1024
    });
    const result = await product.services.files.cleanupOrphans({ gracePeriodMs: 0 });
    expect(result.removedObjects).toBe(1);
    expect(await product.infrastructure.objectStore.exists(orphan.objectKey)).toBe(false);
  });
});

async function streamBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";

import {
  extractOfficeContentSummary
} from "../../apps/api/src/modules/artifact-collaboration/application/office-content-summary.js";
import {
  renderApprovedTeachingPlanDocx
} from "../../apps/api/src/modules/artifact-collaboration/application/teaching-plan-docx-renderer.js";
import {
  assertFileSignature,
  validateFileMetadata
} from "../../apps/api/src/modules/artifact-collaboration/domain/file-artifact.js";
import {
  LocalObjectStore,
  ObjectTooLargeError
} from "../../apps/api/src/modules/capability-integration/infrastructure/local-object-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("Gate 2.5B LocalObjectStore", () => {
  it("streams content under a generated key and verifies metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "edu-agent-object-store-"));
    temporaryDirectories.push(root);
    const store = new LocalObjectStore(root);
    const content = Buffer.from("合成教学参考资料", "utf8");
    const stored = await store.put({
      content: Readable.from(content),
      maxBytes: 1024,
      expectedSizeBytes: content.byteLength
    });

    expect(stored.objectKey).toMatch(/^v1\/[a-f0-9]{2}\/[a-f0-9]{2}\//u);
    expect(stored.objectKey).not.toContain("合成教学参考资料");
    expect(stored.sha256).toBe(
      createHash("sha256").update(content).digest("hex")
    );
    expect(await store.exists(stored.objectKey)).toBe(true);
    expect(await streamBuffer(await store.get(stored.objectKey))).toEqual(content);
    expect(await store.metadata(stored.objectKey)).toMatchObject({
      sizeBytes: content.byteLength,
      sha256: stored.sha256
    });
    expect(await store.listObjectKeys()).toEqual([stored.objectKey]);
    expect(await store.delete(stored.objectKey)).toBe(true);
    expect(await store.exists(stored.objectKey)).toBe(false);
  });

  it("fails closed for traversal, oversized streams, MIME mismatch and signatures", async () => {
    const root = await mkdtemp(join(tmpdir(), "edu-agent-object-store-"));
    temporaryDirectories.push(root);
    const store = new LocalObjectStore(root);
    await expect(store.get("../../secret.txt")).rejects.toThrow("Unsafe object key");
    await expect(
      store.put({ content: Readable.from(Buffer.alloc(9)), maxBytes: 8 })
    ).rejects.toBeInstanceOf(ObjectTooLargeError);
    expect(() =>
      validateFileMetadata({ originalFileName: "../plan.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
    ).toThrow("unsafe");
    expect(() =>
      validateFileMetadata({ originalFileName: "plan.pdf", mimeType: "text/plain" })
    ).toThrow("does not match");
    expect(() =>
      assertFileSignature({ extension: ".pdf", firstBytesHex: "504b0304" })
    ).toThrow("signature");
  });
});

describe("Gate 2.5B approved TeachingPlan DOCX", () => {
  it("creates a valid OOXML document with required teaching sections and approval notice", async () => {
    const buffer = await renderApprovedTeachingPlanDocx({
      courseRun: {
        courseRunRef: "course-run:synthetic",
        subject: "数学",
        gradeLevel: "八年级",
        className: "八年级 3 班",
        academicTerm: "2026 秋季",
        title: "八年级 3 班数学 · 当前学期"
      },
      unit: {
        unitRef: "unit:linear-function",
        courseRunRef: "course-run:synthetic",
        sequence: 1,
        title: "一次函数",
        description: "合成演示单元",
        status: "active"
      },
      lesson: {
        lessonRef: "lesson:slope",
        unitRef: "unit:linear-function",
        courseRunRef: "course-run:synthetic",
        sequence: 3,
        title: "斜率与图像变化",
        plannedAt: "2026-08-03T01:00:00.000Z",
        durationMinutes: 40,
        preparationState: "ready_for_use",
        learningObjectives: [{ objectiveRef: "objective:slope", title: "解释斜率", description: "区分斜率正负与图像变化方向。" }],
        currentEvidenceRefs: ["evidence:synthetic"],
        currentApprovedPlanRef: "revision:approved",
        activePreparationTaskRef: "task:lesson-preparation"
      },
      revision: {
        artifactRef: "artifact:plan",
        revisionRef: "revision:approved",
        revisionNumber: 3,
        parentRevisionRef: "revision:parent",
        selectedStrategyId: "strategy:contrast",
        teacherSelection: "modified",
        state: "approved",
        title: "斜率与图像变化教案",
        content: {
          objective: "能够用语言解释斜率正负与函数图像的变化方向。",
          lessonFocus: "通过对比图像辨析上升与下降。",
          openingActivity: "观察两条直线并提出可确认的问题。",
          teacherQuestions: ["斜率为负时，图像从左向右如何变化？"],
          studentActivity: "小组比较图像并用完整句说明依据。",
          supportStrategy: "提供坐标变化提示，不直接给出结论。",
          independentCheck: "独立判断三条直线并写出理由。",
          followUp: "收集解释质量作为下一课时证据。",
          evidenceRefs: ["evidence:synthetic"]
        },
        createdAt: "2026-08-01T02:00:00.000Z"
      },
      evidence: [{ evidenceRef: "evidence:synthetic", summary: "合成证据显示学生易混淆变化方向。", status: "confirmed" }],
      knownGaps: ["尚未观察独立迁移表现。"],
      generatedAt: "2026-08-01T03:00:00.000Z"
    });

    expect(buffer.subarray(0, 2).toString("hex")).toBe("504b");
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")!.async("string");
    const stylesXml = await zip.file("word/styles.xml")!.async("string");
    expect(documentXml).toContain("斜率与图像变化");
    expect(documentXml).toContain("Evidence 依据摘要");
    expect(documentXml).toContain("课后反思");
    expect(documentXml).toContain("AI 辅助生成、教师已批准");
    expect(documentXml).toContain("revision:approved");
    expect(stylesXml).toContain("Microsoft YaHei");
    expect(zip.file("word/footer1.xml")).not.toBeNull();
  });

  it("refuses draft and in-review revisions", async () => {
    const invalid = {
      courseRun: { courseRunRef: "course", subject: "数学", gradeLevel: "八年级", className: "3 班", academicTerm: "当前学期", title: "数学" },
      unit: { unitRef: "unit", courseRunRef: "course", sequence: 1, title: "一次函数", description: "合成", status: "active" as const },
      lesson: { lessonRef: "lesson", unitRef: "unit", courseRunRef: "course", sequence: 1, title: "课时", plannedAt: null, durationMinutes: 40, preparationState: "in_progress" as const, learningObjectives: [], currentEvidenceRefs: [], currentApprovedPlanRef: null, activePreparationTaskRef: null },
      revision: { artifactRef: "artifact", revisionRef: "revision", revisionNumber: 1, parentRevisionRef: null, selectedStrategyId: null, teacherSelection: null, state: "in_review" as const, title: "待审核", content: { objective: "目标", lessonFocus: "重点", openingActivity: "导入", teacherQuestions: ["问题"], studentActivity: "活动", supportStrategy: "支持", independentCheck: "检查", followUp: "后续", evidenceRefs: ["evidence"] }, createdAt: "2026-08-01T00:00:00.000Z" },
      evidence: [], knownGaps: [], generatedAt: "2026-08-01T00:00:00.000Z"
    };
    await expect(renderApprovedTeachingPlanDocx(invalid)).rejects.toThrow("approved");
  });
});

describe("Gate 2.5B Office summary extraction", () => {
  it("extracts bounded local summaries from DOCX, PPTX and XLSX OOXML", async () => {
    const docx = new JSZip();
    docx.file("[Content_Types].xml", "<Types />");
    docx.file(
      "word/document.xml",
      "<w:document><w:body><w:p><w:r><w:t>一次函数教学重点</w:t></w:r></w:p></w:body></w:document>"
    );
    await expect(
      extractOfficeContentSummary({
        extension: ".docx",
        content: await docx.generateAsync({ type: "nodebuffer" })
      })
    ).resolves.toContain("一次函数教学重点");

    const pptx = new JSZip();
    pptx.file("[Content_Types].xml", "<Types />");
    pptx.file("ppt/presentation.xml", "<p:presentation />");
    pptx.file(
      "ppt/slides/slide1.xml",
      "<p:sld><a:t>斜率正负与图像方向</a:t></p:sld>"
    );
    await expect(
      extractOfficeContentSummary({
        extension: ".pptx",
        content: await pptx.generateAsync({ type: "nodebuffer" })
      })
    ).resolves.toContain("斜率正负与图像方向");

    const xlsx = new JSZip();
    xlsx.file("[Content_Types].xml", "<Types />");
    xlsx.file("xl/workbook.xml", "<workbook />");
    xlsx.file(
      "xl/sharedStrings.xml",
      "<sst><si><t>合成课堂观察</t></si></sst>"
    );
    await expect(
      extractOfficeContentSummary({
        extension: ".xlsx",
        content: await xlsx.generateAsync({ type: "nodebuffer" })
      })
    ).resolves.toContain("合成课堂观察");
  });

  it("rejects renamed ZIP archives that are not the declared Office format", async () => {
    const archive = new JSZip();
    archive.file("notes.txt", "not an Office document");
    await expect(
      extractOfficeContentSummary({
        extension: ".docx",
        content: await archive.generateAsync({ type: "nodebuffer" })
      })
    ).rejects.toThrow("OOXML");
  });
});

async function streamBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

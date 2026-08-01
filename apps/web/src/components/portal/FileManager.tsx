import { useEffect, useMemo, useRef, useState } from "react";

import type {
  FileAssetDetail,
  FileAssetSummary,
  FileCategory,
  LessonView
} from "@edu-agent/contracts";
import { Alert, Button, Input, Select, Spin, Tag } from "antd";

import {
  ApiError,
  addFileBinding,
  changeFileLifecycle,
  createFileVersion,
  downloadFile,
  loadCourseRuns,
  loadCurriculumUnits,
  loadFile,
  loadFiles,
  loadLessons,
  uploadFile
} from "../../api";
import { WorkspaceIcon } from "../WorkspaceIcon";

type ViewMode = "grid" | "list";
type SortMode = "newest" | "oldest" | "name" | "size" | "type";

const categories: Array<{ value: FileCategory | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "lesson_plan", label: "教案" },
  { value: "reference", label: "参考资料" },
  { value: "courseware", label: "课件" },
  { value: "assessment", label: "测评" },
  { value: "worksheet", label: "讲义" },
  { value: "report", label: "报告" },
  { value: "other", label: "其他" }
];

export function FileManager(props: {
  onAction: (action: string) => void;
  initialAssetRef?: string | null;
  initialLessonRef?: string | null;
}) {
  const [items, setItems] = useState<FileAssetSummary[]>([]);
  const [selected, setSelected] = useState<FileAssetDetail | null>(null);
  const [lessons, setLessons] = useState<LessonView[]>([]);
  const [lessonRef, setLessonRef] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FileCategory | "all">("all");
  const [status, setStatus] = useState<"active" | "deleted" | "all">("active");
  const [sort, setSort] = useState<SortMode>("newest");
  const [view, setView] = useState<ViewMode>("grid");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const versionInputRef = useRef<HTMLInputElement>(null);
  const pendingInitialAssetRef = useRef(props.initialAssetRef);
  const previousInitialAssetRef = useRef(props.initialAssetRef);

  async function refresh(
    preferredAssetRef?: string,
    requestedStatus = status
  ) {
    setLoading(true);
    setError(null);
    try {
      const result = await loadFiles({
        status: requestedStatus,
        sort,
        ...(query.trim() ? { query: query.trim() } : {}),
        ...(category === "all" ? {} : { category })
      });
      setItems(result.items);
      const nextRef = preferredAssetRef ??
        (result.items.some((item) => item.assetRef === selected?.assetRef)
          ? selected?.assetRef
          : result.items[0]?.assetRef);
      setSelected(nextRef ? await loadFile(nextRef) : null);
    } catch (caught) {
      setItems([]);
      setSelected(null);
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const preferredAssetRef =
      pendingInitialAssetRef.current ?? undefined;
    const timer = window.setTimeout(
      () => {
        void refresh(preferredAssetRef).finally(() => {
          if (pendingInitialAssetRef.current === preferredAssetRef) {
            pendingInitialAssetRef.current = null;
          }
        });
      },
      180
    );
    return () => window.clearTimeout(timer);
  }, [query, category, status, sort]);

  useEffect(() => {
    if (previousInitialAssetRef.current === props.initialAssetRef) return;
    previousInitialAssetRef.current = props.initialAssetRef;
    pendingInitialAssetRef.current = props.initialAssetRef;
    if (!props.initialAssetRef) return;
    setError(null);
    void loadFile(props.initialAssetRef)
      .then(setSelected)
      .catch((caught) => setError(message(caught)));
  }, [props.initialAssetRef]);

  useEffect(() => {
    void loadCourseRuns()
      .then(async (courses) => {
        const course = courses.items[0];
        if (!course) return [];
        const units = await loadCurriculumUnits(course.courseRunRef);
        const groups = await Promise.all(
          units.items.map((unit) => loadLessons(unit.unitRef))
        );
        return groups.flatMap((group) => group.items);
      })
      .then((loaded) => {
        setLessons(loaded);
        setLessonRef(
          loaded.some(
            (lesson) => lesson.lessonRef === props.initialLessonRef
          )
            ? props.initialLessonRef ?? undefined
            : loaded[0]?.lessonRef
        );
      })
      .catch((caught) => {
        setLessons([]);
        setLessonRef(undefined);
        setError(`课时上下文加载失败：${message(caught)}`);
      });
  }, []);

  useEffect(() => {
    if (
      props.initialLessonRef &&
      lessons.some(
        (lesson) => lesson.lessonRef === props.initialLessonRef
      )
    ) {
      setLessonRef(props.initialLessonRef);
    }
  }, [props.initialLessonRef, lessons]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setPreviewUrl(null);
    setTextPreview(null);
    if (!selected || selected.status === "deleted") return;
    const kind = selected.currentVersion.previewKind;
    if (!(["image", "pdf", "text"] as const).includes(kind as "image" | "pdf" | "text")) return;
    void downloadFile(selected.assetRef)
      .then(async (blob) => {
        if (!active) return;
        if (kind === "text") {
          setTextPreview((await blob.text()).slice(0, 20_000));
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch((caught) => {
        if (active) setError(message(caught));
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected?.assetRef, selected?.currentVersion.versionRef, selected?.status]);

  async function choose(asset: FileAssetSummary) {
    setError(null);
    try {
      setSelected(await loadFile(asset.assetRef));
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function handleMutationError(
    caught: unknown,
    assetRef?: string
  ) {
    if (caught instanceof ApiError && caught.status === 409 && assetRef) {
      await refresh(assetRef);
      setError(`${message(caught)}；页面已重新读取服务端文件版本。`);
      return;
    }
    setError(message(caught));
  }

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const result = await uploadFile(file, {
        originalFileName: file.name,
        mimeType: normalizedMime(file),
        category: "reference",
        purpose: "file.upload",
        idempotencyKey: `ui:file:upload:${crypto.randomUUID()}`,
        bindings: lessonRef
          ? [{ targetType: "lesson", targetRef: lessonRef, relation: "reference" }]
          : []
      });
      props.onAction(result.replayed ? "已恢复原上传结果" : "参考文件已安全保存");
      await refresh(result.asset.assetRef);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function addVersion(file: File) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createFileVersion(selected.assetRef, file, {
        originalFileName: file.name,
        mimeType: normalizedMime(file),
        expectedAssetVersion: selected.version,
        purpose: "file.version.create",
        idempotencyKey: `ui:file:version:${crypto.randomUUID()}`
      });
      props.onAction(result.deduplicated ? "内容相同，已复用当前版本" : "已创建不可变新版本");
      await refresh(selected.assetRef);
    } catch (caught) {
      await handleMutationError(caught, selected.assetRef);
    } finally {
      setBusy(false);
      if (versionInputRef.current) versionInputRef.current.value = "";
    }
  }

  async function bindTarget(
    targetType: "lesson" | "preparation_task" | "teaching_plan_revision"
  ) {
    const lesson = lessons.find((item) => item.lessonRef === lessonRef);
    const targetRef = targetType === "lesson"
      ? lesson?.lessonRef
      : targetType === "preparation_task"
        ? lesson?.activePreparationTaskRef
        : lesson?.currentApprovedPlanRef;
    if (!selected || !targetRef) return;
    setBusy(true);
    setError(null);
    try {
      const result = await addFileBinding(selected.assetRef, {
        targetType,
        targetRef,
        relation: "reference",
        expectedAssetVersion: selected.version,
        purpose: "file.binding.add",
        idempotencyKey: `ui:file:binding:${crypto.randomUUID()}`
      });
      const label = targetType === "lesson"
        ? "课时"
        : targetType === "preparation_task"
          ? "备课任务"
          : "当前已批准教学计划";
      props.onAction(result.deduplicated ? `该${label}关联已存在` : `已关联${label}`);
      await refresh(selected.assetRef);
    } catch (caught) {
      await handleMutationError(caught, selected.assetRef);
    } finally {
      setBusy(false);
    }
  }

  async function lifecycle(nextStatus: "active" | "deleted") {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await changeFileLifecycle(selected.assetRef, nextStatus, {
        expectedVersion: selected.version,
        purpose: nextStatus === "deleted" ? "file.delete" : "file.restore",
        idempotencyKey: `ui:file:${nextStatus}:${crypto.randomUUID()}`
      });
      const nextFilter = nextStatus === "deleted" ? "deleted" : "active";
      setStatus(nextFilter);
      props.onAction(
        nextStatus === "deleted"
          ? "文件已软删除；绑定和版本历史仍保留，可在“已删除”中恢复"
          : "文件已恢复；原绑定和版本历史保持不变"
      );
      await refresh(result.asset.assetRef, nextFilter);
    } catch (caught) {
      await handleMutationError(caught, selected.assetRef);
    } finally {
      setBusy(false);
    }
  }

  async function download(asset: FileAssetSummary | FileAssetDetail, version?: FileAssetDetail["versions"][number]) {
    setBusy(true);
    setError(null);
    try {
      const target = version ?? asset.currentVersion;
      const blob = await downloadFile(asset.assetRef, version?.versionRef);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = target.originalFileName;
      anchor.click();
      URL.revokeObjectURL(url);
      props.onAction(`已下载 ${target.originalFileName}`);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(
    () => new Map(categories.map((entry) => [
      entry.value,
      entry.value === "all" ? items.length : items.filter((item) => item.category === entry.value).length
    ])),
    [items]
  );
  const bindingLesson = lessons.find((lesson) => lesson.lessonRef === lessonRef);
  const lessonAlreadyBound = Boolean(
    bindingLesson &&
      selected?.bindings.some(
        (binding) =>
          binding.targetType === "lesson" &&
          binding.targetRef === bindingLesson.lessonRef
      )
  );
  const taskAlreadyBound = Boolean(
    bindingLesson?.activePreparationTaskRef &&
      selected?.bindings.some(
        (binding) =>
          binding.targetType === "preparation_task" &&
          binding.targetRef === bindingLesson.activePreparationTaskRef
      )
  );
  const planAlreadyBound = Boolean(
    bindingLesson?.currentApprovedPlanRef &&
      selected?.bindings.some(
        (binding) =>
          binding.targetType === "teaching_plan_revision" &&
          binding.targetRef === bindingLesson.currentApprovedPlanRef
      )
  );
  const exportManaged = selected?.source === "teaching_plan_export";

  return (
    <div className="file-manager" data-testid="file-manager">
      {error ? <Alert type="error" showIcon title={error} closable onClose={() => setError(null)} /> : null}
      <header className="file-manager__toolbar">
        <Input prefix={<WorkspaceIcon name="search" />} placeholder="搜索真实文件名" value={query} onChange={(event) => setQuery(event.target.value)} allowClear />
        <Select aria-label="上传关联课时" value={lessonRef} onChange={setLessonRef} disabled={busy || lessons.length === 0} placeholder={lessons.length === 0 ? "课时不可用" : "选择关联课时"} options={lessons.map((lesson) => ({ value: lesson.lessonRef, label: lesson.title }))} />
        <Button loading={busy} disabled={busy || lessons.length === 0} title={lessons.length === 0 ? "课时上下文未加载，暂不能上传并绑定" : undefined} icon={<WorkspaceIcon name="upload" />} onClick={() => uploadRef.current?.click()}>上传</Button>
        <input ref={uploadRef} data-testid="file-upload-input" hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.md,.txt,.docx,.pptx,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
        <Button disabled title="本 Gate 不实现在线新建 Office 文件">新建（未实现）</Button>
        <div className="view-switch" aria-label="文件视图">
          <button type="button" className={view === "grid" ? "is-active" : ""} aria-label="网格视图" onClick={() => setView("grid")}><WorkspaceIcon name="grid" /></button>
          <button type="button" className={view === "list" ? "is-active" : ""} aria-label="列表视图" onClick={() => setView("list")}><WorkspaceIcon name="list" /></button>
        </div>
      </header>

      <div className="file-manager__body">
        <aside className="file-filter-panel">
          <section>
            <h2>按用途</h2>
            {categories.map((entry) => (
              <button type="button" key={entry.value} className={category === entry.value ? "is-active" : ""} onClick={() => setCategory(entry.value)}>
                <WorkspaceIcon name="folder" /><span>{entry.label}</span><small>{counts.get(entry.value) ?? 0}</small>
              </button>
            ))}
          </section>
          <section>
            <h2>生命周期</h2>
            <Select aria-label="文件生命周期筛选" value={status} onChange={setStatus} options={[{ value: "active", label: "有效" }, { value: "deleted", label: "已删除" }, { value: "all", label: "全部" }]} />
          </section>
        </aside>

        <section className="file-results">
          <header>
            <div><h2>真实教学文件</h2><span>{items.length} 个文件 · PostgreSQL 元数据 + LocalObjectStore 内容</span></div>
            <Select value={sort} onChange={setSort} options={[{ value: "newest", label: "从新到旧" }, { value: "oldest", label: "从旧到新" }, { value: "name", label: "名称" }, { value: "size", label: "大小" }, { value: "type", label: "类型" }]} />
          </header>
          <Spin spinning={loading}>
            <div className={`file-result-${view}`} data-testid="real-file-list">
              {items.map((file) => (
                <button type="button" key={file.assetRef} className={selected?.assetRef === file.assetRef ? "is-active" : ""} onClick={() => void choose(file)}>
                  <span className="file-card-icon"><WorkspaceIcon name={file.currentVersion.extension === ".pptx" ? "slides" : "document"} /></span>
                  <span className="file-card-copy">
                    <strong>{file.displayName}</strong>
                    <small>{file.currentVersion.extension.slice(1).toUpperCase()} · {formatSize(file.currentVersion.sizeBytes)}</small>
                    <small>{categoryLabel(file.category)} · {file.bindingCount} 个关联</small>
                    <span>{new Date(file.updatedAt).toLocaleString("zh-CN")}</span>
                  </span>
                  <Tag className="status-pill" color={file.status === "active" ? "success" : "default"}>{file.status === "active" ? "有效" : "已删除"}</Tag>
                  <span className="file-card-version">v{file.currentVersion.versionNumber}</span>
                </button>
              ))}
            </div>
            {!loading && items.length === 0 ? <div className="file-no-results">没有符合条件的真实文件。</div> : null}
          </Spin>
        </section>

        <section className="file-manager__preview">
          {selected ? (
            <div className="file-preview" data-testid="file-detail">
              <span className="section-kicker">FILE ASSET</span>
              <h2>{selected.displayName}</h2>
              <p>{selected.currentVersion.contentSummary}</p>
              <p>SHA-256：<code>{selected.currentVersion.sha256.slice(0, 16)}…</code></p>
              <p>来源：{selected.source === "upload" ? "教师上传" : "已批准 TeachingPlan 导出"}</p>
              {selected.source === "teaching_plan_export" ? (
                <Alert
                  type="success"
                  showIcon
                  title="正式教学成果"
                  description="此 FileAsset 的每个版本只能由对应的 approved TeachingPlan Revision 导出；不能手工替换内容或改绑来源。"
                />
              ) : null}
              {selected.currentVersion.previewKind === "image" && previewUrl ? (
                <img src={previewUrl} alt={selected.displayName} style={{ maxWidth: "100%", maxHeight: 360 }} />
              ) : null}
              {selected.currentVersion.previewKind === "pdf" && previewUrl ? (
                <iframe title={`${selected.displayName} PDF 预览`} src={previewUrl} style={{ width: "100%", height: 360, border: 0 }} />
              ) : null}
              {selected.currentVersion.previewKind === "text" && textPreview !== null ? (
                <pre style={{ whiteSpace: "pre-wrap", maxHeight: 360, overflow: "auto" }}>{textPreview}</pre>
              ) : null}
              {selected.currentVersion.previewKind === "office" ? (
                <Alert type="info" showIcon title="Office 文件提供安全详情与下载" description="本 Gate 不在浏览器中完整渲染 DOCX、PPTX 或 XLSX。" />
              ) : null}
              <div className="file-secondary-actions">
                <Button onClick={() => void download(selected)} disabled={busy || selected.status === "deleted"}>下载</Button>
                <Button onClick={() => versionInputRef.current?.click()} disabled={busy || selected.status === "deleted" || exportManaged} title={exportManaged ? "正式教案的新版本只能从新的 approved TeachingPlan Revision 导出" : undefined}>创建新版本</Button>
                <input ref={versionInputRef} data-testid="file-version-input" hidden type="file" accept={selected.currentVersion.extension} onChange={(event) => { const file = event.target.files?.[0]; if (file) void addVersion(file); }} />
                <Button onClick={() => void bindTarget("lesson")} disabled={busy || exportManaged || !bindingLesson || selected.status === "deleted" || lessonAlreadyBound} title={exportManaged ? "正式教案关联由导出流程维护" : undefined}>{lessonAlreadyBound ? "已关联课时" : "关联课时"}</Button>
                <Button
                  onClick={() => void bindTarget("preparation_task")}
                  disabled={busy || exportManaged || !bindingLesson?.activePreparationTaskRef || selected.status === "deleted" || taskAlreadyBound}
                  title={exportManaged ? "正式教案关联由导出流程维护" : bindingLesson?.activePreparationTaskRef ? undefined : "所选课时暂无关联备课任务"}
                >{taskAlreadyBound ? "已关联任务" : "关联任务"}</Button>
                <Button
                  onClick={() => void bindTarget("teaching_plan_revision")}
                  disabled={busy || exportManaged || !bindingLesson?.currentApprovedPlanRef || selected.status === "deleted" || planAlreadyBound}
                  title={exportManaged ? "正式教案关联由导出流程维护" : bindingLesson?.currentApprovedPlanRef ? undefined : "所选课时暂无 current approved TeachingPlan"}
                >{planAlreadyBound ? "已关联教学计划" : "关联教学计划"}</Button>
                {selected.status === "active" ? (
                  <Button danger disabled={busy || selected.deletionProtected} title={selected.deletionProtected ? "正式教学成果引用的文件不可删除" : undefined} onClick={() => void lifecycle("deleted")}>删除</Button>
                ) : (
                  <Button disabled={busy} onClick={() => void lifecycle("active")}>恢复</Button>
                )}
                <Button disabled title="本 Gate 不实现文件分享">分享（未实现）</Button>
              </div>
              <h3>版本历史</h3>
              <ol data-testid="file-version-history">
                {selected.versions.map((version) => (
                  <li key={version.versionRef}>
                    <button type="button" className="text-action" disabled={busy || selected.status === "deleted"} title={selected.status === "deleted" ? "恢复文件后才能下载历史版本" : undefined} onClick={() => void download(selected, version)}>v{version.versionNumber} · {version.originalFileName} · {formatSize(version.sizeBytes)}</button>
                    <small>{version.contentSummary}</small>
                  </li>
                ))}
              </ol>
              <h3>关联</h3>
              {selected.bindings.length > 0 ? (
                <ul>{selected.bindings.map((binding) => <li key={binding.bindingRef}>{bindingLabel(binding.targetType)} · {binding.relation === "export" ? "正式导出" : "参考关联"} · {binding.targetRef}</li>)}</ul>
              ) : <p>尚未关联 Lesson、Task 或 TeachingPlan。</p>}
            </div>
          ) : <div className="file-no-results">选择一个文件查看详情。</div>}
        </section>
      </div>
    </div>
  );
}

function normalizedMime(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split(".").pop();
  return {
    md: "text/markdown",
    txt: "text/plain",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }[extension ?? ""] ?? "application/octet-stream";
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KiB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function bindingLabel(targetType: string): string {
  return {
    lesson: "课时（lesson）",
    preparation_task: "备课任务（preparation_task）",
    teaching_plan_revision: "TeachingPlan Revision（teaching_plan_revision）",
    teaching_plan_artifact: "TeachingPlan Artifact（teaching_plan_artifact）"
  }[targetType] ?? targetType;
}

function categoryLabel(category: FileCategory): string {
  return categories.find((entry) => entry.value === category)?.label ?? "其他";
}

function message(error: unknown): string {
  if (error instanceof ApiError) return `${error.message}（${error.code}）`;
  return error instanceof Error ? error.message : "文件操作失败。";
}

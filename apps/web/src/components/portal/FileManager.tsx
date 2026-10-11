import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AssignmentDetail,
  AssignmentSummary,
  FileAssetDetail,
  FileAssetSummary,
  FileCategory,
  LessonView
} from "@edu-agent/contracts";
import { Alert, Button, Drawer, Input, Select, Spin, Tag } from "antd";

import {
  ApiError,
  addFileBinding,
  changeFileLifecycle,
  createFileVersion,
  downloadFile,
  loadCourseRuns,
  loadCurriculumUnits,
  loadAssignment,
  loadAssignments,
  loadFile,
  loadFiles,
  loadLessons,
  uploadFile
} from "../../api";
import { cleanDisplayText, cleanTeacherPreviewText } from "../../presentation";
import { WorkspaceIcon } from "../WorkspaceIcon";

type SortMode = "newest" | "oldest" | "name" | "size" | "type";

const categories: Array<{ value: FileCategory | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "lesson_plan", label: "教案" },
  { value: "reference", label: "参考资料" },
  { value: "courseware", label: "课件" },
  { value: "assessment", label: "测评" },
  { value: "worksheet", label: "讲义" },
];

export function FileManager(props: {
  onAction: (action: string) => void;
  initialAssetRef?: string | null;
  initialLessonRef?: string | null;
}) {
  const [items, setItems] = useState<FileAssetSummary[]>([]);
  const [selected, setSelected] = useState<FileAssetDetail | null>(null);
  const [lessons, setLessons] = useState<LessonView[]>([]);
  const [lessonAssignments, setLessonAssignments] = useState<AssignmentSummary[]>([]);
  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [lessonRef, setLessonRef] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FileCategory | "all">("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(Boolean(props.initialAssetRef));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const versionInputRef = useRef<HTMLInputElement>(null);
  const pendingInitialAssetRef = useRef(props.initialAssetRef);
  const previousInitialAssetRef = useRef(props.initialAssetRef);

  async function refresh(
    preferredAssetRef?: string,
    requestedStatus: "active" | "deleted" | "all" = "active"
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
          : undefined);
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
  }, [query, category, sort]);

  useEffect(() => {
    if (previousInitialAssetRef.current === props.initialAssetRef) return;
    previousInitialAssetRef.current = props.initialAssetRef;
    pendingInitialAssetRef.current = props.initialAssetRef;
    if (!props.initialAssetRef) return;
    setError(null);
    void loadFile(props.initialAssetRef)
      .then((detail) => {
        setSelected(detail);
        setDetailOpen(true);
      })
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
    if (!lessonRef) {
      setLessonAssignments([]);
      setAssignment(null);
      return;
    }
    let active = true;
    void loadAssignments(lessonRef)
      .then(async (result) => {
        if (!active) return;
        setLessonAssignments(result.items);
        const selectedAssignment = result.items[0];
        setAssignment(
          selectedAssignment
            ? await loadAssignment(selectedAssignment.assignmentRef)
            : null
        );
      })
      .catch((caught) => {
        if (active) {
          setLessonAssignments([]);
          setAssignment(null);
          setError(`作业关联上下文加载失败：${message(caught)}`);
        }
      });
    return () => {
      active = false;
    };
  }, [lessonRef]);

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
          setTextPreview(cleanTeacherPreviewText((await blob.text()).slice(0, 20_000)));
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
      setDetailOpen(true);
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
      props.onAction(result.replayed ? "文件已在资料库中" : "文件已上传");
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
      props.onAction(result.deduplicated ? "内容没有变化，继续使用当前文件" : "新版本已保存");
      await refresh(selected.assetRef);
    } catch (caught) {
      await handleMutationError(caught, selected.assetRef);
    } finally {
      setBusy(false);
      if (versionInputRef.current) versionInputRef.current.value = "";
    }
  }

  async function bindTarget(
    targetType:
      | "lesson"
      | "preparation_task"
      | "teaching_plan_revision"
      | "assignment"
      | "assignment_version"
  ) {
    const lesson = lessons.find((item) => item.lessonRef === lessonRef);
    const targetRef = targetType === "lesson"
      ? lesson?.lessonRef
      : targetType === "preparation_task"
        ? lesson?.activePreparationTaskRef
        : targetType === "teaching_plan_revision"
          ? lesson?.currentApprovedPlanRef
          : targetType === "assignment"
            ? assignment?.assignmentRef
            : assignment?.currentVersion.assignmentVersionRef;
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
          : targetType === "teaching_plan_revision"
            ? "当前教学方案"
            : targetType === "assignment"
              ? "作业"
              : "作业内容版本";
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
      props.onAction(
        nextStatus === "deleted"
          ? "文件已移至“已删除”，需要时可以恢复"
          : "文件已恢复"
      );
      if (nextStatus === "deleted") {
        await refresh(undefined, "active");
        setSelected(await loadFile(result.asset.assetRef));
        setDetailOpen(true);
      } else {
        await refresh(result.asset.assetRef, "active");
      }
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
  const assignmentAlreadyBound = Boolean(
    assignment &&
      selected?.bindings.some(
        (binding) =>
          binding.targetType === "assignment" &&
          binding.targetRef === assignment.assignmentRef
      )
  );
  const assignmentVersionAlreadyBound = Boolean(
    assignment &&
      selected?.bindings.some(
        (binding) =>
          binding.targetType === "assignment_version" &&
          binding.targetRef === assignment.currentVersion.assignmentVersionRef
      )
  );
  const exportManaged = selected?.source === "teaching_plan_export";

  return (
    <div className="file-manager" data-testid="file-manager">
      {error ? <Alert type="error" showIcon title={error} closable onClose={() => setError(null)} /> : null}
      <header className="file-manager__topbar">
        <div className="file-manager__toolbar">
          <Input className="file-search-input" prefix={<WorkspaceIcon name="search" variant="filled" />} placeholder="搜索资料" value={query} onChange={(event) => setQuery(event.target.value)} allowClear />
          <Select className="file-sort-select" suffixIcon={<WorkspaceIcon name="chevronDown" variant="filled" />} value={sort} aria-label="资料排序" onChange={setSort} options={[{ value: "newest", label: "最近更新" }, { value: "oldest", label: "最早更新" }, { value: "name", label: "按名称" }, { value: "size", label: "按大小" }, { value: "type", label: "按类型" }]} />
          <Button className="file-upload-action" type="primary" loading={busy} disabled={busy || lessons.length === 0} title={lessons.length === 0 ? "课时上下文未加载，暂不能上传并关联" : undefined} icon={<WorkspaceIcon name="upload" variant="filled" />} onClick={() => uploadRef.current?.click()}>上传资料</Button>
          <input ref={uploadRef} data-testid="file-upload-input" hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.md,.txt,.docx,.pptx,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
        </div>
      </header>

      <div className="file-manager__body">
        <aside className="file-filter-panel">
          <section>
            {categories.map((entry) => (
              <button type="button" key={entry.value} className={category === entry.value ? "is-active" : ""} onClick={() => setCategory(entry.value)}>
                <WorkspaceIcon name="folder" variant="filled" /><span>{entry.label}</span><small>{counts.get(entry.value) ?? 0}</small>
              </button>
            ))}
          </section>
        </aside>

        <section className="file-results">
          <Spin spinning={loading}>
            <div className="file-result-list" data-testid="real-file-list">
              <div className="file-list-head" aria-hidden="true">
                <span>名称</span>
                <span>类型</span>
                <span className="file-list-update-head">更新时间</span>
              </div>
              {items.map((file) => (
                <button type="button" key={file.assetRef} className={selected?.assetRef === file.assetRef ? "is-active" : ""} onClick={() => void choose(file)}>
                  <span className="file-list-name">
                    <span className="file-card-icon"><WorkspaceIcon name={file.currentVersion.extension === ".pptx" ? "slides" : "document"} /></span>
                    <span>
                      <strong>{file.displayName}</strong>
                    </span>
                  </span>
                  <span>{categoryLabel(file.category)}</span>
                  <time>{formatUpdatedAt(file.updatedAt)}</time>
                </button>
              ))}
            </div>
            {!loading && items.length === 0 ? <div className="file-no-results">没有符合条件的文件。</div> : null}
          </Spin>
        </section>

      </div>
      <Drawer
        className="file-detail-drawer"
        size={560}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selected?.displayName ?? "资料详情"}
      >
        {selected ? (
          <div className="file-preview" data-testid="file-detail">
            <div className="file-preview__summary">
              <Tag color={selected.status === "active" ? "success" : "error"}>
                {selected.status === "active" ? "已完成" : "未完成"}
              </Tag>
              <span>{categoryLabel(selected.category)}</span>
              <span>{formatSize(selected.currentVersion.sizeBytes)}</span>
              <span>{formatUpdatedAt(selected.updatedAt)}</span>
            </div>
            <p>{cleanTeacherPreviewText(selected.currentVersion.contentSummary ?? "暂无内容摘要")}</p>
            <small>来源：{selected.source === "upload" ? "教师上传" : "教学方案生成"}</small>

            {selected.currentVersion.previewKind === "image" && previewUrl ? (
              <img src={previewUrl} alt={selected.displayName} />
            ) : null}
            {selected.currentVersion.previewKind === "pdf" && previewUrl ? (
              <iframe title={`${selected.displayName} PDF 预览`} src={previewUrl} />
            ) : null}
            {selected.currentVersion.previewKind === "text" && textPreview !== null ? (
              <pre>{textPreview}</pre>
            ) : null}
            {selected.currentVersion.previewKind === "office" ? (
              <Alert type="info" showIcon title="下载后查看完整内容" description="当前格式需要使用对应的办公软件打开。" />
            ) : null}

            <div className="file-primary-actions">
              <Button onClick={() => void download(selected)} disabled={busy || selected.status === "deleted"}>下载</Button>
              <Button onClick={() => versionInputRef.current?.click()} disabled={busy || selected.status === "deleted" || exportManaged} title={exportManaged ? "这份资料随教学方案更新" : undefined}>更新文件</Button>
              <input ref={versionInputRef} data-testid="file-version-input" hidden type="file" accept={selected.currentVersion.extension} onChange={(event) => { const file = event.target.files?.[0]; if (file) void addVersion(file); }} />
            </div>

            <details className="file-detail-section">
              <summary>关联教学内容</summary>
              <div className="file-binding-context">
                <label>
                  课时
                  <Select aria-label="资料关联课时" value={lessonRef} onChange={setLessonRef} disabled={busy || lessons.length === 0} placeholder="选择课时" options={lessons.map((lesson) => ({ value: lesson.lessonRef, label: lesson.title }))} />
                </label>
                <label>
                  作业
                  <Select<string>
                    aria-label="资料关联作业"
                    value={assignment?.assignmentRef ?? null}
                    onChange={(assignmentRef: string) => {
                      void loadAssignment(assignmentRef)
                        .then(setAssignment)
                        .catch((caught) => setError(`作业关联信息加载失败：${message(caught)}`));
                    }}
                    disabled={busy || lessonAssignments.length === 0}
                    placeholder={lessonAssignments.length === 0 ? "当前课时暂无作业" : "选择作业"}
                    options={lessonAssignments.map((item) => ({ value: item.assignmentRef, label: item.title }))}
                  />
                </label>
              </div>
              <div className="file-secondary-actions">
                <Button onClick={() => void bindTarget("lesson")} disabled={busy || exportManaged || !bindingLesson || selected.status === "deleted" || lessonAlreadyBound}>{lessonAlreadyBound ? "已关联课时" : "关联课时"}</Button>
                <Button onClick={() => void bindTarget("preparation_task")} disabled={busy || exportManaged || !bindingLesson?.activePreparationTaskRef || selected.status === "deleted" || taskAlreadyBound}>{taskAlreadyBound ? "已关联备课" : "关联备课"}</Button>
                <Button onClick={() => void bindTarget("teaching_plan_revision")} disabled={busy || exportManaged || !bindingLesson?.currentApprovedPlanRef || selected.status === "deleted" || planAlreadyBound}>{planAlreadyBound ? "已关联方案" : "关联方案"}</Button>
                <Button onClick={() => void bindTarget("assignment")} disabled={busy || exportManaged || !assignment || selected.status === "deleted" || assignmentAlreadyBound}>{assignmentAlreadyBound ? "已关联作业" : "关联作业"}</Button>
                <Button onClick={() => void bindTarget("assignment_version")} disabled={busy || exportManaged || !assignment || selected.status === "deleted" || assignmentVersionAlreadyBound}>{assignmentVersionAlreadyBound ? "已关联当前内容" : "关联当前内容"}</Button>
              </div>
              {selected.bindings.length > 0 ? (
                <ul>{selected.bindings.map((binding) => <li key={binding.bindingRef}>{bindingLabel(binding.targetType)} · {binding.relation === "export" ? "随方案生成" : "教师关联"}</li>)}</ul>
              ) : <p>尚未关联课时、备课或作业。</p>}
            </details>

            <details className="file-detail-section">
              <summary>历史版本</summary>
              <ol data-testid="file-version-history">
                {selected.versions.map((version) => (
                  <li key={version.versionRef}>
                    <button type="button" className="text-action" disabled={busy || selected.status === "deleted"} title={selected.status === "deleted" ? "恢复后可以下载" : undefined} onClick={() => void download(selected, version)}>第 {version.versionNumber} 版 · {version.originalFileName} · {formatSize(version.sizeBytes)}</button>
                    <small>{cleanDisplayText(version.contentSummary ?? "暂无内容摘要")}</small>
                  </li>
                ))}
              </ol>
            </details>

            <div className="file-danger-zone">
              {selected.status === "active" ? (
                <Button danger disabled={busy || selected.deletionProtected} title={selected.deletionProtected ? "正在使用的教学成果不能删除" : undefined} onClick={() => void lifecycle("deleted")}>移至已删除</Button>
              ) : (
                <Button disabled={busy} onClick={() => void lifecycle("active")}>恢复资料</Button>
              )}
            </div>
          </div>
        ) : <div className="file-no-results">选择一项资料查看详情。</div>}
      </Drawer>
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

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function bindingLabel(targetType: string): string {
  return {
    lesson: "课时",
    preparation_task: "备课任务",
    teaching_plan_revision: "教学方案",
    teaching_plan_artifact: "教学方案",
    assignment: "作业",
    assignment_version: "作业内容"
  }[targetType] ?? "关联内容";
}

function categoryLabel(category: FileCategory): string {
  return categories.find((entry) => entry.value === category)?.label ?? "其他";
}

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "文件操作失败。";
}

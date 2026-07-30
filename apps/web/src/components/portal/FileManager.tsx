import { useMemo, useState } from "react";

import { Button, Input, Select } from "antd";

import { teachingFiles, type TeachingFile } from "../../teacher-portal-data";
import { WorkspaceIcon } from "../WorkspaceIcon";
import { FilePreview } from "./TeachingComponents";
import { StatusPill } from "./PortalPrimitives";

type ViewMode = "grid" | "list";
type SortMode = "newest" | "oldest" | "name" | "size" | "type";

const purposeFilters = ["全部", "教案", "作业", "课件", "测评", "讲义", "报告", "其他"] as const;
const typeFilters = ["全部类型", "PPT", "Word", "Excel", "PDF", "图片", "文本"] as const;

export function FileManager(props: {
  onAction: (action: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [purpose, setPurpose] = useState<string>("全部");
  const [fileType, setFileType] = useState<string>("全部类型");
  const [timeFilter, setTimeFilter] = useState("最近修改");
  const [sort, setSort] = useState<SortMode>("newest");
  const [view, setView] = useState<ViewMode>("grid");
  const [selected, setSelected] = useState<TeachingFile | null>(teachingFiles[0]!);
  const [customPurpose, setCustomPurpose] = useState<string | null>(null);

  const files = useMemo(() => {
    const result = teachingFiles
      .filter((file) => file.name.includes(query.trim()))
      .filter((file) => purpose === "全部" || file.purpose === purpose)
      .filter((file) => fileType === "全部类型" || file.fileType === fileType)
      .filter((file) => {
        if (timeFilter === "今天") return file.modifiedAt.includes("今天");
        if (timeFilter === "本周") return !file.modifiedAt.includes("6 月");
        if (timeFilter === "本月") return true;
        if (timeFilter === "更早") return file.modifiedAt.includes("6 月");
        return true;
      });
    return [...result].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "zh-CN");
      if (sort === "type") return a.fileType.localeCompare(b.fileType, "zh-CN");
      if (sort === "size") return Number.parseFloat(b.size) - Number.parseFloat(a.size);
      if (sort === "oldest") return teachingFiles.indexOf(b) - teachingFiles.indexOf(a);
      return teachingFiles.indexOf(a) - teachingFiles.indexOf(b);
    });
  }, [fileType, purpose, query, sort, timeFilter]);

  return (
    <div className="file-manager" data-testid="file-manager">
      <header className="file-manager__toolbar">
        <Input
          prefix={<WorkspaceIcon name="search" />}
          placeholder="搜索文件名称"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          allowClear
        />
        <Button icon={<WorkspaceIcon name="upload" />} onClick={() => props.onAction("上传文件")}>上传</Button>
        <Button type="primary" icon={<WorkspaceIcon name="plus" />} onClick={() => props.onAction("新建文件")}>新建</Button>
        <div className="view-switch" aria-label="文件视图">
          <button type="button" className={view === "grid" ? "is-active" : ""} aria-label="网格视图" onClick={() => setView("grid")}><WorkspaceIcon name="grid" /></button>
          <button type="button" className={view === "list" ? "is-active" : ""} aria-label="列表视图" onClick={() => setView("list")}><WorkspaceIcon name="list" /></button>
        </div>
      </header>

      <div className="file-manager__body">
        <aside className="file-filter-panel">
          <section>
            <header><h2>按用途</h2><button type="button" title="新增自定义分类" onClick={() => setCustomPurpose(customPurpose ? null : "我的材料")}><WorkspaceIcon name="plus" /></button></header>
            {purposeFilters.map((item) => (
              <button type="button" key={item} className={purpose === item ? "is-active" : ""} onClick={() => setPurpose(item)}>
                <WorkspaceIcon name="folder" />
                <span>{item}</span>
                <small>{item === "全部" ? teachingFiles.length : teachingFiles.filter((file) => file.purpose === item).length}</small>
              </button>
            ))}
            {customPurpose ? (
              <button type="button" className={purpose === customPurpose ? "is-active" : ""} onClick={() => setPurpose(customPurpose)}>
                <WorkspaceIcon name="folder" /><span>{customPurpose}</span><small>0</small>
              </button>
            ) : null}
          </section>
          <section>
            <h2>文件类型</h2>
            <Select
              aria-label="文件类型筛选"
              value={fileType}
              onChange={setFileType}
              options={typeFilters.map((value) => ({ value, label: value }))}
            />
          </section>
          <section>
            <h2>修改时间</h2>
            {["最近修改", "今天", "本周", "本月", "更早"].map((item) => (
              <button type="button" key={item} className={timeFilter === item ? "is-active" : ""} onClick={() => setTimeFilter(item)}>
                <WorkspaceIcon name="clock" /><span>{item}</span>
              </button>
            ))}
          </section>
          <button
            type="button"
            className="file-filter-reset"
            onClick={() => {
              setQuery("");
              setPurpose("全部");
              setFileType("全部类型");
              setTimeFilter("最近修改");
              setSort("newest");
              setView("grid");
              setSelected(teachingFiles[0]!);
            }}
          >
            <WorkspaceIcon name="reset" />恢复初始数据
          </button>
        </aside>

        <section className="file-results">
          <header>
            <div><h2>全部文件</h2><span>{files.length} 个文件 · 仅供界面预览</span></div>
            <Select
              aria-label="文件排序"
              value={sort}
              onChange={setSort}
              options={[
                { value: "newest", label: "修改时间：从新到旧" },
                { value: "oldest", label: "修改时间：从旧到新" },
                { value: "name", label: "名称" },
                { value: "size", label: "文件大小" },
                { value: "type", label: "文件类型" }
              ]}
            />
          </header>
          <div className={`file-result-${view}`}>
            {files.map((file) => (
              <button
                type="button"
                key={file.id}
                className={selected?.id === file.id ? "is-active" : ""}
                onClick={() => setSelected(file)}
              >
                <span className="file-card-icon"><WorkspaceIcon name={file.fileType === "PPT" ? "slides" : "document"} /></span>
                <span className="file-card-copy">
                  <strong>{file.name}</strong>
                  <small>{file.fileType} · {file.size}</small>
                  <small>{file.course} · {file.className}</small>
                  <span>{file.modifiedAt} · {file.modifiedBy}</span>
                </span>
                <StatusPill tone={file.status === "待审核" ? "warning" : file.status === "已就绪" ? "success" : "neutral"}>{file.status}</StatusPill>
                <span className="file-card-version">{file.version}</span>
              </button>
            ))}
          </div>
          {files.length === 0 ? <div className="file-no-results">没有符合当前筛选条件的文件。</div> : null}
        </section>

        <section className="file-manager__preview">
          <FilePreview file={selected} onAction={props.onAction} />
          {selected ? (
            <div className="file-secondary-actions">
              {["分享", "复制", "删除", "查看差异"].map((action) => (
                <Button
                  key={action}
                  danger={action === "删除"}
                  icon={<WorkspaceIcon name={action === "删除" ? "trash" : action === "查看差异" ? "eye" : "more"} />}
                  onClick={() => props.onAction(action)}
                >
                  {action}
                </Button>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

import type { TeacherWorkspace } from "@edu-agent/contracts";

import { WorkspaceIcon } from "../components/WorkspaceIcon";
import {
  recentFiles,
  teachingAssets
} from "../demo-read-model";
import { teachingPlanStateLabel } from "../presentation";
import type { AppRoute } from "../route";

export function FilesPage(props: {
  workspace: TeacherWorkspace;
  navigate: (route: AppRoute) => void;
}) {
  return (
    <div className="task-page">
      <header className="task-page__header">
        <div>
          <h1>文件</h1>
          <p>教案、课件、练习、作业和最近使用的教学材料</p>
        </div>
        <button
          type="button"
          className="primary-action"
          title="演示功能：本轮不创建真实文件"
          disabled
        >
          新建文件
        </button>
      </header>

      <section className="file-categories" aria-label="文件分类">
        {["全部", "教案", "课件", "练习", "作业"].map((category) => (
          <button
            type="button"
            key={category}
            className={category === "全部" ? "is-active" : ""}
            title={
              category === "全部"
                ? undefined
                : "演示功能：分类筛选将在后续实现"
            }
            disabled={category !== "全部"}
          >
            {category}
          </button>
        ))}
      </section>

      <section className="plain-panel">
        <div className="section-heading">
          <h2>备课材料</h2>
          <span>{teachingAssets.length} 个文件</span>
        </div>
        <div className="file-list">
          {teachingAssets.map((asset) => (
            <article key={`${asset.type}:${asset.name}`}>
              <WorkspaceIcon
                name={asset.type === "课件" ? "slides" : "document"}
              />
              <div>
                <small>{asset.type}</small>
                <h3>{asset.name}</h3>
                <time>最近修改 {asset.updatedAt}</time>
              </div>
              <span className="status-text">
                {asset.type === "教案"
                  ? teachingPlanStateLabel(
                      props.workspace.latestTeachingPlan.state
                    )
                  : asset.status}
              </span>
              {asset.type === "教案" ? (
                <button
                  type="button"
                  onClick={() => props.navigate("/teaching-plan")}
                >
                  查看变更
                </button>
              ) : (
                <button
                  type="button"
                  title="演示功能：文件编辑器尚未接入"
                  disabled
                >
                  {asset.action}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="plain-panel">
        <div className="section-heading">
          <h2>最近使用</h2>
        </div>
        <div className="recent-file-list">
          {recentFiles.map((file) => (
            <button
              type="button"
              key={file.name}
              title="演示功能：文件预览尚未接入"
              disabled
            >
              <WorkspaceIcon name="document" />
              <span>
                <strong>{file.name}</strong>
                <small>{file.type} · {file.openedAt}</small>
              </span>
              <WorkspaceIcon name="chevron" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

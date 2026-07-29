import { WorkspaceIcon } from "../components/WorkspaceIcon";
import type { AppRoute } from "../route";

export function SettingsPage(props: {
  navigate: (route: AppRoute) => void;
}) {
  return (
    <div className="task-page settings-page">
      <header className="task-page__header">
        <div>
          <h1>设置</h1>
          <p>演示环境、系统记录与开发辅助页面</p>
        </div>
      </header>

      <section className="plain-panel settings-list">
        <button type="button" onClick={() => props.navigate("/runs")}>
          <WorkspaceIcon name="clock" />
          <span>
            <strong>系统记录</strong>
            <small>查看教师可理解的过程，并按需展开技术详情</small>
          </span>
          <WorkspaceIcon name="chevron" />
        </button>
        <button
          type="button"
          onClick={() => props.navigate("/style-guide")}
        >
          <WorkspaceIcon name="document" />
          <span>
            <strong>样式与字体</strong>
            <small>开发辅助页面，不属于教师一级工作入口</small>
          </span>
          <WorkspaceIcon name="chevron" />
        </button>
      </section>

      <section className="plain-panel environment-panel">
        <div className="section-heading">
          <h2>当前环境</h2>
        </div>
        <dl className="detail-list">
          <div>
            <dt>环境</dt>
            <dd>演示环境</dd>
          </div>
          <div>
            <dt>数据</dt>
            <dd>示例数据，未连接真实学校系统</dd>
          </div>
          <div>
            <dt>助手</dt>
            <dd>本地演示助手，不调用外部模型</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

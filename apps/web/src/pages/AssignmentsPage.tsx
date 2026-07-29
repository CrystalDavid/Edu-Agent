import { WorkspaceIcon } from "../components/WorkspaceIcon";
import { assignmentRows } from "../demo-read-model";
import type { AppRoute } from "../route";

export function AssignmentsPage(props: {
  navigate: (route: AppRoute) => void;
  openAgentTask: (command: string) => void;
}) {
  return (
    <div className="task-page">
      <header className="task-page__header">
        <div>
          <h1>作业</h1>
          <p>查看提交情况、共性问题与需要跟进的学生</p>
        </div>
        <button
          type="button"
          className="primary-action"
          title="演示功能：本轮不创建正式作业"
          disabled
        >
          布置作业
        </button>
      </header>

      <section className="plain-panel">
        <div className="section-heading">
          <h2>作业列表</h2>
          <span>4 人未交</span>
        </div>
        <div className="assignment-list">
          {assignmentRows.map((assignment) => (
            <article key={assignment.name}>
              <WorkspaceIcon name="assignment" />
              <div>
                <h3>{assignment.name}</h3>
                <p>{assignment.className} · 截止 {assignment.due}</p>
              </div>
              <div>
                <small>提交</small>
                <strong>{assignment.submitted}</strong>
              </div>
              <span className="status-text">{assignment.status}</span>
              <button
                type="button"
                onClick={() => props.navigate("/students")}
              >
                查看情况
              </button>
            </article>
          ))}
        </div>
      </section>

      <div className="page-grid">
        <section className="plain-panel">
          <div className="section-heading">
            <h2>共性问题</h2>
          </div>
          <ul className="plain-list">
            <li>能判断图像上升或下降，但解释依据不完整。</li>
            <li>容易把纵轴截距的位置当作斜率大小。</li>
            <li>单位变化时，部分学生只给出计算结果。</li>
          </ul>
          <button
            type="button"
            onClick={() => props.navigate("/evidence")}
          >
            查看分析依据
          </button>
        </section>

        <section className="plain-panel">
          <div className="section-heading">
            <h2>后续处理</h2>
          </div>
          <p className="panel-copy">
            可以把最近作业情况带入下一节课的备课任务；系统只生成建议草稿，仍由教师判断。
          </p>
          <button
            type="button"
            className="primary-action full-width"
            onClick={() =>
              props.openAgentTask("根据最近作业调整教学重点")
            }
          >
            根据结果调整课程
          </button>
        </section>
      </div>
    </div>
  );
}

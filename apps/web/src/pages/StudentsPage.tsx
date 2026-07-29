import type { TeacherWorkspace } from "@edu-agent/contracts";

import { WorkspaceIcon } from "../components/WorkspaceIcon";
import {
  classStudents,
  focusStudents
} from "../demo-read-model";
import { cleanDisplayText } from "../presentation";
import type { AppRoute } from "../route";

export function StudentsPage(props: {
  workspace: TeacherWorkspace;
  navigate: (route: AppRoute) => void;
}) {
  const className = cleanDisplayText(
    props.workspace.courseRun.className
  );

  return (
    <div className="task-page">
      <header className="task-page__header">
        <div>
          <h1>学生</h1>
          <p>{className} · 先看需要关注的情况，再按需查看分析依据</p>
        </div>
        <button
          type="button"
          className="primary-action"
          onClick={() => props.navigate("/evidence")}
        >
          查看分析依据
        </button>
      </header>

      <section className="learning-summary-panel">
        <div>
          <span>班级整体情况</span>
          <p>
            多数学生能判断图像上升或下降；对“变化率”和“截距位置”的解释仍容易混淆。
          </p>
        </div>
        <div>
          <span>证据缺口</span>
          <p>仍需观察学生能否在新情境中独立解释图像变化。</p>
        </div>
      </section>

      <div className="page-grid">
        <section className="plain-panel">
          <div className="section-heading">
            <h2>需要关注</h2>
          </div>
          <div className="focus-card-list">
            {focusStudents.map((student) => (
              <article key={student.id}>
                <span className="student-index">{student.id}</span>
                <div>
                  <h3>学生 {student.id}</h3>
                  <p>{student.summary}</p>
                  <small>辅助情况：{student.assistance}</small>
                </div>
                <button
                  type="button"
                  onClick={() => props.navigate("/evidence")}
                >
                  查看依据
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="plain-panel">
          <div className="section-heading">
            <h2>下一步</h2>
          </div>
          <div className="next-step-list">
            <article>
              <WorkspaceIcon name="lesson" />
              <div>
                <p>课堂追问</p>
                <small>让学生解释斜率变化如何影响图像。</small>
              </div>
            </article>
            <article>
              <WorkspaceIcon name="assignment" />
              <div>
                <p>新情境练习</p>
                <small>不提供答案，观察学生是否能独立迁移。</small>
              </div>
            </article>
          </div>
          <button
            type="button"
            className="primary-action full-width"
            onClick={() => props.navigate("/copilot")}
          >
            调整下一节课
          </button>
        </section>
      </div>

      <section className="plain-panel">
        <div className="section-heading">
          <h2>班级学生</h2>
          <span>当前展示 6 条示例记录</span>
        </div>
        <div className="student-table" role="table">
          <div role="row" className="student-table__head">
            <span role="columnheader">学生</span>
            <span role="columnheader">当前情况</span>
            <span role="columnheader">备注</span>
            <span role="columnheader">操作</span>
          </div>
          {classStudents.map((student) => (
            <div role="row" key={student.id}>
              <span role="cell">{student.name}</span>
              <span role="cell">{student.status}</span>
              <span role="cell">{student.note}</span>
              <span role="cell">
                <button
                  type="button"
                  title="演示功能：当前仅提供班级级别的查看"
                  disabled
                >
                  查看
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

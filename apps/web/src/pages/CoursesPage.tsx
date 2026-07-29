import type { TeacherWorkspace } from "@edu-agent/contracts";

import { WorkspaceIcon } from "../components/WorkspaceIcon";
import { courseRows, teachingAssets } from "../demo-read-model";
import {
  cleanDisplayText,
  teachingPlanStateLabel
} from "../presentation";
import type { AppRoute } from "../route";

export function CoursesPage(props: {
  workspace: TeacherWorkspace;
  navigate: (route: AppRoute) => void;
}) {
  const className = cleanDisplayText(
    props.workspace.courseRun.className
  );
  const planState = teachingPlanStateLabel(
    props.workspace.latestTeachingPlan.state
  );

  return (
    <div className="task-page">
      <header className="task-page__header">
        <div>
          <h1>课程</h1>
          <p>查看课程安排、教学目标、计划、文件和班级学习情况</p>
        </div>
        <button
          type="button"
          className="primary-action"
          onClick={() => props.navigate("/copilot")}
        >
          调整教学
        </button>
      </header>

      <section className="current-course-panel">
        <div className="current-course-panel__heading">
          <span>当前课程</span>
          <strong>{className} · {props.workspace.courseRun.subject}</strong>
          <p>{props.workspace.learningObjective.title}</p>
        </div>
        <div className="current-course-links">
          <button type="button" onClick={() => props.navigate("/goals")}>
            教学目标
          </button>
          <button
            type="button"
            onClick={() => props.navigate("/teaching-plan")}
          >
            教学计划
          </button>
          <button type="button" onClick={() => props.navigate("/files")}>
            课程文件
          </button>
          <button
            type="button"
            onClick={() => props.navigate("/evidence")}
          >
            班级学习情况
          </button>
        </div>
      </section>

      <div className="page-grid">
        <section className="plain-panel">
          <div className="section-heading">
            <h2>我的课程</h2>
          </div>
          <div className="course-list">
            {courseRows.map((course) => (
              <article key={course.className}>
                <WorkspaceIcon name="course" />
                <div>
                  <h3>{course.className} · {course.subject}</h3>
                  <p>{course.nextLesson}</p>
                  <small>{course.time}</small>
                </div>
                <span className="status-text">{course.status}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="plain-panel">
          <div className="section-heading">
            <h2>下一节课</h2>
          </div>
          <dl className="detail-list">
            <div>
              <dt>主题</dt>
              <dd>一次函数：斜率与图像</dd>
            </div>
            <div>
              <dt>教学目标</dt>
              <dd>{props.workspace.goal.title}</dd>
            </div>
            <div>
              <dt>教学计划</dt>
              <dd>{planState}</dd>
            </div>
            <div>
              <dt>需要补充</dt>
              <dd>新情境下的独立解释</dd>
            </div>
          </dl>
          <div className="section-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => props.navigate("/copilot")}
            >
              继续备课
            </button>
            <button
              type="button"
              onClick={() => props.navigate("/teaching-plan")}
            >
              查看计划
            </button>
          </div>
        </section>
      </div>

      <section className="plain-panel">
        <div className="section-heading">
          <h2>课程文件</h2>
          <button type="button" onClick={() => props.navigate("/files")}>
            查看全部
          </button>
        </div>
        <div className="compact-file-grid">
          {teachingAssets.slice(0, 3).map((asset) => (
            <article key={`${asset.type}:${asset.name}`}>
              <WorkspaceIcon name="document" />
              <div>
                <small>{asset.type}</small>
                <p>{asset.name}</p>
                <time>{asset.updatedAt}</time>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

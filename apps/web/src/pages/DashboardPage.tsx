import type { TeacherWorkspace } from "@edu-agent/contracts";

import { WorkspaceIcon } from "../components/WorkspaceIcon";
import {
  attentionItems,
  focusStudents,
  quickActions,
  recentFiles,
  teachingAssets,
  todayCourses,
  todaySchedule
} from "../demo-read-model";
import { cleanDisplayText } from "../presentation";
import type { AppRoute } from "../route";

export function DashboardPage(props: {
  workspace: TeacherWorkspace;
  navigate: (route: AppRoute) => void;
  openAgentTask: (command: string) => void;
}) {
  const teacherName = cleanDisplayText(
    props.workspace.identity.teacherName
  );

  function runCourseAction(courseIndex: number, primary: boolean) {
    if (courseIndex === 0 && primary) {
      props.openAgentTask("准备明天的课程");
      return;
    }
    if (courseIndex === 1 && primary) {
      props.navigate("/teaching-plan");
      return;
    }
    if (!primary || courseIndex === 2) {
      props.navigate(courseIndex === 1 ? "/courses" : "/files");
      return;
    }
    props.navigate("/courses");
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-greeting">
        <h1>上午好，{teacherName}</h1>
        <p>今天有 3 节课，1 份课件需要完成</p>
      </header>

      <section
        className="dashboard-section today-courses"
        aria-labelledby="today-courses-heading"
        data-testid="today-courses"
      >
        <div className="section-heading">
          <h2 id="today-courses-heading">今日课程</h2>
          <button type="button" onClick={() => props.navigate("/schedule")}>
            查看完整日程
          </button>
        </div>
        <div className="course-card-grid">
          {todayCourses.map((course, index) => (
            <article className="course-card" key={course.id}>
              <time>{course.time}</time>
              <div className="course-card__body">
                <div className="course-card__title">
                  <h3>
                    {course.className} · {course.subject}
                  </h3>
                  <span>{course.status}</span>
                </div>
                <p>{course.topic}</p>
                <div className="course-card__actions">
                  <button
                    type="button"
                    className="text-action text-action--primary"
                    onClick={() => runCourseAction(index, true)}
                  >
                    {course.primaryAction}
                  </button>
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => runCourseAction(index, false)}
                  >
                    {course.secondaryAction}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className="dashboard-section"
        aria-labelledby="quick-actions-heading"
        data-testid="quick-actions"
      >
        <div className="section-heading">
          <h2 id="quick-actions-heading">快捷操作</h2>
        </div>
        <div className="quick-action-grid">
          {quickActions.map((action) => (
            <button
              type="button"
              className="quick-action"
              key={action.label}
              onClick={() => props.openAgentTask(action.command)}
            >
              <span>
                <WorkspaceIcon name={action.icon} />
              </span>
              <span className="quick-action__label">
                {action.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section
        className="dashboard-section"
        aria-labelledby="attention-heading"
        data-testid="attention-items"
      >
        <div className="section-heading">
          <h2 id="attention-heading">需要处理</h2>
        </div>
        <div className="attention-list">
          {attentionItems.map((item) => (
            <article key={item.title}>
              <span className="attention-count">{item.count}</span>
              <div>
                <small>{item.type}</small>
                <p>{item.title}</p>
              </div>
              <time>{item.due}</time>
              <button
                type="button"
                onClick={() => props.navigate(item.route as AppRoute)}
              >
                {item.action}
              </button>
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard-two-column">
        <section
          className="dashboard-section"
          aria-labelledby="assets-heading"
          data-testid="teaching-assets"
        >
          <div className="section-heading">
            <h2 id="assets-heading">备课与课件</h2>
            <button type="button" onClick={() => props.navigate("/files")}>
              查看全部
            </button>
          </div>
          <div className="artifact-list">
            {teachingAssets.map((asset) => (
              <article key={`${asset.type}:${asset.name}`}>
                <span className="artifact-icon">
                  <WorkspaceIcon
                    name={asset.type === "课件" ? "slides" : "document"}
                  />
                </span>
                <div>
                  <small>{asset.type}</small>
                  <p>{asset.name}</p>
                  <time>{asset.updatedAt}</time>
                </div>
                <span className="status-text">{asset.status}</span>
                <button
                  type="button"
                  onClick={() =>
                    props.navigate(
                      asset.type === "教案"
                        ? "/teaching-plan"
                        : "/files"
                    )
                  }
                >
                  {asset.action}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section
          className="dashboard-section"
          aria-labelledby="students-heading"
          data-testid="student-learning"
        >
          <div className="section-heading">
            <h2 id="students-heading">学生学习情况</h2>
          </div>
          <div className="class-summary">
            <span>班级整体情况</span>
            <p>
              多数学生能判断图像上升或下降；对斜率与截距的解释仍容易混淆。
            </p>
          </div>
          <div className="focus-student-list">
            <span>需要关注</span>
            {focusStudents.map((student) => (
              <article key={student.id}>
                <span className="student-index">{student.id}</span>
                <div>
                  <p>学生 {student.id}</p>
                  <small>
                    {student.summary} · {student.assistance}
                  </small>
                </div>
              </article>
            ))}
          </div>
          <div className="section-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => props.navigate("/students")}
            >
              查看班级情况
            </button>
            <button
              type="button"
              onClick={() => props.navigate("/evidence")}
            >
              查看分析依据
            </button>
          </div>
        </section>
      </div>

      <div className="dashboard-two-column dashboard-two-column--lower">
        <section
          className="dashboard-section"
          aria-labelledby="schedule-heading"
          data-testid="schedule-todos"
        >
          <div className="section-heading">
            <h2 id="schedule-heading">今日日程与待办</h2>
            <button type="button" onClick={() => props.navigate("/schedule")}>
              打开日程
            </button>
          </div>
          <div className="schedule-list">
            {todaySchedule.slice(0, 5).map((item) => (
              <article key={`${item.time}:${item.title}`}>
                <time>{item.time}</time>
                <span>{item.kind}</span>
                <p>{item.title}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="dashboard-section"
          aria-labelledby="recent-files-heading"
        >
          <div className="section-heading">
            <h2 id="recent-files-heading">最近文件</h2>
            <button type="button" onClick={() => props.navigate("/files")}>
              打开文件
            </button>
          </div>
          <div className="recent-file-list">
            {recentFiles.map((file) => (
              <button
                type="button"
                key={file.name}
                onClick={() => props.navigate("/files")}
              >
                <WorkspaceIcon name="document" />
                <span>
                  <strong>{file.name}</strong>
                  <small>
                    {file.type} · {file.openedAt}
                  </small>
                </span>
                <WorkspaceIcon name="chevron" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

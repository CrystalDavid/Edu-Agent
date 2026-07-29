import type { TeacherWorkspace } from "@edu-agent/contracts";

import { Button } from "antd";

import {
  preparationGroupUpdates,
  schoolUpdates,
  students,
  teacherTodos,
  teachingFiles,
  todayCourses
} from "../teacher-portal-data";
import type { AppRoute } from "../route";
import { WorkspaceIcon } from "../components/WorkspaceIcon";
import {
  ModuleCard,
  PageHeader,
  QuickAction,
  StatusPill
} from "../components/portal/PortalPrimitives";

export function OverviewPage(props: {
  workspace: TeacherWorkspace;
  navigate: (route: AppRoute) => void;
  onAction: (message: string) => void;
}) {
  const pending = teacherTodos.filter((todo) => todo.status !== "已完成").slice(0, 5);
  const followUps = students.filter((student) => student.followUp);
  return (
    <div className="portal-page overview-page" data-testid="overview-page">
      <PageHeader
        title="概览"
        subtitle="上午好，林老师"
        actions={
          <Button type="primary" icon={<WorkspaceIcon name="agent" />} onClick={() => props.navigate("/agent")}>
            问问 Agent
          </Button>
        }
      />

      <div className="overview-grid overview-grid--top">
        <ModuleCard
          title="今天需要做什么"
          description="3 节课 · 5 项待处理工作"
          className="today-focus-card"
          testId="today-work"
          action={<button type="button" className="text-action" onClick={() => props.navigate("/schedule")}>查看完整日程</button>}
        >
          <div className="today-work-list">
            {pending.map((todo) => (
              <article key={todo.id}>
                <time>{todo.due.replace("今天 ", "")}</time>
                <span className="work-kind">{todo.kind}</span>
                <div>
                  <strong>{todo.title}</strong>
                  <small>{todo.context}</small>
                </div>
                <StatusPill tone={todo.priority === "重要" ? "warning" : "neutral"}>{todo.status}</StatusPill>
                <button type="button" onClick={() => todo.kind === "学生" ? props.navigate("/students") : todo.kind === "课件" ? props.navigate("/files") : props.navigate("/schedule")}>
                  处理
                </button>
              </article>
            ))}
          </div>
        </ModuleCard>

        <ModuleCard
          title="学生概况"
          description="八年级 3 班 · 最近更新于 10:40"
          action={<button type="button" className="text-action" onClick={() => props.navigate("/students")}>进入学生页面</button>}
          testId="student-summary"
        >
          <div className="student-overview-summary">
            <div className="trend-summary">
              <span>班级整体趋势</span>
              <strong>解释质量正在改善</strong>
              <small>最近四次作业平均正确率 72% → 82%</small>
              <div className="spark-bars" aria-label="最近四次作业趋势">
                {[48, 58, 70, 82].map((value) => <i key={value} style={{ height: `${value}%` }} />)}
              </div>
            </div>
            <dl>
              <div><dt>作业上交</dt><dd>38 / 42</dd></div>
              <div><dt>需要跟进</dt><dd>{followUps.length} 人</dd></div>
              <div><dt>主要共性问题</dt><dd>斜率与截距的解释仍易混淆</dd></div>
            </dl>
          </div>
        </ModuleCard>
      </div>

      <ModuleCard
        title="今日课程"
        description="按时间排列，优先显示尚未准备完成的内容"
        action={<button type="button" className="text-action" onClick={() => props.navigate("/teaching")}>查看全部教学内容</button>}
        testId="today-courses"
      >
        <div className="today-course-grid">
          {todayCourses.map((course, index) => (
            <article key={course.id} className={index === 0 ? "is-next" : ""}>
              <header>
                <time>{course.time}</time>
                {index === 0 ? <StatusPill tone="blue">下一节</StatusPill> : null}
              </header>
              <strong>{course.className} · {course.subject}</strong>
              <h3>{course.topic}</h3>
              <span>{course.room}</span>
              <div className="course-status-row">
                <small>{course.preparation}</small>
                <small>{course.slides}</small>
                <small>{course.homework}</small>
              </div>
              <footer>
                <Button type={index === 0 ? "primary" : "default"} onClick={() => props.navigate("/teaching")}>打开课程</Button>
                <button type="button" className="text-action" onClick={() => index === 0 ? props.navigate("/agent") : props.navigate("/teaching")}>
                  {index === 0 ? "继续备课" : "查看计划"}
                </button>
              </footer>
            </article>
          ))}
        </div>
      </ModuleCard>

      <section className="overview-quick-row" aria-label="快捷操作">
        <QuickAction icon="lesson" label="开始备课" description="从当前章节继续" onClick={() => props.navigate("/teaching")} />
        <QuickAction icon="slides" label="制作课件" description="关联当前教案" onClick={() => props.navigate("/agent")} />
        <QuickAction icon="assignment" label="查看作业" description="4 人未交" onClick={() => props.navigate("/assignments")} />
        <QuickAction icon="students" label="查看学生" description={`${followUps.length} 人待跟进`} onClick={() => props.navigate("/students")} />
      </section>

      <div className="overview-grid overview-grid--middle">
        <ModuleCard
          title="备课组动态"
          description="只显示与你当前课程有关的事项"
          action={<StatusPill>3 条更新</StatusPill>}
        >
          <div className="compact-activity-list">
            {preparationGroupUpdates.map((item) => (
              <article key={item.title}>
                <span className="activity-icon"><WorkspaceIcon name="students" /></span>
                <div><strong>{item.title}</strong><small>{item.time}</small></div>
                <button type="button" onClick={() => props.onAction(item.action)}>{item.action}</button>
              </article>
            ))}
          </div>
        </ModuleCard>
        <ModuleCard title="学校动态" description="通知、会议与教学截止事项">
          <div className="school-update-list">
            {schoolUpdates.map((item, index) => (
              <article key={item.title}>
                <span>{index + 1}</span>
                <div><strong>{item.title}</strong><small>{item.meta}</small></div>
              </article>
            ))}
          </div>
        </ModuleCard>
      </div>

      <ModuleCard
        title="最近文件"
        description="最近编辑和打开的教学材料"
        action={<button type="button" className="text-action" onClick={() => props.navigate("/files")}>打开文件库</button>}
      >
        <div className="recent-files-grid">
          {teachingFiles.slice(0, 6).map((file) => (
            <button type="button" key={file.id} onClick={() => props.navigate("/files")}>
              <span className="file-card-icon"><WorkspaceIcon name={file.fileType === "PPT" ? "slides" : "document"} /></span>
              <span><strong>{file.name}</strong><small>{file.fileType} · {file.modifiedAt}</small></span>
              <StatusPill tone={file.status === "待审核" ? "warning" : "neutral"}>{file.status}</StatusPill>
            </button>
          ))}
        </div>
      </ModuleCard>
    </div>
  );
}

import { useEffect, useState } from "react";

import type {
  FileAssetSummary,
  LessonPreparationSummary,
  TeacherAssignmentOverview,
  TeacherWorkbenchOverview,
  TeacherWorkspace
} from "@edu-agent/contracts";

import { Button, Modal } from "antd";

import {
  preparationGroupUpdates,
  schoolUpdates
} from "../teacher-portal-data";
import {
  createTeacherTodo,
  loadAssignmentOverview,
  loadFiles,
  loadLessonPreparationSummary,
  loadTeacherWorkbenchOverview
} from "../api";
import type { AppRoute } from "../route";
import { lessonPreparationStatusLabel } from "../presentation";
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
  navigateLesson: (lessonRef: string) => void;
  navigateFiles: (context?: {
    assetRef?: string;
    lessonRef?: string;
  }) => void;
  navigatePreparation: (
    taskRef: string,
    destination?: "/agent" | "/copilot" | "/teaching-plan" | "/runs"
  ) => void;
}) {
  const [preparation, setPreparation] =
    useState<LessonPreparationSummary | null>(null);
  const [preparationError, setPreparationError] =
    useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<FileAssetSummary[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [assignmentOverview, setAssignmentOverview] =
    useState<TeacherAssignmentOverview | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [workbench, setWorkbench] =
    useState<TeacherWorkbenchOverview | null>(null);
  const [workbenchError, setWorkbenchError] = useState<string | null>(null);
  const [todoModalOpen, setTodoModalOpen] = useState(false);
  const [todoTitle, setTodoTitle] = useState("");
  const [todoDueAt, setTodoDueAt] = useState("");
  useEffect(() => {
    let active = true;
    void loadLessonPreparationSummary()
      .then((result) => {
        if (active) setPreparation(result);
      })
      .catch((caught) => {
        if (active) {
          setPreparationError(
            caught instanceof Error
              ? caught.message
              : "备课概览加载失败"
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    void loadFiles({ status: "active", sort: "newest" })
      .then((result) => setRecentFiles(result.items.slice(0, 6)))
      .catch((caught) => {
        setRecentFiles([]);
        setFileError(
          caught instanceof Error ? caught.message : "最近文件加载失败"
        );
      });
  }, []);
  useEffect(() => {
    void loadAssignmentOverview()
      .then(setAssignmentOverview)
      .catch((caught) => {
        setAssignmentError(
          caught instanceof Error ? caught.message : "作业概览加载失败"
        );
      });
  }, []);
  const refreshWorkbench = () =>
    loadTeacherWorkbenchOverview()
      .then(setWorkbench)
      .catch((caught) => {
        setWorkbenchError(
          caught instanceof Error ? caught.message : "教师工作台加载失败"
        );
      });
  useEffect(() => {
    void refreshWorkbench();
  }, []);
  const openDeepLink = (deepLink: string) => {
    window.history.pushState({}, "", deepLink);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  return (
    <div className="portal-page overview-page" data-testid="overview-page">
      <PageHeader
        title="概览"
        subtitle="上午好，林老师"
        actions={(
          <>
            <Button icon={<WorkspaceIcon name="plus" />} onClick={() => setTodoModalOpen(true)}>
              新建待办
            </Button>
            <Button type="primary" icon={<WorkspaceIcon name="agent" />} onClick={() => props.navigate("/agent")}>
              问问 Agent
            </Button>
          </>
        )}
      />

      <div className="overview-grid overview-grid--top">
        <ModuleCard
          title="今天需要做什么"
          description={workbench
            ? `${workbench.todayTodos.length} 项个人待办 · ${workbench.actionItems.length} 项业务提醒 · ${workbench.todayCalendar.length} 项今日日程`
            : "正在读取 PostgreSQL 教师工作台"}
          className="today-focus-card"
          testId="today-work"
          action={<button type="button" className="text-action" onClick={() => props.navigate("/schedule")}>打开日程与待办</button>}
        >
          {workbenchError ? <p role="alert">{workbenchError}</p> : null}
          {preparationError ? (
            <p role="alert">{preparationError}</p>
          ) : null}
          <div className="today-work-list">
            {workbench?.todayTodos.slice(0, 3).map((todo) => (
              <article key={todo.todoRef}>
                <time>{todo.dueAt ? new Date(todo.dueAt).toLocaleDateString("zh-CN") : "未设截止"}</time>
                <span className="work-kind">个人</span>
                <div>
                  <strong>{todo.pinned ? "📌 " : ""}{todo.title}</strong>
                  <small>{todo.description || "教师个人待办"} · v{todo.version}</small>
                </div>
                <StatusPill tone={todo.priority === "high" ? "warning" : "neutral"}>{todo.priority}</StatusPill>
                <button type="button" onClick={() => props.navigate("/schedule")}>打开待办</button>
              </article>
            ))}
            {workbench?.actionItems.slice(0, 4).map((item) => (
              <article key={item.projectionRef}>
                <time>{item.dueAt ? new Date(item.dueAt).toLocaleDateString("zh-CN") : "需处理"}</time>
                <span className="work-kind">{item.sourceModule}</span>
                <div><strong>{item.title}</strong><small>{item.summary}</small></div>
                <StatusPill tone={item.priority === "high" ? "warning" : "neutral"}>{item.displayStatus}</StatusPill>
                <button type="button" onClick={() => openDeepLink(item.deepLink)}>{item.recommendedAction}</button>
              </article>
            ))}
            {workbench && workbench.todayTodos.length === 0 && workbench.actionItems.length === 0 ? <p>今天没有待处理事项。</p> : null}
          </div>
          {workbench && workbench.todayCalendar.length > 0 ? (
            <div className="overview-calendar-strip">
              <strong>今日日程</strong>
              {workbench.todayCalendar.slice(0, 4).map((item) => (
                <button
                  type="button"
                  key={item.sourceKind === "manual" ? item.event.eventRef : item.projection.projectionRef}
                  onClick={() => item.deepLink ? openDeepLink(item.deepLink) : props.navigate("/schedule")}
                >
                  {item.sourceKind === "manual" ? item.event.title : item.projection.title}
                </button>
              ))}
            </div>
          ) : null}
        </ModuleCard>

        <ModuleCard
          title="学生概况"
          description="来自 Assignment、Submission、GradeDecision 和可重算 Evidence 读取模型"
          action={(
            <span>
              <StatusPill tone="success">真实数据</StatusPill>{" "}
              <button type="button" className="text-action" onClick={() => props.navigate("/students")}>进入学生页面</button>
            </span>
          )}
          testId="student-summary"
        >
          {assignmentError ? <p role="alert">{assignmentError}</p> : null}
          <div className="student-overview-summary">
            <div className="trend-summary">
              <span>当前教师工作</span>
              <strong>{assignmentOverview?.pendingGradingCount ?? 0} 份提交待确认</strong>
              <small>只统计已发布作业；未交不是 0 分</small>
            </div>
            <dl>
              <div><dt>待发布草稿</dt><dd>{assignmentOverview?.draftCount ?? 0}</dd></div>
              <div><dt>当前已发布</dt><dd>{assignmentOverview?.publishedCount ?? 0}</dd></div>
              <div><dt>本次未交</dt><dd>{assignmentOverview?.notSubmittedCount ?? 0}</dd></div>
              <div><dt>教学调整候选</dt><dd>{assignmentOverview?.adjustmentCandidates.length ?? 0}</dd></div>
            </dl>
          </div>
        </ModuleCard>
      </div>

      <ModuleCard
        title="今日课程"
        description="来自正式数据源的课程、单元与课时"
        action={<button type="button" className="text-action" onClick={() => props.navigate("/teaching")}>查看全部教学内容</button>}
        testId="today-courses"
      >
        <div className="today-course-grid">
          {preparation?.recentLessons.map((lesson, index) => (
            <article key={lesson.lessonRef} className={index === 0 ? "is-next" : ""}>
              <header>
                <time>{lesson.plannedAt ? new Date(lesson.plannedAt).toLocaleString("zh-CN") : "待安排"}</time>
                {index === 0 ? <StatusPill tone="blue">最近</StatusPill> : null}
              </header>
              <strong>八年级 3 班 · 数学</strong>
              <h3>{lesson.title}</h3>
              <span>{lesson.durationMinutes} 分钟</span>
              <div className="course-status-row">
                <small>{lessonPreparationStatusLabel(lesson.preparationState)}</small>
                <small>{lesson.learningObjectives.length} 个教学目标</small>
                <small>{lesson.currentApprovedPlanRef ? "已有 approved 计划" : "暂无 approved 计划"}</small>
              </div>
              <footer>
                <Button type={index === 0 ? "primary" : "default"} onClick={() => props.navigateLesson(lesson.lessonRef)}>打开课时</Button>
                {lesson.activePreparationTaskRef ? (
                  <button type="button" className="text-action" onClick={() => props.navigateLesson(lesson.lessonRef)}>
                    查看任务状态
                  </button>
                ) : null}
              </footer>
            </article>
          ))}
        </div>
      </ModuleCard>

      <section className="overview-quick-row" aria-label="快捷操作">
        <QuickAction icon="lesson" label="开始备课" description="从当前章节继续" onClick={() => props.navigate("/teaching")} />
        <QuickAction icon="slides" label="制作课件" description="本阶段未实现 PPTX 生成" onClick={() => undefined} disabled disabledReason="当前只支持 approved TeachingPlan 导出 DOCX" />
        <QuickAction icon="assignment" label="查看作业" description={`${assignmentOverview?.notSubmittedCount ?? 0} 人次未交 · ${assignmentOverview?.pendingGradingCount ?? 0} 份待确认`} onClick={() => props.navigate("/assignments")} />
        <QuickAction icon="students" label="查看学生" description={`${assignmentOverview?.recentlyConfirmed.length ?? 0} 条近期确认批改`} onClick={() => props.navigate("/students")} />
      </section>

      <div className="overview-grid overview-grid--middle">
        <ModuleCard
          title="备课组动态"
          description="协作与待办尚未接入正式 API"
          action={<StatusPill>演示数据</StatusPill>}
        >
          <div className="compact-activity-list">
            {preparationGroupUpdates.map((item) => (
              <article key={item.title}>
                <span className="activity-icon"><WorkspaceIcon name="students" /></span>
                <div><strong>{item.title}</strong><small>{item.time}</small></div>
                <button type="button" disabled title="协作操作尚未实现">{item.action}</button>
              </article>
            ))}
          </div>
        </ModuleCard>
        <ModuleCard
          title="学校动态"
          description="通知与日程尚未接入正式 API"
          action={<StatusPill>只读演示</StatusPill>}
        >
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
        action={<button type="button" className="text-action" onClick={() => props.navigateFiles()}>打开文件库</button>}
      >
        <div className="recent-files-grid">
          {recentFiles.map((file) => (
            <button type="button" key={file.assetRef} onClick={() => props.navigateFiles({ assetRef: file.assetRef })}>
              <span className="file-card-icon"><WorkspaceIcon name={file.currentVersion.extension === ".pptx" ? "slides" : "document"} /></span>
              <span><strong>{file.displayName}</strong><small>{file.currentVersion.extension.slice(1).toUpperCase()} · v{file.currentVersion.versionNumber}</small></span>
              <StatusPill tone={file.source === "teaching_plan_export" ? "success" : "neutral"}>{file.source === "teaching_plan_export" ? "正式成果" : "参考资料"}</StatusPill>
            </button>
          ))}
          {fileError ? <p role="alert">最近文件加载失败：{fileError}</p> : null}
          {!fileError && recentFiles.length === 0 ? <p>暂无真实教学文件。</p> : null}
        </div>
      </ModuleCard>
      <Modal
        title="新建个人待办"
        open={todoModalOpen}
        okText="创建"
        cancelText="取消"
        okButtonProps={{ disabled: !todoTitle.trim() }}
        onCancel={() => setTodoModalOpen(false)}
        onOk={() => {
          void createTeacherTodo({
            title: todoTitle.trim(),
            description: "从概览创建",
            priority: "normal",
            dueAt: todoDueAt ? new Date(todoDueAt).toISOString() : null,
            purpose: "teacher-todo.create",
            idempotencyKey: `overview-todo:${crypto.randomUUID()}`
          }).then(() => {
            setTodoTitle("");
            setTodoDueAt("");
            setTodoModalOpen(false);
            return refreshWorkbench();
          }).catch((caught) => {
            setWorkbenchError(
              caught instanceof Error ? caught.message : "待办创建失败"
            );
          });
        }}
      >
        <div className="demo-form">
          <label>
            标题
            <input
              data-testid="overview-todo-title"
              value={todoTitle}
              onChange={(event) => setTodoTitle(event.target.value)}
            />
          </label>
          <label>
            截止时间
            <input
              type="datetime-local"
              value={todoDueAt}
              onChange={(event) => setTodoDueAt(event.target.value)}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

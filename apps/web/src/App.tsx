import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import type { TeacherWorkspace } from "@edu-agent/contracts";
import {
  Button,
  Result,
  Skeleton,
  Space,
  Typography
} from "antd";

import {
  ApiError,
  type RecoverableCopilotTask,
  loadTeacherWorkbench,
  loadWorkspace
} from "./api";
import { TeacherSidebar } from "./components/portal/TeacherSidebar";
import { WorkspaceIcon } from "./components/WorkspaceIcon";
import { cleanDisplayText } from "./presentation";
import { useAppRoute } from "./route";

const OverviewPage = lazy(() =>
  import("./pages/OverviewPage").then((module) => ({
    default: module.OverviewPage
  }))
);
const TeacherSchedulePage = lazy(() =>
  import("./pages/TeacherSchedulePage").then((module) => ({
    default: module.TeacherSchedulePage
  }))
);
const TeachingWorkspacePage = lazy(() =>
  import("./pages/TeachingWorkspacePage").then((module) => ({
    default: module.TeachingWorkspacePage
  }))
);
const StudentWorkspacePage = lazy(() =>
  import("./pages/StudentWorkspacePage").then((module) => ({
    default: module.StudentWorkspacePage
  }))
);
const TeacherFilesPage = lazy(() =>
  import("./pages/TeacherFilesPage").then((module) => ({
    default: module.TeacherFilesPage
  }))
);
const AgentWorkspacePage = lazy(() =>
  import("./pages/AgentWorkspacePage").then((module) => ({
    default: module.AgentWorkspacePage
  }))
);
const TeacherSettingsPage = lazy(() =>
  import("./pages/TeacherSettingsPage").then((module) => ({
    default: module.TeacherSettingsPage
  }))
);
const TeacherStyleGuidePage = lazy(() =>
  import("./pages/TeacherStyleGuidePage").then((module) => ({
    default: module.TeacherStyleGuidePage
  }))
);

// Gate 2 semantic detail pages remain reachable but are no longer primary
// teacher navigation. This preserves the verified proposal/diff/audit flow.
const GoalsPage = lazy(() =>
  import("./pages/GoalsPage").then((module) => ({
    default: module.GoalsPage
  }))
);
const EvidencePage = lazy(() =>
  import("./pages/EvidencePage").then((module) => ({
    default: module.EvidencePage
  }))
);
const CopilotPage = lazy(() =>
  import("./pages/CopilotPage").then((module) => ({
    default: module.CopilotPage
  }))
);
const TeachingPlanPage = lazy(() =>
  import("./pages/TeachingPlanPage").then((module) => ({
    default: module.TeachingPlanPage
  }))
);
const RunsPage = lazy(() =>
  import("./pages/RunsPage").then((module) => ({
    default: module.RunsPage
  }))
);

function PageLoading() {
  return (
    <div className="portal-route-loading" aria-label="页面加载中">
      <Skeleton active paragraph={{ rows: 8 }} />
    </div>
  );
}
export function App() {
  const {
    route,
    navigate,
    proposalRevisionRef,
    navigateProposal,
    preparationTaskRef,
    navigatePreparation,
    lessonRef,
    navigateLesson,
    fileAssetRef,
    fileLessonRef,
    navigateFiles
  } = useAppRoute();
  const [workspace, setWorkspace] = useState<TeacherWorkspace | null>(null);
  const [task, setTask] =
    useState<RecoverableCopilotTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const initialRequest = useRef<Promise<TeacherWorkspace> | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const refreshWorkspace = useCallback(async () => {
    const next = await loadWorkspace();
    setWorkspace(next);
  }, []);

  const bootstrap = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    initialRequest.current ??= loadTeacherWorkbench();
    void initialRequest.current
      .then((result) => {
        if (active) setWorkspace(result);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught : new Error("无法加载教师工作空间"));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => bootstrap(), [bootstrap]);
  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3200);
  };

  const retryBootstrap = () => {
    initialRequest.current = null;
    setWorkspace(null);
    bootstrap();
  };

  if (loading) {
    return (
      <div className="portal-boot-screen">
        <div className="portal-boot-card">
          <span className="brand-mark">EA</span>
          <Skeleton active paragraph={{ rows: 7 }} />
        </div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="portal-boot-screen">
        <Result
          status="error"
          title={<Typography.Title level={2}>教师工作空间未能启动</Typography.Title>}
          subTitle={
            <div className="startup-diagnostic">
              <p>{error?.message ?? "请确认本地演示服务已经启动。"}</p>
              {error instanceof ApiError ? (
                <dl>
                  <div><dt>请求服务</dt><dd>{error.service}</dd></div>
                  <div><dt>安全错误代码</dt><dd>{error.code}</dd></div>
                </dl>
              ) : null}
              <details>
                <summary>查看本地启动指南</summary>
                <p>运行 <code>corepack pnpm demo:doctor</code>，再运行 <code>corepack pnpm demo:dev</code>。</p>
                <p>完整说明：<code>docs/demo/LOCAL_DEMO.md</code></p>
              </details>
            </div>
          }
          extra={
            <Space>
              <Button type="primary" onClick={retryBootstrap}>重试</Button>
              <Button href="/api/health" target="_blank" rel="noreferrer">检查服务状态</Button>
            </Space>
          }
        />
      </div>
    );
  }

  const teacherName = cleanDisplayText(workspace.identity.teacherName);
  return (
    <div className="teacher-portal-shell">
      <TeacherSidebar route={route} teacherName={teacherName} onNavigate={navigate} />
      <main className={`teacher-portal-main${route === "/agent" ? " teacher-portal-main--agent" : ""}`}>
        <Suspense fallback={<PageLoading />}>
          {route === "/" || route === "/overview" ? (
            <OverviewPage workspace={workspace} navigate={navigate} navigateLesson={navigateLesson} navigateFiles={navigateFiles} navigatePreparation={navigatePreparation} />
          ) : null}
          {route === "/schedule" ? <TeacherSchedulePage navigate={navigate} /> : null}
          {route === "/teaching" || route === "/courses" ? (
            <TeachingWorkspacePage navigateFiles={navigateFiles} navigatePreparation={navigatePreparation} initialLessonRef={lessonRef} initialTab="course" onAction={showNotice} />
          ) : null}
          {route === "/assignments" ? (
            <TeachingWorkspacePage navigateFiles={navigateFiles} navigatePreparation={navigatePreparation} initialTab="homework" onAction={showNotice} />
          ) : null}
          {route === "/students" ? (
            <StudentWorkspacePage navigate={navigate} onAction={showNotice} />
          ) : null}
          {route === "/files" ? (
            <TeacherFilesPage
              onAction={showNotice}
              initialAssetRef={fileAssetRef}
              initialLessonRef={fileLessonRef}
            />
          ) : null}
          {route === "/agent" ? (
            preparationTaskRef ? (
              <CopilotPage
                workspace={workspace}
                task={task}
                setTask={setTask}
                refreshWorkspace={refreshWorkspace}
                navigate={navigate}
                proposalRevisionRef={proposalRevisionRef}
                navigateProposal={navigateProposal}
                preparationTaskRef={preparationTaskRef}
                navigatePreparation={navigatePreparation}
                initialPrompt=""
              />
            ) : (
              <AgentWorkspacePage navigate={navigate} onAction={showNotice} />
            )
          ) : null}
          {route === "/settings" ? (
            <TeacherSettingsPage navigate={navigate} onAction={showNotice} />
          ) : null}
          {route === "/style-guide" ? <TeacherStyleGuidePage /> : null}

          {route === "/goals" ? <GoalsPage workspace={workspace} /> : null}
          {route === "/evidence" ? <EvidencePage workspace={workspace} /> : null}
          {route === "/copilot" ? (
            <div className="legacy-detail-shell">
              <header>
                <button type="button" onClick={() => navigate("/agent")}><WorkspaceIcon name="arrowLeft" />返回 Agent</button>
                <span>结构化教学建议详情 · 保留 Gate 2 语义</span>
              </header>
              <CopilotPage
                workspace={workspace}
                task={task}
                setTask={setTask}
                refreshWorkspace={refreshWorkspace}
                navigate={navigate}
                proposalRevisionRef={proposalRevisionRef}
                navigateProposal={navigateProposal}
                preparationTaskRef={preparationTaskRef}
                navigatePreparation={navigatePreparation}
                initialPrompt=""
              />
            </div>
          ) : null}
          {route === "/teaching-plan" ? (
            <div className="legacy-detail-shell">
              <header>
                <button type="button" onClick={() => navigate("/teaching")}><WorkspaceIcon name="arrowLeft" />返回教学</button>
                <span>教学计划版本与变更</span>
              </header>
              <TeachingPlanPage
                workspace={workspace}
                task={task}
                refreshWorkspace={refreshWorkspace}
                preparationTaskRef={preparationTaskRef}
                navigatePreparation={navigatePreparation}
                navigateLesson={navigateLesson}
                navigateFiles={navigateFiles}
              />
            </div>
          ) : null}
          {route === "/runs" ? (
            <div className="legacy-detail-shell">
              <header>
                <button type="button" onClick={() => navigate("/settings")}><WorkspaceIcon name="arrowLeft" />返回设置</button>
                <span>系统记录与技术详情</span>
              </header>
              <RunsPage workspace={workspace} task={task} preparationTaskRef={preparationTaskRef} />
            </div>
          ) : null}
        </Suspense>
      </main>
      {notice ? (
        <div className="portal-toast" role="status">
          <WorkspaceIcon name="check" />
          <span>{notice}</span>
          <button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}><WorkspaceIcon name="close" /></button>
        </div>
      ) : null}
    </div>
  );
}
